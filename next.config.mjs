/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // The podium share picture reads its fonts and logo from disk at run time; ship them with that route.
    outputFileTracingIncludes: { "/api/progress-podium/[slug]": ["./src/assets/**/*"] },
  },
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
