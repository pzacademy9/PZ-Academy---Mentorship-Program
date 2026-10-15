import { describe, it, expect } from "vitest";
import {
  buildPayload, chooseTier, fieldStep, initialState, isFreeSelection, nextStep, prevStep, quoteProblem, resizeMembers,
  setGroupSize, stepsFor, toggleOption, validateStep, voucherProblem, MAX_VOUCHER_BYTES, type FormState,
} from "@/lib/landing/registration/form-state";
import { computeQuote } from "@/lib/landing/registration/pricing";
import { formatMoney } from "@/lib/landing/registration/format";
import { ppcConfig, webinarConfig } from "./fixtures/registration-fixtures";

const NOW = new Date("2026-10-13T10:00:00Z");
const me = { name: "Ayesha Khan", email: "Ayesha@Mail.com", whatsapp: "923001234567", profession: "Pharmacist" };
const quoteFor = (s: FormState, cfg = ppcConfig) => computeQuote({ config: cfg, regionKey: s.regionKey, mode: s.mode, optionKeys: s.optionKeys, tierKey: s.tierKey, groupSize: s.groupSize, now: NOW });
const filledLead = (s: FormState): FormState => ({ ...s, lead: { name: "Sara Ali", email: "sara@mail.com", whatsapp: "+92 300 1234567", profession: "Pharmacist", city: "Lahore", discovery: "" } });

describe("formatMoney", () => {
  it("prefixes the currency and groups thousands", () => {
    expect(formatMoney(4800, "PKR")).toBe("PKR 4,800");
    expect(formatMoney(0, "PKR")).toBe("PKR 0");
  });
});

describe("initialState", () => {
  it("guesses the region from the country, honours ?region=, and prefills a logged-in user with a locked email", () => {
    expect(initialState(ppcConfig, { country: "AE", me: null }).regionKey).toBe("UAE");
    expect(initialState(ppcConfig, { country: "AE", me: null, regionParam: "KSA" }).regionKey).toBe("KSA");
    const s = initialState(ppcConfig, { country: "PK", me });
    expect(s.lead).toMatchObject({ name: "Ayesha Khan", email: "ayesha@mail.com", whatsapp: "923001234567", profession: "Pharmacist" });
    expect(s.emailLocked).toBe(true);
    expect(s.detailsCollapsed).toBe(true);
    expect(s.mode).toBe("live");
    expect(s.tierKey).toBe("individual");
    expect(s.optionKeys).toEqual([]);
  });
  it("does not collapse details when the profile is missing something", () => {
    expect(initialState(ppcConfig, { country: "PK", me: { ...me, whatsapp: "" } }).detailsCollapsed).toBe(false);
  });
  it("preselects the only option when there is just one", () => {
    expect(initialState({ ...ppcConfig, options: [ppcConfig.options[0]] }, { country: null, me: null }).optionKeys).toEqual(["full"]);
  });
  it("never crashes on an unknown country or ?region=", () => {
    expect(initialState(ppcConfig, { country: "ZZ", me: null, regionParam: "NOPE" }).regionKey).toBe("INTL");
    expect(initialState(ppcConfig, { country: null, me: null, regionParam: "<script>" }).regionKey).toBe("PK");
  });
});

describe("toggleOption", () => {
  it("a package is chosen alone; a module replaces the package; every module collapses to the package", () => {
    expect(toggleOption(ppcConfig, ["m1"], "full")).toEqual({ optionKeys: ["full"], collapsed: false });
    expect(toggleOption(ppcConfig, ["full"], "m1")).toEqual({ optionKeys: ["m1"], collapsed: false });
    expect(toggleOption(ppcConfig, ["m1"], "m2")).toEqual({ optionKeys: ["full"], collapsed: true });
    expect(toggleOption(ppcConfig, ["m1"], "m1")).toEqual({ optionKeys: [], collapsed: false });
  });
  it("with module mix off, choosing every module keeps the modules", () => {
    const cfg = { ...ppcConfig, moduleMix: { enabled: false, bundleOptionKey: "" } };
    expect(toggleOption(cfg, ["m1"], "m2")).toEqual({ optionKeys: ["m1", "m2"], collapsed: false });
  });
  it("two packages (Free / Pro) behave like a single choice", () => {
    expect(toggleOption(webinarConfig, ["free"], "pro").optionKeys).toEqual(["pro"]);
    expect(isFreeSelection(webinarConfig, ["free"])).toBe(true);
    expect(isFreeSelection(webinarConfig, ["pro"])).toBe(false);
    expect(isFreeSelection(webinarConfig, [])).toBe(false);
  });
});

