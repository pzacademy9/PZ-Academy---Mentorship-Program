import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (name: string) =>
  readFileSync(join(process.cwd(), "src", "lib", "data", name), "utf8");

/** Source text of one top-level function: from its declaration to the next top-level `export`/`async function`/`function`. */
function fnBody(src: string, name: string): string {
  const marker = new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\b`);
  const m = marker.exec(src);
  if (!m) throw new Error(`guard test: function "${name}" not found - was it renamed or moved?`);
  const rest = src.slice(m.index + m[0].length);
  const next = rest.search(/\n(?:export\s+)?(?:async\s+)?function\s|\nexport\s+(?:type|const)\s/);
  return next === -1 ? rest : rest.slice(0, next);
}

describe("data layer guards", () => {
  const contacts = read("sales-contacts.ts");
  const send = read("sales-send.ts");
  const numbers = read("sales-numbers.ts");

  it("contact actions go through the ownership helpers", () => {
    expect(contacts).toContain("canActOnContact(");
    expect(contacts).toContain("canClaimContact(");
    expect(send).toContain("canActOnContact(");
    // Writes go through the shared owner gate.
    for (const fn of ["logOutcome", "addNote"]) {
      expect(fnBody(contacts, fn), fn).toContain("loadOwned(");
    }
    expect(fnBody(contacts, "loadOwned")).toContain("canActOnContact(");
    expect(fnBody(contacts, "claimContact")).toContain("canClaimContact(");
  });

  it("detail and list reads mask other agents' contacts through canSeeDetails", () => {
    expect(contacts).toContain("canSeeDetails(");
    const detail = fnBody(contacts, "getContactDetail");
    const list = fnBody(contacts, "listContacts");
    expect(detail).toContain("canSeeDetails(");
    expect(list).toContain("canSeeDetails(");
    // The restricted branch returns before the activity read, so timelines never leave the data layer.
    expect(detail.indexOf("canSeeDetails(")).toBeLessThan(detail.indexOf('.from("contact_activities")'));
    expect(detail).toContain("restricted: true");
  });

  it("a timed panic freeze never replaces an indefinite freeze", () => {
    const body = fnBody(numbers, "freezeNumber");
    expect(body).toContain("isIndefinitelyFrozen(");
    expect(body).toContain("changed: false");
    expect(body.indexOf("isIndefinitelyFrozen(")).toBeLessThan(body.indexOf(".update("));
  });

  it("the role gate cannot be dropped from the list and queue reads", () => {
    expect(fnBody(contacts, "getTodayQueue")).toContain("canUseSales(");
    expect(fnBody(contacts, "listContacts")).toContain("canUseSales(");
  });

  it("the send gate checks limits before and after inserting, and refuses do-not-contact", () => {
    const body = fnBody(send, "requestSend");
    expect(body).toContain("evaluateSend(");
    expect(body).toContain("violationAfterInsert(");
    expect(body.indexOf("evaluateSend(")).toBeLessThan(body.indexOf('.insert('));
    expect(body.indexOf('.insert(')).toBeLessThan(body.indexOf("violationAfterInsert("));
    expect(body).toContain("do_not_contact_at");
    expect(body).toContain("whatsapp_unsubscribed_at");
    expect(body).toContain('reason: "do-not-contact"');
  });

  it("the Today queue never includes do-not-contact or unsubscribed contacts", () => {
    const queue = fnBody(contacts, "getTodayQueue");
    expect(queue).toContain('.is("do_not_contact_at", null)');
    expect(queue).toContain('.is("whatsapp_unsubscribed_at", null)');
  });

  it("only the send module produces WhatsApp links", () => {
    expect(contacts).not.toContain("buildWhatsAppLink");
    expect(numbers).not.toContain("buildWhatsAppLink");
    expect(send).toContain("buildWhatsAppLink(");
  });

  it("an empty actor id never matches a number assignment", () => {
    expect(fnBody(numbers, "getNumberForAgent")).toContain('userId === ""');
  });

  it("admin assign is admin-only", () => {
    const assign = fnBody(contacts, "assignContacts");
    expect(assign).toContain('admin.role !== "admin" && admin.role !== "super_admin"');
  });

  it("no log line or message promises safety", () => {
    for (const src of [contacts, send, numbers]) {
      expect(src).not.toMatch(/\bguarantee/i);
      expect(src).not.toMatch(/\b100% safe\b/i);
    }
  });
});
