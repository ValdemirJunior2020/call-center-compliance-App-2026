// server/server.js
import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

import { createMatrixSearcher } from "./lib/searchMatrix.js";

// If you already have QA JSON searchers wired in your existing server.js,
// keep them. If not, this file still compiles; QA modes will return "Unsupported"
// until you add them. (But you told me QA modes already work in your server.)
import { qaAnswer } from "./lib/qaAnswer.js"; // <-- keep if it exists in your project

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===== Load Matrix Knowledge =====
const matrixPath = path.join(__dirname, "knowledge", "matrix-2026.json");
const searchMatrix = createMatrixSearcher({ knowledgePath: matrixPath });

// =====================
// SMART CLASSIFICATION
// =====================
function norm(text) {
  return String(text || "").trim().toLowerCase();
}

function isSmallTalk(q) {
  const t = norm(q);
  if (!t) return true;

  const exact = new Set([
    "hi",
    "hello",
    "hey",
    "yo",
    "good morning",
    "good afternoon",
    "good evening",
    "how are you",
    "how r u",
    "whats up",
    "what's up",
    "who are you",
    "what are you",
    "are you real",
    "are you a bot",
    "thanks",
    "thank you",
  ]);

  if (exact.has(t)) return true;

  // short greetings
  if (t.length <= 12 && (t.startsWith("hi") || t.startsWith("hey") || t.startsWith("hello"))) return true;

  return false;
}

function isCapabilityQuestion(q) {
  const t = norm(q);
  const patterns = [
    "what can you do",
    "can you help",
    "help me",
    "what do you do",
    "how do i use this",
    "how does this work",
    "can you answer anything",
    "what can you answer",
    "what questions can i ask",
  ];
  return patterns.some((p) => t.includes(p));
}

function looksLikeTicketIntent(q) {
  const t = norm(q);
  return (
    t.includes("ticket") ||
    t.includes("create a ticket") ||
    t.includes("open a ticket") ||
    t.includes("submit a ticket") ||
    t.includes("case") ||
    t.includes("jira") ||
    t.includes("zendesk")
  );
}

function looksLikeQAIntent(q) {
  const t = norm(q);
  const qaWords = [
    "qa",
    "quality",
    "score",
    "scoring",
    "kpi",
    "passing",
    "pass",
    "fail",
    "markdown",
    "na",
    "n/a",
    "rubric",
    "criteria",
    "call efficiency",
    "expectations",
    "greeting",
    "verification",
    "resolution",
    "ownership",
    "dead air",
    "script",
    "intro",
  ];
  return qaWords.some((w) => t.includes(w));
}

function looksLikeGroupsIntent(q) {
  const t = norm(q);
  const groupWords = ["group", "groups", "rfp", "9 rooms", "room block", "block request", "sales", "proposal"];
  return groupWords.some((w) => t.includes(w));
}

// Auto mode router:
// - If user selected Matrix but question looks QA -> send to QA mode automatically
function resolveMode(requestedMode, question) {
  const t = norm(question);

  // If small talk or capability: keep requested mode but we will short-circuit anyway
  if (!t) return requestedMode;

  if (requestedMode === "Matrix-2026") {
    if (looksLikeQAIntent(t)) {
      return looksLikeGroupsIntent(t) ? "QA-Groups" : "QA-Voice";
    }
  }

  return requestedMode;
}

// Helper: matrix hit filtering
function topMatrixHit(question, { preferTicketTab = false } = {}) {
  const hits = searchMatrix(question, { topK: 10 });

  if (!hits.length) return { hits, top: null };

  if (preferTicketTab) {
    const ticketHits = hits.filter((h) => String(h.tab || "").toLowerCase().includes("ticket"));
    if (ticketHits.length) return { hits, top: ticketHits[0] };
  }

  return { hits, top: hits[0] };
}

/**
 * ✅ Extract numbered steps from a long instruction string.
 * Supports: "1. ... 2. ... 3. ..." and cleans markdown (**)
 */
