import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";

const ALLOWED_HOSTS = new Set([
  "drive.google.com",
  "drive.usercontent.google.com",
  "docs.google.com",
]);

/**
 * Pulls the Drive file id out of a stored screenshot URL.
 *
 * GAS stores `file.getUrl()`, which is an HTML *viewer* page
 * (https://drive.google.com/file/d/<ID>/view) — it will never render in an
 * <img> tag. That is the reason this proxy exists at all.
 */
function driveFileId(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  // The URL comes from our own GAS bridge, but it is still DB-sourced input
  // being handed to fetch() — pin the host so a bad row can't make this an
  // open redirector / SSRF gadget.
  if (!ALLOWED_HOSTS.has(parsed.hostname)) return null;

  return parsed.pathname.match(/\/d\/([^/]+)/)?.[1] ?? parsed.searchParams.get("id");
}

/**
 * Streams a payment screenshot from Drive through the app, admin-gated.
 *
 * Proxying rather than hotlinking means the image renders reliably, keeps
 * working if Drive sharing is tightened later, and never exposes the raw
 * Drive URL to the browser.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;

  const { data: enrollment } = await auth.supabase
    .from("enrollments")
    .select("payment_screenshot_url")
    .eq("id", id)
    .maybeSingle();

  if (!enrollment?.payment_screenshot_url) {
    return NextResponse.json({ error: "No screenshot on this enrollment" }, { status: 404 });
  }

  const fileId = driveFileId(enrollment.payment_screenshot_url);
  if (!fileId) {
    return NextResponse.json({ error: "Unrecognised screenshot URL" }, { status: 404 });
  }

  // Uploads are capped at 5 MB (screenshotUploadSchema), well under the size
  // that triggers Drive's virus-scan interstitial, so the direct download
  // endpoint returns bytes. If it hands back HTML anyway, fall back to the
  // thumbnail renderer — which also gives us a preview image for PDFs.
  const sources = [
    `https://drive.google.com/uc?export=download&id=${fileId}`,
    `https://drive.google.com/thumbnail?id=${fileId}&sz=w1600`,
  ];

  for (const source of sources) {
    let upstream: Response;
    try {
      upstream = await fetch(source, { redirect: "follow" });
    } catch {
      continue;
    }

    const contentType = upstream.headers.get("content-type") ?? "";
    if (!upstream.ok || !upstream.body || contentType.startsWith("text/html")) continue;

    return new NextResponse(upstream.body, {
      headers: {
        "Content-Type": contentType || "application/octet-stream",
        // no-store, not `private, max-age`: these are payment screenshots
        // containing account details. A cached copy stays readable from the
        // browser's disk cache after the admin logs out, so on a shared
        // machine the next user could pull it back without re-authorising.
        // Verified: with max-age set, a signed-in student got a 200 from
        // cache on a URL that correctly returns 403 when actually requested.
        "Cache-Control": "private, no-store, max-age=0, must-revalidate",
        "Content-Disposition": "inline",
      },
    });
  }

  return NextResponse.json({ error: "Could not load screenshot from Drive" }, { status: 502 });
}
