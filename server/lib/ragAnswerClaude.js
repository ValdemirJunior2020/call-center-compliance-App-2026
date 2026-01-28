// server/lib/ragAnswerClaude.js
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

function safeStr(v) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function pickField(fields, keys) {
  if (!fields) return "";
  const map = new Map(Object.keys(fields).map((k) => [k.toLowerCase(), k]));
  for (const k of keys) {
    const real = map.get(k.toLowerCase());
    if (real && safeStr(fields[real])) return safeStr(fields[real]);
  }
  return "";
}

function normalizeYesNo(v) {
  const s = safeStr(v).toLowerCase();
  if (!s) return "";
  if (["yes", "y", "true"].includes(s)) return "yes";
  if (["no", "n", "false"].includes(s)) return "no";
  return safeStr(v);
}

function computeRoutingFromHits(hits) {
  const vals = { queue: [], slack: [], createTicket: [], supervisor: [] };

  for (const h of hits.slice(0, 5)) {
    const f = h.fields || {};
    const queue = pickField(f, ["Queue", "Refund Queue", "Routing Queue"]);
    const slack = pickField(f, ["Slack", "Slack Channel"]);
    const ticket = pickField(f, ["Ticket", "Create Ticket", "Create a Ticket", "Ticket Type"]);
    const sup = pickField(f, ["Supervisor", "Escalation", "Supervisor/Escalation"]);

    if (queue) vals.queue.push(queue);
    if (slack) vals.slack.push(slack);
    if (ticket) vals.createTicket.push(ticket);
    if (sup) vals.supervisor.push(sup);
  }

  const mergeYesNo = (arr) => {
    const norm = arr.map(normalizeYesNo).filter(Boolean);
    if (!norm.length) return "";
    if (norm.includes("yes")) return "yes";
    if (norm.includes("no")) return "no";
    // most common raw
    const counts = new Map();
    for (const v of arr) counts.set(v, (counts.get(v) || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  };

  return {
    queue: mergeYesNo(vals.queue),
    slack: mergeYesNo(vals.slack),
    createTicket: mergeYesNo(vals.createTicket),
    supervisor: mergeYesNo(vals.supervisor),
  };
}

function buildSnippets(hits) {
  return hits.slice(0, 5).map((h, idx) => {
    const fields = h.fields || {};
    const scenario =
      pickField(fields, ["Scenario", "Issue", "Situation", "Title", "Topic"]) || "";
    const guestSays = pickField(fields, ["Guest Says", "Guest", "Customer Says"]) || "";
    const instruction =
      pickField(fields, ["Instruction", "Instructions", "What to do", "Procedure", "Action"]) ||
      "";

    const queue = pickField(fields, ["Queue", "Refund Queue", "Routing Queue"]) || "";
    const slack = pickField(fields, ["Slack", "Slack Channel"]) || "";
    const ticket = pickField(fields, ["Ticket", "Create Ticket", "Ticket Type"]) || "";
    const supervisor =
      pickField(fields, ["Supervisor", "Escalation", "Supervisor/Escalation"]) || "";

    const source = h.source || `Matrix-2026 > ${h.sheet || "Sheet"} > Row ${h.row ?? "?"}`;

    const parts = [
      `SNIPPET ${idx + 1}`,
      `SOURCE: ${source}`,
      scenario ? `SCENARIO: ${scenario}` : null,
      guestSays ? `GUEST: ${guestSays}` : null,
      instruction ? `INSTRUCTIONS: ${instruction}` : null,
      queue ? `QUEUE: ${queue}` : null,
      slack ? `SLACK: ${slack}` : null,
      ticket ? `CREATE TICKET: ${ticket}` : null,
      supervisor ? `SUPERVISOR/ESCALATION: ${supervisor}` : null,
    ].filter(Boolean);

    return parts.join("\n");
  });
}

export async function ragAnswerClaude({ question, mode, hits }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      answer:
        "Server is missing ANTHROPIC_API_KEY. Please set it in your .env and restart the server.",
      source: "System",
      citations: [],
    };
  }

  const model = process.env.CLAUDE_MODEL || "claude-sonnet-4-5-20250929";
  const routing = computeRoutingFromHits(hits);
  const snippets = buildSnippets(hits);

  const system = `
You are HotelPlanner's Call Center Compliance Assistant.

CRITICAL:
- You are NOT the hotel. You are a third-party booking company (HotelPlanner).
- CLOSED-BOOK: Use ONLY the provided SNIPPETS. No outside assumptions.
- If not clearly covered, say "not covered in documentation" and recommend escalation.

OUTPUT FORMAT (Markdown) — EXACT ORDER:
escalation / what to do first
quick answer
steps to follow
routing
source rows

STYLE:
- Short, direct, action-based.
- Convert long instruction text into numbered steps.
- "escalation / what to do first" must be first, and in lowercase title exactly.
- Do NOT write "unknown". If not in snippets, write "not specified in matrix".
`.trim();

  const user = `
QUESTION:
${question}

SNIPPETS:
${snippets.join("\n\n")}

ROUTING MERGE:
queue: ${routing.queue || "not specified in matrix"}
slack: ${routing.slack || "not specified in matrix"}
create ticket: ${routing.createTicket || "not specified in matrix"}
supervisor/escalation: ${routing.supervisor || "not specified in matrix"}

REQUIREMENTS:
- Your answer MUST cite the specific SOURCE rows in the "source rows" section (top 3).
- Use ONLY what the snippets say.
`.trim();

  const resp = await anthropic.messages.create({
    model,
    max_tokens: 750,
    temperature: 0.1,
    system,
    messages: [{ role: "user", content: user }],
  });

  const text = resp?.content?.[0]?.text ? String(resp.content[0].text) : "";

  return {
    answer: text || "not covered in documentation. recommend escalation.",
    source: mode,
    citations: hits.slice(0, 5).map((h) => ({
      source: h.source,
      sheet: h.sheet,
      row: h.row,
      score: h.score ?? null,
    })),
  };
}
