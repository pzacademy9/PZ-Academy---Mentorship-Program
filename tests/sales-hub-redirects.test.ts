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
