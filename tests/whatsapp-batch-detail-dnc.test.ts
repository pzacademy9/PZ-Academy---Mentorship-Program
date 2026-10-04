import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(process.cwd(), "src", "lib", "data", "admin-crm-whatsapp.ts"), "utf8");

function detailBody(): string {
  const start = src.indexOf("export async function getWhatsAppBatchDetail");
  if (start === -1) throw new Error("getWhatsAppBatchDetail not found");
  const rest = src.slice(start + 10);
  const next = rest.search(/\nexport\s/);
  return next === -1 ? rest : rest.slice(0, next);
}

describe("getWhatsAppBatchDetail DNC flag", () => {
  const body = detailBody();

  it("embeds do_not_contact_at in the recipients select", () => {
    expect(body).toContain("contacts(do_not_contact_at)");
  });

  it("has no second contacts lookup by id list", () => {
    expect(body).not.toContain('.in("id"');
    expect(body).not.toContain('.from("contacts")');
  });

  it("fails closed when the embedded contact is missing", () => {
    expect(body).toMatch(/if \(!contact\) return true;/);
  });
});
