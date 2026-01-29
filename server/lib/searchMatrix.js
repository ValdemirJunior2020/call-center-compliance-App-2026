// server/lib/searchMatrix.js
import fs from "fs";

/**
 * Supports both formats:
 * 1) Array rows: [{ sheet, row_number, text, keywords: [] }, ...]
 * 2) Object rows: { rows: [...] }
 */

function normText(s) {
  return String(s ?? "")
    .replace(/[\u200b\u200c\u200d\uFEFF]/g, "")
    .replace(/[’']/g, "'")
    .toLowerCase()
    .trim();
}

function safeString(v) {
  if (v == null) return "";
  return String(v).trim();
}

function tokenize(text) {
  return normText(text)
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

// Phrase synonyms (expand as you like)
const PHRASE_SYNONYMS = [
  ["hotel sold out", "sold out"],
  ["no availability", "sold out"],
  ["fully booked", "sold out"],
  ["no rooms", "sold out"],
  ["no room", "sold out"],

  ["money back", "refund"],
  ["reimbursement", "refund"],
  ["reimburse", "refund"],

  ["change dates", "modify dates"],
  ["change date", "modify dates"],
  ["move my reservation", "modify reservation"],
  ["change my reservation", "modify reservation"],
];

function applyPhraseSynonyms(text) {
  let t = normText(text);
  for (const [from, to] of PHRASE_SYNONYMS) {
    const f = normText(from);
    const r = normText(to);
    t = t.split(f).join(r);
  }
  return t;
}

/**
 * ✅ Query expansions to map "not-in-matrix" phrasing to the closest matrix scenario.
 * Per your decision: "sold out / no availability" should map to:
 *   Voice Matrix → "Reservation not found at check-in"
 */
const QUERY_EXPANSIONS = [
  {
    triggers: ["sold out", "fully booked", "no availability", "no rooms", "no room"],
    // Terms that exist in/near the "Reservation not found at check-in" instructions
    add: [
      "reservation",
      "not",
      "found",
      "check-in",
      "supplier",
      "unconfirmed",
      "voucher",
      "rebook",
      "relocate",
      "inventory",
    ],
  },
];

function expandQuery(text) {
  const t = applyPhraseSynonyms(text);
  const lower = normText(t);

  const extra = new Set();
  for (const rule of QUERY_EXPANSIONS) {
    if (rule.triggers.some((tr) => lower.includes(normText(tr)))) {
      rule.add.forEach((w) => extra.add(normText(w)));
    }
  }

  if (extra.size) return `${t} ${Array.from(extra).join(" ")}`;
  return t;
}

function tokenizeQuery(text) {
  return tokenize(expandQuery(text));
}

/**
 * Very common words that hurt matching.
 * Note: we do NOT stopword "sold" and "out" — we want those to stay meaningful.
 */
const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "to",
  "of",
  "in",
  "on",
  "for",
  "with",
  "at",
  "by",
  "from",
  "is",
  "are",
  "be",
  "been",
  "being",
  "it",
  "this",
  "that",
  "as",
  "can",
  "could",
  "should",
  "would",
  "will",
  "just",
  "please",
  "help",
  "need",
  "want",

  // domain-generic terms that appear everywhere:
  "hotel",
  "issue",
  "issues",
  "request",
  "requests",
  "guest",
  "customer",
  "client",
  "booking",
  "bookings",
  "stay",
  "date",
  "dates",
  "night",
  "nights",
]);

function filterStopwords(tokens) {
  return tokens.filter((t) => !STOPWORDS.has(t));
}

/**
 * Parse your row.text
 */
function parseMatrixText(text) {
  const raw = safeString(text);
  const parts = raw.split("|").map((p) => p.trim()).filter(Boolean);

  let issue = "";
  let instructions = "";
  let slack = "";
  let refundQueue = "";
  let ticket = "";
  let supervisor = "";

  if (parts.length) {
    const first = parts[0];
    const idx = first.toLowerCase().indexOf("instructions:");
    if (idx !== -1) {
      issue = first.slice(0, idx).trim();
      instructions = first.slice(idx + "instructions:".length).trim();
    } else {
      issue = first.trim();
    }
  }

  for (const p of parts) {
    const pl = p.toLowerCase();

    if (pl.startsWith("instructions:")) {
      instructions = p.slice("instructions:".length).trim();
      continue;
    }
    if (pl.startsWith("slack")) {
      slack = p.split(":").slice(1).join(":").trim();
      continue;
    }
    if (pl.startsWith("refund queue")) {
      refundQueue = p.split(":").slice(1).join(":").trim();
      continue;
    }
    if (pl.startsWith("create a ticket")) {
      ticket = p.split(":").slice(1).join(":").trim();
      continue;
    }
    if (pl.startsWith("supervisor")) {
      supervisor = p.split(":").slice(1).join(":").trim();
      continue;
    }
  }

  return { issue, instructions, slack, refundQueue, ticket, supervisor };
}

/**
 * Weighted scoring:
 * - query tokens (after stopword filter) must match document tokens
 * - keyword matches count heavier
 */
function scoreWeighted({ queryTokens, docTokensSet, keywordSet }) {
  if (!queryTokens.length) return 0;

  let hits = 0;
  let keywordHits = 0;

  for (const t of queryTokens) {
    if (keywordSet && keywordSet.has(t)) keywordHits += 1;
    if (docTokensSet.has(t)) hits += 1;
  }

  const base = hits / queryTokens.length;

  // keyword boost (up to +0.35)
  const kwBoost =
    keywordSet && queryTokens.length
      ? Math.min(0.35, (keywordHits / queryTokens.length) * 0.6)
      : 0;

  return base + kwBoost;
}

export function createMatrixSearcher({ knowledgePath }) {
  if (!knowledgePath) throw new Error("knowledgePath is required");

  const raw = JSON.parse(fs.readFileSync(knowledgePath, "utf8"));
  const rows = Array.isArray(raw) ? raw : Array.isArray(raw?.rows) ? raw.rows : [];

  const corpus = [];

  for (const row of rows) {
    const sheet = safeString(row.sheet || row.tab || "");
    const rowNum = row.row_number ?? row.row ?? row.id ?? "";

    const text = safeString(row.text || "");
    const parsed = parseMatrixText(text);

    const description = parsed.issue || safeString(row.description || row.issue || "");
    const instructions = parsed.instructions || safeString(row.instructions || "");

    const slack = parsed.slack || safeString(row.slack || "");
    const refundQueue = parsed.refundQueue || safeString(row.refundQueue || "");
    const ticket = parsed.ticket || safeString(row.ticket || "");
    const supervisor = parsed.supervisor || safeString(row.supervisor || "");

    const keywords = Array.isArray(row.keywords) ? row.keywords : [];
    const keywordTokens = keywords.map((k) => normText(k)).filter(Boolean);
    const keywordSet = new Set(keywordTokens);

    const searchText = [
      sheet,
      description,
      instructions,
      slack,
      refundQueue,
      ticket,
      supervisor,
      keywordTokens.join(" "),
      text,
    ]
      .filter(Boolean)
      .join(" | ");

    const docTokens = new Set(filterStopwords(tokenize(searchText)));

    corpus.push({
      tab: sheet,
      row: rowNum,
      description,
      instructions,
      slack,
      refundQueue,
      ticket,
      supervisor,
      _tokens: docTokens,
      _keywordSet: keywordSet,
    });
  }

  return function searchMatrix(query, { topK = 10 } = {}) {
    const qTokensRaw = tokenizeQuery(safeString(query));
    const qTokens = filterStopwords(qTokensRaw);

    if (!qTokens.length) return [];

    const scored = corpus
      .map((c) => {
        const s = scoreWeighted({
          queryTokens: qTokens,
          docTokensSet: c._tokens,
          keywordSet: c._keywordSet,
        });
        return {
          tab: c.tab,
          row: c.row,
          score: s,
          description: c.description,
          instructions: c.instructions,
          slack: c.slack,
          refundQueue: c.refundQueue,
          ticket: c.ticket,
          supervisor: c.supervisor,
        };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return scored;
  };
}
