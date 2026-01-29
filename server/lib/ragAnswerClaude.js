// server/lib/ragAnswerClaude.js
import Anthropic from "@anthropic-ai/sdk";

/**
 * This function must be robust:
 * - rows may contain undefined/null (defensive filter)
 * - fields may be missing (default to "")
 * - NEVER throw due to missing fields; fallback gracefully
 */

function s(v) {
  if (v == null) return "";
  return String(v).trim();
}

function buildPrompt(question, rows) {
  const q = s(question);

  const cleanRows = Array.isArray(rows) ? rows.filter(Boolean) : [];

  // If no evidence rows, force "not covered"
  if (!cleanRows.length) {
    return `
You are a compliance assistant. You MUST only use the provided matrix rows.
If you don't have enough information from the rows, respond with "not covered in documentation."

Question:
${q}

Matrix Rows:
(none)

Return JSON ONLY in this exact format:
{
  "escalation": "...",
  "quickAnswer": "...",
  "steps": ["...", "..."]
}
`.trim();
  }

  const formattedRows = cleanRows
    .map((row, i) => {
      // All fields are optional; default to empty strings
      const tab = s(row.tab);
      const rowNum = s(row.row);
      const desc = s(row.description);
      const instr = s(row.instructions);

      const slack = s(row.slack);
      const refundQueue = s(row.refundQueue);
      const ticket = s(row.ticket);
      const supervisor = s(row.supervisor);

      return `
[ROW ${i + 1}]
Tab: ${tab || "N/A"}
Row: ${rowNum || "N/A"}
Description: ${desc || "N/A"}
Instructions: ${instr || "N/A"}
Slack: ${slack || "N/A"}
Refund Queue: ${refundQueue || "N/A"}
Create a Ticket: ${ticket || "N/A"}
Supervisor: ${supervisor || "N/A"}
`.trim();
    })
    .join("\n\n");

  return `
You are a compliance assistant for a Call Center Compliance Guide.

STRICT RULES:
- Use ONLY the content in the Matrix Rows below.
- Do NOT invent steps, policies, or routing.
- If the Matrix Rows do not clearly answer, say "not covered in documentation."
- Keep the output professional, concise, and procedure-driven.

Question:
${q}

Matrix Rows:
${formattedRows}

Return JSON ONLY in this exact format:
{
  "escalation": "one short paragraph",
  "quickAnswer": "one short paragraph",
  "steps": ["step 1", "step 2", "step 3"]
}

Notes:
- "steps" must be clear, sequential actions.
- If the rows conflict, prefer the best-matching row (usually ROW 1).
`.trim();
}

function safeParseJson(text) {
  const raw = s(text);
  if (!raw) return null;

  // Try direct parse first
  try {
    return JSON.parse(raw);
  } catch {}

  // Fallback: extract JSON block from text
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const slice = raw.slice(start, end + 1);
    try {
      return JSON.parse(slice);
    } catch {}
  }

  return null;
}

export async function ragAnswerClaude({ question, rows, model }) {
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const prompt = buildPrompt(question, rows);

  // Pick model (prefer env var)
  const chosenModel = s(model) || s(process.env.CLAUDE_MODEL) || "claude-3-5-sonnet-20241022";

  const resp = await client.messages.create({
    model: chosenModel,
    max_tokens: 700,
    temperature: 0,
    messages: [{ role: "user", content: prompt }],
  });

  // Anthropic response content can be array of blocks
  const text =
    Array.isArray(resp?.content)
      ? resp.content.map((c) => (c?.type === "text" ? c.text : "")).join("\n")
      : s(resp?.content);

  const parsed = safeParseJson(text);

  // Hard fallback (never throw)
  if (!parsed || typeof parsed !== "object") {
    return {
      escalation: "not covered in documentation.",
      quickAnswer: "not covered in documentation.",
      steps: ["not covered in documentation."],
    };
  }

  const escalation = s(parsed.escalation) || "not covered in documentation.";
  const quickAnswer = s(parsed.quickAnswer) || "not covered in documentation.";
  const steps = Array.isArray(parsed.steps)
    ? parsed.steps.map((x) => s(x)).filter(Boolean)
    : [];

  return {
    escalation,
    quickAnswer,
    steps: steps.length ? steps : ["not covered in documentation."],
  };
}
