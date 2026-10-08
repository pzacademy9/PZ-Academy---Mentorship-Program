import { describe, it, expect } from "vitest";
import { filterAudience, courseOptions, outcomeOptions, type AudienceRowJson } from "@/lib/crm/campaign-ui";

const row = (id: string, fullName: string, over: Partial<AudienceRowJson> = {}): AudienceRowJson => ({
  id, fullName, phone: "+923001234567", lastOutcome: null, courses: [], ...over,
});
const rows = [
  row("1", "Ayesha Khan", { courses: ["PPC"], lastOutcome: "interested", phone: "+923001111111" }),
  row("2", "Bilal Ahmed", { courses: ["MDC"], phone: "+923002222222" }),
  row("3", "Sara Ali", { courses: ["PPC", "MDC"], lastOutcome: "replied", phone: "+923003333333" }),
];

describe("campaign-ui", () => {
  it("searches name and phone digits", () => {
    expect(filterAudience(rows, { q: "ayesha", outcome: "", course: "" }).map((r) => r.id)).toEqual(["1"]);
    expect(filterAudience(rows, { q: "0300 222", outcome: "", course: "" }).map((r) => r.id)).toEqual(["2"]);
  });
  it("filters by outcome, with 'new' meaning no outcome yet", () => {
    expect(filterAudience(rows, { q: "", outcome: "new", course: "" }).map((r) => r.id)).toEqual(["2"]);
    expect(filterAudience(rows, { q: "", outcome: "replied", course: "" }).map((r) => r.id)).toEqual(["3"]);
  });
  it("filters by course and combines filters", () => {
    expect(filterAudience(rows, { q: "", outcome: "", course: "PPC" }).map((r) => r.id)).toEqual(["1", "3"]);
    expect(filterAudience(rows, { q: "sara", outcome: "", course: "MDC" }).map((r) => r.id)).toEqual(["3"]);
  });
  it("builds sorted unique course options and outcome options present in the data", () => {
    expect(courseOptions(rows)).toEqual(["MDC", "PPC"]);
    expect(outcomeOptions(rows).map((o) => o.value)).toEqual(["new", "interested", "replied"]);
  });
});
