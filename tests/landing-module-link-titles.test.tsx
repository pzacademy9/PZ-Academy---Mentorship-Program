import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));

import { resolveVariant } from "@/lib/landing/resolve-variant";
import { emptyOverrides } from "@/lib/landing/variants";
import { emptyContent, type LandingContent } from "@/lib/landing/content";
import { registrationOptionLabel } from "@/lib/landing/registration/labels";
import { selectWaGroups } from "@/lib/landing/registration/wa-groups";
import { StepChoose } from "@/components/landing/registration/StepChoose";
import { OrderSummary } from "@/components/landing/registration/OrderSummary";
import { initialState } from "@/lib/landing/registration/form-state";
import { ppcConfig } from "./fixtures/registration-fixtures";

const WA = "https://chat.whatsapp.com/AbCdEf123456";

function build(titleOne = "National and Global Pharmacovigilance System"): LandingContent {
  const c = emptyContent("course");
  c.sections = [
    { id: "cur1", type: "curriculum", enabled: true, data: { heading: "Course outline", items: [
      { title: "Overview of the course", subtitle: "", points: "", module: "" },
      { title: "Module 1: National and Global Pharmacovigilance System", subtitle: "", points: "- Day 1", module: "module-1" },
      { title: "Module 2: Terminologies", subtitle: "", points: "- Day 4", module: "module-2" },
    ] } },
    { id: "faq1", type: "faq", enabled: true, data: { heading: "FAQ", items: [{ q: "Q?", a: "A", module: "module-1" }] } },
  ];
  c.modules = [
    { key: "module-1", title: titleOne, format: "3-Day Workshop", days: 3, optionKey: "m1" },
    { key: "module-2", title: "Terminologies", format: "3-Day Workshop", days: 3, optionKey: "m2" },
  ];
  c.registration = {
    ...c.registration,
    enabled: true,
    regions: [{ key: "PK", label: "Pakistan", currency: "PKR", classTime: "7pm", timezoneLabel: "PKT", accountKeys: ["a"] }],
    defaultRegionKey: "PK",
    options: [
      { key: "m1", label: "Module 1", kind: "module", free: false, waGroupUrl: WA, moduleIds: [] },
      { key: "m2", label: "Module 2", kind: "module", free: false, waGroupUrl: "", moduleIds: [] },
    ],
    prices: { m1: { PK: { amount: 1000 } }, m2: { PK: { amount: 1000 } } },
  };
  return c;
}

const titles = (c: LandingContent) => (c.sections.find((s) => s.id === "cur1")!.data.items as { title: string }[]).map((i) => i.title);

describe("a module link shows the module's own title", () => {
  it("the curriculum item for that module uses the module title, other items are untouched", () => {
    const r = resolveVariant(build(), { regionKey: null, moduleKey: "module-1" }, emptyOverrides());
    expect(titles(r)).toEqual(["Overview of the course", "National and Global Pharmacovigilance System"]);
  });
  it("works the same with a country in the link", () => {
    const r = resolveVariant(build(), { regionKey: "PK", moduleKey: "module-1" }, emptyOverrides());
    expect(titles(r)).toContain("National and Global Pharmacovigilance System");
  });
  it("the form option shows the module title, while the saved label stays as it is", () => {
    const r = resolveVariant(build(), { regionKey: null, moduleKey: "module-1" }, emptyOverrides());
    expect(r.registration.options).toHaveLength(1);
    expect(r.registration.options[0].displayLabel).toBe("National and Global Pharmacovigilance System");
    expect(r.registration.options[0].label).toBe("Module 1");
    const saved = registrationOptionLabel(r.registration, { mode: "live", optionKeys: ["m1"], tierKey: "individual", groupSize: 1 });
    expect(saved).toBe("Module 1 - Individual");
  });
  it("the main page and country-only links are unchanged", () => {
    const main = resolveVariant(build(), { regionKey: null, moduleKey: null }, emptyOverrides());
    expect(titles(main)).toContain("Module 1: National and Global Pharmacovigilance System");
    expect(main.registration.options.every((o) => o.displayLabel === undefined)).toBe(true);
    const pk = resolveVariant(build(), { regionKey: "PK", moduleKey: null }, emptyOverrides());
    expect(pk.registration.options.every((o) => o.displayLabel === undefined)).toBe(true);
  });
  it("a module with no title changes nothing", () => {
    const c = build("   ");
    const r = resolveVariant(c, { regionKey: null, moduleKey: "module-1" }, emptyOverrides());
    expect(r.registration.options[0].displayLabel).toBeUndefined();
    expect(titles(r)).toContain("Module 1: National and Global Pharmacovigilance System");
  });
  it("never changes the content it was given", () => {
    const c = build();
    const before = JSON.stringify(c);
    resolveVariant(c, { regionKey: null, moduleKey: "module-1" }, emptyOverrides());
    expect(JSON.stringify(c)).toBe(before);
  });
  it("the WhatsApp group button uses the module title", () => {
    const r = resolveVariant(build(), { regionKey: null, moduleKey: "module-1" }, emptyOverrides());
    expect(selectWaGroups(r.registration, ["m1"], "live")).toEqual([{ label: "National and Global Pharmacovigilance System", url: WA }]);
  });
});

describe("the outline rename is careful", () => {
  it("leaves several items for one module alone (their own titles are meant)", () => {
    const c = build();
    const cur = c.sections.find((x) => x.id === "cur1")!;
    (cur.data.items as object[]).push({ title: "Day 2 - Reactions", subtitle: "", points: "", module: "module-1" });
    const r = resolveVariant(c, { regionKey: null, moduleKey: "module-1" }, emptyOverrides());
    expect(titles(r)).toEqual(["Overview of the course", "Module 1: National and Global Pharmacovigilance System", "Day 2 - Reactions"]);
  });
  it("does not overwrite items the admin edited on the link itself", () => {
    const ov = { ...emptyOverrides(), sections: { cur1: { fields: { items: [
      { title: "My own heading for this link", subtitle: "", points: "", module: "module-1" },
    ] } } } };
    const r = resolveVariant(build(), { regionKey: null, moduleKey: "module-1" }, ov);
    expect(titles(r)).toEqual(["My own heading for this link"]);
  });
});

describe("the form shows the module title to the visitor", () => {
  const first = ppcConfig.options[0];
  const config = { ...ppcConfig, options: ppcConfig.options.map((o) => ({ ...o, displayLabel: o.key === first.key ? "The module's real title" : undefined })) };
  it("the choice list", () => {
    const state = initialState(config, { country: "PK", me: null });
    render(<StepChoose config={config} state={state} errors={{}} notice={null} isFree={false}
      onRegion={vi.fn()} onMode={vi.fn()} onToggleOption={vi.fn()} onTier={vi.fn()} onGroupSize={vi.fn()} />);
    expect(screen.getByText("The module's real title")).toBeTruthy();
  });
  it("the order summary", () => {
    const state = { ...initialState(config, { country: "PK", me: null }), optionKeys: [first.key] };
    render(<OrderSummary config={config} state={state} quote={null} promo={null} />);
    expect(screen.getByText("The module's real title")).toBeTruthy();
  });
});
