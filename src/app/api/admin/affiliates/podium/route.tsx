// Share picture of the affiliate podium (top three by paid sales). Admin only. Only the public name
// (first name + last initial), rank and paid count reach the picture: no full name, email, code or money.
import { ImageResponse } from "next/og";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getAffiliateBoard } from "@/lib/data/affiliate-leaderboard";
import { PODIUM_SIZES, parsePodiumSize, podiumFileName } from "@/lib/progress/leaderboard";
import { PodiumImage } from "@/components/progress/portal/PodiumImage";
import { podiumAssets } from "@/lib/progress/podium-assets";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const text = (body: string, status: number) =>
  new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

export async function GET(req: Request) {
  const auth = await requireAdmin("sales_hub");
  if (!auth.ok) return auth.response;

  const query = new URL(req.url).searchParams;
  const size = parsePodiumSize(query.get("size"));
  if (!size) return text("Size must be square or story.", 400);
  const rawPeriod = query.get("period");
  const period = rawPeriod === null || rawPeriod === "" || rawPeriod === "month" ? "month" : rawPeriod === "all" ? "all" : null;
  if (!period) return text("Period must be month or all.", 400);

  try {
    const board = await getAffiliateBoard(period);
    // Rows are already in rank order; only affiliates with a paid sale are on the picture.
    const entries = board.rows
      .filter((r) => r.paid >= 1)
      .slice(0, 3)
      .map((r) => ({ name: r.publicName, rank: r.rank, score: r.paid }));
    if (entries.length === 0) return text("No paid sales yet.", 404);

    const label = period === "month" ? "This month" : "All time";
    const { width, height } = PODIUM_SIZES[size];
    const { fonts, logo } = await podiumAssets();
    const img = new ImageResponse(
      <PodiumImage
        title="Pharmacozyme Affiliates"
        label={label}
        entries={entries}
        size={size}
        logo={logo}
        unit="paid sales"
        heading={`Affiliate leaderboard · ${label}`}
        fallbackLabel="Affiliate"
      />,
      { width, height, ...(fonts.length > 0 ? { fonts } : {}) },
    );
    // Drawing happens while the body is read: read it here so a drawing failure lands in the catch (500).
    const png = await img.arrayBuffer();
    return new Response(png, {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `inline; filename="${podiumFileName("affiliates", label, size)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return text("We could not make this picture right now. Please try again in a minute.", 500);
  }
}
