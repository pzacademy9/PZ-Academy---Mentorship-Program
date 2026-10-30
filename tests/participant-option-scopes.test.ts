import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock, memoryHandler } from "./helpers/supabase-mock";

const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));

import { buildRecipientBody } from "@/components/admin/registrations/builder-body";
import { previewBodySchema, createSendBodySchema, recipientsBodySchema } from "@/lib/validations/participants";
import { resolveCandidates } from "@/lib/data/participant-campaigns";

const PAGE = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  db.reset();
  db.state.handler = memoryHandler({ landing_registrations: [] });
});

describe("optionScopes on the message path", () => {
  for (const scopes of [["full"], ["full", 1]] as ("full" | number)[][]) {
    const label = JSON.stringify(scopes);
    it(`${label} survives buildRecipientBody and every body schema`, () => {
      const out = buildRecipientBody(PAGE, { mode: "filter", filters: { mode: "live", optionScopes: scopes } });
      expect(out).toEqual({ filters: { mode: "live", optionScopes: scopes, pageId: PAGE } });
      const base = { pageId: PAGE, ...out };
      expect(previewBodySchema.parse({ ...base, channel: "email" })).toMatchObject({ filters: { optionScopes: scopes } });
      expect(recipientsBodySchema.parse(base)).toMatchObject({ filters: { optionScopes: scopes } });
      expect(createSendBodySchema.parse({ ...base, channel: "email", subject: "s", body: "b", expectedCount: 1, expectedNotPaid: 0, confirmNotPaid: false }))
        .toMatchObject({ filters: { optionScopes: scopes } });
    });
  }
  it("an empty optionScopes list is left out", () => {
    const out = buildRecipientBody(PAGE, { mode: "filter", filters: { optionScopes: [] } });
    expect(out).toEqual({ filters: { pageId: PAGE } });
  });
  it("rejects a module outside 1 to 12 and a non-scope word", () => {
    for (const bad of [[13], ["x"], [0]]) {
      expect(recipientsBodySchema.safeParse({ pageId: PAGE, filters: { optionScopes: bad } }).success).toBe(false);
    }
  });
  it("resolveCandidates applies optionScopes to the query", async () => {
    await resolveCandidates({ pageId: "pg1", filters: { optionScopes: ["full"] } });
    const op = db.state.ops.find((o) => o.table === "landing_registrations" && o.op === "select");
    expect(op!.filters.some(([kind, , v]) => kind === "or" && String(v).includes("option_label.ilike"))).toBe(true);
  });
});
