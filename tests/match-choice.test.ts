import { describe, it, expect } from "vitest";
import { suggestOptions, splitLabel, type ChoiceOption } from "@/lib/landing/registration/match-choice";

const options: ChoiceOption[] = [
  { key: "full", label: "Full Course", kind: "bundle", moduleIds: ["a", "b", "c", "d"] },
  { key: "m1", label: "Module 1", kind: "module", moduleIds: ["a"] },
  { key: "m2", label: "Module 2", kind: "module", moduleIds: ["b"] },
  { key: "m3", label: "Module 3", kind: "module", moduleIds: ["c"] },
  { key: "m4", label: "Module 4", kind: "module", moduleIds: ["d"] },
];

describe("suggestOptions", () => {
  it("matches the old sheet full-course label to the bundle option", () => {
    expect(suggestOptions("Live — Full Course – Individual", options)).toEqual({ keys: ["full"], confident: true });
  });
  it("matches Modules: M3 to Module 3", () => {
    expect(suggestOptions("Recorded — Modules: M3 – Individual", options)).toEqual({ keys: ["m3"], confident: true });
  });
  it("matches several modules", () => {
    expect(suggestOptions("Live — Modules: M2, M3 – Individual", options)).toEqual({ keys: ["m2", "m3"], confident: true });
  });
  it("reads the app label format", () => {
    expect(suggestOptions("Live - Module 2 - Individual", options)).toEqual({ keys: ["m2"], confident: true });
  });
  it("group labels still match", () => {
    expect(suggestOptions("Live — Full Course – Group of 3", options)).toEqual({ keys: ["full"], confident: true });
    expect(suggestOptions("Live - Full Course - Group, 5 people", options).keys).toEqual(["full"]);
  });
  it("an unknown option text is not confident and gives no keys", () => {
    expect(suggestOptions("Live — Special bundle – Individual", options)).toEqual({ keys: [], confident: false });
  });
  it("a token matching two options is not confident", () => {
    const dup: ChoiceOption[] = [
      { key: "a", label: "Module 3", kind: "module", moduleIds: [] },
      { key: "b", label: "Workshop 3", kind: "module", moduleIds: [] },
    ];
    const r = suggestOptions("Live - M3 - Individual", dup);
    expect(r.confident).toBe(false);
  });
  it("partial match returns the matched keys but not confident", () => {
    expect(suggestOptions("Live — Modules: M2, M9 – Individual", options)).toEqual({ keys: ["m2"], confident: false });
  });
  it("no options gives no keys", () => {
    expect(suggestOptions("Live — Full Course – Individual", [])).toEqual({ keys: [], confident: false });
  });
});

describe("splitLabel", () => {
  it("returns mode live, recorded or null", () => {
    expect(splitLabel("Live — Full Course – Individual")).toEqual({ mode: "live", optionText: "full course" });
    expect(splitLabel("Recorded - Module 2 - Group of 3")).toEqual({ mode: "recorded", optionText: "module 2" });
    expect(splitLabel("Full Course - Individual")).toEqual({ mode: null, optionText: "full course" });
  });
});
