/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    const base = "/dashboard/admin/sales-hub";
    return [
      ...["contacts", "cohorts", "campaigns", "whatsapp"].map((section) => ({
        source: `/dashboard/admin/crm/${section}/:id`,
        destination: `${base}/${section}/:id`,
        permanent: true,
      })),
      { source: "/dashboard/admin/crm/agents/:path*", destination: base, permanent: true },
      { source: "/dashboard/admin/sales-team", destination: `${base}/team`, permanent: true },
      { source: "/dashboard/admin/sales-safety", destination: `${base}/safety`, permanent: true },
    ];
  },
};

export default nextConfig;
