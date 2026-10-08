import { describe, it, expect } from "vitest";
import * as numbers from "@/lib/data/sales-numbers";
import * as contacts from "@/lib/data/sales-contacts";

describe("sales-numbers exports", () => {
  it("exposes the functions the routes and send module rely on", () => {
    for (const name of [
      "toNumberState",
      "getSafetySettings",
      "getNumberUsage",
      "getNumberForAgent",
      "getBudgetsForAgent",
      "freezeNumber",
      "listNumbersAdmin",
      "createNumber",
      "updateNumber",
      "updateSafetySettings",
      "listBlockedAttempts",
      "logBlockedAttempt",
    ]) {
      expect(typeof (numbers as Record<string, unknown>)[name]).toBe("function");
    }
  });

  it("maps a frozen row to a NumberState", () => {
    const state = numbers.toNumberState({
      id: "n1",
      label: "DMC",
      phone_e164: null,
      status: "frozen",
      frozen_until: "2026-10-07T00:00:00.000Z",
      warmup_started_on: "2026-10-01",
      daily_cap: 40,
      hourly_cap: null,
      created_at: "2026-10-01T00:00:00.000Z",
    });
    expect(state).toEqual({
      status: "frozen",
      frozenUntil: new Date("2026-10-07T00:00:00.000Z"),
      warmupStartedOn: "2026-10-01",
      dailyCapOverride: 40,
      hourlyCapOverride: null,
    });
  });

  it("treats any non-frozen status as active", () => {
    const state = numbers.toNumberState({
      id: "n1", label: "x", phone_e164: null, status: "weird", frozen_until: null,
      warmup_started_on: "2026-10-01", daily_cap: null, hourly_cap: null, created_at: "",
    });
    expect(state.status).toBe("active");
  });
});

describe("sales-contacts exports", () => {
  it("exposes the contact actions", () => {
    for (const name of [
      "getTodayQueue",
      "listContacts",
      "getContactDetail",
      "claimContact",
      "logOutcome",
      "addNote",
      "addLead",
      "assignContacts",
    ]) {
      expect(typeof (contacts as Record<string, unknown>)[name]).toBe("function");
    }
  });
});

import * as send from "@/lib/data/sales-send";

describe("sales-send exports", () => {
  it("exposes requestSend", () => {
    expect(typeof send.requestSend).toBe("function");
  });
});

import * as assignment from "@/lib/data/sales-assignment";

describe("sales-assignment exports", () => {
  it("exposes the assignment data layer", () => {
    for (const name of ["previewAssignment", "commitAssignment", "listAgentAssignmentCounts", "getAgentsCanClaim", "setAgentsCanClaim", "releaseOwnContact"]) {
      expect(typeof (assignment as Record<string, unknown>)[name]).toBe("function");
    }
  });
});

import * as campaigns from "@/lib/data/sales-campaigns";

describe("sales-campaigns exports", () => {
  it("exposes the campaign data layer", () => {
    for (const name of [
      "loadCampaignAudience", "createCampaign", "listMyCampaigns", "getMyCampaign",
      "sendCampaignRecipient", "skipCampaignRecipient", "setCampaignStatus",
    ]) {
      expect(typeof (campaigns as Record<string, unknown>)[name]).toBe("function");
    }
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";

function fnBody(src: string, name: string): string {
  const start = src.indexOf(`export async function ${name}(`);
  if (start < 0) throw new Error(`${name} not found`);
  const next = src.indexOf("\nexport ", start + 1);
  return src.slice(start, next < 0 ? undefined : next);
}

describe("sendCampaignRecipient source guards", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/data/sales-campaigns.ts"), "utf8");
  const body = fnBody(src, "sendCampaignRecipient");

  it("reserves the recipient (guarded on pending) before calling requestSend", () => {
    const guard = body.indexOf('.eq("status", "pending")');
    const call = body.indexOf("requestSend(");
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(call).toBeGreaterThanOrEqual(0);
    expect(guard).toBeLessThan(call);
  });

  it("classifies refusals with classifyRefusal", () => {
    expect(body).toContain("classifyRefusal(");
  });

  it("guards reverts on status sent and the acting agent", () => {
    expect(body).toContain('.eq("status", "sent")');
    expect(body).toContain('.eq("sent_by", actor.id)');
  });
});
