// Download links for an audience file. Kept out of client components so any page can import it.
export const AUDIENCE_EXPORT_URL = "/api/admin/crm/audiences/export";

export function audienceExportUrls(key: string): { meta: string; plain: string } {
  const meta = `${AUDIENCE_EXPORT_URL}?f=${key}`;
  return { meta, plain: `${meta}&format=plain` };
}
