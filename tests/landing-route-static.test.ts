import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Without generateStaticParams, Next 14 renders a [slug] route as fully dynamic (no-store) even with
// `revalidate` set. Guard the exports that make /e/[slug] ISR-cacheable.
describe("public landing routes stay ISR-cacheable", () => {
  for (const file of ["src/app/e/[slug]/page.tsx", "src/app/e/[slug]/status/page.tsx", "src/app/e/[slug]/[...variant]/page.tsx"]) {
    it(file, () => {
      const src = readFileSync(file, "utf8");
      expect(src).toMatch(/export const revalidate = \d+/);
      expect(src).toMatch(/export async function generateStaticParams/);
      expect(src).toMatch(/export const dynamicParams = true/);
    });
  }
  it("the variant route never reads cookies or headers (it would turn the page dynamic)", () => {
    const src = readFileSync("src/app/e/[slug]/[...variant]/page.tsx", "utf8");
    expect(src).not.toMatch(/next\/headers/);
    expect(src).not.toMatch(/cookies\s*\(/);
    expect(src).not.toMatch(/headers\s*\(/);
  });
});
