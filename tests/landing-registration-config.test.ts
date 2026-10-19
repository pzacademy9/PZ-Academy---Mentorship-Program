// tests/landing-registration-config.test.ts
import { describe, it, expect } from "vitest";
import {
  DEFAULT_REGISTRATION, normalizeRegistration, registrationConfigSchema, registrationProblems, isValidInstant,
  type RegistrationConfig,
} from "@/lib/landing/registration/config";
import {
  emptyContent, normalizeContent, contentSchema, computeReadiness, removeSection, updateSectionData,
  updateRegistration, MAX_CONTENT_BYTES,
} from "@/lib/landing/content";
import { ppcConfig, mdcConfig, w20Config } from "./fixtures/landing-registration";

const msgs = (r: RegistrationConfig) => registrationProblems(r).map((p) => p.message).join(" | ");

describe("normalizeRegistration", () => {
  it("returns a fresh default for missing or garbage input", () => {
    for (const bad of [undefined, null, "x", 5, [], { prices: "no", regions: "no" }]) {
      const r = normalizeRegistration(bad);
      expect(r).toEqual(DEFAULT_REGISTRATION);
      expect(r).not.toBe(DEFAULT_REGISTRATION);
      expect(r.regions).not.toBe(DEFAULT_REGISTRATION.regions);
    }
  });
  it("keeps a valid config exactly as it is", () => {
    for (const c of [ppcConfig(), mdcConfig(), w20Config()]) {
      expect(normalizeRegistration(JSON.parse(JSON.stringify(c)))).toEqual(c);
    }
  });
  it("drops broken price cells, unsafe keys and unknown modes, and clamps numbers", () => {
    const prices = JSON.parse(
      '{"full":{"PK":{"amount":"6000"},"UAE":{"amount":200,"earlyAmount":-1,"groupTotals":{"group3":480,"bad":"x"}}},"__proto__":{"PK":{"amount":1}},"constructor":{"PK":{"amount":1}}}',
    );
    const r = normalizeRegistration({
      modes: ["live", "hybrid"],
      recordedPercentOfRegular: 250,
      capacity: -3,
      prices,
      tiers: [{ key: "group3", label: "Group of 3", minSize: 3, maxSize: 3, percentOff: 400 }],
      options: [{ key: "full", label: "Full", kind: "weird", free: "yes", waGroupUrl: "javascript:alert(1)" }],
      pixelId: "123<script>",
    });
    expect(r.modes).toEqual(["live"]);
    expect(r.recordedPercentOfRegular).toBe(100);
    expect(r.capacity).toBe(0);
    expect(r.prices).toEqual({ full: { UAE: { amount: 200, groupTotals: { group3: 480 } } } });
    expect(Object.prototype.hasOwnProperty.call(r.prices, "__proto__")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(r.prices, "constructor")).toBe(false);
    expect(({} as Record<string, unknown>).PK).toBeUndefined();
    expect(r.tiers[0].percentOff).toBe(90);
    expect(r.options[0]).toEqual({ key: "full", label: "Full", kind: "bundle", free: false, waGroupUrl: "", moduleIds: [] });
    expect(r.pixelId).toBe("");
  });
  it("keeps an explicitly empty mode list so readiness can ask for one", () => {
    expect(normalizeRegistration({ modes: [] }).modes).toEqual([]);
  });
});

describe("registrationConfigSchema", () => {
  it("accepts the default and the three real configs", () => {
    for (const c of [DEFAULT_REGISTRATION, ppcConfig(), mdcConfig(), w20Config()]) {
      expect(registrationConfigSchema.safeParse(c).success).toBe(true);
    }
  });
  it("rejects an unsafe WhatsApp link, a non-digit Pixel ID, too many countries and a negative price", () => {
    const a = ppcConfig(); a.options[0].waGroupUrl = "javascript:alert(1)";
    const b = ppcConfig(); b.pixelId = "1');alert(1);//";
    const c = ppcConfig(); c.regions = Array.from({ length: 13 }, (_, i) => ({ ...c.regions[0], key: `R${i}` }));
    const d = ppcConfig(); d.prices.full.PK.amount = -1;
    for (const x of [a, b, c, d]) expect(registrationConfigSchema.safeParse(x).success).toBe(false);
  });
  it("accepts half-typed values so autosave never blocks typing", () => {
    const c = ppcConfig();
    c.refPrefix = "p";
    c.options[0].waGroupUrl = "https://chat.wh";
    c.earlyBirdEndsAt = "2026-10-";
    expect(registrationConfigSchema.safeParse(c).success).toBe(true);
  });
});

describe("isValidInstant", () => {
  it("needs a real date with an explicit offset", () => {
    expect(isValidInstant("2026-10-15T19:00:00Z")).toBe(true);
    expect(isValidInstant("2026-10-16T00:00:00+05:00")).toBe(true);
    for (const bad of ["2026-10-16T00:00:00", "soon", "", "2026-13-45T00:00:00Z"]) expect(isValidInstant(bad), bad).toBe(false);
  });
  it("needs a strict ISO shape and rejects rolled-over dates", () => {
    expect(isValidInstant("2026-10-15T19:00:00+05:00")).toBe(true);
    for (const bad of ["Oct 15 2026 19:00 +05:00", "2026-02-30T00:00:00Z", "2026-10-15T24:00:00Z"]) expect(isValidInstant(bad), bad).toBe(false);
  });
});

