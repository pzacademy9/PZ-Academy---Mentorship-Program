import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(
  join(process.cwd(), "supabase", "migrations", "0065_sales_hub_claim_setting.sql"),
  "utf8",
);
const types = readFileSync(
  join(process.cwd(), "src", "lib", "supabase", "database.types.ts"),
  "utf8",
);

describe("0065 sales hub claim setting", () => {
  it("adds agents_can_claim idempotently, default off", () => {
    expect(sql).toMatch(/alter table public\.whatsapp_safety_settings/i);
    expect(sql).toMatch(
      /add column if not exists agents_can_claim boolean not null default false/i,
    );
  });

  it("creates no policies and no new tables", () => {
    expect(sql).not.toMatch(/create policy/i);
    expect(sql).not.toMatch(/create table/i);
  });

  it("database.types.ts knows the column in Row, Insert and Update", () => {
    const block = types.slice(types.indexOf("whatsapp_safety_settings: {"));
    expect((block.slice(0, 4000).match(/agents_can_claim/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});
