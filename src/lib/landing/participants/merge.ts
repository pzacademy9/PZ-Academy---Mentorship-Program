import { firstNameOf } from "@/lib/crm/whatsapp-link";

/** Live-session details for session emails. Without it the session tags stay verbatim. */
export type SessionTagContext = { zoomUrl: string; kahootUrl: string; timeText: string; attendanceUrl: string };
export type TagContext = { name: string; refId: string; portalUrl: string | null; pzId: string; session?: SessionTagContext };

export const PARTICIPANT_TAGS: readonly string[] = ["first_name", "full_name", "ref_id", "portal_link", "pz_id"];

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
    pz_id: ctx.pzId,
  };
  if (ctx.session) {
    values.zoom_link = ctx.session.zoomUrl;
    values.kahoot_link = ctx.session.kahootUrl;
    values.session_time = ctx.session.timeText;
    values.attendance_link = ctx.session.attendanceUrl;
  }
  return template.replace(TAG_RE, (match, key: string) => {
    const value = values[key];
    if (value === undefined) return match;
    return mode === "html" ? escapeHtml(value) : value;
  });
}

/** True when the template shows the person's PZ ID, so people without one must not get it. */
export function usesPzId(template: string): boolean {
  return /\{\{\s*pz_id\s*\}\}/.test(template);
}

export function usesPortalLink(template: string): boolean {
  return /\{\{\s*portal_link\s*\}\}/.test(template);
}
