import { describe, it, expect } from "vitest";
import { buildImport } from "@/lib/landing/import/build-content";
import { masterPrompt, EXAMPLE_FILE_BY_KIND } from "@/lib/landing/import/prompts";
import { LINK_ALL_MODULES, LINK_GROUP } from "@/lib/landing/registration/card-price";
import type { PageKind } from "@/lib/landing/content";

const FRONT = `---
format: pz-landing/1
kind: course
title: Linked Cards Course
slug: linked-cards
registration:
  default_region: UAE
  regions:
    - { code: UAE, name: UAE, currency: AED }
    - { code: PK, name: Pakistan, currency: PKR }
  options:
    - { key: full, name: Full Course, kind: bundle }
    - { key: m1, name: Module 1, kind: module }
  tiers:
    - { key: g3, label: Group of 3, size: 3, percent_off: 20 }
  prices:
    full:
      UAE: { amount: 200 }
      PK: { amount: 15000 }
    m1:
      UAE: { amount: 100 }
      PK: { amount: 8000 }
modules:
  - { key: module-1, title: Foundations, format: 3-Day Workshop, days: 3, option: m1 }
---
`;
const cards = (items: string) => `${FRONT}
## Section: pricing_cards
\`\`\`yml
heading: Choose your plan
items:
${items}
\`\`\`
`;
const items = (r: ReturnType<typeof buildImport>) => {
  if (!r.ok) throw new Error(r.errors.join(" | "));
  const s = r.built.content.sections.find((x) => x.type === "pricing_cards")!;
  return s.data.items as { name: string; option: string; price: string }[];
};

describe("importing linked price cards", () => {
  it("keeps valid option values on cards", () => {
    const r = buildImport(cards(`  - name: Full course
    option: full
  - name: Single modules
    option: ${LINK_ALL_MODULES}
  - name: Groups
    option: ${LINK_GROUP}`));
    expect(items(r).map((i) => [i.option, i.price])).toEqual([["full", ""], [LINK_ALL_MODULES, ""], [LINK_GROUP, ""]]);
    if (r.ok) expect(r.built.warnings.map((w) => w.message).filter((m) => /linked/.test(m))).toEqual([]);
  });

  it("imports an unknown option unlinked with a plain warning", () => {
    const r = buildImport(cards(`  - name: Mystery
    option: nope`));
    expect(items(r)[0].option).toBe("");
    if (!r.ok) throw new Error("x");
    expect(r.built.warnings.map((w) => w.message)).toContain(
      'The card "Mystery" is linked to "nope", which is not one of the things people can buy, so it was left unlinked.',
    );
  });

  it("keeps both option and typed price when a file gives both", () => {
    const r = buildImport(cards(`  - name: Full course
    option: full
    price: AED 200`));
    expect(items(r)[0]).toMatchObject({ option: "full", price: "AED 200" });
  });

  it("imports a card with no option and a price as before", () => {
    const r = buildImport(cards(`  - name: Plain
    price: AED 99`));
    expect(items(r)[0]).toMatchObject({ option: "", price: "AED 99" });
  });
});

describe("master prompts for linked cards", () => {
  for (const kind of ["course", "workshop", "webinar"] as PageKind[]) {
    it(`${kind}: teaches option links`, () => {
      const p = masterPrompt(kind);
      expect(p).not.toContain("See price for your country");
      expect(p).toContain("option:");
      if (kind === "webinar") expect(p).not.toContain(LINK_ALL_MODULES);
      else expect(p).toContain(LINK_ALL_MODULES);
      const block = p.split("## Section: pricing_cards")[1].split("## Section:")[0];
      expect(block).not.toContain("price*");
      expect(block).toContain("price: only on a card without option");
      expect(p).toContain(LINK_GROUP);
      expect(p).toMatch(/one country/i);
      expect(p).toMatch(/group discount card/i);
      expect(EXAMPLE_FILE_BY_KIND[kind]).toContain("option:");
    });
  }
});
