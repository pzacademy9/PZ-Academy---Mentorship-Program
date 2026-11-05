// Share picture of a batch podium (top three live-ranked students). It reads the same public view as
// /progress/<slug> (getPortalBatch, same per-caller limit), so it can only show what that page shows.
import { ImageResponse } from "next/og";
import { getPortalBatch } from "@/lib/data/portal";
import { portalCallerAllowed } from "@/lib/pzid/caller-allowed";
import { PODIUM_SIZES, parsePodiumSize, podium, podiumFileName, resolvePodiumPick, rowsFor } from "@/lib/progress/leaderboard";
import { PodiumImage } from "@/components/progress/portal/PodiumImage";

// Reads request headers for the rate limit and live scores, so nothing is cached at build time.
export const dynamic = "force-dynamic";

const text = (body: string, status: number) =>
  new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

export async function GET(req: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const query = new URL(req.url).searchParams;
  const size = parsePodiumSize(query.get("size"));
  if (!size) return text("Size must be square or story.", 400);

  try {
    if (!(await portalCallerAllowed())) return text("Too many requests, try again in a few minutes.", 429);
    const view = await getPortalBatch(slug);
    if (!view) return text("Batch not found.", 404);
    const pick = resolvePodiumPick(view, query.get("class"));
    if (!pick) return text("Class not found.", 404);
    // Only name, rank and score leave this function.
    const entries = podium(rowsFor(view, pick.id)).map((r) => ({ name: r.name, rank: r.rank, score: r.score }));
    if (entries.length === 0) return text("No ranked students yet.", 404);

    const { width, height } = PODIUM_SIZES[size];
    const img = new ImageResponse(<PodiumImage title={view.title} label={pick.label} entries={entries} size={size} />, { width, height });
    return new Response(img.body, {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `inline; filename="${podiumFileName(view.slug, pick.label, size)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    // Thrown text stays on the server.
    return text("We could not make this picture right now. Please try again in a minute.", 500);
  }
}
