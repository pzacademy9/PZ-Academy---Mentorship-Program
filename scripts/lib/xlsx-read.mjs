// scripts/lib/xlsx-read.mjs
// A tiny .xlsx reader using only node built-ins (zip + XML). Reads one sheet into rows of strings.
import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";

/** Every file in a zip, by name. Reads the central directory, so it works on any normal .xlsx. */
export function unzip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Not a zip file");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("Bad zip directory");
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    const lNameLen = buf.readUInt16LE(localOffset + 26);
    const lExtraLen = buf.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(start, start + compSize);
    files.set(name, method === 0 ? raw : inflateRawSync(raw));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

const decode = (s) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&");

/** Text of every <t> inside one shared-string item or inline string. */
const textOf = (xml) => [...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1])).join("");

/** "C12" to column index 2. */
function colIndex(ref) {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Rows (arrays of strings, "" for empty cells) of the sheet with this name. */
export function readSheet(path, sheetName) {
  const files = unzip(readFileSync(path));
  const get = (name) => files.get(name)?.toString("utf8") ?? "";

  const shared = [...get("xl/sharedStrings.xml").matchAll(/<si[^>]*>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));

  const wb = get("xl/workbook.xml");
  const sheetTag = [...wb.matchAll(/<sheet\b[^>]*>/g)].map((m) => m[0]).find((t) => decode(/name="([^"]*)"/.exec(t)?.[1] ?? "") === sheetName);
  if (!sheetTag) throw new Error(`Sheet "${sheetName}" not found`);
  const rid = /r:id="([^"]*)"/.exec(sheetTag)?.[1];
  const rels = get("xl/_rels/workbook.xml.rels");
  const relTag = [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((t) => /Id="([^"]*)"/.exec(t)?.[1] === rid);
  const target = /Target="([^"]*)"/.exec(relTag ?? "")?.[1];
  if (!target) throw new Error("Sheet file not found");
  const sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
  const xml = get(sheetPath);

  const rows = [];
  for (const rm of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const rowNum = Number(/\br="(\d+)"/.exec(rm[1])?.[1] ?? rows.length + 1);
    const cells = [];
    for (const cm of rm[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1];
      const body = cm[2] ?? "";
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1] ?? "A1";
      const type = /\bt="([^"]*)"/.exec(attrs)?.[1];
      let value = "";
      if (type === "s") value = shared[Number(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? -1)] ?? "";
      else if (type === "inlineStr") value = textOf(body);
      else value = decode(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "");
      cells[colIndex(ref)] = value;
    }
    rows[rowNum - 1] = Array.from(cells, (c) => c ?? "");
  }
  return Array.from(rows, (r) => r ?? []);
}
