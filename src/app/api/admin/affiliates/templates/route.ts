import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { listAffiliateTemplates } from "@/lib/data/affiliate-templates";

/** The saved WhatsApp and email templates, for the contact pop-up. */
export async function GET() {
  const auth = await requireAdmin("sales_hub");
  if (!auth.ok) return auth.response;
  try {
    const [whatsapp, email] = await Promise.all([listAffiliateTemplates("whatsapp"), listAffiliateTemplates("email")]);
    return NextResponse.json({ whatsapp, email });
  } catch {
    return NextResponse.json({ error: "Could not load the templates. Please try again." }, { status: 500 });
  }
}
