import { NextRequest, NextResponse } from "next/server";
import { getAgentByToken, listActiveLeadCampaigns } from "@/lib/data/leads";

export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const agent = token ? await getAgentByToken(token) : null;
  if (!agent) {
    return NextResponse.json({ error: "Invalid or inactive agent link" }, { status: 403 });
  }

  const campaigns = await listActiveLeadCampaigns();
  return NextResponse.json({ campaigns });
}