describe("registrationProblems", () => {
  it("finds nothing wrong with the three real configs", () => {
    for (const c of [ppcConfig(), mdcConfig(), w20Config()]) expect(registrationProblems(c)).toEqual([]);
  });
  it("asks for a mode, a country, an option, a ref code and a name on an empty setup", () => {
    const m = msgs({ ...normalizeRegistration(undefined), enabled: true, modes: [] });
    expect(m).toMatch(/Live, Recorded or both/);
    expect(m).toMatch(/at least one country/);
    expect(m).toMatch(/at least one thing people can buy/);
    expect(m).toMatch(/short code for reference numbers/);
    expect(m).toMatch(/short name for messages/);
  });
  it("asks for every missing paid price, naming the option and the country", () => {
    const c = ppcConfig();
    delete c.prices.m2.INTL;
    expect(msgs(c)).toContain('Add the price of "M2 Acute & Chronic Therapeutics" for International.');
  });
  it("warns when an Early Bird price is higher than the regular price", () => {
    const c = ppcConfig();
    c.prices.full.PK.earlyAmount = 7000;
    expect(msgs(c)).toContain('The Early Bird price of "Full Course" for Pakistan is higher than the regular price.');
  });
  it("does not need a price in every country for a free option, but needs one somewhere", () => {
    const w = w20Config();
    expect(msgs(w)).toBe("");
    delete w.prices.free;
    expect(msgs(w)).toMatch(/"Free Access" is free but not offered in any country/);
  });
  it("needs a payment account for each country unless everything is free", () => {
    const c = ppcConfig();
    c.regions[1].accountKeys = [];
    expect(msgs(c)).toContain("Choose at least one payment account for International.");
    const free = w20Config();
    free.options = [free.options[0]];
    free.prices = { free: { PK: { amount: 0 } } };
    free.regions = [free.regions[0]];
    free.regions[0].accountKeys = [];
    free.whatsappVerifyNumber = "";
    expect(registrationProblems(free)).toEqual([]);
  });
  it("checks the Early Bird instant, the WhatsApp links, the ref code and the verify number", () => {
    const c = ppcConfig();
    c.earlyBirdEndsAt = "2026-10-16T00:00:00"; // no offset: legacy visitor-timezone bug
    c.options[1].waGroupUrl = "https://example.com/group";
    c.refPrefix = "ppc";
    c.whatsappVerifyNumber = "+92 370 0199429";
    const m = msgs(c);
    expect(m).toMatch(/Early Bird end date/);
    expect(m).toMatch(/WhatsApp group link for "M1 Clinical Pharmacology"/);
    expect(m).toMatch(/reference numbers/);
    expect(m).toMatch(/digits only/);
  });
  it("flags duplicate codes, a missing first country, bad group sizes and a missing bundle", () => {
    const c = ppcConfig();
    c.regions[1].key = "PK";
    c.defaultRegionKey = "XX";
    c.tiers[0].minSize = 1;
    c.tiers[1].maxSize = 4;
    c.moduleMix.bundleOptionKey = "m1";
    const m = msgs(c);
    expect(m).toMatch(/same code "PK"/);
    expect(m).toMatch(/selected first/);
    expect(m).toMatch(/at least 2 people/);
    expect(m).toMatch(/largest group size/);
    expect(m).toMatch(/replaces every module/);
  });
  it("checks that group totals point at an existing fixed-size tier and are sane", () => {
    const a = ppcConfig(); a.prices.full.INTL.groupTotals = { group3: 131, nope: 5 };
    expect(msgs(a)).toMatch(/"nope" in "Full Course" for International does not match any group discount/);
    const b = ppcConfig(); b.tiers[0].maxSize = 10;
    expect(msgs(b)).toMatch(/"Group of 3" in "Full Course" for International needs a fixed group size/);
    const c = ppcConfig(); c.prices.full.PK.earlyGroupTotals = { group3: -4 };
    expect(msgs(c)).toMatch(/Early Bird group total for "group3" in "Full Course" for Pakistan must be a number of 0 or more/);
    const d = ppcConfig(); d.prices.full.PK.groupTotals = { group3: Number.NaN };
    expect(msgs(d)).toMatch(/must be a number of 0 or more/);
  });
  it("rejects reserved object keys as region, option, tier and account codes", () => {
    for (const bad of ["constructor", "__proto__", "prototype"]) {
      const r = ppcConfig(); r.regions[1].key = bad;
      expect(msgs(r), `region ${bad}`).toContain(`"${bad}" is a reserved word, pick another code.`);
      const o = ppcConfig(); o.options[1].key = bad;
      expect(msgs(o), `option ${bad}`).toContain(`"${bad}" is a reserved word, pick another code.`);
      const t = ppcConfig(); t.tiers[0].key = bad;
      expect(msgs(t), `tier ${bad}`).toContain(`"${bad}" is a reserved word, pick another code.`);
      const a = ppcConfig(); a.regions[1].accountKeys = [bad];
      expect(msgs(a), `account ${bad}`).toContain(`"${bad}" is a reserved word, pick another code.`);
    }
  });
  it("hints when Early Bird prices exist without an end date", () => {
    const c = ppcConfig(); c.earlyBirdEndsAt = "";
    expect(msgs(c)).toMatch(/Early Bird prices are set but no Early Bird end date/);
    expect(msgs(w20Config())).toBe("");
  });
  it("rejects a tier that reuses the reserved word individual", () => {
    const c = ppcConfig();
    c.tiers[0].key = "individual";
    expect(msgs(c)).toMatch(/"Group of 3" needs a different code/);
  });
});

