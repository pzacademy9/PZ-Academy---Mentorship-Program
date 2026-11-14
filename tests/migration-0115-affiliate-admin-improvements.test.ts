import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(join(process.cwd(), "supabase", "migrations", "0115_affiliate_admin_improvements.sql"), "utf8");
const flat = sql.replace(/\s+/g, " ");

describe("0115 affiliate admin improvements", () => {
  it("adds drop_reason idempotently", () => {
    expect(flat).toMatch(/alter table public\.affiliates add column if not exists drop_reason text/i);
  });

  it("creates both tables idempotently with RLS on and no policies", () => {
    expect(flat).toMatch(/create table if not exists public\.affiliate_message_templates \(/i);
    expect(flat).toMatch(/create table if not exists public\.affiliate_motivation_sends \(/i);
    expect(flat).toMatch(/alter table public\.affiliate_message_templates enable row level security/i);
    expect(flat).toMatch(/alter table public\.affiliate_motivation_sends enable row level security/i);
    expect((flat.match(/enable row level security/gi) ?? []).length).toBe(2);
    expect(sql).not.toMatch(/create policy/i);
  });

  it("limits channel and keeps (channel, name) unique", () => {
    expect(flat).toMatch(/channel text not null check \(channel in \('whatsapp', ?'email'\)\)/i);
    expect(flat).toMatch(
      /create unique index if not exists \w+ on public\.affiliate_message_templates \(channel, name\)/i,
    );
    expect(flat).toMatch(/on conflict do nothing/i);
  });

  it("has the send-log columns", () => {
    for (const col of [
      "subject text not null",
      "html text not null",
      "recipient_count int not null",
      "failed_count int not null",
      "recipients jsonb not null default '[]'",
    ]) expect(flat, col).toContain(col);
  });

  it("seeds eight templates, four per channel", () => {
    for (const ch of ["whatsapp", "email"])
      for (const name of ["Welcome", "How to share your code", "Payout ready", "Thank you"])
        expect(flat, `${ch} ${name}`).toContain(`'${ch}', '${name}'`);
  });

  it("seed bodies greet with {name}, stay calm, and sign off", () => {
    const seed = sql.slice(sql.toLowerCase().indexOf("insert into"));
    expect(seed).toContain("Hello {name},");
    expect(seed).toContain("{code}");
    expect(seed).toContain("Pharmacozyme Affiliate Team");
    expect(seed).not.toContain("!");
  });
});
