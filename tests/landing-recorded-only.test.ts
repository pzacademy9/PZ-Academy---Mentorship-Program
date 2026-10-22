// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { RegistrationConfig } from "@/lib/landing/registration/config";
import { registrationProblems } from "@/lib/landing/registration/config";
import { computeQuote } from "@/lib/landing/registration/pricing";
import { cardPrice } from "@/lib/landing/registration/card-price";
import { initialState } from "@/lib/landing/registration/form-state";
import { registrationOptionLabel } from "@/lib/landing/registration/labels";
import { formatMoney } from "@/lib/landing/registration/format";
import { computeReadiness } from "@/lib/landing/content";
import { ppcConfig } from "./fixtures/registration-fixtures";
import { contentWith } from "./helpers/landing-fixtures";

// An ad page that offers recorded lectures only: live is off, recorded is the sole mode.
const recordedOnly: RegistrationConfig = { ...ppcConfig, modes: ["recorded"], recordedPercentOfRegular: 80 };
const now = new Date("2026-10-13T10:00:00Z");
const quote = (mode: "live" | "recorded") =>
  computeQuote({ config: recordedOnly, regionKey: "PK", mode, optionKeys: ["full"], tierKey: "individual", groupSize: 1, now });

describe("recorded-only landing page", () => {
  it("(a) quotes the recorded price", () => {
    const q = quote("recorded");
    expect(q.ok).toBe(true);
    if (q.ok) { expect(q.mode).toBe("recorded"); expect(q.perPerson).toBe(4800); expect(q.earlyBirdApplied).toBe(false); }
  });
  it("(b) refuses live with mode_not_offered", () => {
    expect(quote("live")).toEqual({ ok: false, reason: "mode_not_offered" });
  });
  it("(c) the card price is the recorded price", () => {
    const c = cardPrice(recordedOnly, "full", "PK", now);
    expect(c).toMatchObject({ kind: "price", current: formatMoney(4800, "PKR"), strike: null, earlyEnds: null, recorded: null });
  });
  it("(d) the mode label is not written with one mode", () => {
    const label = registrationOptionLabel(recordedOnly, { mode: "recorded", optionKeys: ["full"], tierKey: "individual", groupSize: 1 });
    expect(label).toBe("Full Course - Individual");
  });
  it("(e) the form starts in recorded mode", () => {
    expect(initialState(recordedOnly, { country: "PK", me: null }).mode).toBe("recorded");
  });
  it("(f) a complete recorded-only page has no blocking problem", () => {
    expect(registrationProblems(recordedOnly)).toEqual([]);
    // The empty-content fixture has other unrelated gaps; going recorded-only must not add any.
    const page = { title: "Recorded", slug: "recorded-ad" };
    const messages = (r: RegistrationConfig) => computeReadiness(contentWith(r), page).problems.map((p) => p.message);
    expect(messages(recordedOnly)).toEqual(messages(ppcConfig));
  });
  it("an empty mode list is a blocking problem", () => {
    expect(registrationProblems({ ...recordedOnly, modes: [] }).map((p) => p.message)).toContain("Choose Live, Recorded or both (Registration setup).");
  });
});
