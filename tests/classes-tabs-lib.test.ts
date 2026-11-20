// @vitest-environment node
import { describe, expect, it } from "vitest";
import { CLASS_TABS, CLASS_TAB_LABELS, classPanelId, classTabId, parseClassTab } from "@/lib/classes/tabs";

describe("class tabs helpers", () => {
  it("lists the three tabs with their labels", () => {
    expect([...CLASS_TABS]).toEqual(["links", "attendance", "quiz"]);
    expect(CLASS_TAB_LABELS).toEqual({ links: "Links and emails", attendance: "Attendance", quiz: "Quiz and podium" });
  });

  it("keeps valid values", () => {
    for (const t of CLASS_TABS) expect(parseClassTab(t)).toBe(t);
  });

  it("anything else gives Links", () => {
    expect(parseClassTab(null)).toBe("links");
    expect(parseClassTab(undefined)).toBe("links");
    expect(parseClassTab("")).toBe("links");
    expect(parseClassTab("x")).toBe("links");
    expect(parseClassTab("Attendance")).toBe("links");
  });

  it("gives each tab its own tab id and panel id", () => {
    expect(new Set(CLASS_TABS.map(classTabId)).size).toBe(3);
    expect(new Set(CLASS_TABS.map(classPanelId)).size).toBe(3);
    expect(classTabId("quiz")).not.toBe(classPanelId("quiz"));
  });
});
