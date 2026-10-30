import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => ({}) }));
vi.mock("@/lib/data/participant-campaigns", () => ({ resolveCandidates: vi.fn() }));
vi.mock("@/lib/data/participant-sends", () => ({ pzIdsFor: vi.fn() }));
vi.mock("@/lib/data/participant-prefs", () => ({ listUnsubscribed: vi.fn() }));

import { buildRecipientPreview } from "@/lib/data/audience-preview";
import { presetLiveWithModule } from "@/lib/classes/audience";
import type { Candidate } from "@/lib/landing/participants/types";

const FULL = "Live - Full Course";
const cand = (id: string, over: Partial<Candidate> = {}): Candidate => ({
  registrationId: id,
  leadId: id,
  isMember: false,
  name: `Name ${id}`,
  email: `${id}@x.com`,
  phone: "0300",
  refId: "R",
  status: "paid",
  mode: "live",
  optionLabel: FULL,
  ...over,
});

const candidates: Candidate[] = [
  cand("lead", { isMember: false }),
  cand("m1", { leadId: "lead", isMember: true }),
  cand("m2", { leadId: "lead", isMember: true }),
  cand("live-m1", { optionLabel: "Live - Modules: M1" }),
  cand("live-m4", { optionLabel: "Live - Modules: M4" }),
  cand("rec", { mode: "recorded", optionLabel: "Recorded - Full Course" }),
  cand("pend", { status: "pending" }),
  cand("unsub", { email: "Unsub@X.com" }),
  cand("weird", { optionLabel: "Something else" }),
];
const pzIds = new Map(
  candidates.filter((c) => c.registrationId !== "pend").map((c) => [c.registrationId, `PZ-${c.registrationId}`]),
);
const unsubscribed = new Set(["unsub@x.com"]);

describe("buildRecipientPreview", () => {
  it("class preview: receiving and exact not-receiving reasons", () => {
    const r = buildRecipientPreview(candidates, {
      audience: presetLiveWithModule(1),
      requirePzId: true,
      pzIds,
      unsubscribed,
    });
    expect(r.receiving.map((p) => p.name)).toEqual(["Name lead", "Name m1", "Name m2", "Name live-m1"]);
    expect(r.notReceiving.map((p) => p.reason).sort()).toEqual(
      ["no_id", "recorded", "unrecognised", "unsubscribed", "wrong_module"].sort(),
    );
    const rec = r.notReceiving.find((p) => p.reason === "recorded")!;
    expect(rec).toMatchObject({ name: "Name rec", email: "rec@x.com", optionLabel: "Recorded - Full Course" });
  });

  it("ID-email preview: only the person without a PZ ID is excluded", () => {
    const r = buildRecipientPreview(candidates.filter((c) => c.registrationId !== "unsub"), {
      requirePzId: true,
      pzIds,
      unsubscribed,
    });
    expect(r.notReceiving.map((p) => [p.name, p.reason])).toEqual([["Name pend", "no_id"]]);
    expect(r.receiving).toHaveLength(7);
  });

  it("no_email wins over unsubscribed, no_id wins over both", () => {
    const r = buildRecipientPreview([cand("a", { email: "" }), cand("b", { status: "pending", email: "" })], {
      audience: presetLiveWithModule(1),
      requirePzId: true,
      pzIds: new Map([["a", "PZ-a"]]),
      unsubscribed,
    });
    expect(r.notReceiving.map((p) => p.reason)).toEqual(["no_email", "no_id"]);
  });
});
