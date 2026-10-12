import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const events: string[] = [];
let linkRow: unknown = { number_id: "n1" };
let numberRow: unknown = { id: "n1", label: "L" };
let gate: Promise<void> | null = null;

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabase: () => ({
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq"]) chain[m] = () => chain;
      chain.maybeSingle = () => {
        events.push(`start:${table}`);
        const out = () => ({ data: table === "whatsapp_number_agents" ? linkRow : numberRow, error: null });
        return gate ? gate.then(out) : Promise.resolve(out());
      };
      return chain;
    },
  }),
}));

import { getNumberForAgent } from "@/lib/data/sales-numbers";

beforeEach(() => {
  events.length = 0;
  gate = null;
  linkRow = { number_id: "n1" };
  numberRow = { id: "n1", label: "L" };
});

describe("getNumberForAgent", () => {
  it("agent: reads the link and the number together and returns the number", async () => {
    let release!: () => void;
    gate = new Promise<void>((r) => {
      release = r;
    });
    const p = getNumberForAgent("u1", false, "n1");
    await new Promise((r) => setTimeout(r, 0));
    expect(events).toEqual(["start:whatsapp_number_agents", "start:whatsapp_numbers"]);
    release();
    expect(await p).toEqual({ id: "n1", label: "L" });
  });
  it("agent without a link gets null even though the number exists", async () => {
    linkRow = null;
    expect(await getNumberForAgent("u1", false, "n1")).toBeNull();
  });
  it("admin: reads only the number row, no link", async () => {
    linkRow = null;
    expect(await getNumberForAgent("a1", true, "n1")).toEqual({ id: "n1", label: "L" });
    expect(events).toEqual(["start:whatsapp_numbers"]);
  });
  it("empty user id is null with no reads; missing number is null", async () => {
    expect(await getNumberForAgent("", true, "n1")).toBeNull();
    expect(events).toEqual([]);
    numberRow = null;
    expect(await getNumberForAgent("a1", true, "n1")).toBeNull();
  });
});
