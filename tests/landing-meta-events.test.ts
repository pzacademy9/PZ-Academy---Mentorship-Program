import { describe, it, expect, beforeEach, vi } from "vitest";
import { createSupabaseMock } from "./helpers/supabase-mock";

const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));

import {
  claimMetaPurchase, markMetaPurchaseSent, markMetaPurchaseSkipped, releaseMetaPurchase, getMetaPurchase, firstPaidAt,
} from "@/lib/data/landing-meta-events";

beforeEach(() => db.reset());

describe("claimMetaPurchase", () => {
  it("returns true when the insert succeeds", async () => {
    await expect(claimMetaPurchase("reg-1", "purchase-reg-1")).resolves.toBe(true);
    expect(db.find("landing_meta_events", "insert")[0].payload).toEqual({
      registration_id: "reg-1", event_id: "purchase-reg-1", state: "claimed",
    });
  });
  it("returns false on a unique violation (already claimed, sent or skipped)", async () => {
    db.state.handler = () => ({ data: null, error: { code: "23505" } });
    await expect(claimMetaPurchase("reg-1", "purchase-reg-1")).resolves.toBe(false);
  });
  it("throws on any other error", async () => {
    db.state.handler = () => ({ data: null, error: { code: "08006" } });
    await expect(claimMetaPurchase("reg-1", "purchase-reg-1")).rejects.toMatchObject({ code: "08006" });
  });
});

describe("mark and release", () => {
  it("markMetaPurchaseSent only updates a claimed row", async () => {
    await markMetaPurchaseSent("reg-1", { value: 4500, currency: "INR" });
    const op = db.find("landing_meta_events", "update")[0];
    expect(op.payload).toMatchObject({ state: "sent", value: 4500, currency: "INR" });
    expect(op.filters).toEqual(expect.arrayContaining([["eq", "registration_id", "reg-1"], ["eq", "state", "claimed"]]));
  });
  it("markMetaPurchaseSkipped sets skipped_old with the reason", async () => {
    await markMetaPurchaseSkipped("reg-1", "first paid 9 days ago");
    expect(db.find("landing_meta_events", "update")[0].payload).toEqual({ state: "skipped_old", detail: "first paid 9 days ago" });
  });
  it("releaseMetaPurchase deletes only a claimed row", async () => {
    await releaseMetaPurchase("reg-1");
    const op = db.find("landing_meta_events", "delete")[0];
    expect(op.filters).toEqual([["eq", "registration_id", "reg-1"], ["eq", "state", "claimed"]]);
  });
  it("throws on a write error", async () => {
    db.state.handler = () => ({ data: null, error: { code: "08006" } });
    await expect(releaseMetaPurchase("reg-1")).rejects.toBeTruthy();
    await expect(markMetaPurchaseSent("reg-1", { value: 1, currency: "INR" })).rejects.toBeTruthy();
  });
});

describe("getMetaPurchase", () => {
  it("maps the row, or null when absent", async () => {
    db.state.handler = () => ({ data: { state: "sent", sent_at: "2026-10-22T10:00:00Z", detail: "" }, error: null });
    await expect(getMetaPurchase("reg-1")).resolves.toEqual({ state: "sent", sentAt: "2026-10-22T10:00:00Z", detail: "" });
    db.state.handler = () => ({ data: null, error: null });
    await expect(getMetaPurchase("reg-1")).resolves.toBeNull();
  });
});

describe("firstPaidAt", () => {
  it("asks for the earliest paid event", async () => {
    db.state.handler = () => ({ data: [{ at: "2026-10-20T08:00:00Z" }], error: null });
    await expect(firstPaidAt("reg-1")).resolves.toBe("2026-10-20T08:00:00Z");
    const op = db.find("landing_status_events", "select")[0];
    expect(op.filters).toEqual(expect.arrayContaining([["eq", "registration_id", "reg-1"], ["eq", "to_status", "paid"]]));
    expect(op.orders).toEqual([["at", true]]);
  });
  it("returns null when it was never paid", async () => {
    db.state.handler = () => ({ data: [], error: null });
    await expect(firstPaidAt("reg-1")).resolves.toBeNull();
  });
});
