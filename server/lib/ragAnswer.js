// server/lib/ragAnswer.js
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function cleanText(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function buildContext(hits) {
  return hits.slice(0, 5).map((h, i) => {
    const src =
      `${h.source || "Matrix-2026"}`
      + (h.sheet ? ` > ${h.sheet}` : "")
      + (h.row ? ` > Row ${h.row}` : "");

    const details =
      h.fields && Object.keys(h.fields).length
        ? Object.entries(h.fields)
            .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "")
            .slice(0, 20)
            .map(([k, v]) => `${k}: ${cleanText(v)}`)
            .join("\n")
        : cleanText(h.text);

    return `SNIPPET ${i + 1}\nSOURCE: ${src}\nCONTENT:\n${details}`;
  }).join("\n\n---\n\n");
}

function enforceTemplate(answerText, fallbackSources = []) {
  const txt = String(answerText || "").trim();

  // If the model didn't follow the format, wrap it into our required structure.
  const hasHeadings =
    txt.includes("### Quick Answer") &&
    txt.includes("### Action Steps") &&
    txt.includes("### Routing") &&
    txt.includes("### Source");

  if (hasHeadings) return txt;

  const sources = fallbackSources.length
    ? fallbackSources.map(s => `- ${s}`).join("\n")
    : "- Matrix-2026";

  return [
    "### Quick Answer",
    txt ? txt.split("\n")[0] : "Not covered in official documentation for the selected mode.",
    "",
    "### Action Steps",
    "- Review the closest matching matrix entry below.",
    "- Follow the documented steps exactly as written in the matrix.",
    "",
    "### Routing",
    "- Queue: (not specified in retrieved snippets)",
    "- Ticket: (not specified in retrieved snippets)",
    "- Slack: (not specified in retrieved snippets)",
    "- Supervisor/Escalation: (not specified in retrieved snippets)",
    "",
    "### Source",
    sources,
  ].join("\n");
}

export async function ragAnswer({ question, mode, hits }) {
  const context = buildContext(hits);

  const system = `
You are a closed-book compliance assistant for call center agents.

ABSOLUTE RULES:
- Use ONLY the provided snippets. Do not use outside knowledge.
- If the snippets do not contain the answer, respond EXACTLY:
Not covered in official documentation for the selected mode.

OUTPUT FORMAT (must match exactly):
### Quick Answer
(1–2 short sentences)

### Action Steps
- Step 1
- Step 2
- Step 3

### Routing
- Queue: (only if present in snippets)
- Ticket: (only if present in snippets)
- Slack: (only if present in snippets)
- Supervisor/Escalation: (only if present in snippets)

### Source
- (list the best snippet source(s), 1–3 lines)

STYLE:
- Short, direct, agent-friendly.
- Use **bold** only for MUST-DO warnings.
- No extra sections. No long paragraphs.
`;

  const user = `
MODE: ${mode}

QUESTION:
${question}

SNIPPETS:
${context}

Write the answer now in the required format.
`;

  let text = "";
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

  try {
    const resp = await client.responses.create({
      model,
      input: [
        { role: "system", content: system.trim() },
        { role: "user", content: user.trim() },
      ],
      temperature: 0.1,
    });

    text = (resp.output_text || "").trim();
  } catch (e) {
    const resp = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: system.trim() },
        { role: "user", content: user.trim() },
      ],
      temperature: 0.1,
    });

    text = resp.choices?.[0]?.message?.content?.trim() || "";
  }

  const sourceLines = hits.slice(0, 3).map((h) => {
    const src =
      `${h.source || "Matrix-2026"}`
      + (h.sheet ? ` > ${h.sheet}` : "")
      + (h.row ? ` > Row ${h.row}` : "");
    return src;
  });

  // Hard-enforce the template even if the model ignores it
  const answer = enforceTemplate(text, sourceLines);

  const citations = hits.slice(0, 3).map((h) => ({
    source: h.source || "Matrix-2026",
    sheet: h.sheet || null,
    row: h.row || null,
    score: h.score,
  }));

  return { answer, source: mode, citations };
}
