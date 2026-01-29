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

function formatRoutingLine(label, value) {
  const v = String(value || "not specified").trim() || "not specified";
  return `${label}: ${v}`;
}

/**
 * ✅ Extracts numbered steps from a long instruction string.
 * Works with patterns like:
 *  "1. Call Supplier, 2. If unconfirmed..., 3. Create a Voucher..."
 * Also cleans duplicate spaces and stray markdown symbols.
 */
function extractNumberedSteps(instructions) {
  const raw = String(instructions || "").trim();
  if (!raw) return [];

  // Normalize some formatting
  let text = raw
    .replace(/\r\n/g, "\n")
    .replace(/\s+/g, " ")
    .replace(/\*\*/g, "") // remove **bold**
    .trim();

  // Insert a newline before each "N." so we can split reliably
  // Example: "..., 2. ..." -> "\n2. ..."
  text = text.replace(/(\s|,)(\d+)\.\s+/g, "\n$2. ");

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  // Keep only lines that start with "N."
  const numbered = lines.filter((l) => /^\d+\.\s+/.test(l));

  // If we successfully got numbered lines, clean them
  if (numbered.length) {
    return numbered
      .map((l) => l.replace(/^\d+\.\s+/, "").trim())
      .filter(Boolean);
  }

  // Fallback: if matrix didn't use numbers, create one step as-is
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

    const hits = searchMatrix(q, { topK: 10 });
    const top = hits[0];
    const topScore = top?.score ?? 0;

    // If we cannot match, do not invent anything
    if (!top || topScore <= 0) {
      const answer =
        `Acknowledge\n` +
        `I understand the scenario, but it is not clearly covered in the Matrix-2026 documentation.\n\n` +
        `Matrix Reference\n` +
        `Matrix-2026: Not covered (no matching row found)\n\n` +
        `Step-by-step Guidance\n` +
        `1. Follow the closest applicable documented procedure if available.\n` +
        `2. If still unclear, escalate for guidance.\n\n` +
        `Reminders / Escalation\n` +
        `${formatRoutingLine("Slack", "not specified")}\n` +
        `${formatRoutingLine("Refund Queue", "not specified")}\n` +
        `${formatRoutingLine("Create a Ticket", "not specified")}\n` +
        `${formatRoutingLine("Supervisor", "recommended (not specified in matrix)")}\n\n` +
        `Source\n` +
        `Matrix-2026`;
      return res.json({
        answer,
        source: "Matrix-2026 • Engine: Matrix-only",
        proof: [],
        debug: { topScore: 0, matchedCount: 0 },
      });
    }

    // Routing from best match
    const routing = {
      slack: top.slack || "not specified",
      refundQueue: top.refundQueue || "not specified",
      ticket: top.ticket || "not specified",
      supervisor: top.supervisor || "not specified",
    };

    // ✅ Matrix-only steps (no Claude required)
    const extractedSteps = extractNumberedSteps(top.instructions);

    const acknowledge =
      `I understand the scenario: "${q}". Based on the Matrix-2026 guide, the closest match is the procedure below.`;

    const matrixRef = `${top.tab} → Row ${top.row} → ${top.description}`;

    const stepsBlock = extractedSteps.length
      ? extractedSteps.map((s, i) => `${i + 1}. ${s}`).join("\n")
      : `1. not covered in documentation.`;

    const reminders =
      `${formatRoutingLine("Slack", routing.slack)}\n` +
      `${formatRoutingLine("Refund Queue", routing.refundQueue)}\n` +
      `${formatRoutingLine("Create a Ticket", routing.ticket)}\n` +
      `${formatRoutingLine("Supervisor", routing.supervisor)}\n\n` +
      `If the scenario still does not fit exactly or the customer escalates, follow the routing above and escalate to a supervisor when required by the matrix.`;

    const answer =
      `Acknowledge\n${acknowledge}\n\n` +
      `Matrix Reference\n${matrixRef}\n\n` +
      `Step-by-step Guidance\n${stepsBlock}\n\n` +
      `Reminders / Escalation\n${reminders}\n\n` +
      `Source\nMatrix-2026`;

    return res.json({
      answer,
      source: "Matrix-2026 • Engine: Matrix-only",
      proof: hits.slice(0, 6),
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
