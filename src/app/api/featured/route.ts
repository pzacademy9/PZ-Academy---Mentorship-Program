import { NextResponse } from "next/server";
import { getFeaturedItems } from "@/lib/data/marketing";

export async function GET() {
  const items = await getFeaturedItems();
  return NextResponse.json({ items });
}
