import { describe, it, expect } from "vitest";
import { COUNTRIES, findCountry } from "@/lib/landing/countries";
import { linkMissingFromLive, moduleKeyProblem, nextModuleKey, regionKeyProblem } from "@/lib/landing/link-names";
import { pickRegion } from "@/lib/landing/registration/region-pick";
import { REGION_KEY_RE, CURRENCY_RE, type RegionDef } from "@/lib/landing/registration/config";
import { emptyContent, renameModule, type LandingContent } from "@/lib/landing/content";

const region = (key: string, label = key): RegionDef => ({ key, label, currency: "USD", classTime: "", timezoneLabel: "", accountKeys: [] });
function content(regions: RegionDef[], moduleKeys: string[]): LandingContent {
  const c = emptyContent("course");
  return {
    ...c,
    registration: { ...c.registration, regions },
    modules: moduleKeys.map((key) => ({ key, title: key, format: "", days: 0, optionKey: "" })),
  };
}

describe("COUNTRIES", () => {
  it("has the countries the academy sells in, with the region keys the page already uses", () => {
    for (const [iso2, key] of [["PK", "PK"], ["AE", "UAE"], ["SA", "KSA"], ["PH", "PH"], ["IN", "IN"]]) {
      expect(findCountry(key)?.iso2, key).toBe(iso2);
    }
  });
  it("every entry has a valid unique region key, a currency and a time zone label", () => {
    const keys = COUNTRIES.map((c) => c.regionKey);
    expect(new Set(keys).size).toBe(keys.length);
    for (const c of COUNTRIES) {
      expect(REGION_KEY_RE.test(c.regionKey), c.regionKey).toBe(true);
      expect(CURRENCY_RE.test(c.currency), c.regionKey).toBe(true);
      expect(c.name.trim(), c.regionKey).not.toBe("");
      expect(c.timezoneLabel.trim(), c.regionKey).not.toBe("");
    }
  });
  it("a visitor from each country lands on that country's prices (same keys as pickRegion)", () => {
    for (const c of COUNTRIES.filter((x) => x.iso2 !== "")) {
      const regions = [region("ZZ"), region(c.regionKey)];
      expect(pickRegion(regions, c.iso2, "ZZ"), c.iso2).toBe(c.regionKey);
    }
  });
});

describe("regionKeyProblem", () => {
  it("accepts a new country", () => {
    expect(regionKeyProblem("UAE", content([region("PK")], ["module-2"]))).toBeNull();
  });
  it("refuses a country that is already on the page", () => {
    expect(regionKeyProblem("UAE", content([region("UAE", "United Arab Emirates")], []))).toMatch(/already on this page/);
  });
  it("refuses the reserved word status", () => {
    expect(regionKeyProblem("STATUS", content([], []))).toMatch(/can't be used/);
  });
  it("refuses a country whose link name a module already uses", () => {
    expect(regionKeyProblem("PK", content([], ["pk"]))).toMatch(/module already uses/);
  });
});

describe("moduleKeyProblem", () => {
  const c = content([region("UAE", "United Arab Emirates")], ["module-1", "module-2"]);
  it("accepts a fresh link name", () => {
    expect(moduleKeyProblem("diabetes", c, 0)).toBeNull();
    expect(moduleKeyProblem("module-1", c, 0)).toBeNull(); // its own name
  });
  it("refuses names that do not fit a web address", () => {
    for (const k of ["", "Module 2", "module--2", "-x", "a_b"]) expect(moduleKeyProblem(k, c, 0), k).not.toBeNull();
  });
  it("refuses a country's link name", () => {
    expect(moduleKeyProblem("uae", c, 0)).toMatch(/United Arab Emirates/);
  });
  it("refuses status and another module's name", () => {
    expect(moduleKeyProblem("status", c, 0)).not.toBeNull();
    expect(moduleKeyProblem("module-2", c, 0)).toMatch(/Another module/);
  });
});

describe("link names an existing link still uses", () => {
  const c = content([], ["module-2"]);
  it("a removed module's link name can't be given to a new module", () => {
    expect(moduleKeyProblem("module-1", c, 1, ["module-1"])).toMatch(/earlier module/);
    expect(nextModuleKey(c, ["module-1"])).toBe("module-3");
  });
  it("a module keeps its own link name even though its link exists", () => {
    expect(moduleKeyProblem("module-2", c, 0, ["module-2"])).toBeNull();
  });
});

describe("linkMissingFromLive", () => {
  const live = content([region("UAE", "United Arab Emirates")], ["module-1"]);
  const draft = content([region("UAE", "United Arab Emirates"), region("QA", "Qatar")], ["module-1", "module-2"]);
  it("null when the live main page has the link's country and module", () => {
    expect(linkMissingFromLive({ regionKey: "UAE", moduleKey: "module-1" }, draft, live)).toBeNull();
  });
  it("names what the live main page is missing", () => {
    expect(linkMissingFromLive({ regionKey: "QA", moduleKey: "module-2" }, draft, live)).toBe("Publish the main page again so it includes Qatar and module-2");
    expect(linkMissingFromLive({ regionKey: null, moduleKey: "module-2" }, draft, live)).toBe("Publish the main page again so it includes module-2");
  });
  it("asks for the main page first when it is not live at all", () => {
    expect(linkMissingFromLive({ regionKey: "UAE", moduleKey: null }, draft, null)).toBe("Publish the main page first");
  });
});

describe("renameModule", () => {
  it("renames the module and moves its tagged items, leaving other tags alone", () => {
    const c = content([], ["module-1", "module-2"]);
    const cur = c.sections.find((s) => s.type === "curriculum")!;
    const withItems = {
      ...c,
      sections: c.sections.map((s) => (s.id === cur.id
        ? { ...s, data: { ...s.data, items: [{ title: "a", module: "module-1" }, { title: "b", module: "module-2" }, { title: "c", module: "" }] } }
        : s)),
    };
    const next = renameModule(withItems, "module-1", "diabetes");
    expect(next.modules.map((m) => m.key)).toEqual(["diabetes", "module-2"]);
    const items = next.sections.find((s) => s.id === cur.id)!.data.items as { module: string }[];
    expect(items.map((i) => i.module)).toEqual(["diabetes", "module-2", ""]);
    expect(withItems.modules[0].key).toBe("module-1"); // input untouched
  });
});

describe("nextModuleKey", () => {
  it("numbers modules module-1, module-2 … skipping names in use", () => {
    expect(nextModuleKey(content([], []))).toBe("module-1");
    expect(nextModuleKey(content([], ["module-1", "module-3"]))).toBe("module-2");
  });
});