describe("tiers and members", () => {
  it("a fixed group sets the size and the member rows; individual clears them", () => {
    const s0 = initialState(ppcConfig, { country: "PK", me: null });
    const g3 = chooseTier(s0, ppcConfig, "group3");
    expect(g3.groupSize).toBe(3);
    expect(g3.members).toHaveLength(2);
    expect(chooseTier(g3, ppcConfig, "individual")).toMatchObject({ groupSize: 1, members: [] });
  });
  it("a variable group clamps the size and keeps typed member rows when growing", () => {
    const s0 = chooseTier(initialState(webinarConfig, { country: "PK", me: null }), webinarConfig, "group3plus");
    const typed = { ...s0, members: [{ name: "A", email: "a@x.co", whatsapp: "1", profession: "" }, ...s0.members.slice(1)] };
    const s1 = setGroupSize(typed, webinarConfig, 5);
    expect(s1.groupSize).toBe(5);
    expect(s1.members).toHaveLength(4);
    expect(s1.members[0].name).toBe("A");
    expect(setGroupSize(s1, webinarConfig, 99).groupSize).toBe(50);
    expect(setGroupSize(s1, webinarConfig, 1).groupSize).toBe(3);
    expect(resizeMembers([], 1)).toEqual([]);
  });
});

describe("step flow", () => {
  it("free selections have two steps, paid have four", () => {
    expect(stepsFor(true)).toEqual(["choose", "details"]);
    expect(stepsFor(false)).toEqual(["choose", "details", "pay", "upload"]);
    expect(nextStep(stepsFor(false), "pay")).toBe("upload");
    expect(nextStep(stepsFor(false), "upload")).toBe("submit");
    expect(nextStep(stepsFor(true), "details")).toBe("submit");
    expect(prevStep(stepsFor(false), "choose")).toBeNull();
    expect(prevStep(stepsFor(false), "pay")).toBe("details");
  });
  it("maps server field names to the step that owns them", () => {
    const paid = stepsFor(false);
    expect(fieldStep("lead.email", paid)).toBe("details");
    expect(fieldStep("members.1.whatsapp", paid)).toBe("details");
    expect(fieldStep("paymentMethod", paid)).toBe("pay");
    expect(fieldStep("promoCode", paid)).toBe("pay");
    expect(fieldStep("voucher", paid)).toBe("upload");
    expect(fieldStep("lead.consent", paid)).toBe("upload");
    expect(fieldStep("lead.consent", stepsFor(true))).toBe("details");
    expect(fieldStep("groupSize", paid)).toBe("choose");
    expect(fieldStep("something.else", paid)).toBe("choose");
  });
});

