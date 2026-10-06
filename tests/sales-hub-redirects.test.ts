import fs from "node:fs";
import path from "node:path";
import { legacyCrmTabTarget } from "@/lib/crm/sales-hub-routes";
import nextConfig from "../next.config.mjs";

type R = { source: string; destination: string; permanent: boolean };

async function rules(): Promise<R[]> {
  return (await (nextConfig as { redirects: () => Promise<R[]> }).redirects()) as R[];
}

it("detail pages keep their id", async () => {
  const r = await rules();
  for (const section of ["contacts", "cohorts", "campaigns", "whatsapp"]) {
    const rule = r.find((x) => x.source === `/dashboard/admin/crm/${section}/:id`);
    expect(rule?.destination).toBe(`/dashboard/admin/sales-hub/${section}/:id`);
    expect(rule?.permanent).toBe(true);
  }
});

it("sales-team and sales-safety move to the hub", async () => {
  const r = await rules();
  expect(r.find((x) => x.source === "/dashboard/admin/sales-team")?.destination).toBe("/dashboard/admin/sales-hub/team");
  expect(r.find((x) => x.source === "/dashboard/admin/sales-safety")?.destination).toBe("/dashboard/admin/sales-hub/safety");
});

it("legacy agents routes land on the overview", async () => {
  const r = await rules();
  expect(r.find((x) => x.source === "/dashboard/admin/crm/agents/:path*")?.destination).toBe("/dashboard/admin/sales-hub");
});

function pageExists(route: string): boolean {
  const dir = route
    .split("/")
    .filter((seg) => seg && !seg.startsWith(":"))
    .join("/");
  return fs.existsSync(path.join(process.cwd(), "src", "app", dir, "page.tsx"));
}

it("every redirect destination resolves to an existing page", async () => {
  for (const rule of await rules()) {
    const dest = rule.destination.replace(/\/:[A-Za-z*]+\*?/g, "");
    expect(pageExists(dest), `${rule.source} -> ${rule.destination}`).toBe(true);
  }
});

it("every legacy ?tab= target resolves to an existing page", () => {
  for (const tab of [undefined, "contacts", "import", "merge", "campaigns", "cohorts", "whatsapp", "conversion", "agents", "bogus"]) {
    const target = legacyCrmTabTarget(tab);
    expect(pageExists(target), `tab=${tab} -> ${target}`).toBe(true);
  }
});
