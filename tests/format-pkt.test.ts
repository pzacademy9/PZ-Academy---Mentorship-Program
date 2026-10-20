import { describe, expect, it } from "vitest";
import { formatDatePkt, formatDateTimePkt } from "@/lib/format";

describe("Pakistan-time formatters", () => {
  it("shows 22:22 for 17:22 UTC regardless of the machine's zone", () => {
    expect(formatDateTimePkt("2026-10-20T17:22:00Z")).toBe("20 Oct 2026, 22:22");
  });

  it("rolls the date over at Pakistan midnight", () => {
    expect(formatDatePkt("2026-10-20T20:30:00Z")).toBe("21 Oct 2026");
    expect(formatDateTimePkt("2026-10-20T20:30:00Z")).toBe("21 Oct 2026, 01:30");
  });
});
