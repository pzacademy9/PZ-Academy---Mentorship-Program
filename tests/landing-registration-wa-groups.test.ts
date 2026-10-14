// tests/landing-registration-wa-groups.test.ts
import { describe, it, expect } from "vitest";
import { isValidWaGroupUrl, selectWaGroups } from "@/lib/landing/registration/wa-groups";
import { ppcConfig, w20Config, WA } from "./fixtures/landing-registration";

describe("isValidWaGroupUrl", () => {
  it("accepts real invite links", () => {
    expect(isValidWaGroupUrl(WA.full)).toBe(true);
    expect(isValidWaGroupUrl(`  ${WA.m1}  `)).toBe(true);
  });
  it("rejects anything else", () => {
    for (const bad of [
      "", "http://chat.whatsapp.com/IGAWff910JFIzNCw42qGle", "https://chat.whatsapp.com/",
      "https://evil.com/IGAWff910JFIzNCw42qGle", "https://chat.whatsapp.com.evil.com/IGAWff910JFIzNCw42qGle",
      "javascript:alert(1)", "https://chat.whatsapp.com/IGAWff910JFIzNCw42qGle/../x", "https://wa.me/923700199429",
    ]) expect(isValidWaGroupUrl(bad), bad).toBe(false);
  });
});

describe("selectWaGroups (the legacy PPC rule)", () => {
  it("Full Course shows only the Full Course group", () => {
    expect(selectWaGroups(ppcConfig(), ["full"], "live")).toEqual([{ label: "Full Course", url: WA.full }]);
  });
  it("all four modules show only the Full Course group", () => {
    expect(selectWaGroups(ppcConfig(), ["m4", "m1", "m3", "m2"], "live")).toEqual([{ label: "Full Course", url: WA.full }]);
  });
  it("Full Course plus a module still shows only the Full Course group", () => {
    expect(selectWaGroups(ppcConfig(), ["m2", "full"], "live")).toEqual([{ label: "Full Course", url: WA.full }]);
  });
  it("two modules show two buttons, in module order", () => {
    expect(selectWaGroups(ppcConfig(), ["m3", "m1"], "live")).toEqual([
      { label: "M1 Clinical Pharmacology", url: WA.m1 },
      { label: "M3 Critical Care & Emergency", url: WA.m3 },
    ]);
  });
  it("recorded shows no groups", () => {
    expect(selectWaGroups(ppcConfig(), ["full"], "recorded")).toEqual([]);
    expect(selectWaGroups(ppcConfig(), ["m1", "m2"], "recorded")).toEqual([]);
  });
  it("skips options without a valid link and ignores unknown keys", () => {
    const c = ppcConfig();
    c.options[2].waGroupUrl = ""; // m2
    c.options[3].waGroupUrl = "https://example.com/x"; // m3
    expect(selectWaGroups(c, ["m1", "m2", "m3", "nope"], "live")).toEqual([{ label: "M1 Clinical Pharmacology", url: WA.m1 }]);
  });
  it("webinar plans each have their own group", () => {
    expect(selectWaGroups(w20Config(), ["free"], "live")).toEqual([{ label: "Free Access", url: WA.w20Free }]);
    expect(selectWaGroups(w20Config(), ["pro"], "live")).toEqual([{ label: "Pro Access", url: WA.w20Pro }]);
  });
});
