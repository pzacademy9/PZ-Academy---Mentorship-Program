import { describe, it, expect, beforeEach, vi } from "vitest";
import { createSupabaseMock } from "./helpers/supabase-mock";

const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));

import { saveSnapshots, saveStatusSnapshots } from "@/lib/data/landing-sheet-sync";

beforeEach(() => db.reset());

const reg = (id: string) => ({ id, status: "paid" as const, amountReceived: 5000, name: "A", email: "a@x.com", whatsapp: "923001234567" });

describe("saveSnapshots", () => {
  it("upserts all five values on registration_id", async () => {
    await saveSnapshots([reg("r1"), reg("r2")]);
    const [op] = db.find("landing_sheet_snapshots", "upsert");
    expect(op.upsertOptions).toMatchObject({ onConflict: "registration_id" });
    expect(op.payload).toHaveLength(2);
    expect((op.payload as Record<string, unknown>[])[0]).toMatchObject({
      registration_id: "r1", status: "paid", amount_received: 5000, name: "A", email: "a@x.com", whatsapp: "923001234567",
    });
  });
  it("stores the planner's normalized form: email lower+trim, WhatsApp digits, name trimmed", async () => {
    await saveSnapshots([{ ...reg("r1"), name: " Ayesha Khan ", email: "  Ayesha@Example.com ", whatsapp: "+92 300-1234567" }]);
    const [op] = db.find("landing_sheet_snapshots", "upsert");
    expect((op.payload as Record<string, unknown>[])[0]).toMatchObject({ name: "Ayesha Khan", email: "ayesha@example.com", whatsapp: "923001234567" });
  });
  it("does nothing for an empty list", async () => {
    await saveSnapshots([]);
    expect(db.state.ops).toHaveLength(0);
  });
  it("throws on a database error", async () => {
    db.state.handler = () => ({ data: null, error: { message: "boom" } });
    await expect(saveSnapshots([reg("r1")])).rejects.toThrow("boom");
  });
});

describe("saveStatusSnapshots", () => {
  it("updates only status, amount and updated_at of existing rows", async () => {
    await saveStatusSnapshots([{ id: "r1", status: "paid", amountReceived: 5000 }, { id: "r2", status: "pending", amountReceived: null }]);
    const ops = db.find("landing_sheet_snapshots", "update");
    expect(ops).toHaveLength(2);
    expect(db.find("landing_sheet_snapshots", "upsert")).toHaveLength(0);
    expect(ops[0].filters).toContainEqual(["eq", "registration_id", "r1"]);
    expect(Object.keys(ops[0].payload as object).sort()).toEqual(["amount_received", "status", "updated_at"]);
    expect(ops[1].payload).toMatchObject({ status: "pending", amount_received: null });
  });
  it("throws on a database error", async () => {
    db.state.handler = () => ({ data: null, error: { message: "boom" } });
    await expect(saveStatusSnapshots([{ id: "r1", status: "paid", amountReceived: 1 }])).rejects.toThrow("boom");
  });
});