function extractNumberedSteps(instructions) {
  const raw = String(instructions || "").trim();
  if (!raw) return [];

  let text = raw
    .replace(/\r\n/g, "\n")
    .replace(/\s+/g, " ")
    .replace(/\*\*/g, "")
    .trim();

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

// ======================
// MAIN ASK ENDPOINT
// ======================
app.post("/api/ask", async (req, res) => {
  try {
    const { mode: requestedMode, question } = req.body || {};
    const q = String(question || "").trim();

    if (!q) return res.status(400).json({ error: "Missing question" });

    // 1) Small talk / non-work -> short-circuit (no matrix, no routing buttons)
    if (isSmallTalk(q)) {
      return res.json({
        answer:
          `Acknowledge\n` +
          `I’m here as a work tool for compliance and QA guidance — not as a person.\n\n` +
          `What I can help with\n` +
          `- Matrix-2026: step-by-step procedures (voice + ticket routing)\n` +
          `- QA-Voice: rubric guidance (CS) — KPI pass = 90%\n` +
          `- QA-Groups: rubric guidance (Groups) — KPI pass = 85%\n\n` +
          `Next step\n` +
          `Ask a work scenario like: "guest wants refund outside policy" or "guest wants group rate but only 6 rooms".\n\n` +
          `Source\nSystem Guardrail`,
        source: "Guardrail • Engine: Smart-router",
        proof: [],
        debug: { reason: "smalltalk" },
      });
    }

    // 2) Capability question -> explain modes (no matrix match)
    if (isCapabilityQuestion(q)) {
      return res.json({
        answer:
          `Acknowledge\n` +
          `Yes — I can help, but I only answer using the documents in the app.\n\n` +
          `Supported modes\n` +
          `1. Matrix-2026: procedures + routing (Slack/Queue/Ticket/Supervisor)\n` +
          `2. QA-Voice (CS): scoring rubric guidance (pass = 90%)\n` +
          `3. QA-Groups: scoring rubric guidance (pass = 85%)\n\n` +
          `How to ask\n` +
          `- Matrix example: "hotel sold out at check-in"\n` +
          `- QA example: "agent did not set expectations before hold"\n` +
          `- Groups example: "guest wants group rates for 7 rooms"\n\n` +
          `Source\nSystem Guide`,
        source: "Guide • Engine: Smart-router",
        proof: [],
        debug: { reason: "capability" },
      });
    }

    // 3) Auto-resolve mode when user selected Matrix but question looks QA
    const mode = resolveMode(requestedMode, q);

    // 4) QA modes (if your qaAnswer exists and is already working)
    if (mode === "QA-Voice" || mode === "QA-Groups") {
      // NOTE: this assumes your project already has ./lib/qaAnswer.js
      // because you told me QA is already returning results.
      const out = await qaAnswer({ mode, question: q });

      return res.json({
        ...out,
        // IMPORTANT: ensure routing is not present for QA so frontend hides pills
        routing: null,
      });
    }

    // 5) Matrix-2026 mode
    if (mode !== "Matrix-2026") {
      return res.status(400).json({ error: `Unsupported mode: ${mode}` });
    }

    // If question contains "ticket" -> prefer Ticket Matrix rows first
    const preferTicketTab = looksLikeTicketIntent(q);

    const { hits, top } = topMatrixHit(q, { preferTicketTab });
    const topScore = top?.score ?? 0;

    if (!top || topScore <= 0) {
      return res.json({
        answer:
          `Acknowledge\n` +
          `I understand the scenario, but it is not clearly covered in the Matrix-2026 documentation.\n\n` +
          `Matrix Reference\n` +
          `Matrix-2026: Not covered (no matching row found)\n\n` +
          `Step-by-step Guidance\n` +
          `1. Search the closest documented procedure.\n` +
          `2. If still unclear, escalate to a supervisor.\n\n` +
          `Source\nMatrix-2026`,
        source: "Matrix-2026 • Engine: Matrix-only",
        proof: [],
        routing: null,
        debug: { topScore: 0, matchedCount: 0 },
      });
    }

    const routing = {
      slack: top.slack || "not specified",
      refundQueue: top.refundQueue || "not specified",
      ticket: top.ticket || "not specified",
      supervisor: top.supervisor || "not specified",
    };

    const extractedSteps = extractNumberedSteps(top.instructions);

    const acknowledge =
      `I understand the scenario: "${q}". Based on the Matrix-2026 guide, the closest match is the procedure below.` +
      (preferTicketTab ? ` (Ticket-focused match)` : ``);

    const matrixRef = `${top.tab} → Row ${top.row} → ${top.description}`;

    const stepsBlock = extractedSteps.length
      ? extractedSteps.map((s, i) => `${i + 1}. ${s}`).join("\n")
      : `1. not covered in documentation.`;

    const answer =
      `Acknowledge\n${acknowledge}\n\n` +
      `Matrix Reference\n${matrixRef}\n\n` +
      `Step-by-step Guidance\n${stepsBlock}\n\n` +
      `Source\nMatrix-2026`;

    return res.json({
      answer,
      source: "Matrix-2026 • Engine: Matrix-only",
      proof: hits.slice(0, 6),
      routing,
      debug: { topScore, matchedCount: hits.length, preferTicketTab },
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
