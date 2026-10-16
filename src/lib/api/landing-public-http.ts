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

/** The `v` query value of a public API request, or null when absent. */
export function variantParam(req: Request): string | null {
  try {
    return new URL(req.url).searchParams.get("v");
  } catch {
    return null;
  }
}

export type PageGate = { ok: true; page: RegistrablePage } | { ok: false; response: NextResponse };

/** One or two lowercase slug-like segments (region, module, or region/module); same shape the admin creates. */
const VARIANT_PARAM_RE = /^[a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9]+(-[a-z0-9]+)*)?$/;
const MAX_VARIANT_PARAM = 80;

/**
 * Shared page lookup for /api/landing/[slug]/*. Drafts, unknown and malformed slugs are 404
 * (never a hint that a draft exists). With `registration: true` (the default) a page whose
 * registration form is switched off is also 404. Closed pages pass: each route decides.
 * `variant` is the raw `v` query value ("uae/module-2"); null/undefined means the main page. A malformed
 * value, or a variant that is unknown, disabled or unpublished, is the same plain 404 (no hint).
 */
export async function loadPublicPage(
  slug: string,
  opts: { registration: boolean; variant?: string | null } = { registration: true },
): Promise<PageGate> {
  const notFound = () => ({ ok: false as const, response: publicJson({ error: "Page not found" }, 404) });
  if (!isPublicSlug(slug)) return notFound();
  let segments: string[] | undefined;
  if (opts.variant !== undefined && opts.variant !== null) {
    if (opts.variant.length > MAX_VARIANT_PARAM || !VARIANT_PARAM_RE.test(opts.variant)) return notFound();
    segments = opts.variant.split("/");
  }
  let page: RegistrablePage | null;
  try {
    page = segments ? await getRegistrablePage(slug, segments) : await getRegistrablePage(slug);
  } catch {
    return { ok: false, response: publicJson({ error: "We could not load this page. Please try again in a moment." }, 500) };
  }
  if (!page) return { ok: false, response: publicJson({ error: "Page not found" }, 404) };
  if (opts.registration && !page.registration.enabled) {
    return { ok: false, response: publicJson({ error: "Registration is not open on this page." }, 404) };
  }
  return { ok: true, page };
}
