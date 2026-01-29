// server/lib/searchQaForm.js
import fs from "fs";

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreText(query, text) {
  const q = norm(query);
  const t = norm(text);
  if (!q || !t) return 0;

  const qTokens = q.split(" ").filter(Boolean);
  const tTokens = new Set(t.split(" ").filter(Boolean));

  let hit = 0;
  for (const tok of qTokens) {
    if (tTokens.has(tok)) hit++;
  }

  // stable denominator so long questions don't over-score
  const denom = Math.max(10, Math.ceil(qTokens.length * 0.6));
  return hit / denom;
}

export function createQaFormSearcher({ knowledgePath }) {
  if (!knowledgePath || typeof knowledgePath !== "string") {
    throw new Error(
      `createQaFormSearcher: knowledgePath must be a string. Got: ${typeof knowledgePath}`
    );
  }

  const raw = fs.readFileSync(knowledgePath, "utf-8");
  const json = JSON.parse(raw);

  const meta = json?.meta || {};
  const criteria = Array.isArray(json?.criteria) ? json.criteria : [];

  const cleaned = criteria
    .map((c) => {
      const id = String(c.id || "").trim();
      const title = String(c.title || "").trim();
      const points = Number(c.points || 0);
      const examples = Array.isArray(c.examples) ? c.examples : [];
      const notes = Array.isArray(c.notes) ? c.notes : [];

      if (!id || !title) return null;

      const yes = examples
        .filter((e) => String(e.result || "").toUpperCase() === "YES")
        .map((e) => String(e.text || "").trim())
        .filter(Boolean);

      const no = examples
        .filter((e) => String(e.result || "").toUpperCase() === "NO")
        .map((e) => String(e.text || "").trim())
        .filter(Boolean);

      const na = examples
        .filter((e) => {
          const r = String(e.result || "").toUpperCase();
          return r === "NA" || r === "N/A";
        })
        .map((e) => String(e.text || "").trim())
        .filter(Boolean);

      const haystack =
        `${id}\n${title}\n` +
        `YES:\n${yes.join("\n")}\n` +
        `NO:\n${no.join("\n")}\n` +
        `NA:\n${na.join("\n")}\n` +
        `NOTES:\n${notes.join("\n")}`;

      return {
        id,
        title,
        points: Number.isFinite(points) ? points : 0,
        yes,
        no,
        na,
        notes,
        haystack,
      };
    })
    .filter(Boolean);

  return function searchQaForm(question, { topK = 6 } = {}) {
    const hits = [];

    for (const c of cleaned) {
      const s = scoreText(question, c.haystack);

      // small boosts if ID/title strongly matches
      const qn = norm(question);
      const tn = norm(c.title);

      let boost = 0;
      if (tn && qn && (tn.includes(qn) || qn.includes(tn))) boost += 0.2;

      const finalScore = Math.min(1.5, s + boost);

      if (finalScore > 0) {
        hits.push({
          score: finalScore,
          id: c.id,
          title: c.title,
          points: c.points,
          yes: c.yes,
          no: c.no,
          na: c.na,
          notes: c.notes,
        });
      }
    }

    hits.sort((a, b) => b.score - a.score);
    return {
      meta,
      hits: hits.slice(0, topK),
    };
  };
}
