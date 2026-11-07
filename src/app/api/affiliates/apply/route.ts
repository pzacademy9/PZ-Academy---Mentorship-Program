import { NextRequest, NextResponse } from "next/server";
import { affiliateApplicationSchema } from "@/lib/validations/affiliate-application";
import { firstIssue } from "@/lib/validations/landing-promo";
import { createApplication } from "@/lib/data/affiliates";
import { getAffiliatePolicies } from "@/lib/data/site-terms";
import { allowAffiliateApply } from "@/lib/pzid/lookup-limit";

/** An application is a few hundred words; anything near this size is not one. */
const MAX_BODY_BYTES = 20 * 1024;

function callerIp(req: NextRequest): string {
  return (req.headers.get("x-real-ip") ?? "").trim() || (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
}

/** Public: someone applies to become an affiliate. */
export async function POST(req: NextRequest) {
  if (!(await allowAffiliateApply(callerIp(req)))) {
    return NextResponse.json({ error: "Too many tries. Please wait a few minutes and try again." }, { status: 429 });
  }

  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return NextResponse.json({ error: "That is too much text." }, { status: 413 });
  const raw = await req.text().catch(() => "");
  if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ error: "That is too much text." }, { status: 413 });

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  // Honeypot: real people never see this field. Pretend it worked, save nothing.
  if (typeof json === "object" && json !== null && typeof (json as { website?: unknown }).website === "string" && (json as { website: string }).website !== "") {
    return NextResponse.json({ ok: true });
  }

  const parsed = affiliateApplicationSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json(firstIssue(parsed.error), { status: 400 });

  let policies;
  try {
    policies = await getAffiliatePolicies();
  } catch {
    return NextResponse.json({ error: "Applications are not open yet." }, { status: 503 });
  }
  if (!policies.ready) return NextResponse.json({ error: "Applications are not open yet." }, { status: 503 });

  const result = await createApplication(parsed.data, policies.version);
  if (!result.ok) {
    if (result.reason === "duplicate") return NextResponse.json({ error: "You have already applied with this email." }, { status: 409 });
    return NextResponse.json({ error: "Could not send your application. Please try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}