describe("page content carries the registration settings", () => {
  const page = { title: "PPC Batch 4", slug: "ppc-b4" };
  const minimal = () => {
    let c = emptyContent("webinar");
    for (const s of c.sections) if (s.type !== "hero") c = removeSection(c, s.id);
    c = updateSectionData(c, c.sections[0].id, { headline: "Diabetes webinar" });
    return { ...c, seo: { ...c.seo, description: "A one hour webinar." } };
  };
  it("emptyContent and normalizeContent always include a fresh default", () => {
    expect(emptyContent("course").registration).toEqual(DEFAULT_REGISTRATION);
    expect(normalizeContent({}).registration).toEqual(DEFAULT_REGISTRATION);
    expect(emptyContent("course").registration).not.toBe(emptyContent("course").registration);
  });
  it("normalizeContent keeps a saved registration", () => {
    const c = { ...emptyContent("course"), registration: ppcConfig() };
    expect(normalizeContent(JSON.parse(JSON.stringify(c))).registration).toEqual(ppcConfig());
  });
  it("contentSchema accepts content with or without registration", () => {
    const withReg = { ...emptyContent("course"), registration: ppcConfig() };
    const without: Record<string, unknown> = { ...emptyContent("course") };
    delete without.registration;
    expect(contentSchema.safeParse(withReg).success).toBe(true);
    expect(contentSchema.safeParse(without).success).toBe(true);
  });
  it("with registration on, the Register link is no longer required but the setup is checked", () => {
    const off = minimal();
    expect(computeReadiness(off, page).problems.map((p) => p.message).join("|")).toMatch(/Register button/);
    const on = updateRegistration(off, ppcConfig());
    expect(computeReadiness(on, page)).toEqual({ ready: true, problems: [] });
    const broken = updateRegistration(on, { refPrefix: "" });
    const m = computeReadiness(broken, page).problems.map((p) => p.message).join("|");
    expect(m).not.toMatch(/Register button/);
    expect(m).toMatch(/reference numbers/);
  });
  it("updateRegistration is immutable", () => {
    const c = emptyContent("course");
    const u = updateRegistration(c, { eventLabel: "PPC Batch 4" });
    expect(u.registration.eventLabel).toBe("PPC Batch 4");
    expect(c.registration.eventLabel).toBe("");
  });
  it("raises the content size cap to 400 KB", () => expect(MAX_CONTENT_BYTES).toBe(400_000));
});

describe("option moduleIds", () => {
  const U1 = "11111111-1111-4111-8111-111111111111";
  const U2 = "22222222-2222-4222-8222-222222222222";
  it("an old saved option without moduleIds loads as []", () => {
    const r = normalizeRegistration({ options: [{ key: "m1", label: "M1", kind: "module", free: false, waGroupUrl: "", moduleIds: [] }] });
    expect(r.options[0].moduleIds).toEqual([]);
  });
  it("keeps uuid ids, drops junk and caps at 40", () => {
    const many = Array.from({ length: 50 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    const r = normalizeRegistration({ options: [{ key: "m1", label: "M1", kind: "module", free: false, waGroupUrl: "", moduleIds: [U1, "nope", 5, U2] }, { key: "m2", label: "M2", kind: "module", free: false, waGroupUrl: "", moduleIds: many }] });
    expect(r.options[0].moduleIds).toEqual([U1, U2]);
    expect(r.options[1].moduleIds).toHaveLength(40);
  });
  it("the schema defaults a missing moduleIds to [] and keeps given ids", () => {
    const c = JSON.parse(JSON.stringify(ppcConfig()));
    delete c.options[0].moduleIds;
    c.options[1].moduleIds = [U1];
    const parsed = registrationConfigSchema.safeParse(c);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.options[0].moduleIds).toEqual([]);
      expect(parsed.data.options[1].moduleIds).toEqual([U1]);
    }
    c.options[1].moduleIds = ["not-a-uuid"];
    expect(registrationConfigSchema.safeParse(c).success).toBe(false);
  });
});
