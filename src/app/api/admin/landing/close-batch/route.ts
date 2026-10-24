import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { closeBatch, previewCloseBatch } from "@/lib/data/landing-close-batch";
import { closeBatchBodySchema, closeBatchQuerySchema } from "@/lib/validations/landing-close-batch";

export const maxDuration = 60;

const failed = () => NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
const notFound = (e: unknown) => e instanceof Error && e.message === "Page not found";

/** Close the batch into the paid and interested CRM cohorts (admin). middleware does not cover /api, so gate here. */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = closeBatchBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  try {
    return NextResponse.json(await closeBatch({ pageId: parsed.data.pageId, adminId: auth.user.id }));
  } catch (e) {
    if (notFound(e)) return NextResponse.json({ error: "Page not found" }, { status: 404 });
    console.error("[landing-close-batch] close failed");
    return failed();
  }
}

/** What closing would do, without changing anything (admin). */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = closeBatchQuerySchema.safeParse({ pageId: new URL(req.url).searchParams.get("pageId") });
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  try {
    return NextResponse.json(await previewCloseBatch(parsed.data.pageId));
  } catch (e) {
    if (notFound(e)) return NextResponse.json({ error: "Page not found" }, { status: 404 });
    console.error("[landing-close-batch] preview failed");
    return failed();
  }
}
