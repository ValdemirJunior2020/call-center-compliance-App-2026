// server/lib/searchMatrix.js
import fs from "fs";
import path from "path";

/**
 * Normalize header keys coming from Excel/Sheets exports.
 * - removes zero-width characters
 * - trims
 * - lowercases
 * - collapses spaces
 */
function normKey(k) {
  return String(k || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "") // zero-width chars
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * Safely pick a value from:
 * - row[key]
 * - row.fields[key]
 * using alias keys (case-insensitive + zero-width-safe)
 */
function pick(row, aliases = []) {
  const candidates = aliases.map(normKey);

  // 1) direct keys on row
  for (const rawKey of Object.keys(row || {})) {
    const nk = normKey(rawKey);
    if (candidates.includes(nk)) {
      const v = row[rawKey];
      if (v !== undefined && v !== null && String(v).trim() !== "") return v;
    }
  }

  // 2) keys inside row.fields (your knowledge.json uses fields.* a lot)
  const fields = row?.fields && typeof row.fields === "object" ? row.fields : {};
  for (const rawKey of Object.keys(fields)) {
    const nk = normKey(rawKey);
    if (candidates.includes(nk)) {
      const v = fields[rawKey];
      if (v !== undefined && v !== null && String(v).trim() !== "") return v;
    }
  }

  return "";
}

function normalizeCell(v) {
  const s = String(v ?? "").trim();
  return s ? s : "";
}

/**
 * Build a text blob used for matching.
 * Keep it simple: issue/title/description + instructions.
 */
function buildSearchText(row) {
  const title = pick(row, ["title", "issue", "hotel & reservation issues"]);
  const desc = pick(row, ["description", "details"]);
  const instr = pick(row, ["instructions", "steps", "procedure"]);
  return [title, desc, instr].filter(Boolean).join("\n").toLowerCase();
}

function scoreMatch(q, text) {
  // very simple token overlap scoring (fast + deterministic)
  const query = String(q || "").toLowerCase().trim();
  if (!query) return 0;

  const qTokens = query.split(/[^a-z0-9]+/i).filter(Boolean);
  if (!qTokens.length) return 0;

  let hit = 0;
  for (const t of qTokens) {
    if (t.length < 2) continue;
    if (text.includes(t)) hit += 1;
  }

  // normalize by query length
  return hit / Math.max(4, qTokens.length);
}

function loadKnowledge(knowledgePath) {
  const fullPath = path.resolve(knowledgePath);
  const raw = fs.readFileSync(fullPath, "utf-8");
  const json = JSON.parse(raw);

  if (!Array.isArray(json)) {
    throw new Error(
      `knowledge.json must be an array. Got: ${typeof json} at ${fullPath}`
    );
  }

  // Flatten routing fields onto the row so server.js can safely do top.slack etc.
  return json.map((row, idx) => {
    const slack = normalizeCell(pick(row, ["slack", "slack\u200b", "slack "])); // catches Slack + hidden chars
    const refundQueue = normalizeCell(
      pick(row, ["refund queue", "refundqueue", "queue"])
    );
    const ticket = normalizeCell(
      pick(row, ["create a ticket", "ticket", "create ticket"])
    );
    const supervisor = normalizeCell(
      pick(row, ["supervisor", "sup", "super visor"])
    );

    const description = normalizeCell(
      pick(row, ["description", "issue", "title", "hotel & reservation issues"])
    );

    const instructions = normalizeCell(pick(row, ["instructions", "steps"]));

    return {
      ...row,
      // make sure these exist at the top level (this is what your server.js expects)
      slack,
      refundQueue,
      ticket,
      supervisor,
      description,
      instructions,
      // helpful for debugging
      __idx: idx,
      __searchText: buildSearchText({ ...row, slack, refundQueue, ticket, supervisor, description, instructions }),
    };
  });
}

export function createMatrixSearcher({ knowledgePath }) {
  const rows = loadKnowledge(knowledgePath);

  return function searchMatrix(question, { topK = 8 } = {}) {
    const q = String(question || "").trim();
    const scored = rows
      .map((r) => {
        const s = scoreMatch(q, r.__searchText || "");
        return { row: r, score: s };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return {
      hits: scored.map(({ row, score }) => ({
        score,
        tab: row.tab || row?.meta?.tab || row?.sheet || "Unknown Tab",
        row: row.row ?? row?.meta?.row ?? null,

        // These are the ones your server.js uses:
        description: row.description,
        instructions: row.instructions,
        slack: row.slack,
        refundQueue: row.refundQueue,
        ticket: row.ticket,
        supervisor: row.supervisor,
      })),
    };
  };
}
