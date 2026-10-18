import { describe, it, expect } from "vitest";
import { IMPORT_FORMAT_ID, masterPrompt, EXAMPLE_FILE_BY_KIND } from "@/lib/landing/import/prompts";
import { buildImport } from "@/lib/landing/import/build-content";
import { computeQuote } from "@/lib/landing/registration/pricing";
import { registrationProblems } from "@/lib/landing/registration/config";
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
          expect(prompt, `mentions ${t}`).not.toMatch(new RegExp(String.raw`\b${t}\b`, "i"));
        }
      });

      it("lists field keys derived from the section definitions", () => {
        for (const t of KIND_SECTIONS[kind]) {
          for (const f of SECTION_DEFS[t].fields) {
            if (f.kind === "image") continue;
            expect(prompt, `${t}.${f.key}`).toContain(f.key);
            for (const sub of f.itemFields ?? []) if (sub.kind !== "image" && !(kind === "webinar" && sub.kind === "module")) expect(prompt, `${t}.${f.key}.${sub.key}`).toContain(sub.key);
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
        expect(prompt.length - EXAMPLE_FILE_BY_KIND[kind].length).toBeLessThan(12000);
      });

      it("keeps the rules section (before the section list) short", () => {
        const rules = prompt.split("# The page sections")[0];
        expect(rules.length).toBeLessThan(9000);
      });

      it("states the final outline, group and conflict rules", () => {
        expect(prompt).toContain("write only min: N (no max)");
        expect(prompt).not.toMatch(/max: 10/);
        expect(prompt).toMatch(/leave that field out and list it under "Please check before publishing"/);
        expect(prompt).not.toMatch(/closing summary/);
        if (kind === "course") expect(prompt).toMatch(/titled "Module N: name"/);
        if (kind === "workshop") expect(prompt).toMatch(/titled "Day N: name"/);
      });

      it("embeds its worked example", () => {
        expect(prompt).toContain(EXAMPLE_FILE_BY_KIND[kind]);
      });
    });
  }
});

// Registration messages we knowingly allow in the examples: payment accounts are picked in the editor.
const ALLOWED = [/payment account/i, /account/i, /verif/i];

describe("worked examples", () => {
  for (const kind of KINDS) {
    it(`${kind} example imports cleanly`, () => {
      const r = buildImport(EXAMPLE_FILE_BY_KIND[kind]);
      if (!r.ok) throw new Error(r.errors.join(" | "));
      expect(r.built.kind).toBe(kind);
      expect(r.built.content.sections.map((s) => s.type)).toEqual(KIND_SECTIONS[kind]);
      const unexpected = r.built.warnings.map((w) => w.message).filter((m) => !ALLOWED.some((a) => a.test(m)));
      expect(unexpected).toEqual([]);
      const blocking = registrationProblems(r.built.content.registration).map((p) => p.message).filter((m) => !ALLOWED.some((a) => a.test(m)));
      expect(blocking).toEqual([]);
    });
  }

  it("webinar example offers a Free and a Pro plan", () => {
    const r = buildImport(EXAMPLE_FILE_BY_KIND.webinar);
    if (!r.ok) throw new Error(r.errors.join(" | "));
    const reg = r.built.content.registration;
    expect(reg.options.map((o) => [o.key, !!o.free])).toEqual([["free", true], ["pro", false]]);
    expect(reg.prices.free.UAE.amount).toBe(0);
    expect(reg.prices.free.PK.amount).toBe(0);
    expect(reg.prices.pro.PK.amount).toBeGreaterThan(0);
  });

  it("multi-country examples link their pricing cards instead of typing a price", () => {
    for (const kind of KINDS) {
      const r = buildImport(EXAMPLE_FILE_BY_KIND[kind]);
      if (!r.ok) throw new Error(r.errors.join(" | "));
      expect(r.built.content.registration.regions.length).toBeGreaterThan(1);
      const cards = r.built.content.sections.find((s) => s.type === "pricing_cards")!.data.items as { price: string; option: string }[];
      for (const c of cards) { expect(c.price).toBe(""); expect(c.option).not.toBe(""); }
    }
  });

  it("course example group prices come out as intended", () => {
    const r = buildImport(EXAMPLE_FILE_BY_KIND.course);
    if (!r.ok) throw new Error(r.errors.join(" | "));
    const config = r.built.content.registration;
    const q = (regionKey: string, tierKey: string, groupSize: number) => {
      const res = computeQuote({ config, regionKey, mode: "live", optionKeys: ["full"], tierKey, groupSize, now: new Date("2026-10-01T00:00:00Z") });
      if (!res.ok) throw new Error(res.reason);
      return res.total;
    };
    expect(q("UAE", "g3", 3)).toBe(384); // stated Early Bird total wins
    expect(q("PK", "g3", 3)).toBe(28800); // percent only: 12000 less 20% = 9600 each
    expect(q("UAE", "g5", 6)).toBe(720); // 160 less 25% = 120 each
  });

  it("course example has prices, modules, recorded mode and links", () => {
    const r = buildImport(EXAMPLE_FILE_BY_KIND.course);
    if (!r.ok) throw new Error(r.errors.join(" | "));
    const reg = r.built.content.registration;
    expect(r.built.content.modules.length).toBeGreaterThan(1);
    expect(reg.regions.length).toBeGreaterThan(1);
    expect(reg.tiers.length).toBeGreaterThan(0);
    expect(reg.modes).toEqual(["live", "recorded"]);
    expect(reg.recordedPercentOfRegular).toBe(60);
    expect(r.built.links.some((l) => l.on && l.heroTitle)).toBe(true);
    expect(r.built.links.some((l) => l.on && l.regionKey && l.moduleKey)).toBe(true);
  });
});

describe("prompt guards", () => {
  it("the section-name check can fail", () => {
    const foreign = SECTION_TYPES.find((t) => !KIND_SECTIONS.webinar.includes(t))!;
    const bad = masterPrompt("webinar") + ` ${foreign}`;
    expect(bad).toMatch(new RegExp(String.raw`\b${foreign}\b`, "i"));
  });
  it("webinar prompt never mentions module tags", () => {
    expect(masterPrompt("webinar")).not.toMatch(/module:/);
  });
  it("teaches the new rules", () => {
    for (const k of KINDS) {
      const p = masterPrompt(k);
      expect(p).toContain("write NO price on it");
      expect(p).toContain("Please check");
      expect(p).toContain("Done for you");
      expect(p).toMatch(/default_region is the main country/);
      expect(p).toMatch(/percent_off and NO group_totals/);
      expect(p).not.toMatch(/up to 5 short lines/);
    }
    expect(masterPrompt("webinar")).toMatch(/TWO options/);
  });
  it("covers payment screenshot number, quoting, early bird time and short summary", () => {
    for (const k of KINDS) {
      const p = masterPrompt(k);
      expect(p).toContain("verify_whatsapp");
      expect(p).toContain("early_group_totals".slice(0, 5) === "early" ? "early_group_totals" : "");
      expect(p).toMatch(/double quotes/);
      expect(p).toMatch(/23:59/);
      expect(p).toMatch(/at most 3 lines/);
      expect(p).toMatch(/just interview them/);
    }
  });
});

describe("length limits in the format guide", () => {
  it.each(["course", "workshop", "webinar"] as const)("tells the AI the limits that matter (%s)", (kind) => {
    const p = masterPrompt(kind);
    expect(p).toContain("seo title 120, seo description 300");
    expect(p).toContain("hero headline and hero_title 120, hero subheadline and hero_subtitle 400");
    expect(p).toContain("FAQ question 200, FAQ answer 1500");
  });
});
