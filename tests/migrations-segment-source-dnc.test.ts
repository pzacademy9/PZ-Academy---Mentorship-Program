import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(
  join(process.cwd(), "supabase", "migrations", "0064_crm_segment_source_do_not_contact.sql"),
  "utf8",
);

describe("0064 segment source honours do-not-contact", () => {
  it("restates security_invoker on the recreated view", () => {
    expect(sql).toMatch(/create or replace view public\.crm_contact_segment_source\s+with \(security_invoker = true\)/i);
  });

  it("folds do_not_contact_at is null into is_sendable", () => {
    const isSendable = sql.slice(sql.indexOf("c.email is not null"), sql.indexOf("as is_sendable"));
    expect(isSendable).toMatch(/c\.do_not_contact_at is null/);
  });

  it("appends do_not_contact_at after every existing column (whatsapp_unsubscribed_at stays before it)", () => {
    const selectList = sql.slice(sql.indexOf("select\n"), sql.indexOf("from contacts c"));
    const iWa = selectList.indexOf("c.whatsapp_unsubscribed_at");
    const iDnc = selectList.lastIndexOf("c.do_not_contact_at");
    expect(iWa).toBeGreaterThan(selectList.indexOf("as is_sendable"));
    expect(iDnc).toBeGreaterThan(iWa);
    expect(selectList.trimEnd().endsWith("c.do_not_contact_at")).toBe(true);
  });

  it("re-runs the revoke from anon and authenticated", () => {
    expect(sql).toMatch(/revoke all on public\.crm_contact_segment_source from anon, authenticated;/i);
  });
});
