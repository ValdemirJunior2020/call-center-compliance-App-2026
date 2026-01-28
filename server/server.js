// server/server.js
import "dotenv/config";
import express from "express";
import cors from "cors";
import { createMatrixSearcher } from "./lib/searchMatrix.js";
import { ragAnswer } from "./lib/ragAnswer.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const searchMatrix = createMatrixSearcher({
  knowledgePath: "./knowledge/knowledge.json",
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    openaiKeyLoaded: !!process.env.OPENAI_API_KEY,
    anthropicKeyLoaded: !!process.env.ANTHROPIC_API_KEY,
  });
});

/**
 * POST /api/ask
 * body: { mode: "Matrix-2026", question: "...", engine?: "openai"|"claude" }
 */
app.post("/api/ask", async (req, res) => {
  try {
    const { mode, question, engine } = req.body || {};

    if (!mode) {
      return res.status(400).json({
        answer: "Please select a knowledge base first.",
        source: "System",
      });
    }

    const q = String(question || "").trim();
    if (!q || q.length < 3) {
      return res.status(400).json({
        answer: "Please enter a question.",
        source: "System",
      });
    }

    // ---------- MATRIX-2026 (deterministic) ----------
    if (mode === "Matrix-2026") {
      const results = searchMatrix(q, { topK: 8 });

      // If nothing looks relevant
      if (!results?.hits?.length || results.hits[0].score < 0.18) {
        return res.json({
          answer:
            "escalation / what to do first\nnot covered in documentation.\n\nquick answer\nnot covered in documentation.\n\nsteps to follow\nnot covered in documentation.\n\nSlack: not specified\nRefund Queue: not specified\nCreate a Ticket: not specified\nSupervisor: not specified\n\nsource rows\nSOURCE: Matrix-2026",
          source: "Matrix-2026",
          proof: [],
          debug: {
            topScore: results?.hits?.[0]?.score ?? 0,
            matchedCount: results?.hits?.length ?? 0,
          },
        });
      }

      // Pick the best row
      const top = results.hits[0];

      const quick = top.description || top.issue || top.title || q;

      const instructionsRaw = String(top.instructions || "").trim();
      const steps = splitSteps(instructionsRaw);

      const escalation = buildEscalation(top);

      const answerText = formatMatrixAnswer({
        escalation,
        quickAnswer: quick,
        steps,
        routing: {
          slack: top.slack,
          refundQueue: top.refundQueue,
          createTicket: top.ticket || top.createTicket,
          supervisor: top.supervisor,
        },
        sourceRows: [`Matrix-2026 > ${top.tab || "Unknown Tab"} > Row ${top.row ?? "?"}`],
      });

      const proof = results.hits.slice(0, 5).map((h) => ({
        tab: h.tab || "Unknown Tab",
        row: h.row ?? null,
        score: round3(h.score),
      }));

      return res.json({
        answer: answerText,
        source: `Matrix-2026 • Engine: ${engine === "claude" ? "Claude" : "ChatGPT"}`,
        proof,
        debug: {
          topScore: round3(top.score),
          matchedCount: results.hits.length,
        },
      });
    }

    // ---------- OTHER MODES (optional RAG) ----------
    const ai = await ragAnswer({
      question: q,
      mode: String(mode),
      hits: [],
      engine: engine || "openai",
    });

    return res.json({
      answer: ai.answer,
      source: ai.source || `Mode: ${mode}`,
      citations: ai.citations || [],
    });
  } catch (err) {
    console.error("ASK ERROR:", err);
    res.status(500).json({
      answer: "Server error while answering from the knowledge base.",
      source: "System",
    });
  }
});

function round3(n) {
  const x = Number(n || 0);
  return Math.round(x * 1000) / 1000;
}

function splitSteps(instructionsRaw) {
  if (!instructionsRaw) return [];

  const normalized = String(instructionsRaw).replace(/\r/g, "\n");

  if (/\b1\./.test(normalized)) {
    const parts = normalized
      .split(/\b\d+\.\s*/g)
      .map((s) => s.trim())
      .filter(Boolean);
    return parts;
  }

  if (/\b1\.\s*[^]+,\s*2\./.test(normalized)) {
    const parts = normalized
      .split(/\s*,\s*(?=\d+\.)/g)
      .map((s) => s.replace(/^\d+\.\s*/, "").trim())
      .filter(Boolean);
    return parts;
  }

  const lines = normalized
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length > 1) return lines;

  return [String(instructionsRaw).trim()];
}

function normalizeCell(v) {
  const s = String(v ?? "").trim();
  return s ? s : "not specified";
}

function buildEscalation(row) {
  const sup = String(row?.supervisor ?? "").trim();
  if (!sup) return "follow matrix routing (check Supervisor column).";

  const up = sup.toUpperCase();
  if (up.includes("YES")) return "escalate to supervisor (yes).";
  if (up.includes("NO") || up.includes("NONE")) return "escalate to supervisor (no).";
  return `escalate to supervisor (${sup}).`;
}

function formatMatrixAnswer({ escalation, quickAnswer, steps, routing, sourceRows }) {
  const slack = normalizeCell(routing?.slack);
  const refundQueue = normalizeCell(routing?.refundQueue);
  const createTicket = normalizeCell(routing?.createTicket);
  const supervisor = normalizeCell(routing?.supervisor);

  const stepsBlock =
    steps && steps.length
      ? steps.map((s) => `- ${s}`).join("\n")
      : "No instructions listed for this row in Matrix-2026.";

  const sources =
    sourceRows && sourceRows.length
      ? sourceRows.map((s) => `SOURCE: ${s}`).join("\n")
      : "SOURCE: Matrix-2026";

  return (
    `escalation / what to do first\n${String(escalation || "").toLowerCase()}\n\n` +
    `quick answer\n${quickAnswer || "not covered in documentation."}\n\n` +
    `steps to follow\n${stepsBlock}\n\n` +
    `Slack: ${slack}\n` +
    `Refund Queue: ${refundQueue}\n` +
    `Create a Ticket: ${createTicket}\n` +
    `Supervisor: ${supervisor}\n\n` +
    `source rows\n${sources}`
  );
}

const PORT = process.env.PORT || 5050;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
