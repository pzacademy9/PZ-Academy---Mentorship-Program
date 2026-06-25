import { NextRequest, NextResponse } from "next/server";

const GAS_URL = process.env.GAS_WEBAPP_URL ?? "";

export async function POST(req: NextRequest) {
  if (!GAS_URL) {
    return NextResponse.json({ ok: false, error: "GAS_WEBAPP_URL not configured." }, { status: 500 });
  }
  try {
    const body = await req.json();
    const res = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    return NextResponse.json(json);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Network error." },
      { status: 500 }
    );
  }
}
