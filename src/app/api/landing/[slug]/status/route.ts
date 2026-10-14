import { NextRequest } from "next/server";
import { getRegistrationStatus } from "@/lib/data/landing-registrations";
import { loadPublicPage, publicJson } from "@/lib/api/landing-public-http";
import { statusQuerySchema } from "@/lib/validations/landing-public";

export const dynamic = "force-dynamic";

/** "Check my registration": reference + the email used. Works after registration is switched off. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const gate = await loadPublicPage(slug, { registration: false });
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const parsed = statusQuerySchema.safeParse({ ref: url.searchParams.get("ref") ?? "", email: url.searchParams.get("email") ?? "" });
  if (!parsed.success) {
    return publicJson({ error: "Enter your reference (for example PZA-PPC-001) and the email you registered with." }, 400);
  }

  try {
    // Scoped to the page in the URL: a ref + email from another event is "not found" here.
    const found = await getRegistrationStatus(parsed.data.ref, parsed.data.email, gate.page.id);
    if (!found) {
      return publicJson({ error: "We could not find a registration with that reference and email. Check both and try again." }, 404);
    }
    return publicJson(found);
  } catch {
    return publicJson({ error: "We could not check your registration. Please try again in a moment." }, 500);
  }
}
