import { describe, it, expect } from "vitest";
import { emptyContent } from "@/lib/landing/content";
import { selectWaGroups } from "@/lib/landing/registration/wa-groups";
import { desiredEnrollment, pickPortalUrl } from "@/lib/landing/registration/access-rules";

const A = "https://chat.whatsapp.com/AAAAAAAAAA";
const B = "https://chat.whatsapp.com/BBBBBBBBBB";
const C = "https://chat.whatsapp.com/CCCCCCCCCC";
const D = "https://chat.whatsapp.com/DDDDDDDDDD";

// PPC-style fake: a package plus three modules, each with its own group. Module mix is on, so
// buying every module collapses to the package.
function config() {
  const r = emptyContent("course").registration;
  r.enabled = true;
  r.modes = ["live", "recorded"];
  r.options = [
    { key: "full", label: "Full Course", kind: "bundle", free: false, waGroupUrl: A, moduleIds: [] },
    { key: "m1", label: "Module 1", kind: "module", free: false, waGroupUrl: B, moduleIds: [] },
    { key: "m2", label: "Module 2", kind: "module", free: false, waGroupUrl: C, moduleIds: [] },
    { key: "m3", label: "Module 3", kind: "module", free: false, waGroupUrl: D, moduleIds: [] },
  ];
  r.moduleMix = { enabled: true, bundleOptionKey: "full" };
  return r;
}
const urls = (keys: string[], mode: "live" | "recorded") => selectWaGroups(config(), keys, mode).map((g) => g.url);

function recordedPortal(courseSlug = "demo") {
  const desired = desiredEnrollment({ status: "paid", mode: "recorded", hasCourse: true, isTest: false, moduleIds: [], finishedModuleIds: [] });
  return pickPortalUrl({
    courseSlug, hasAccount: true, desired, mode: "recorded", status: "paid", pastedLink: "", appUrl: "https://app.example.com",
  });
}

describe("which links each buyer gets", () => {
  it("live full course gets only the package group (A)", () => {
    expect(urls(["full"], "live")).toEqual([A]);
  });
  it("live module 1 gets only group B, never A or C", () => {
    expect(urls(["m1"], "live")).toEqual([B]);
  });
  it("live modules 1 and 2 get B and C", () => {
    expect(urls(["m1", "m2"], "live")).toEqual([B, C]);
  });
  it("live buyer of every module gets the package group, as for the package", () => {
    expect(urls(["m1", "m2", "m3"], "live")).toEqual([A]);
  });
  it("recorded full gets no group and a portal link", () => {
    expect(urls(["full"], "recorded")).toEqual([]);
    expect(recordedPortal()).toBe("https://app.example.com/portal/demo");
  });
  it("recorded module 1 gets no group and a portal link", () => {
    expect(urls(["m1"], "recorded")).toEqual([]);
    expect(recordedPortal()).toBe("https://app.example.com/portal/demo");
  });
});
