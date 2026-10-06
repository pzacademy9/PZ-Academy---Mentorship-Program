import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|ts)$/.test(n) ? [p] : [];
  });
}
const files = [
  ...walk(join(ROOT, "src", "components", "sales")),
  ...walk(join(ROOT, "src", "app", "dashboard", "sales")),
  ...walk(join(ROOT, "src", "app", "dashboard", "admin", "sales-hub", "safety")),
  ...walk(join(ROOT, "src", "components", "admin", "sales")).filter((f) => !f.endsWith("SalesTeamPanel.tsx")),
  ...["sales-ui.ts", "sales-admin-ui.ts", "sales-help-copy.ts", "send-limits.ts"]
    .map((n) => join(ROOT, "src", "lib", "crm", n))
    .filter(existsSync),
];
const rel = (f: string) => relative(ROOT, f).replace(/\\/g, "/");

describe("sales UI guards", () => {
  it("no raw colours: hex, rgb(), white/black utilities", () => {
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src, rel(f)).not.toMatch(/#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?(?:[0-9a-fA-F]{2})?\b/);
      expect(src, rel(f)).not.toMatch(/rgba?\(/);
      expect(src, rel(f)).not.toMatch(/\b(?:bg|text|border)-(?:white|black)\b/);
    }
  });

  it("Stitch tokens always carry the pz- prefix", () => {
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src, rel(f)).not.toMatch(
        /(?<![\w-])(?:bg|text|border|ring|fill|from|to|divide)-(?:primary|secondary|tertiary|surface|on-|outline|error|inverse|background)/,
      );
    }
  });

  it("adaptive text tokens are never used as backgrounds", () => {
    for (const f of files) {
      expect(readFileSync(f, "utf8"), rel(f)).not.toMatch(/\bbg-pz-(?:deep|forest|mid|pine|sage|danger)\b/);
    }
  });

  it("no Material Symbols and no arbitrary radii (repo radii decision D7)", () => {
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src, rel(f)).not.toContain("material-symbols");
      expect(src, rel(f)).not.toMatch(/rounded(?:-[a-z]+)?-\[/);
    }
  });

  it("copy never promises safety", () => {
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src, rel(f)).not.toMatch(/\bsafe\b(?!-area)/i);
      expect(src, rel(f)).not.toMatch(/\bsafely\b|guarantee|anti-ban|risk score|100%|bulk sender|protect|\bshield\b|detect/i);
    }
  });
});
