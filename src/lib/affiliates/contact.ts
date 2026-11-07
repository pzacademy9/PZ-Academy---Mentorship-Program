// src/lib/affiliates/contact.ts
// Where the affiliate emails point. Public business contacts, not personal data.
const SUPPORT_WA = "https://wa.me/923155614490";
const GROUP_WA = "https://chat.whatsapp.com/FbT3oCEJgVkK2aSt2RrN5B";

export const affiliateSupportWa = (): string => process.env.AFFILIATE_SUPPORT_WA_LINK || SUPPORT_WA;
export const affiliateGroupWa = (): string => process.env.AFFILIATE_GROUP_WA_LINK || GROUP_WA;

/** The affiliate's private page (built in Step 2). Anyone with the link can open it, so it is only ever shown to the admin and emailed to the affiliate. */
export function affiliateLink(token: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || "https://pharmacozyme.com").replace(/\/+$/, "");
  return `${base}/affiliate/${token}`;
}
