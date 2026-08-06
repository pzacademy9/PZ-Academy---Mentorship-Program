import { describe, it, expect } from "vitest";
import {
  mapBookingSheetStatus,
  mapApplicationSheetStatus,
  mentorshipSyncWebhookSchema,
} from "@/lib/validations/mentorship-sync";

describe("mapBookingSheetStatus", () => {
  it("maps the three known sheet values", () => {
    expect(mapBookingSheetStatus("Pending")).toBe("pending");
    expect(mapBookingSheetStatus("Confirmed")).toBe("confirmed");
    expect(mapBookingSheetStatus("Cancelled")).toBe("cancelled");
  });

  it("returns null for an unknown value", () => {
    expect(mapBookingSheetStatus("Something Else")).toBeNull();
  });
});

describe("mapApplicationSheetStatus", () => {
  it("maps the three known sheet values", () => {
    expect(mapApplicationSheetStatus("Pending")).toBe("pending");
    expect(mapApplicationSheetStatus("Approved")).toBe("approved");
    expect(mapApplicationSheetStatus("Rejected")).toBe("rejected");
  });

  it("returns null for an unknown value", () => {
    expect(mapApplicationSheetStatus("Maybe")).toBeNull();
  });
});

describe("mentorshipSyncWebhookSchema", () => {
  it("accepts a valid statusChange payload", () => {
    const result = mentorshipSyncWebhookSchema.safeParse({
      action: "statusChange",
      sheetKind: "booking",
      row: { email: "jane@example.com", status: "Confirmed" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid newSubmission payload", () => {
    const result = mentorshipSyncWebhookSchema.safeParse({
      action: "newSubmission",
      sheetKind: "application",
      row: { email: "jane@example.com", status: "Pending" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown sheetKind", () => {
    const result = mentorshipSyncWebhookSchema.safeParse({
      action: "statusChange",
      sheetKind: "course",
      row: { email: "jane@example.com", status: "Confirmed" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown action", () => {
    const result = mentorshipSyncWebhookSchema.safeParse({
      action: "somethingElse",
      sheetKind: "booking",
      row: { email: "jane@example.com", status: "Confirmed" },
    });
    expect(result.success).toBe(false);
  });
});
