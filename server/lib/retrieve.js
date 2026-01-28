import fs from "fs";
import path from "path";

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(s) {
  const t = norm(s);
  if (!t) return [];
  return t.split(" ").filter(Boolean);
}

function scoreEntry(entry, qTokens, qNorm) {
  const fields = entry.fields || {};
  const scenario = norm(fields.Scenario || fields["Scenario / Issue"] || "");
  const issue = norm(fields.Issue || fields["Issue / Situation"] || "");
  const guestSays = norm(fields["Guest Says"] || fields.GuestSays || "");
  const desc = norm(fields.Description || fields.description || "");
  const instr = norm(fields.Instructions || fields.Instruction || "");

  const blob = `${scenario} ${issue} ${guestSays} ${desc} ${instr} ${norm(
    entry.text || ""
  )}`;

  let score = 0;

  for (const tok of qTokens) {
    if (!tok) continue;
    if (blob.includes(tok)) score += 2;
    if (scenario.includes(tok)) score += 6;
    if (issue.includes(tok)) score += 6;
    if (guestSays.includes(tok)) score += 5;
    if (desc.includes(tok)) score += 3;
  }

  if (scenario && qNorm && scenario.includes(qNorm)) score += 28;
  if (issue && qNorm && issue.includes(qNorm)) score += 22;
  if (guestSays && qNorm && guestSays.includes(qNorm)) score += 20;

  const boosts = [
    "reservation not found",
    "can t check in",
    "cant check in",
    "cannot check in",
    "hotel cannot find",
    "room not found",
    "check in issue",
    "unconfirmed",
  ];
  for (const b of boosts) {
    if (qNorm.includes(b) && blob.includes(b)) score += 28;
  }

  return score;
}

function instructionsToSteps(instructionsRaw) {
  const raw = String(instructionsRaw || "").trim();
  if (!raw) return [];

  let parts = raw
    .replace(/\r/g, "")
    .split(/\s(?=\d+\.)/g)
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length <= 1) {
    parts = raw
      .split(/,\s*(?=\d+\.)/g)
      .map((p) => p.trim())
      .filter(Boolean);
  }

  const steps = parts
    .map((p) => p.replace(/^\d+\.\s*/, "").trim())
    .filter(Boolean);

  return steps.length ? steps : [raw];
}

/**
 * Find a value from fields using many possible header names.
 * (Your Excel headers vary by tab.)
 */
function pickField(fields, keys) {
  for (const k of keys) {
    if (fields[k] != null && String(fields[k]).trim() !== "") return fields[k];
  }

  // also try case-insensitive match
  const map = new Map(Object.keys(fields).map((k) => [k.toLowerCase(), k]));
  for (const k of keys) {
    const real = map.get(String(k).toLowerCase());
    if (real && fields[real] != null && String(fields[real]).trim() !== "") {
      return fields[real];
    }
  }

  return "";
}

export function createRetriever() {
  const knowledgeDir = path.resolve("knowledge");
  const matrixPath = path.join(knowledgeDir, "matrix-2026.json");
  const combinedPath = path.join(knowledgeDir, "knowledge.json");

  let entries = [];
  if (fs.existsSync(matrixPath)) {
    entries = JSON.parse(fs.readFileSync(matrixPath, "utf-8"));
  } else if (fs.existsSync(combinedPath)) {
    entries = JSON.parse(fs.readFileSync(combinedPath, "utf-8"));
  }

  return function retrieveBest(question) {
    const qNorm = norm(question);
    const qTokens = tokenize(question);

    let best = null;
    let bestScore = -1;

    for (const entry of entries) {
      const s = scoreEntry(entry, qTokens, qNorm);
      if (s > bestScore) {
        bestScore = s;
        best = entry;
      }
    }

    if (!best || bestScore < 10) return null;

    const fields = best.fields || {};

    const scenario = pickField(fields, ["Scenario", "Scenario / Issue", "Issue"]);
    const quickAnswer = pickField(fields, [
      "Description",
      "What to do",
      "What to do next",
      "Guidance",
      "Scenario",
    ]);

    const instructions = pickField(fields, ["Instructions", "Instruction", "Procedure", "Steps"]);
    const steps = instructionsToSteps(instructions);

    // ✅ FIX: your routing headers are different — map them all
    const queue = pickField(fields, [
      "Queue",
      "Queue?",
      "Refund Queue",
      "Refund queue",
      "Routing",
    ]);

    const slack = pickField(fields, [
      "Slack",
      "Slack?",
      "Slack Channel",
      "Slack channel",
    ]);

    const ticket = pickField(fields, [
      "Ticket",
      "Ticket?",
      "Create Ticket",
      "Create ticket",
      "Submit Ticket",
      "Submit ticket",
    ]);

    const supervisor = pickField(fields, [
      "Supervisor",
      "Supervisor/Escalation",
      "Supervisor/Escalations",
      "Escalation",
      "Escalations",
    ]);

    // ✅ FIX: row number should always exist
    const sheet = best.sheet || pickField(fields, ["Sheet"]) || "Unknown Sheet";
    const row =
      best.rowNumber ||
      best.row ||
      pickField(fields, ["Row", "Row #", "Row#", "Row Number", "RowNumber"]) ||
      "";

    const rowNum = String(row).trim();

    return {
      hit: best,
      score: bestScore,
      scenario,
      quickAnswer,
      steps,
      routing: { queue, slack, ticket, supervisor },
      sourceLine: `Matrix-2026 > ${sheet}${rowNum ? ` > Row ${rowNum}` : ""}`,
      sheet,
      rowNumber: rowNum || null,
    };
  };
}
