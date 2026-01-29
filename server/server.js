// server/server.js
import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

import { createMatrixSearcher } from "./lib/searchMatrix.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ Non-work / small-talk detection
function isNonWorkQuestion(text) {
  const q = String(text || "").toLowerCase().trim();
  const smallTalk = [
    "how are you",
    "how r u",
    "hello",
    "hi",
    "hey",
    "what's up",
    "whats up",
    "good morning",
    "good afternoon",
    "good evening",
    "who are you",
    "what are you",
    "are you real",
  ];
  return smallTalk.some((phrase) => q === phrase || q.startsWith(phrase));
}

// ===== Load Matrix Knowledge =====
const matrixPath = path.join(__dirname, "knowledge", "matrix-2026.json");
const searchMatrix = createMatrixSearcher({ knowledgePath: matrixPath });

// ===== Health Check =====
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    matrixPath: "./knowledge/matrix-2026.json",
    anthropicKeyLoaded: Boolean(process.env.ANTHROPIC_API_KEY),
    claudeModelEnv: process.env.CLAUDE_MODEL || null,
  });
});

// ===== Debug Search (safe) =====
app.get("/debug/search", (req, res) => {
  const q = String(req.query.q || "hotel sold out");
  const hits = searchMatrix(q, { topK: 5 });
  res.json({
    query: q,
    matchedCount: hits.length,
    topScore: hits[0]?.score ?? 0,
    topHit: hits[0] || null,
    sample: hits,
  });
});

/**
 * ✅ Extract numbered steps from instruction strings.
 */
function extractNumberedSteps(instructions) {
  const raw = String(instructions || "").trim();
  if (!raw) return [];

  let text = raw
    .replace(/\r\n/g, "\n")
    .replace(/\s+/g, " ")
    .replace(/\*\*/g, "")
    .trim();

  // newline before "2." etc so we can split
  text = text.replace(/(\s|,)(\d+)\.\s+/g, "\n$2. ");

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const numbered = lines.filter((l) => /^\d+\.\s+/.test(l));

  if (numbered.length) {
    return numbered
      .map((l) => l.replace(/^\d+\.\s+/, "").trim())
      .filter(Boolean);
  }

  return [text];
}

// ===== Main Ask Endpoint =====
app.post("/api/ask", async (req, res) => {
  try {
    const { mode, question } = req.body || {};
    const q = String(question || "").trim();

    if (!q) return res.status(400).json({ error: "Missing question" });
    if (mode !== "Matrix-2026") {
      return res.status(400).json({ error: `Unsupported mode: ${mode}` });
    }

    // ✅ GUARDRAIL: small talk => do not search matrix
    if (isNonWorkQuestion(q)) {
      const answer =
        `Acknowledge\n` +
        `I’m here to assist with work-related compliance scenarios only.\n\n` +
        `Matrix Reference\n` +
        `Not applicable (general conversation)\n\n` +
        `Step-by-step Guidance\n` +
        `1. Please describe a real work scenario (example: "hotel sold out", "refund outside policy", "reservation not found at check-in").\n` +
        `2. Include key details if you have them (same-day check-in? prepaid vs pay-at-hotel? itinerary?).\n\n` +
        `Source\n` +
        `System Boundary (Matrix-only tool)`;

      return res.json({
        answer,
        source: "System • Boundary",
        proof: [],
        routing: null, // ✅ no routing for non-work
        debug: { skippedMatrix: true },
      });
    }

    const hits = searchMatrix(q, { topK: 10 });
    const top = hits[0];
    const topScore = top?.score ?? 0;

    // ✅ If no match, do not invent routing or steps
    if (!top || topScore <= 0) {
      const answer =
        `Acknowledge\n` +
        `I understand the scenario, but it is not clearly covered in the Matrix-2026 documentation.\n\n` +
        `Matrix Reference\n` +
        `Matrix-2026: Not covered (no matching row found)\n\n` +
        `Step-by-step Guidance\n` +
        `1. Try rephrasing with more detail (example: "guest requesting refund outside policy window").\n` +
        `2. If still unclear, escalate for guidance.\n\n` +
        `Source\n` +
        `Matrix-2026`;

      return res.json({
        answer,
        source: "Matrix-2026 • Engine: Matrix-only",
        proof: [],
        routing: null, // ✅ no routing when no match
        debug: { topScore: 0, matchedCount: 0 },
      });
    }

    // ✅ Routing as STRUCTURED JSON (frontend pills use this)
    const routing = {
      slack: top.slack || "not specified",
      refundQueue: top.refundQueue || "not specified",
      ticket: top.ticket || "not specified",
      supervisor: top.supervisor || "not specified",
    };

    const steps = extractNumberedSteps(top.instructions);
    const stepsBlock = steps.length
      ? steps.map((s, i) => `${i + 1}. ${s}`).join("\n")
      : `1. not covered in documentation.`;

    const acknowledge =
      `I understand the scenario: "${q}". Based on the Matrix-2026 guide, the closest match is the procedure below.`;

    const matrixRef = `${top.tab} → Row ${top.row} → ${top.description}`;

    // ✅ Answer no longer includes "Reminders / Escalation" at all
    const answer =
      `Acknowledge\n${acknowledge}\n\n` +
      `Matrix Reference\n${matrixRef}\n\n` +
      `Step-by-step Guidance\n${stepsBlock}\n\n` +
      `Source\nMatrix-2026`;

    return res.json({
      answer,
      source: "Matrix-2026 • Engine: Matrix-only",
      proof: hits.slice(0, 6),
      routing, // ✅ send routing for pills
      debug: { topScore, matchedCount: hits.length },
    });
  } catch (err) {
    console.error("ERROR /api/ask:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

const PORT = process.env.PORT || 5050;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
