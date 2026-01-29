// server/tools/convertMatrixExcelToJson.mjs
import fs from "fs";
import path from "path";
import xlsx from "xlsx";

function slugify(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "sheet";
}

function normHeader(h) {
  return String(h ?? "")
    .replace(/[\u200b\u200c\u200d\uFEFF]/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

function findHeaderRow(rows, maxScan = 40) {
  let bestIdx = -1;
  let bestCount = 0;

  for (let i = 0; i < Math.min(rows.length, maxScan); i++) {
    const row = rows[i] || [];
    const count = row.filter((c) => String(c ?? "").trim() !== "").length;
    if (count > bestCount && count >= 3) {
      bestCount = count;
      bestIdx = i;
    }
  }
  return bestIdx; // 0-based
}

function mapColumns(headers) {
  const map = {};
  headers.forEach((h, i) => {
    const hl = h.toLowerCase();
    if (!hl) return;

    if (hl.includes("instruction")) map.instructions = i;
    else if (hl.includes("slack")) map.slack = i;
    else if (hl.includes("refund") && hl.includes("queue")) map.refundQueue = i;
    else if (hl.includes("create") && hl.includes("ticket")) map.ticket = i;
    else if (hl.includes("supervisor")) map.supervisor = i;
    else if (
      hl.includes("issue") ||
      hl.includes("scenario") ||
      hl.includes("problem") ||
      hl.includes("topic")
    ) {
      if (map.issue == null) map.issue = i;
    }
  });
  return map;
}

function toStr(v) {
  if (v == null) return "";
  return String(v).trim();
}

function convertExcel(excelPath) {
  const wb = xlsx.readFile(excelPath, { cellDates: true });
  const meta = [];
  const allRows = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];

    // get all rows as arrays
    const rows = xlsx.utils.sheet_to_json(ws, { header: 1, raw: true });
    const headerIdx = findHeaderRow(rows);
    if (headerIdx === -1) continue;

    const headerRow = rows[headerIdx] || [];
    const headers = headerRow.map(normHeader);

    // last non-empty header
    let last = 0;
    for (let i = 0; i < headers.length; i++) {
      if (headers[i]) last = i + 1;
    }
    const trimmedHeaders = headers.slice(0, last);
    const colmap = mapColumns(trimmedHeaders);

    meta.push({
      sheet: sheetName,
      headerRow: headerIdx + 1, // excel-style
      headers: trimmedHeaders,
      mappedColumns: Object.fromEntries(
        Object.entries(colmap).map(([k, i]) => [k, trimmedHeaders[i]])
      ),
    });

    for (let r = headerIdx + 1; r < rows.length; r++) {
      const row = rows[r] || [];
      const cells = row.slice(0, last);

      const any = cells.some((c) => String(c ?? "").trim() !== "");
      if (!any) continue;

      const raw = {};
      for (let c = 0; c < trimmedHeaders.length; c++) {
        const key = trimmedHeaders[c] || `COL_${c + 1}`;
        const val = cells[c];
        if (val == null || String(val).trim() === "") continue;
        raw[key] = val;
      }

      const issue = colmap.issue != null ? toStr(cells[colmap.issue]) : "";
      const instructions =
        colmap.instructions != null ? toStr(cells[colmap.instructions]) : "";
      const slack = colmap.slack != null ? toStr(cells[colmap.slack]) : "";
      const refundQueue =
        colmap.refundQueue != null ? toStr(cells[colmap.refundQueue]) : "";
      const ticket = colmap.ticket != null ? toStr(cells[colmap.ticket]) : "";
      const supervisor =
        colmap.supervisor != null ? toStr(cells[colmap.supervisor]) : "";

      allRows.push({
        id: `${slugify(sheetName)}-${r + 1}`,
        tab: sheetName,
        row: r + 1,
        issue,
        instructions,
        slack,
        refundQueue,
        ticket,
        supervisor,
        raw,
      });
    }
  }

  return { rows: allRows, meta };
}

// --------------------
// RUN
// --------------------
const ROOT = process.cwd(); // run from /server
const excelPath = path.join(ROOT, "Matrix-2026.xlsx");

if (!fs.existsSync(excelPath)) {
  console.error(`❌ Excel file not found: ${excelPath}`);
  console.error(`Put Matrix-2026.xlsx inside /server then run again.`);
  process.exit(1);
}

const { rows, meta } = convertExcel(excelPath);

const outDir = path.join(ROOT, "knowledge");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

fs.writeFileSync(path.join(outDir, "knowledge.json"), JSON.stringify(rows, null, 2), "utf-8");
fs.writeFileSync(path.join(outDir, "matrix-2026.meta.json"), JSON.stringify(meta, null, 2), "utf-8");

console.log(`✅ Done!`);
console.log(`Rows: ${rows.length}`);
console.log(`Saved: ${path.join(outDir, "knowledge.json")}`);
console.log(`Saved: ${path.join(outDir, "matrix-2026.meta.json")}`);
