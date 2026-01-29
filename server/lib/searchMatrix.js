// server/lib/searchMatrix.js
import fs from "fs";

function normKey(s) {
  return String(s ?? "")
    .replace(/[\u200b\u200c\u200d\uFEFF]/g, "") // remove zero-width chars
    .trim()
    .toLowerCase();
}

function pickFromRaw(raw, wanted) {
  if (!raw || typeof raw !== "object") return "";
  const w = normKey(wanted);

  // direct-ish match
  for (const k of Object.keys(raw)) {
    if (normKey(k) === w) {
      const v = raw[k];
      return v == null ? "" : String(v).trim();
    }
  }

  // fallback: "Refund Queue" could be "RefundQueue", etc.
  for (const k of Object.keys(raw)) {
    const nk = normKey(k).replace(/\s+/g, "");
    const nw = w.replace(/\s+/g, "");
    if (nk === nw) {
      const v = raw[k];
      return v == null ? "" : String(v).trim();
    }
  }

  return "";
}

function safeString(v) {
  if (v == null) return "";
  const s = String(v).trim();
  return s;
}

function buildSearchText(row) {
  // Keep it simple and strong for matching
  const parts = [
    row.issue,
    row.title,
    row.description,
    row.instructions,
    row.tab,
    // include raw text too (helps a lot)
    row.raw ? Object.values(row.raw).join(" ") : "",
  ]
    .filter(Boolean)
    .map((x) => String(x));

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

export function createMatrixSearcher({ knowledgePath }) {
  const rawText = fs.readFileSync(knowledgePath, "utf-8");
  const parsed = JSON.parse(rawText);

  // Support either:
  // 1) array of rows
  // 2) { rows: [...] }
  const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.rows) ? parsed.rows : [];

  // Normalize rows into the shape your server expects
  const normalized = rows.map((r, idx) => {
    const raw = r.raw && typeof r.raw === "object" ? r.raw : null;

    const issue = safeString(r.issue || r.title || r.problem || r.scenario || pickFromRaw(raw, "Hotel & Reservation Issues"));
    const instructions = safeString(r.instructions || pickFromRaw(raw, "Instructions"));

    const slack =
      safeString(r.slack) ||
      safeString(r.Slack) ||
      pickFromRaw(raw, "Slack");

    const refundQueue =
      safeString(r.refundQueue) ||
      safeString(r.refund_queue) ||
      safeString(r["Refund Queue"]) ||
      pickFromRaw(raw, "Refund Queue");

    const ticket =
      safeString(r.ticket) ||
      safeString(r.createTicket) ||
      safeString(r["Create a Ticket"]) ||
      pickFromRaw(raw, "Create a Ticket");

    const supervisor =
      safeString(r.supervisor) ||
      safeString(r.Supervisor) ||
      pickFromRaw(raw, "Supervisor");

    const tab = safeString(r.tab || r.sheet || r.Tab || "");
    const rowNum = Number(r.row ?? r.rowNumber ?? r.excelRow ?? NaN);
    const row = Number.isFinite(rowNum) ? rowNum : null;

    const id = safeString(r.id) || `${tab || "sheet"}-${row || idx + 1}`;

    const doc = {
      id,
      tab,
      row,
      issue,
      description: issue, // keep compatibility with your server.js
      instructions,
      slack,
      refundQueue,
      ticket,
      supervisor,
      raw,
    };

    return {
      ...doc,
      __search: buildSearchText(doc).toLowerCase(),
    };
  });

  function scoreMatch(query, text) {
    // Tiny scoring — good enough and fast
    const q = query.toLowerCase().trim();
    if (!q) return 0;

    // give credit for each token found
    const tokens = q.split(/\s+/).filter(Boolean);
    let hits = 0;
    for (const t of tokens) {
      if (t.length < 2) continue;
      if (text.includes(t)) hits += 1;
    }
    // normalize 0..1-ish
    return hits / Math.max(tokens.length, 1);
  }

  return function searchMatrix(query, { topK = 8 } = {}) {
    const q = String(query || "").trim();
    const scored = normalized
      .map((row) => ({
        ...row,
        score: scoreMatch(q, row.__search),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return {
      hits: scored.map(({ __search, ...rest }) => rest),
    };
  };
}
