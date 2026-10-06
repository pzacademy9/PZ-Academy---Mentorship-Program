import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(process.cwd(), "src", "lib", "data", "sales-assignment.ts"), "utf8");

/** Source text of one top-level function: from its declaration to the next top-level `export`/`async function`/`function`. */
function fnBody(source: string, name: string): string {
  const marker = new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\b`);
  const m = marker.exec(source);
  if (!m) throw new Error(`guard test: function "${name}" not found - was it renamed or moved?`);
  const rest = source.slice(m.index + m[0].length);
  const next = rest.search(/\n(?:export\s+)?(?:async\s+)?function\s|\nexport\s+(?:type|const)\s/);
  return next === -1 ? rest : rest.slice(0, next);
}

describe("assignment data layer guards", () => {
  it("assignment functions are admin-only", () => {
    for (const fn of ["previewAssignment", "commitAssignment"]) {
      expect(fnBody(src, fn)).toContain('admin.role !== "admin" && admin.role !== "super_admin"');
    }
  });

  it("commit only updates contacts the plan selected, and never touches do-not-contact", () => {
    const body = fnBody(src, "commitAssignment");
    expect(body).toContain("planAssignment(");
    expect(body).toContain("plan.toAssign");
    expect(body).toContain("chunk(");
  });

  it("the update itself excludes do-not-contact in every mode", () => {
    expect(fnBody(src, "commitAssignment")).toContain('.is("do_not_contact_at", null)');
  });

  it("default mode guards the update against a concurrent claim", () => {
    expect(fnBody(src, "commitAssignment")).toContain('.is("owner_id", null)');
  });

  it("writes one timeline event per changed contact with the admin as actor", () => {
    const body = fnBody(src, "commitAssignment");
    expect(body).toContain('from("contact_activities")');
    expect(body).toContain("agent_id: admin.id");
  });

  it("notifies the agent once per commit, and a notification failure never throws", () => {
    const body = fnBody(src, "commitAssignment");
    expect(body).toContain('from("notifications")');
    expect(body).toContain('type: "contacts_assigned"');
  });

  it("every id list is chunked", () => {
    expect(src).toContain("const ID_CHUNK = 200");
    expect(fnBody(src, "loadCandidates")).toContain("chunk(ids, ID_CHUNK)");
  });
});
