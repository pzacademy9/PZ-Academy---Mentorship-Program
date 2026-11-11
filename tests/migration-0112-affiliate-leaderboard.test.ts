import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(join(process.cwd(), "supabase", "migrations", "0112_affiliate_leaderboard.sql"), "utf8");
const flat = sql.replace(/\s+/g, " ");
const check = readFileSync(join(process.cwd(), "supabase", "checks", "0112_affiliate_leaderboard_check.sql"), "utf8");

describe("0112 affiliate leaderboard", () => {
  it("makes the link token table, service role only", () => {
    expect(flat).toMatch(/create table if not exists public\.affiliate_board_link/i);
    expect(flat).toMatch(/alter table public\.affiliate_board_link enable row level security/i);
    expect(sql).not.toMatch(/create policy/i);
    expect(flat).toMatch(/id boolean primary key default true check \(id\)/i);
    expect(flat).toMatch(/on conflict \(id\) do nothing/i);
  });
  it("seeds a URL-safe token that fits the public pattern", () => {
    expect(flat).toMatch(/insert into public\.affiliate_board_link/i);
    expect(flat).toMatch(/\^\[A-Za-z0-9_-\]\{20,64\}\$/);
  });
  it("defines the board function for the service role only", () => {
    expect(flat).toMatch(/create or replace function public\.affiliate_leaderboard\(p_from timestamptz default null\)/i);
    expect(flat).toMatch(/returns table \(affiliate_id uuid, name text, team text, registered integer, paid integer\)/i);
    expect(flat).toMatch(/language sql stable security definer set search_path = public/i);
    expect(flat).toMatch(/revoke all on function public\.affiliate_leaderboard\(timestamptz\) from public, anon, authenticated/i);
    expect(flat).toMatch(/grant execute on function public\.affiliate_leaderboard\(timestamptz\) to service_role/i);
  });
  it("ranks accepted affiliates only, real sales only", () => {
    expect(flat).toMatch(/status = 'accepted'/i);
    expect(flat).toMatch(/is_test = false/i);
    expect(flat).toMatch(/row_type in \('individual', 'lead'\)/i);
    expect(flat).toMatch(/voided_at is null/i);
    expect(flat).toMatch(/left join/i);
  });
  it("opening sales count only in the all-time board", () => {
    expect(flat).toMatch(/case when p_from is null then a\.opening_secured else 0 end/i);
    const body = sql.slice(sql.indexOf("create or replace function"));
    expect(body.match(/opening_secured/g)).toHaveLength(1);
    expect(body).not.toMatch(/order by/i);
  });
  it("never deletes or drops anything", () => {
    expect(sql).not.toMatch(/drop table/i);
    expect(sql).not.toMatch(/delete from/i);
  });
  it("the check script is read-only", () => {
    expect(check).not.toMatch(/\b(insert|update|delete|drop|alter)\b/i);
    expect(check).toMatch(/affiliate_leaderboard/);
    expect(check).toMatch(/affiliate_board_link/);
  });
});
