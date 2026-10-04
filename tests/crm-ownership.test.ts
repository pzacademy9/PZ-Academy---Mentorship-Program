import { describe, it, expect } from "vitest";
import { canActOnContact, canClaimContact, canSeeDetails } from "@/lib/crm/ownership";

const agent = { id: "agent-1", role: "sales_agent" as const };
const other = { id: "agent-2", role: "sales_agent" as const };
const admin = { id: "admin-1", role: "admin" as const };

describe("canActOnContact", () => {
  it("lets a sales agent act on their own contact", () => {
    expect(canActOnContact({ owner_id: "agent-1" }, agent)).toEqual({ ok: true });
  });
  it("blocks acting on another agent's contact", () => {
    expect(canActOnContact({ owner_id: "agent-1" }, other)).toEqual({ ok: false, reason: "not-owner" });
  });
  it("blocks acting on an unclaimed contact (must claim first)", () => {
    expect(canActOnContact({ owner_id: null }, agent)).toEqual({ ok: false, reason: "not-owner" });
    expect(canActOnContact({ owner_id: undefined }, agent)).toEqual({ ok: false, reason: "not-owner" });
  });
  it("lets admin and super_admin act on any contact", () => {
    expect(canActOnContact({ owner_id: "agent-1" }, admin)).toEqual({ ok: true });
    expect(canActOnContact({ owner_id: null }, { id: "s", role: "super_admin" })).toEqual({ ok: true });
  });
  it("never lets a student or mentor act on a contact", () => {
    expect(canActOnContact({ owner_id: "x" }, { id: "x", role: "student" })).toEqual({ ok: false, reason: "not-allowed" });
    expect(canActOnContact({ owner_id: "x" }, { id: "x", role: "mentor" })).toEqual({ ok: false, reason: "not-allowed" });
  });
  it("an actor with an empty id never matches an empty owner_id", () => {
    expect(canActOnContact({ owner_id: "" }, { id: "", role: "sales_agent" })).toEqual({ ok: false, reason: "not-owner" });
  });
});

describe("canClaimContact", () => {
  it("lets a sales agent claim an unclaimed contact", () => {
    expect(canClaimContact({ owner_id: null }, agent)).toEqual({ ok: true });
    expect(canClaimContact({ owner_id: undefined }, agent)).toEqual({ ok: true });
  });
  it("blocks claiming a contact that already has an owner, including your own", () => {
    expect(canClaimContact({ owner_id: "agent-2" }, agent)).toEqual({ ok: false, reason: "already-claimed" });
    expect(canClaimContact({ owner_id: "agent-1" }, agent)).toEqual({ ok: false, reason: "already-claimed" });
  });
  it("blocks students and mentors from claiming", () => {
    expect(canClaimContact({ owner_id: null }, { id: "x", role: "student" })).toEqual({ ok: false, reason: "not-allowed" });
    expect(canClaimContact({ owner_id: null }, { id: "x", role: "mentor" })).toEqual({ ok: false, reason: "not-allowed" });
  });
});

describe("canSeeDetails", () => {
  const v = (viewerId: string, viewerRole: "sales_agent" | "admin" | "super_admin" | "student", ownerId: string | null | undefined) => ({ viewerId, viewerRole, ownerId });
  it("lets the owner see everything", () => {
    expect(canSeeDetails(v("agent-1", "sales_agent", "agent-1"))).toBe(true);
  });
  it("lets anyone see unclaimed contacts (hand-over)", () => {
    expect(canSeeDetails(v("agent-1", "sales_agent", null))).toBe(true);
    expect(canSeeDetails(v("agent-1", "sales_agent", undefined))).toBe(true);
  });
  it("hides another agent's contact from a non-admin", () => {
    expect(canSeeDetails(v("agent-1", "sales_agent", "agent-2"))).toBe(false);
    expect(canSeeDetails(v("s", "student", "agent-2"))).toBe(false);
  });
  it("lets admins and super admins see everything", () => {
    expect(canSeeDetails(v("a", "admin", "agent-2"))).toBe(true);
    expect(canSeeDetails(v("a", "super_admin", "agent-2"))).toBe(true);
  });
  it("an empty viewer id never matches an empty owner id", () => {
    expect(canSeeDetails(v("", "sales_agent", ""))).toBe(false);
  });
});
