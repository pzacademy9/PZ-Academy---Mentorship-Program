// tests/migrations-landing-publish-rpc.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(join(process.cwd(), "supabase", "migrations", "0068_landing_publish_rpc.sql"), "utf8");
const types = readFileSync(join(process.cwd(), "src", "lib", "supabase", "database.types.ts"), "utf8");

/** The text of one function, from its create line to its closing $$; */
function body(name: string): string {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  expect(start, name).toBeGreaterThanOrEqual(0);
  return sql.slice(start, sql.indexOf("$$;", start));
}

describe("0068 landing publish / rollback RPCs", () => {
  it("defines both as security definer plpgsql returning the new version number, with a pinned search_path", () => {
    for (const name of ["landing_publish_page", "landing_rollback_page"]) {
      const b = body(name);
      expect(b, name).toMatch(/returns integer/i);
      expect(b, name).toMatch(/language plpgsql/i);
      expect(b, name).toMatch(/security definer/i);
      expect(b, name).toMatch(/set search_path = public/i);
    }
  });

  it("locks the page row before it picks the next version number (concurrent publishes queue, never collide)", () => {
    for (const name of ["landing_publish_page", "landing_rollback_page"]) {
      const b = body(name);
      const lock = b.search(/from public\.landing_pages\s+where id = p_page_id\s+for update/i);
      const next = b.search(/coalesce\(max\(version\), 0\) \+ 1/i);
      expect(lock, name).toBeGreaterThan(0);
      expect(next, name).toBeGreaterThan(lock);
      expect(b, name).toMatch(/insert into public\.landing_page_versions/i);
    }
  });

  it("publish copies the draft, keeps a closed page closed, refuses a changed draft and never touches draft or revision", () => {
    const b = body("landing_publish_page");
    expect(b).toMatch(/published\s*=\s*v_page\.draft/i);
    expect(b).toMatch(/when v_page\.status = 'closed' then 'closed' else 'published'/i);
    expect(b).toMatch(/p_revision is not null and v_page\.revision <> p_revision/i);
    expect(b).toMatch(/landing_revision_conflict/);
    expect(b).toMatch(/landing_page_not_found/);
    expect(b).not.toMatch(/\bdraft\s*=/i);
    expect(b).not.toMatch(/\brevision\s*=/i);
  });

  it("rollback writes the version into draft AND published, bumps the revision and keeps a closed page closed", () => {
    const b = body("landing_rollback_page");
    expect(b).toMatch(/draft\s*=\s*v_content/i);
    expect(b).toMatch(/published\s*=\s*v_content/i);
    expect(b).toMatch(/revision\s*=\s*v_page\.revision \+ 1/i);
    expect(b).toMatch(/when v_page\.status = 'closed' then 'closed' else 'published'/i);
    expect(b).toMatch(/landing_version_not_found/);
    expect(b).toMatch(/landing_page_not_found/);
  });

  it("is service-role only", () => {
    expect(sql).toMatch(/revoke all on function public\.landing_publish_page\(uuid, uuid, integer\) from public, anon, authenticated;/i);
    expect(sql).toMatch(/grant execute on function public\.landing_publish_page\(uuid, uuid, integer\) to service_role;/i);
    expect(sql).toMatch(/revoke all on function public\.landing_rollback_page\(uuid, integer, uuid\) from public, anon, authenticated;/i);
    expect(sql).toMatch(/grant execute on function public\.landing_rollback_page\(uuid, integer, uuid\) to service_role;/i);
  });

  it("creates no tables and no policies", () => {
    expect(sql).not.toMatch(/create table/i);
    expect(sql).not.toMatch(/create policy/i);
  });

  it("database.types.ts knows both functions (hand-added, never regenerated)", () => {
    const fns = types.slice(types.indexOf("    Functions: {"));
    expect(fns).toMatch(/landing_publish_page: \{\s+Args: \{ p_page_id: string; p_revision\?: number; p_user: string \}\s+Returns: number/);
    expect(fns).toMatch(/landing_rollback_page: \{\s+Args: \{ p_page_id: string; p_user: string; p_version: number \}\s+Returns: number/);
  });
});
