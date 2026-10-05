import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { statusForReason } from "@/lib/api/sales-http";

function walk(dir: string): string[] {
  let out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out = out.concat(walk(p));
    else if (name === "route.ts") out.push(p);
  }
  return out;
}

const salesRoot = join(process.cwd(), "src", "app", "api", "sales");
const adminSalesRoot = join(process.cwd(), "src", "app", "api", "admin", "sales");
const rel = (p: string) => p.replace(process.cwd(), "").replaceAll("\\", "/");

describe("sales route files", () => {
  const sales = walk(salesRoot);
  const adminSales = walk(adminSalesRoot);

  it("exist in the expected number", () => {
    expect(sales.map(rel).sort()).toEqual(
      [
        "/src/app/api/sales/budget/route.ts",
        "/src/app/api/sales/contacts/[id]/claim/route.ts",
        "/src/app/api/sales/contacts/[id]/note/route.ts",
        "/src/app/api/sales/contacts/[id]/outcome/route.ts",
        "/src/app/api/sales/contacts/[id]/route.ts",
        "/src/app/api/sales/contacts/[id]/send/route.ts",
        "/src/app/api/sales/contacts/route.ts",
        "/src/app/api/sales/leads/route.ts",
        "/src/app/api/sales/numbers/[id]/freeze/route.ts",
        "/src/app/api/sales/templates/route.ts",
        "/src/app/api/sales/today/route.ts",
      ].sort(),
    );
    expect(adminSales).toHaveLength(5);
  });

  it("every agent route gates with requireSalesAgent and never requireAdmin", () => {
    for (const f of sales) {
      const src = readFileSync(f, "utf8");
      expect(src, rel(f)).toContain("requireSalesAgent(");
      expect(src, rel(f)).not.toContain("requireAdmin(");
    }
  });

  it("every admin route gates with requireAdmin and never requireSalesAgent", () => {
    for (const f of adminSales) {
      const src = readFileSync(f, "utf8");
      expect(src, rel(f)).toContain("requireAdmin(");
      expect(src, rel(f)).not.toContain("requireSalesAgent");
    }
  });

  it("no route builds a WhatsApp link itself; only the send route goes through requestSend", () => {
    for (const f of [...sales, ...adminSales]) {
      const src = readFileSync(f, "utf8");
      expect(src, rel(f)).not.toContain("buildWhatsAppLink");
    }
    const sendRoute = readFileSync(join(salesRoot, "contacts", "[id]", "send", "route.ts"), "utf8");
    expect(sendRoute).toContain("requestSend(");
  });

  it("no route talks to the database client directly", () => {
    for (const f of [...sales, ...adminSales]) {
      const src = readFileSync(f, "utf8");
      expect(src, rel(f)).not.toContain("createAdminSupabase");
    }
  });

  it("the send route passes the chosen follow-up hours to requestSend", () => {
    const src = readFileSync(join(salesRoot, "contacts", "[id]", "send", "route.ts"), "utf8");
    expect(src).toContain("followupInHours: parsed.data.followupInHours");
  });

  it("the contact detail route passes the restricted flag through", () => {
    const src = readFileSync(join(salesRoot, "contacts", "[id]", "route.ts"), "utf8");
    expect(src).toContain("restricted: result.restricted");
  });

  it("the templates route is read-only", () => {
    const src = readFileSync(join(salesRoot, "templates", "route.ts"), "utf8");
    expect(src).toContain('listTemplates("whatsapp")');
    expect(src).not.toMatch(/export async function (POST|PUT|PATCH|DELETE)/);
    expect(src).not.toContain("createTemplate");
    expect(src).not.toContain("deleteTemplate");
  });

  it("admin number routes pass the plain duplicate / invalid-phone message through with its status", () => {
    const create = readFileSync(join(adminSalesRoot, "numbers", "route.ts"), "utf8");
    const update = readFileSync(join(adminSalesRoot, "numbers", "[id]", "route.ts"), "utf8");
    expect(create).toContain("result.message");
    expect(create).toContain("statusForReason(result.reason)");
    expect(update).toContain("result.message");
    expect(statusForReason("duplicate")).toBe(409);
    expect(statusForReason("invalid-phone")).toBe(400);
  });
});
