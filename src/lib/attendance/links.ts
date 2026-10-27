// Base of attendance links: same rule as the Sales "my links" page. No server-only imports.
export const attendanceBase = (): string => (process.env.NEXT_PUBLIC_APP_URL || "https://pharmacozyme.com").replace(/\/+$/, "");
