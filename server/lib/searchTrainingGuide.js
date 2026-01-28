import fs from "fs";
import path from "path";

// cosine similarity
function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function norm(a) {
  return Math.sqrt(dot(a, a));
}

function cosine(a, b) {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return 0;
  return dot(a, b) / (na * nb);
}

export function createTrainingGuideSearcher() {
  const file = path.resolve("knowledge/training-guide-2025.json");
  if (!fs.existsSync(file)) {
    throw new Error(
      `Missing Training Guide knowledge JSON. Run ingest script first: ${file}`
    );
  }

  const data = JSON.parse(fs.readFileSync(file, "utf-8"));

  // Keep only what we need in memory
  const items = data.map((x) => ({
    id: x.id,
    mode: x.mode,
    source: x.source,
    text: x.text,
    // embeddings are not included in this file right now (we are doing local retrieval on text)
    // We'll do keyword-based retrieval here to keep it simple & stable.
  }));

  // Simple keyword retrieval (fast, works great for training guides)
  // We’ll still let Claude summarize + format the answer.
  return function searchTrainingGuide(query, topK = 6) {
    const q = String(query || "").toLowerCase();
    const qWords = q.split(/\s+/).filter(Boolean);

    const scored = items.map((it) => {
      const t = it.text.toLowerCase();
      let score = 0;

      for (const w of qWords) {
        if (w.length < 3) continue;
        if (t.includes(w)) score += 2;
      }

      // bonus if the exact phrase appears
      if (q.length >= 6 && t.includes(q)) score += 10;

      return { item: it, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK).filter((x) => x.score > 0);
  };
}