describe("validateStep", () => {
  const opts = { hasAccounts: true, isFree: false };
  it("choose: needs an option and a sellable price", () => {
    const s = initialState(ppcConfig, { country: "PK", me: null });
    expect(validateStep("choose", s, ppcConfig, null, opts)).toEqual({ optionKeys: "Choose what you want to join." });
    const noPrice = { ...ppcConfig, prices: { ...ppcConfig.prices, full: { PK: ppcConfig.prices.full.PK } } };
    const s2 = { ...s, regionKey: "UAE", optionKeys: ["full"] };
    expect(validateStep("choose", s2, noPrice, quoteFor(s2, noPrice), opts).optionKeys).toMatch(/isn't sold in your country/);
    const s3 = { ...s, optionKeys: ["full"] };
    expect(validateStep("choose", s3, ppcConfig, quoteFor(s3), opts)).toEqual({});
  });
  it("details: plain messages for the lead and each member, and unique emails", () => {
    const s = chooseTier({ ...initialState(ppcConfig, { country: "PK", me: null }), optionKeys: ["full"] }, ppcConfig, "group3");
    const e1 = validateStep("details", s, ppcConfig, quoteFor(s), opts);
    expect(e1["lead.name"]).toBe("Enter your full name.");
    expect(e1["lead.email"]).toBe("Enter a valid email address, like name@example.com.");
    expect(e1["lead.whatsapp"]).toMatch(/country code/);
    expect(e1["lead.profession"]).toBe("Choose your profession.");
    expect(e1["lead.city"]).toBe("Enter your city or country.");
    expect(e1["members.0.name"]).toBe("Enter member 2's full name.");
    expect(e1["members.1.email"]).toBe("Enter a valid email for member 3.");
    // The register route requires a profession for every member, so the form asks for it too.
    expect(e1["members.0.profession"]).toBe("Choose member 2's profession.");
    const filled = filledLead(s);
    const dup = { ...filled, members: [{ name: "Ali", email: "SARA@mail.com", whatsapp: "923001112222", profession: "Nurse" }, { name: "Zed", email: "zed@mail.com", whatsapp: "923001113333", profession: "Student" }] };
    expect(validateStep("details", dup, ppcConfig, quoteFor(dup), opts)).toEqual({ "members.0.email": "Each person needs their own email address." });
  });
  it("details on a free selection also needs consent", () => {
    const s = filledLead({ ...initialState(webinarConfig, { country: "PK", me: null }), optionKeys: ["free"] });
    expect(validateStep("details", s, webinarConfig, quoteFor(s, webinarConfig), { hasAccounts: true, isFree: true })).toEqual({ consent: "Please tick the box to agree to the registration terms." });
  });
  it("pay: an account must be chosen, and a typed but unapplied promo is flagged", () => {
    const s = { ...filledLead({ ...initialState(ppcConfig, { country: "PK", me: null }), optionKeys: ["full"] }), promoInput: "PZ10" };
    expect(validateStep("pay", s, ppcConfig, quoteFor(s), opts)).toEqual({
      paymentMethod: "Choose the account you paid into.",
      promoCode: "Press Apply to use your promo code, or clear the box.",
    });
  });
  it("upload: needs a receipt of an allowed type and size, and consent", () => {
    const s = filledLead({ ...initialState(ppcConfig, { country: "PK", me: null }), optionKeys: ["full"], paymentMethod: "faysal" });
    expect(validateStep("upload", s, ppcConfig, quoteFor(s), opts)).toEqual({
      voucher: "Upload a photo or PDF of your payment receipt.",
      consent: "Please tick the box to agree to the registration terms.",
    });
    const exe = { ...s, consent: true, voucher: new File(["x"], "a.exe", { type: "application/x-msdownload" }) };
    expect(validateStep("upload", exe, ppcConfig, quoteFor(exe), opts).voucher).toBe("Upload a JPG, PNG, WebP or PDF file.");
    const big = { ...s, consent: true, voucher: new File([new Uint8Array(MAX_VOUCHER_BYTES + 1)], "a.pdf", { type: "application/pdf" }) };
    expect(validateStep("upload", big, ppcConfig, quoteFor(big), opts).voucher).toMatch(/bigger than 4 MB/);
  });
});

describe("voucherProblem", () => {
  it("matches the route: jpg/png/webp/pdf, over 0 and at most 4 MB", () => {
    expect(voucherProblem({ size: 100, type: "image/webp" })).toBeNull();
    expect(voucherProblem({ size: MAX_VOUCHER_BYTES, type: "application/pdf" })).toBeNull();
    expect(voucherProblem({ size: MAX_VOUCHER_BYTES + 1, type: "image/png" })).toMatch(/4 MB/);
    expect(voucherProblem({ size: 100, type: "image/heic" })).toMatch(/JPG, PNG, WebP or PDF/);
    expect(voucherProblem({ size: 0, type: "image/png" })).toMatch(/Upload a photo or PDF/);
    expect(voucherProblem(null)).toMatch(/Upload a photo or PDF/);
  });
});

describe("quoteProblem", () => {
  it("explains each engine refusal on the right field", () => {
    expect(quoteProblem({ ok: false, reason: "free_group" }, webinarConfig, "group3plus")).toEqual({ field: "tierKey", message: "Groups aren't available for the free option. Choose Individual." });
    expect(quoteProblem({ ok: false, reason: "bad_group_size" }, webinarConfig, "group3plus")).toEqual({ field: "groupSize", message: "Group size must be between 3 and 50 people." });
    expect(quoteProblem({ ok: false, reason: "mixed_free" }, webinarConfig, "individual")!.field).toBe("optionKeys");
    expect(quoteProblem(null, webinarConfig, "individual")).toBeNull();
  });
});

describe("buildPayload", () => {
  const attribution = { refCode: "agent-1", utm: { utm_campaign: "ppc3" }, fbp: "fb.1.1.2", fbc: "", eventId: "evt-1", sessionId: "s-1" };
  it("trims, lowercases emails, keeps only WhatsApp digits, and sends only the needed member rows", () => {
    const s = chooseTier(filledLead({ ...initialState(ppcConfig, { country: "PK", me: null }), optionKeys: ["full"], paymentMethod: "faysal", promoApplied: "PZ10", consent: true }), ppcConfig, "group3");
    const withMembers = { ...s, members: [{ name: " Ali ", email: " ALI@x.co ", whatsapp: "0300-111", profession: "Nurse" }, { name: "Zed", email: "zed@x.co", whatsapp: "92 300 222", profession: "" }] };
    const p = buildPayload(withMembers, attribution, false, false);
    expect(p).toMatchObject({
      regionKey: "PK", mode: "live", optionKeys: ["full"], tierKey: "group3", groupSize: 3,
      lead: { name: "Sara Ali", email: "sara@mail.com", whatsapp: "923001234567", profession: "Pharmacist", city: "Lahore", discovery: "", consent: true },
      members: [{ name: "Ali", email: "ali@x.co", whatsapp: "0300111", profession: "Nurse" }, { name: "Zed", email: "zed@x.co", whatsapp: "92300222", profession: "" }],
      paymentMethod: "faysal", promoCode: "PZ10", honeypot: "", testMode: false, attribution,
    });
  });
  it("a free registration sends no payment method and no promo", () => {
    const s = filledLead({ ...initialState(webinarConfig, { country: "PK", me: null }), optionKeys: ["free"], paymentMethod: "paypal", promoApplied: "X", consent: true });
    expect(buildPayload(s, attribution, true, true)).toMatchObject({ paymentMethod: "", promoCode: "", testMode: true, members: [] });
  });
});
