import { firstNameOf } from "@/lib/crm/whatsapp-link";

export type TagContext = { name: string; refId: string; portalUrl: string | null };

export const PARTICIPANT_TAGS: readonly string[] = ["first_name", "full_name", "ref_id", "portal_link"];

const TAG_RE = /\{\{\s*(\w+)\s*\}\}/g;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Unknown tags stay verbatim so typos are visible in a test send. */
export function renderParticipantTags(template: string, ctx: TagContext, mode: "html" | "text"): string {
  const full = ctx.name.trim();
  const first = firstNameOf(ctx.name);
  const values: Record<string, string> = {
    first_name: first === "" ? "there" : first,
    full_name: full,
    ref_id: ctx.refId,
    portal_link: ctx.portalUrl ?? "",
  };
  return template.replace(TAG_RE, (match, key: string) => {
    const value = values[key];
    if (value === undefined) return match;
    return mode === "html" ? escapeHtml(value) : value;
  });
}

export function usesPortalLink(template: string): boolean {
  return /\{\{\s*portal_link\s*\}\}/.test(template);
}
