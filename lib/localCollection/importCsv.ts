export interface ParsedCsvResult {
  headers: string[];
  rows: string[][];
  malformed: boolean;
}

export function parseCsv(text: string): ParsedCsvResult {
  const input = String(text || "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let atFieldStart = true;
  let malformed = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    const next = input[i + 1];

    if (inQuotes) {
      if (ch === "\"") {
        if (next === "\"") {
          field += "\"";
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === "\"") {
      if (!atFieldStart) malformed = true;
      inQuotes = true;
      atFieldStart = false;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      atFieldStart = true;
      continue;
    }
    if (ch === "\r" || ch === "\n") {
      row.push(field);
      field = "";
      atFieldStart = true;
      if (row.some((value) => String(value || "").trim().length > 0)) rows.push(row);
      row = [];
      if (ch === "\r" && next === "\n") i += 1;
      continue;
    }
    field += ch;
    atFieldStart = false;
  }

  if (inQuotes) malformed = true;
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((value) => String(value || "").trim().length > 0)) rows.push(row);
  }

  const headerRow = rows[0] || [];
  const dataRows = rows.slice(1);
  const headers = headerRow.map((value) => String(value || "").trim());
  return { headers, rows: dataRows, malformed };
}
