import { parse as parseYaml, YAMLParseError } from "yaml";
import { SECTION_TYPES } from "@/lib/landing/sections";
import { normalizeBullets } from "./bullets";

export { normalizeBullets };

export interface ImportProblem { level: "error" | "warning"; message: string }
export interface ParsedFile {
  front: Record<string, unknown>;
  sections: { type: string; heading: string; data: Record<string, unknown>; line: number }[];
}

type Result = { ok: true; file: ParsedFile } | { ok: false; problems: ImportProblem[] };

const FORMAT_MSG = "This file is not in the PZ Academy page format (expected pz-landing/1).";
const err = (message: string): ImportProblem => ({ level: "error", message });

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function deepBullets(v: unknown): unknown {
  if (typeof v === "string") return normalizeBullets(v);
  if (Array.isArray(v)) return v.map(deepBullets);
  if (isRecord(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deepBullets(x)]));
  return v;
}

interface Cleaned { lines: string[]; orig: number[] }

const FORMAT_LINE = /^format\s*:/;

/** Strips BOM, CRLF, an outer code fence and chatter. `orig[i]` is the 1-based line in the user's file. */
function clean(raw: string): Cleaned {
  let lines = raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
  let orig = lines.map((_, i) => i + 1);
  // Outer fence (AI wrapper) before the front matter: drop it and anything before it.
  const fmt = lines.findIndex((l) => FORMAT_LINE.test(l));
  const limit = fmt >= 0 ? fmt : lines.length;
  const open = lines.findIndex((l, i) => i < limit && /^\s*```\s*(markdown|md)?\s*$/i.test(l));
  if (open >= 0) {
    lines = lines.slice(open + 1);
    orig = orig.slice(open + 1);
    let end = lines.length - 1;
    while (end >= 0 && lines[end].trim() === "") end--;
    if (end >= 0 && /^\s*```\s*$/.test(lines[end])) {
      lines = lines.slice(0, end);
      orig = orig.slice(0, end);
    }
  }
  // Front matter: the --- line just above "format:", else the first --- line.
  const fmt2 = lines.findIndex((l) => FORMAT_LINE.test(l));
  let start = -1;
  if (fmt2 >= 0) {
    for (let i = fmt2 - 1; i >= 0; i--) {
      if (lines[i].trim() === "---") { start = i; break; }
    }
  }
  if (start < 0) start = lines.findIndex((l) => l.trim() === "---");
  if (start < 0) start = 0;
  return { lines: lines.slice(start), orig: orig.slice(start) };
}

const straighten = (t: string) => t.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");

function failure(text: string, e: unknown): { hasTabs: boolean; line: number } {
  const hasTabs = /^\t/m.test(text) || (e instanceof YAMLParseError && e.code === "TAB_AS_INDENT");
  const line = e instanceof YAMLParseError && e.linePos ? e.linePos[0].line : 1;
  return { hasTabs, line };
}

export function parseImportFile(raw: string): Result {
  try {
    const cl = clean(typeof raw === "string" ? raw : "");
    const lines = cl.lines;
    const at = (i: number) => cl.orig[Math.min(Math.max(i, 0), cl.orig.length - 1)] ?? 1;
    if (lines.length === 0 || lines[0].trim() !== "---") return { ok: false, problems: [err(FORMAT_MSG)] };
    const close = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
    if (close < 0) return { ok: false, problems: [err("The top of the file (between the two --- lines) is missing or not closed.")] };

    const frontText = lines.slice(1, close).join("\n");
    let front: unknown;
    try {
      front = parseYaml(straighten(frontText));
    } catch (e) {
      const f = failure(frontText, e);
      return {
        ok: false,
        problems: [err(f.hasTabs
          ? "The top of the file uses tab characters for indentation. Use spaces instead."
          : `The top of the file could not be read near line ${at(f.line)}.`)],
      };
    }
    if (!isRecord(front) || front.format !== "pz-landing/1") return { ok: false, problems: [err(FORMAT_MSG)] };

    const problems: ImportProblem[] = [];
    const sections: ParsedFile["sections"] = [];
    const headingRe = /^##\s*Section:\s*(.*?)\s*$/i;
    const heads: { index: number; name: string }[] = [];
    for (let i = close + 1; i < lines.length; i++) {
      const m = headingRe.exec(lines[i]);
      if (m) heads.push({ index: i, name: m[1] });
    }

    heads.forEach((h, n) => {
      const end = n + 1 < heads.length ? heads[n + 1].index : lines.length;
      const type = h.name.toLowerCase();
      if (!/^\w+$/.test(h.name) || !(SECTION_TYPES as readonly string[]).includes(type)) {
        problems.push(err(`The section '${h.name}' is not a section this page format knows.`));
        return;
      }
      let fenceStart = -1;
      let fenceEnd = -1;
      for (let i = h.index + 1; i < end; i++) {
        if (fenceStart < 0 && /^\s*```\s*ya?ml\s*$/i.test(lines[i])) fenceStart = i;
        else if (fenceStart >= 0 && /^\s*```\s*$/.test(lines[i])) { fenceEnd = i; break; }
      }
      if (fenceStart < 0) {
        problems.push(err(`The '${h.name}' section has no content block under it.`));
        return;
      }
      if (fenceEnd < 0) fenceEnd = end;
      const body = lines.slice(fenceStart + 1, fenceEnd).join("\n");
      try {
        const data = body.trim() === "" ? {} : parseYaml(straighten(body));
        if (!isRecord(data)) {
          problems.push(err(`The '${h.name}' section could not be read near line ${at(fenceStart + 1)}.`));
          return;
        }
        sections.push({ type, heading: h.name, data: deepBullets(data) as Record<string, unknown>, line: at(h.index) });
      } catch (e) {
        const f = failure(body, e);
        const near = at(fenceStart + f.line);
        problems.push(err(f.hasTabs
          ? `The '${h.name}' section uses tab characters for indentation (near line ${near}). Use spaces instead.`
          : `The '${h.name}' section could not be read near line ${near}.`));
      }
    });

    if (problems.length) return { ok: false, problems };
    return { ok: true, file: { front, sections } };
  } catch {
    return { ok: false, problems: [err("This file could not be read.")] };
  }
}
