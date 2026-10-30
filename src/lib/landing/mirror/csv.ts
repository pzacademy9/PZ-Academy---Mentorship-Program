// src/lib/landing/mirror/csv.ts
// Small RFC-4180 CSV reader for the registrations sheet export.

export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let touched = false; // current line has any content or a comma
  const endRow = () => {
    row.push(field);
    if (touched) rows.push(row);
    row = [];
    field = "";
    touched = false;
  };
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') { inQuotes = true; touched = true; }
    else if (c === ",") { row.push(field); field = ""; touched = true; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      endRow();
    } else { field += c; touched = true; }
  }
  if (touched) endRow();
  return rows;
}

export function isCsvSheet(rows: string[][]): boolean {
  const head = rows[0];
  if (!head) return false;
  return ["Email", "Submitted At", "Payment Confirmation"].every((h) => head.some((c) => c.trim() === h));
}
