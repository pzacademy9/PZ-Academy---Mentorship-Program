import { describe, it, expect } from "vitest";
import { paidGroupWarning } from "@/lib/landing/registration/wa-groups";
import { statusChangeResponse } from "@/lib/landing/registration/status-change-response";

const SENTENCE = "Marked Paid. The email will go out without a WhatsApp group button, because no group link applies to this student. Check that the batch has a group link and that the student's course option is set.";
const group = [{ label: "Group A", url: "https://chat.whatsapp.com/AAAAAAAAAAAAAAAAAAAAAA" }];

describe("paidGroupWarning", () => {
  it("warns for live + paid + no groups", () => {
    expect(paidGroupWarning({ to: "paid", mode: "live", groups: [] })).toBe(SENTENCE);
  });
  it("is silent for recorded students", () => {
    expect(paidGroupWarning({ to: "paid", mode: "recorded", groups: [] })).toBeNull();
  });
  it("is silent when a group exists", () => {
    expect(paidGroupWarning({ to: "paid", mode: "live", groups: group })).toBeNull();
  });
  it("is silent for other statuses", () => {
    for (const to of ["underpaid", "pending", "reserved"] as const) {
      expect(paidGroupWarning({ to, mode: "live", groups: [] })).toBeNull();
    }
  });
});

describe("statusChangeResponse warning", () => {
  it("includes warning when present", async () => {
    const res = statusChangeResponse({ ok: true, id: "r1", status: "paid", rowsChanged: 1, warning: "careful" });
    expect(await res.json()).toEqual({ id: "r1", status: "paid", warning: "careful" });
  });
  it("omits the key otherwise", async () => {
    const res = statusChangeResponse({ ok: true, id: "r1", status: "paid", rowsChanged: 1 });
    expect(await res.json()).toEqual({ id: "r1", status: "paid" });
  });
});
