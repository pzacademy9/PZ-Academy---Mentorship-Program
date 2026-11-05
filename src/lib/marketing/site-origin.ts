/** The public site's address, for links that leave the site (calendar entries). */
export const siteOrigin = (): string => (process.env.NEXT_PUBLIC_APP_URL || "https://pharmacozyme.com").replace(/\/+$/, "");
