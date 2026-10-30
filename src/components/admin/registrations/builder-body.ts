import type { CampaignSelection } from "./CampaignRegistrations";

/**
 * The recipient part of a preview / send request, in the shape the API's zod schema accepts.
 * Filter mode drops the page number and empty values, and always pins the filter to this campaign.
 */
export function buildRecipientBody(
  pageId: string,
  selection: CampaignSelection,
): { ids: string[] } | { filters: Record<string, string | ("full" | number)[]> } {
  if (selection.mode === "ids") return { ids: selection.ids };
  const filters: Record<string, string | ("full" | number)[]> = {};
  for (const [key, value] of Object.entries(selection.filters)) {
    if (key === "page") continue;
    // The quick filters (Live full course, Live + Module N) are a list: it must reach the server whole.
    if (key === "optionScopes" && Array.isArray(value)) {
      if (value.length > 0) filters[key] = value;
      continue;
    }
    if (typeof value !== "string" || value === "") continue;
    filters[key] = value;
  }
  filters.pageId = pageId;
  return { filters };
}
