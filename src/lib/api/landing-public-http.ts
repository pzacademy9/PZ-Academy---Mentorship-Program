import "server-only";
import { NextResponse } from "next/server";
import { getRegistrablePage, type RegistrablePage } from "@/lib/data/landing-public";
import { isPublicSlug } from "@/lib/validations/landing-public";

/**
 * Public landing replies are never cached by the CDN or the browser: they depend on the
 * visitor's country header, the clock (Early Bird) and the request body or session.
 */
export const NO_STORE: Record<string, string> = { "Cache-Control": "no-store" };

export const CLOSED_MESSAGE = "Registration for this event is closed.";

export function publicJson(body: unknown, status = 200, headers: Record<string, string> = NO_STORE): NextResponse {
  return NextResponse.json(body, { status, headers });
}

export type PageGate = { ok: true; page: RegistrablePage } | { ok: false; response: NextResponse };

/**
 * Shared page lookup for /api/landing/[slug]/*. Drafts, unknown and malformed slugs are 404
 * (never a hint that a draft exists). With `registration: true` (the default) a page whose
 * registration form is switched off is also 404. Closed pages pass: each route decides.
 */
export async function loadPublicPage(slug: string, opts: { registration: boolean } = { registration: true }): Promise<PageGate> {
  if (!isPublicSlug(slug)) return { ok: false, response: publicJson({ error: "Page not found" }, 404) };
  let page: RegistrablePage | null;
  try {
    page = await getRegistrablePage(slug);
  } catch {
    return { ok: false, response: publicJson({ error: "We could not load this page. Please try again in a moment." }, 500) };
  }
  if (!page) return { ok: false, response: publicJson({ error: "Page not found" }, 404) };
  if (opts.registration && !page.registration.enabled) {
    return { ok: false, response: publicJson({ error: "Registration is not open on this page." }, 404) };
  }
  return { ok: true, page };
}
