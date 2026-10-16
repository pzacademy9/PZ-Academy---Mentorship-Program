import { describe, it, expect } from "vitest";
import { parseVariantPath, variantPath, variantQuery, isReservedSegment } from "@/lib/landing/variants";

const c = {
  modules: [{ key: "module-2", title: "M2", format: "3-Day Workshop", days: 3, optionKey: "" }],
  registration: { regions: [{ key: "UAE" }, { key: "KSA" }] },
} as never;

describe("parseVariantPath", () => {
  it("parses region", () => expect(parseVariantPath(["uae"], c)).toEqual({ regionKey: "UAE", moduleKey: null }));
  it("parses region + module", () => expect(parseVariantPath(["uae", "module-2"], c)).toEqual({ regionKey: "UAE", moduleKey: "module-2" }));
  it("parses module only", () => expect(parseVariantPath(["module-2"], c)).toEqual({ regionKey: null, moduleKey: "module-2" }));
  it("region is case-insensitive, canonical returned", () => expect(parseVariantPath(["UAE"], c)).toEqual({ regionKey: "UAE", moduleKey: null }));
  it("module is exact", () => expect(parseVariantPath(["Module-2"], c)).toBeNull());
  it("rejects wrong order, reserved, unknown, empty, 3 segments, ..", () => {
    expect(parseVariantPath(["module-2", "uae"], c)).toBeNull();
    expect(parseVariantPath(["status"], c)).toBeNull();
    expect(parseVariantPath(["nope"], c)).toBeNull();
    expect(parseVariantPath([], c)).toBeNull();
    expect(parseVariantPath(["uae", "module-2", "x"], c)).toBeNull();
    expect(parseVariantPath([".."], c)).toBeNull();
  });
});

describe("variantPath/variantQuery", () => {
  it("formats", () => {
    expect(variantPath({ regionKey: null, moduleKey: null })).toBe("");
    expect(variantPath({ regionKey: "UAE", moduleKey: null })).toBe("uae");
    expect(variantPath({ regionKey: null, moduleKey: "module-2" })).toBe("module-2");
    expect(variantPath({ regionKey: "UAE", moduleKey: "module-2" })).toBe("uae/module-2");
    expect(variantQuery({ regionKey: "UAE", moduleKey: "module-2" })).toBe("uae/module-2");
  });
  it("round-trips", () => {
    const ref = { regionKey: "KSA", moduleKey: "module-2" };
    expect(parseVariantPath(variantPath(ref).split("/"), c)).toEqual(ref);
  });
  it("reserved", () => { expect(isReservedSegment("status")).toBe(true); expect(isReservedSegment("uae")).toBe(false); });
});
