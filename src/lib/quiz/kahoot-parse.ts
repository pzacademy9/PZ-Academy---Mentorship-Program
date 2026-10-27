// src/lib/quiz/kahoot-parse.ts
// Reads a Kahoot report (.xlsx or .csv) into player rows. Pure apart from readKahootFile.
// Real reports have many tabs: the main one is "Final Scores" (Rank, Player, Total Score (points),
// Correct Answers, Incorrect Answers) under two title rows; "Kahoot! Summary" and "RawReportData Data"
// look similar and must not be picked.

export type KahootRow = {
  line: number;
  rank: number | null;
  player: string;
  score: number;
  correct: number;
  incorrect: number;
  hint: string;
};

export type ParseOk = { ok: true; rows: KahootRow[]; skipped: number; sheetName: string; hasCounts: boolean; hasRank: boolean };
export type ParseResult = ParseOk | { ok: false; message: string };
export type ReadResult = (ParseOk & { questionCount: number | null }) | { ok: false; message: string };

export const MAX_BYTES = 5 * 1024 * 1024;
export const MAX_ROWS = 5000;
const HEADER_SCAN_ROWS = 10;

const text = (v: unknown): string => (v === null || v === undefined ? "" : String(v));

/** Accepts 1250, "1250.0", "1,250". Returns null for anything that is not a non-negative whole number. */
function toCount(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 && Number.isInteger(v) ? v : null;
  const s = text(v).replace(/[,\s]/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && Number.isInteger(n) ? n : null;
}

type Cols = { player: number; score: number; correct: number; incorrect: number; rank: number; hint: number };

function findHeader(grid: unknown[][]): { at: number; cols: Cols } | null {
  for (let i = 0; i < Math.min(grid.length, HEADER_SCAN_ROWS); i++) {
    const cells = (grid[i] ?? []).map((c) => text(c).trim().toLowerCase());
    if (cells.some((c) => c.startsWith("question"))) continue; // per-answer raw data, not the final table
    const player = cells.findIndex((c) => c === "player");
    const total = cells.findIndex((c) => c.includes("total score"));
    const score = total >= 0 ? total : cells.findIndex((c) => c.startsWith("score"));
    if (player < 0 || score < 0) continue;
    return {
      at: i,
      cols: {
        player,
        score,
        correct: cells.findIndex((c) => c.startsWith("correct")),
        incorrect: cells.findIndex((c) => c.startsWith("incorrect")),
        rank: cells.findIndex((c) => c === "rank"),
        hint: cells.findIndex((c, idx) => idx !== player && (c.includes("identifier") || c === "name" || c === "full name")),
      },
    };
  }
  return null;
}

export function parseKahootGrid(grid: unknown[][], sheetName = ""): ParseResult {
  const header = findHeader(grid);
  if (!header) return { ok: false, message: "This does not look like a Kahoot report. I could not find the Player and Score columns." };
  const { at, cols } = header;
  const rows: KahootRow[] = [];
  let skipped = 0;
  for (let i = at + 1; i < grid.length; i++) {
    const r = grid[i] ?? [];
    const player = text(r[cols.player]);
    if (r.every((c) => text(c).trim() === "")) continue; // fully blank line: not a player
    if (player.trim() === "") { skipped++; continue; }
    const score = toCount(r[cols.score]);
    if (score === null) { skipped++; continue; }
    rows.push({
      line: i + 1,
      rank: cols.rank >= 0 ? toCount(r[cols.rank]) : null,
      player,
      score,
      correct: cols.correct >= 0 ? (toCount(r[cols.correct]) ?? 0) : 0,
      incorrect: cols.incorrect >= 0 ? (toCount(r[cols.incorrect]) ?? 0) : 0,
      hint: cols.hint >= 0 ? text(r[cols.hint]).trim() : "",
    });
    if (rows.length > MAX_ROWS) return { ok: false, message: `Too many rows (more than ${MAX_ROWS}).` };
  }
  if (rows.length === 0) return { ok: false, message: "The report has no players." };
  return { ok: true, rows, skipped, sheetName, hasCounts: cols.correct >= 0 && cols.incorrect >= 0, hasRank: cols.rank >= 0 };
}

/** Small CSV reader: quoted fields, doubled quotes, CRLF, BOM. */
export function parseCsv(input: string): string[][] {
  const src = input.replace(/^﻿/, "");
  const out: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      out.push(row); row = [];
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) { row.push(cell); out.push(row); }
  return out;
}

/** "Played 20 of 20" on the Overview tab, else the number of Q<n> columns on the Summary tab. */
function questionCountFrom(sheets: { sheet: string; data: unknown[][] }[]): number | null {
  for (const s of sheets) {
    for (const row of s.data) {
      if (text(row[0]).trim().toLowerCase() === "played") {
        const m = /\d+/.exec(text(row[1]));
        if (m) return Number(m[0]);
      }
    }
  }
  for (const s of sheets) {
    const header = s.data.find((row) => (row ?? []).some((c) => /^q\d+$/i.test(text(c).trim())));
    if (header) return header.filter((c) => /^q\d+$/i.test(text(c).trim())).length;
  }
  return null;
}

function rankSheet(name: string, r: ParseOk): number {
  let score = 0;
  if (name.trim().toLowerCase() === "final scores") score += 4;
  if (r.hasRank) score += 2;
  if (r.hasCounts) score += 1;
  return score;
}

export async function readKahootFile(name: string, bytes: Uint8Array): Promise<ReadResult> {
  const lower = name.toLowerCase();
  const isCsv = lower.endsWith(".csv");
  const isXlsx = lower.endsWith(".xlsx");
  if (!isCsv && !isXlsx) return { ok: false, message: "Please upload the Kahoot report as an .xlsx or .csv file." };
  if (bytes.byteLength === 0) return { ok: false, message: "The file is empty." };
  if (bytes.byteLength > MAX_BYTES) return { ok: false, message: "The file is too big (5 MB is the limit)." };

  let sheets: { sheet: string; data: unknown[][] }[];
  try {
    if (isCsv) {
      sheets = [{ sheet: "CSV", data: parseCsv(new TextDecoder("utf-8").decode(bytes)) }];
    } else {
      const { default: readXlsxFile } = await import("read-excel-file/node");
      const result = await readXlsxFile(Buffer.from(bytes));
      sheets = (result as unknown as { sheet: string; data: unknown[][] }[]).map((s) => ({ sheet: s.sheet, data: s.data }));
    }
  } catch {
    return { ok: false, message: "I could not open this file. Is it the report downloaded from Kahoot?" };
  }

  let best: { r: ParseOk; rank: number } | null = null;
  let lastError = "This does not look like a Kahoot report. I could not find the Player and Score columns.";
  for (const s of sheets) {
    const r = parseKahootGrid(s.data, s.sheet);
    if (!r.ok) { lastError = r.message; continue; }
    const rank = rankSheet(s.sheet, r);
    if (!best || rank > best.rank) best = { r, rank };
  }
  if (!best) return { ok: false, message: lastError };
  return { ...best.r, questionCount: questionCountFrom(sheets) };
}
