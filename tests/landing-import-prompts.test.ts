import { describe, it, expect } from "vitest";
import { IMPORT_FORMAT_ID, masterPrompt, EXAMPLE_FILE_BY_KIND } from "@/lib/landing/import/prompts";
import { buildImport } from "@/lib/landing/import/build-content";
import { KIND_SECTIONS, type PageKind } from "@/lib/landing/content";
import { SECTION_DEFS, SECTION_TYPES } from "@/lib/landing/sections";

const KINDS: PageKind[] = ["course", "workshop", "webinar"];
const BANNED = /\b(variants?|overrides?|resolv\w*|schema|yaml|json)\b/i;

describe("masterPrompt", () => {
  it("exports the format id", () => {
    expect(IMPORT_FORMAT_ID).toBe("pz-landing/1");
  });

  for (const kind of KINDS) {
    describe(kind, () => {
      const prompt = masterPrompt(kind);

      it("names the format and every section of its kind, and no others", () => {
        expect(prompt).toContain("pz-landing/1");
        for (const t of KIND_SECTIONS[kind]) expect(prompt).toContain(`## Section: ${t}`);
        for (const t of SECTION_TYPES) {
          if (KIND_SECTIONS[kind].includes(t)) continue;
          expect(prompt, `mentions ${t}`).not.toMatch(new RegExp(`\b${t}\b`, "i"));
        }
      });

      it("lists field keys derived from the section definitions", () => {
        for (const t of KIND_SECTIONS[kind]) {
          for (const f of SECTION_DEFS[t].fields) {
            if (f.kind === "image") continue;
            expect(prompt, `${t}.${f.key}`).toContain(f.key);
            for (const sub of f.itemFields ?? []) if (sub.kind !== "image") expect(prompt, `${t}.${f.key}.${sub.key}`).toContain(sub.key);
          }
        }
      });

      it("contains the interview rules", () => {
        const p = prompt.toLowerCase();
        expect(p).toContain("one question at a time");
        expect(p).toMatch(/every time/);
        expect(p).toContain("persuasive marketing copy");
        expect(p).toContain("exact wording");
        expect(p).toMatch(/never invent/);
        expect(p).toMatch(/pictures? (are|is) (never|not) (included|in the file)|never include (any )?(pictures|images)/);
        expect(p).toMatch(/added later in the editor/);
        expect(p).toContain("```markdown");
        expect(p).toMatch(/nothing (else )?after/);
        expect(p).toContain("- ");
      });

      it("keeps jargon out", () => {
        const visible = prompt.replace(/^\s*```ym?l\s*$/gim, "");
        expect(visible).not.toMatch(BANNED);
      });

      it("stays a sane length", () => {
        expect(prompt.length - EXAMPLE_FILE_BY_KIND[kind].length).toBeLessThan(9500);
      });

      it("embeds its worked example", () => {
        expect(prompt).toContain(EXAMPLE_FILE_BY_KIND[kind]);
      });
    });
  }
});

describe("worked examples", () => {
  for (const kind of KINDS) {
    it(`${kind} example imports cleanly`, () => {
      const r = buildImport(EXAMPLE_FILE_BY_KIND[kind]);
      if (!r.ok) throw new Error(r.errors.join(" | "));
      expect(r.built.kind).toBe(kind);
      expect(r.built.warnings.filter((w) => w.level === "error")).toEqual([]);
      expect(r.built.content.sections.map((s) => s.type)).toEqual(KIND_SECTIONS[kind]);
    });
  }

  it("course example has prices, modules and links", () => {
    const r = buildImport(EXAMPLE_FILE_BY_KIND.course);
    if (!r.ok) throw new Error(r.errors.join(" | "));
    expect(r.built.content.modules.length).toBeGreaterThan(1);
    expect(r.built.content.registration.regions.length).toBeGreaterThan(1);
    expect(r.built.content.registration.tiers.length).toBeGreaterThan(0);
    expect(r.built.links.some((l) => l.on)).toBe(true);
    expect(r.built.links.some((l) => l.heroTitle)).toBe(true);
  });
});
