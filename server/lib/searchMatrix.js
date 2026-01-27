// server/lib/searchMatrix.js
import fs from "fs";
import path from "path";

function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(s) {
  const n = normalize(s);
  if (!n) return [];
  return n.split(" ").filter(Boolean);
}

function scoreTokens(queryTokens, docText) {
  // simple keyword overlap scoring
  const d = normalize(docText);
  if (!d) return 0;

  let hits = 0;
  for (const t of queryTokens) {
    if (t.length < 3) continue;
    if (d.includes(t)) hits++;
  }
  // normalize to 0..1-ish
  return hits / Math.max(6, queryTokens.length);
}

function rowToText(row) {
  if (!row) return "";
  const parts = [];

  if (row.text) parts.push(String(row.text));
  if (row.fields && typeof row.fields === "object") {
    for (const [k, v] of Object.entries(row.fields)) {
      if (v === null || v === undefined) continue;
      const vv = String(v).trim();
      if (!vv) continue;
      parts.push(`${k}: ${vv}`);
    }
  }

  return parts.join(" | ");
}

export function createMatrixSearcher({ knowledgePath = "./knowledge/knowledge.json" } = {}) {
  const abs = path.resolve(process.cwd(), knowledgePath);
  if (!fs.existsSync(abs)) {
    console.warn(`⚠️ knowledge file not found at: ${abs}`);
  }

  const raw = fs.existsSync(abs) ? fs.readFileSync(abs, "utf-8") : "[]";
  const entries = JSON.parse(raw);

  // Normalize entries once
  const indexed = entries.map((e, idx) => {
    const text = rowToText(e);
    return {
      id: e.id || `row-${idx + 1}`,
      source: e.source || "Matrix-2026",
      sheet: e.sheet || null,
      row: e.row || null,
      fields: e.fields || {},
      text: e.text || text,
      _fullText: text,
    };
  });

  return function search(question, { topK = 5 } = {}) {
    const qTokens = tokenize(question);

    const scored = indexed
      .map((e) => {
        const s = scoreTokens(qTokens, e._fullText);
        return { ...e, score: s };
      })
      .filter((e) => e.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return { hits: scored };
  };
}
