import { describe, it, expect } from "vitest";
import { parseImportFile, normalizeBullets } from "@/lib/landing/import/parse";

const FRONT = "---\nformat: pz-landing/1\nkind: course\ntitle: Test\n---\n";
const HERO = "\n## Section: hero\n```yaml\nheadline: Hi\n```\n";
const FMT = "This file is not in the PZ Academy page format (expected pz-landing/1).";

function errs(r: ReturnType<typeof parseImportFile>) {
  return r.ok ? [] : r.problems.map((p) => p.message);
}

describe("parseImportFile", () => {
  it("parses a minimal file", () => {
    const r = parseImportFile(FRONT + HERO);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.file.front.title).toBe("Test");
      expect(r.file.sections).toHaveLength(1);
      expect(r.file.sections[0]).toMatchObject({ type: "hero", data: { headline: "Hi" } });
    }
  });
  it("strips chatter and an outer markdown fence", () => {
    const r = parseImportFile("Sure! Here is your file:\n\n```markdown\n" + FRONT + HERO + "```\n");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.file.sections[0].data.headline).toBe("Hi");
  });
  it("handles BOM and CRLF", () => {
    const r = parseImportFile("﻿" + (FRONT + HERO).replace(/\n/g, "\r\n"));
    expect(r.ok).toBe(true);
  });
  it("rejects wrong or missing format", () => {
    expect(errs(parseImportFile(FRONT.replace("/1", "/2") + HERO))).toEqual([FMT]);
    expect(errs(parseImportFile("---\nkind: course\n---\n" + HERO))).toEqual([FMT]);
    expect(errs(parseImportFile("nothing here"))).toEqual([FMT]);
  });
  it("names the heading on bad YAML", () => {
    const r = parseImportFile(FRONT + "\n## Section: faq\n```yaml\nitems: [a, b\nq: : :\n```\n");
    const m = errs(r);
    expect(m).toHaveLength(1);
    expect(m[0]).toMatch(/^The 'faq' section could not be read near line \d+\.$/);
  });
  it("names an unknown section", () => {
    expect(errs(parseImportFile(FRONT + "\n## Section: nonsense\n```yaml\na: 1\n```\n"))[0]).toContain("'nonsense'");
  });
  it("errors on a heading with no block", () => {
    expect(errs(parseImportFile(FRONT + "\n## Section: faq\nno block\n"))[0]).toContain("'faq'");
  });
  it("reports tabs plainly without throwing", () => {
    const r = parseImportFile(FRONT + "\n## Section: hero\n```yaml\nitems:\n\t- a\n```\n");
    expect(r.ok).toBe(false);
    expect(errs(r)[0]).toMatch(/tab/i);
    expect(errs(r)[0]).not.toMatch(/yaml|schema/i);
  });
  it("normalises bullets deeply in section data", () => {
    const r = parseImportFile(FRONT + "\n## Section: rich_text\n```yaml\nbody: |\n  • a\n  1. b\nitems:\n  - text: \"● x\"\n```\n");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.file.sections[0].data.body).toBe("- a\n- b\n");
      expect((r.file.sections[0].data.items as { text: string }[])[0].text).toBe("- x");
    }
  });
});

describe("normalizeBullets", () => {
  it("converts bullet and numbered lines", () => {
    expect(normalizeBullets("• a\n● b\n– c\n1. d\n2) e\nplain")).toBe("- a\n- b\n- c\n- d\n- e\nplain");
  });
});
