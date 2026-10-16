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

  it("strips chatter and an outer markdown fence around the whole file", () => {
    const r = parseImportFile("Sure! Here is your file:\n\n```markdown\n" + FRONT + HERO + "```\n");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.file.front.title).toBe("Test");
      expect(r.file.sections).toHaveLength(1);
      expect(r.file.sections[0].data.headline).toBe("Hi");
    }
  });

  it("strips a plain outer fence", () => {
    const r = parseImportFile("```\n" + FRONT + HERO + "```");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.file.sections).toHaveLength(1);
  });

  it("ignores a --- rule in chatter before the real front matter", () => {
    const r = parseImportFile("Intro\n---\nmore chatter\n---\n" + FRONT + HERO);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.file.front.title).toBe("Test");
  });

  it("handles BOM and CRLF with no stray characters left", () => {
    const src =
      "\uFEFF" +
      FRONT.replace("title: Test", "title: Test\nsummary: |\n  one\n  two") +
      HERO.replace("headline: Hi", "headline: |\n  a\n  b");
    const r = parseImportFile(src.replace(/\n/g, "\r\n"));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(JSON.stringify(r.file)).not.toContain("\\r");
      expect(JSON.stringify(r.file)).not.toContain("\uFEFF");
      expect(r.file.front.summary).toBe("one\ntwo\n");
      expect(r.file.sections[0].data.headline).toBe("a\nb\n");
    }
  });

  it("converts curly quotes before reading", () => {
    const r = parseImportFile(FRONT + "\n## Section: hero\n```yaml\nheadline: “Hello: world”\nsub: ‘x’\nnote: Don’t\n```\n");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.file.sections[0].data).toEqual({ headline: "Hello: world", sub: "x", note: "Don't" });
  });

  it("keeps valid curly quotes as written and only rescues on failure", () => {
    const r = parseImportFile(
      FRONT + "\n## Section: hero\n```yaml\nheadline: 'Don’t'\nsub: “Hello” world\nnote: ‘90s\n```\n",
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.file.sections[0].data).toEqual({
        headline: "Don’t",
        sub: "“Hello” world",
        note: "‘90s",
      });
    }
  });

  it("reports line numbers of the original file", () => {
    const chatter = "Hello\nthere\n```markdown\n";
    const bad = FRONT + "\n## Section: hero\n```yaml\nheadline: Hi\n```\n\n## Section: faq\n```yaml\nitems: [a, b\nq: : :\n```\n```\n";
    const src = chatter + bad;
    const lines = src.split("\n");
    const m = errs(parseImportFile(src))[0].match(/near line (\d+)/);
    expect(m).not.toBeNull();
    expect(lines[Number(m![1]) - 1]).toMatch(/items: \[a, b|q: : :/);
    const ok = parseImportFile(chatter + FRONT + HERO + "```\n");
    const heroLine = (chatter + FRONT + HERO).split("\n").findIndex((l) => l.startsWith("## Section: hero")) + 1;
    expect(ok.ok && ok.file.sections[0].line).toBe(heroLine);
  });

  it("never throws on empty or non-string input", () => {
    expect(errs(parseImportFile(""))).toEqual([FMT]);
    expect(errs(parseImportFile(undefined as unknown as string))).toEqual([FMT]);
    expect(errs(parseImportFile(42 as unknown as string))).toEqual([FMT]);
  });

  it("rejects wrong or missing format", () => {
    expect(errs(parseImportFile(FRONT.replace("/1", "/2") + HERO))).toEqual([FMT]);
    expect(errs(parseImportFile("---\nkind: course\n---\n" + HERO))).toEqual([FMT]);
    expect(errs(parseImportFile("nothing here"))).toEqual([FMT]);
  });

  it("reports unclosed and unreadable front matter plainly", () => {
    expect(errs(parseImportFile("---\nformat: pz-landing/1\n"))[0]).toMatch(/not closed/);
    const bad = errs(parseImportFile("---\nformat: [pz\nkind: : :\n---\n"));
    expect(bad).toHaveLength(1);
    expect(bad[0]).toMatch(/^The top of the file could not be read near line \d+\.$/);
    expect(bad[0]).not.toMatch(/yaml|schema/i);
  });

  it("names the heading on bad YAML", () => {
    const m = errs(parseImportFile(FRONT + "\n## Section: faq\n```yaml\nitems: [a, b\nq: : :\n```\n"));
    expect(m).toHaveLength(1);
    expect(m[0]).toMatch(/^The 'faq' section could not be read near line \d+\.$/);
  });

  it("collects several problems at once", () => {
    const r = parseImportFile(
      FRONT +
        "\n## Section: nonsense\n```yaml\na: 1\n```\n\n## Section: faq\nno block\n\n## Section: hero\n```yaml\nx: [\n```\n",
    );
    expect(errs(r)).toHaveLength(3);
  });

  it("uses exact wording for unknown sections and missing blocks", () => {
    expect(errs(parseImportFile(FRONT + "\n## Section: nonsense\n```yaml\na: 1\n```\n"))).toEqual([
      "The section 'nonsense' is not a section this page format knows.",
    ]);
    expect(errs(parseImportFile(FRONT + "\n## Section: faq\nno block\n"))).toEqual([
      "The 'faq' section has no content block under it.",
    ]);
  });

  it("never matches a prefix of a longer heading", () => {
    for (const h of ["hero-banner", "feature cards", "hero (main)"]) {
      const m = errs(parseImportFile(FRONT + "\n## Section: " + h + "\n```yaml\na: 1\n```\n"));
      expect(m).toEqual(["The section '" + h + "' is not a section this page format knows."]);
    }
  });

  it("matches real section names case-insensitively", () => {
    const r = parseImportFile(FRONT + "\n## Section: FAQ\n```yaml\na: 1\n```\n");
    expect(r.ok && r.file.sections[0].type).toBe("faq");
  });

  it("reports tabs plainly without throwing", () => {
    const r = parseImportFile(FRONT + "\n## Section: hero\n```yaml\nitems:\n\t- a\n```\n");
    expect(r.ok).toBe(false);
    expect(errs(r)[0]).toMatch(/tab/i);
    expect(errs(r)[0]).not.toMatch(/yaml|schema/i);
  });

  it("normalises bullets deeply in section data", () => {
    const r = parseImportFile(
      FRONT + '\n## Section: rich_text\n```yaml\nbody: |\n  • a\n  1. b\nitems:\n  - text: "● x"\n```\n',
    );
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
  it("handles extra bullet styles and spacing", () => {
    expect(normalizeBullets("•Item\n• b\n‣ c\n◦ d\n○ e\n■ f\n* g")).toBe(
      "- Item\n- b\n- c\n- d\n- e\n- f\n- g",
    );
  });
  it("leaves numbers and mid-line bullets alone", () => {
    expect(normalizeBullets("1.5 litres")).toBe("1.5 litres");
    expect(normalizeBullets("a • b")).toBe("a • b");
    expect(normalizeBullets("**bold** text")).toBe("**bold** text");
  });
});
