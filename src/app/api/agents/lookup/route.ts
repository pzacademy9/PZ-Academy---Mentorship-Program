import { NextRequest, NextResponse } from "next/server";
import { getAgentByToken } from "@/lib/data/leads";

export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 403 });
  }

  const agent = await getAgentByToken(token);
  if (!agent) {
    return NextResponse.json({ error: "Invalid or inactive agent link" }, { status: 403 });
  }

  return NextResponse.json({ name: agent.name });
}
