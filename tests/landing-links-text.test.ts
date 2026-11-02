import { describe, it, expect } from "vitest";
import { buildLinksText, rowCheck } from "@/lib/landing/links-text";
import type { PageCheck } from "@/lib/landing/page-check";

const rows = [
  { label: "Pakistan", path: "pk", enabled: true, published: true },
  { label: "UAE", path: "ae", enabled: true, published: false },
  { label: "Module 1", path: "module-1", enabled: false, published: true },
];
const input = { pageTitle: "PPC Batch 3", origin: "https://app.example.com", slug: "ppc", mainLive: true, rows };

describe("buildLinksText", () => {
  it("lists the page name, the main page and only published links", () => {
    const lines = buildLinksText(input).split("\n");
    expect(lines).toEqual([
      "PPC Batch 3",
      "• Main page: https://app.example.com/e/ppc",
      "• Pakistan: https://app.example.com/e/ppc/pk",
    ]);
  });
  it("omits the main page and every other link when the main page is not live", () => {
    const text = buildLinksText({ ...input, mainLive: false });
    expect(text).not.toContain("Main page");
    expect(text).not.toContain("Pakistan");
    expect(text.split("\n")).toEqual(["PPC Batch 3", "No links are live yet."]);
  });
  it("says no links are live yet when nothing is published", () => {
    const text = buildLinksText({ ...input, rows: rows.slice(1) });
    expect(text.split("\n")).toEqual(["PPC Batch 3", "• Main page: https://app.example.com/e/ppc"]);
    const none = buildLinksText({ ...input, mainLive: false, rows: rows.slice(1) });
    expect(none.split("\n")).toEqual(["PPC Batch 3", "No links are live yet."]);
  });
});

describe("rowCheck", () => {
  const checks: PageCheck[] = [
    { id: "country-PK", title: "PK ok", status: "pass" },
    { id: "module-m1", title: "M1", status: "fail", detail: "bad" },
  ];
  it("finds the country and module checks and returns null for a combined row", () => {
    expect(rowCheck({ ref: { regionKey: "PK", moduleKey: null } }, checks)?.id).toBe("country-PK");
    expect(rowCheck({ ref: { regionKey: null, moduleKey: "m1" } }, checks)?.id).toBe("module-m1");
    expect(rowCheck({ ref: { regionKey: "PK", moduleKey: "m1" } }, checks)).toBeNull();
    expect(rowCheck({ ref: { regionKey: "ZZ", moduleKey: null } }, checks)).toBeNull();
  });
});
