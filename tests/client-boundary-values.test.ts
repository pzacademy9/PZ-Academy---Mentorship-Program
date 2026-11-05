// @vitest-environment node
// A server file must never use a plain value (a list, a number, a helper) that
// is exported from a "use client" file: the production build fails with
// "Attempted to call map() from the server but map is on the client".
// Components (Capitalised names) and types are fine.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const SRC = resolve("src");
const files = walk(SRC);
const isClient = (text: string) => /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/.test(text);
const text = new Map(files.map((f) => [f, readFileSync(f, "utf8")]));

function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? join(SRC, spec.slice(2)) : spec.startsWith(".") ? resolve(dirname(from), spec) : null;
  if (!base) return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) if (text.has(c)) return c;
  return null;
}

describe("server files and client-only values", () => {
  it("no server file imports a plain value from a \"use client\" file", () => {
    const problems: string[] = [];
    for (const [file, src] of Array.from(text)) {
      if (isClient(src)) continue;
      for (const m of Array.from(src.matchAll(/import\s+(?!type\b)\{([^}]+)\}\s+from\s+["']([^"']+)["']/g))) {
        const target = resolveImport(file, m[2]);
        if (!target || !isClient(text.get(target)!)) continue;
        for (const raw of m[1].split(",")) {
          const name = raw.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0].trim();
          if (!name || raw.trim().startsWith("type ")) continue;
          // Components start with a capital and contain a lower-case letter; ALL_CAPS values do not count as components.
          if (/^[A-Z]/.test(name) && /[a-z]/.test(name)) continue;
          problems.push(`${file.replace(SRC, "src")}: ${name} from ${m[2]}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
