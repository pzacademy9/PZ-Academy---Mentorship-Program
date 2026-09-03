import { NextRequest, NextResponse } from "next/server";
import { getActiveBanners } from "@/lib/data/marketing";
import { BANNER_SLOTS } from "@/lib/validations/admin-marketing";
import type { BannerSlot } from "@/lib/validations/admin-marketing";

export async function GET(req: NextRequest) {
  const slotParam = req.nextUrl.searchParams.get("slot");
  if (!slotParam || !(BANNER_SLOTS as readonly string[]).includes(slotParam)) {
    return NextResponse.json({ error: "Missing or invalid slot" }, { status: 400 });
  }

  const banners = await getActiveBanners(slotParam as BannerSlot);
  return NextResponse.json({ banners });
}
