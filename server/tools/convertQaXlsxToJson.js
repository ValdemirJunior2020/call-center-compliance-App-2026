// server/tools/convertQaXlsxToJson.js
// Converts QA Excel forms (Voice + Groups) into JSON files inside server/knowledge/qa
// Requirements: npm i xlsx
import fs from "fs";
import path from "path";
import XLSX from "xlsx";

/**
 * Helpers
 */
function norm(v) {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

function isIdCell(v) {
  const s = norm(v);
  // matches: 1.1 , 2.2 , 3.1.4 etc
  return /^\d+(\.\d+)+$/.test(s);
}

function findHeaderRow(rows, wantedWords = []) {
  // returns { rowIndex, colMap } where colMap[w] = colIndex
  for (let r = 0; r < Math.min(rows.length, 25); r++) {
    const row = rows[r] || [];
    const colMap = {};
    for (let c = 0; c < row.length; c++) {
      const cell = norm(row[c]).toLowerCase();
      for (const w of wantedWords) {
        if (cell === w.toLowerCase()) colMap[w] = c;
      }
    }
    const foundAll = wantedWords.every((w) => colMap[w] != null);
    if (foundAll) return { rowIndex: r, colMap };
  }
  return null;
}

function findColContains(rows, needle) {
  const n = needle.toLowerCase();
  for (let r = 0; r < Math.min(rows.length, 25); r++) {
    const row = rows[r] || [];
    for (let c = 0; c < row.length; c++) {
      const cell = norm(row[c]).toLowerCase();
      if (cell.includes(n)) return { rowIndex: r, colIndex: c };
    }
  }
  return null;
}

function readSheetAsRows(xlsxPath) {
  const wb = XLSX.readFile(xlsxPath, { cellDates: false });
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });
  return { sheetName, rows };
}

/**
 * Core parser
 * The files are "layout-y" with merged cells; so we:
 * - Find the header row containing "Criteria" and "Guideline"
 * - Find the column that contains "Poss Score" (possible score)
 * - Walk down:
 *    when we hit a row that starts a criterion (ID like 1.1) => new criterion
 *    subsequent rows with Criteria = Yes/No and a Guideline => become examples
 */
function parseQaForm({ rows, sheetName, qaType, passThreshold }) {
  // Find key columns
  const header = findHeaderRow(rows, ["Criteria", "Guideline"]);
  if (!header) {
    throw new Error(`[${qaType}] Could not find header row with "Criteria" and "Guideline".`);
  }

  const criteriaCol = header.colMap["Criteria"];
  const guidelineCol = header.colMap["Guideline"];

  // "Poss Score" exists in your files; we use it as the criterion points.
  const poss = findColContains(rows, "poss score");
  const possScoreCol = poss?.colIndex ?? null;

  const criteria = [];

  let current = null;

  // Start scanning after header row
  for (let r = header.rowIndex + 1; r < rows.length; r++) {
    const row = rows[r] || [];

    const idCell = row[0];
    const titleCell = row[1];

    // New criterion starts when col0 looks like 1.1 and col1 has the criterion text
    if (isIdCell(idCell) && norm(titleCell)) {
      // close previous
      if (current) criteria.push(current);

      const points =
        possScoreCol != null ? Number(norm(row[possScoreCol]) || 0) : Number(norm(row[2]) || 0);

      current = {
        id: norm(idCell),
        title: norm(titleCell),
        points: Number.isFinite(points) ? points : 0,
        qaType,
        sheet: sheetName,
        examples: [], // Yes/No/NA guideline lines
        notes: [],
      };

      continue;
    }

    if (!current) continue;

    const yn = norm(row[criteriaCol]); // Yes / No (or blank)
    const guideline = norm(row[guidelineCol]);

    // Store guideline lines
    if (guideline) {
      const ynUpper = yn.toUpperCase();

      // Some rows have blank criteria but contain general notes like "Always applies."
      if (!ynUpper) {
        current.notes.push(guideline);
      } else if (ynUpper === "YES" || ynUpper === "NO" || ynUpper === "N/A" || ynUpper === "NA") {
        current.examples.push({
          result: ynUpper === "N/A" ? "NA" : ynUpper,
          text: guideline,
        });
      } else {
        // Anything weird still captured as note so we don't lose content
        current.notes.push(`${yn}: ${guideline}`);
      }
    }
  }

  // push last
  if (current) criteria.push(current);

  // Clean: remove empty criteria
  const cleaned = criteria.filter((c) => c.id && c.title);

  return {
    meta: {
      version: "2026.1",
      type: "qa_form",
      qaType,
      passThresholdPercent: passThreshold,
      generatedAt: new Date().toISOString(),
    },
    criteria: cleaned,
  };
}

/**
 * Main
 */
function main() {
  const baseDir = process.cwd(); // should be /server when running from server folder
  const qaDir = path.join(baseDir, "knowledge", "qa");

  const voiceXlsx = path.join(qaDir, "qa-form-2023-VOICE.xlsx");
  const groupsXlsx = path.join(qaDir, "QA Groups Ver 1.1.xlsx");

  if (!fs.existsSync(voiceXlsx)) {
    throw new Error(`Missing file: ${voiceXlsx}`);
  }
  if (!fs.existsSync(groupsXlsx)) {
    throw new Error(`Missing file: ${groupsXlsx}`);
  }

  // Voice
  const voice = readSheetAsRows(voiceXlsx);
  const voiceJson = parseQaForm({
    rows: voice.rows,
    sheetName: voice.sheetName,
    qaType: "CS", // Customer Service / Voice
    passThreshold: 90,
  });

  // Groups
  const groups = readSheetAsRows(groupsXlsx);
  const groupsJson = parseQaForm({
    rows: groups.rows,
    sheetName: groups.sheetName,
    qaType: "Groups",
    passThreshold: 85,
  });

  const outVoice = path.join(qaDir, "qa-voice-2026.json");
  const outGroups = path.join(qaDir, "qa-groups-2026.json");

  fs.writeFileSync(outVoice, JSON.stringify(voiceJson, null, 2), "utf-8");
  fs.writeFileSync(outGroups, JSON.stringify(groupsJson, null, 2), "utf-8");

  console.log("✅ QA JSON created:");
  console.log(" -", outVoice);
  console.log(" -", outGroups);
  console.log("\nSummary:");
  console.log("Voice criteria:", voiceJson.criteria.length);
  console.log("Groups criteria:", groupsJson.criteria.length);
}

main();
