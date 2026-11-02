import { describe, it, expect } from "vitest";
import { rowFromLabels, scopeTag, filterRows, countByFilter, copyLines, initials } from "@/lib/pzid/id-list";

const full = rowFromLabels("Sample Doctor-0012", "PPC4-0012", ["Live — Full Course"]);
const m1 = rowFromLabels("Sample Clinician-0045", "PPC4-0045", ["Live - Modules: M1"]);
const m13 = rowFromLabels("Sample Resident-0104", "PPC4-0104", ["Live - Modules: M1", "Recorded - Modules: M3"]);
const odd = rowFromLabels("Sample Scholar-0138", "PPC4-0138", ["garbage"]);
const all = [full, m1, m13, odd];

describe("rowFromLabels", () => {
  it("full course label", () => {
    expect(full).toMatchObject({ full: true, modules: [], known: true });
  });
  it("module list", () => {
    expect(rowFromLabels("A", "P-1", ["Live - Modules: M1, M3"])).toMatchObject({ full: false, modules: [1, 3] });
  });
  it("two labels are unioned", () => {
    expect(m13.modules).toEqual([1, 3]);
  });
  it("full beats modules", () => {
    expect(rowFromLabels("A", "P-1", ["Live - Full Course", "Live - Modules: M2"])).toMatchObject({ full: true, modules: [] });
  });
  it("unrecognised label", () => {
    expect(odd.known).toBe(false);
  });
});

describe("unrecognised scope", () => {
  it("a module above 4 is unrecognised, so every student sits in exactly one bucket", () => {
    const m5 = rowFromLabels("Sample Five-0005", "PPC4-0005", ["Live - Modules: M5"]);
    expect(m5).toMatchObject({ full: false, modules: [], known: false });
    const c = countByFilter([...all, m5]);
    expect(c.full + c.modular + c.unknown).toBe(c.all);
  });
  it("filters to unrecognised students", () => {
    expect(filterRows(all, "unknown", "")).toEqual([odd]);
  });
});

describe("scopeTag", () => {
  it("names each scope", () => {
    expect(scopeTag(full)).toBe("Full course");
    expect(scopeTag(m1)).toBe("Module 1");
    expect(scopeTag(m13)).toBe("Module 1, 3");
    expect(scopeTag(odd)).toBe("Scope not set");
  });
});

describe("filterRows", () => {
  it("filters by scope", () => {
    expect(filterRows(all, "full", "")).toEqual([full]);
    expect(filterRows(all, 3, "")).toEqual([m13]);
    expect(filterRows(all, 1, "").length).toBe(2);
    expect(filterRows(all, "all", "").length).toBe(4);
  });
  it("searches name and PZ ID, ignoring case and spaces", () => {
    expect(filterRows(all, "all", "sample  doc")).toEqual([full]);
    expect(filterRows(all, "all", "ppc4-0045")).toEqual([m1]);
    expect(filterRows(all, "all", "  0012 ")).toEqual([full]);
  });
  it("treats special characters literally", () => {
    expect(filterRows(all, "all", "a(b*")).toEqual([]);
    expect(filterRows(all, "all", "%")).toEqual([]);
  });
});

describe("countByFilter", () => {
  it("counts each chip", () => {
    expect(countByFilter(all)).toEqual({ all: 4, full: 1, modular: 2, unknown: 1, "1": 2, "2": 0, "3": 1, "4": 0 });
  });
});

describe("copyLines and initials", () => {
  it("one line per student", () => {
    expect(copyLines([full, m1])).toBe("Sample Doctor-0012 - PPC4-0012\nSample Clinician-0045 - PPC4-0045");
  });
  it("initials", () => {
    expect(initials("Sample Doctor-0012")).toBe("SD");
    expect(initials("")).toBe("?");
  });
});
