import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { isUuid } from "@/lib/validations/participants";
import { updateRegistrationDetails } from "@/lib/data/landing-registration-edit";

const bodySchema = z
  .object({ name: z.string().max(1000).optional(), email: z.string().max(1000).optional(), whatsapp: z.string().max(1000).optional() })
  .strict()
  .refine((b) => b.name !== undefined || b.email !== undefined || b.whatsapp !== undefined);

/** Edit one person's name, email and WhatsApp (admin). Never changes status, payment or access. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Registration not found" }, { status: 404 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const result = await updateRegistrationDetails({ registrationId: id, ...parsed.data });
  if (result.ok) return NextResponse.json({ ok: true, changed: result.changed });
  switch (result.reason) {
    case "nothing-to-change":
      return NextResponse.json({ ok: true, changed: [] });
    case "not-found":
      return NextResponse.json({ error: "Registration not found" }, { status: 404 });
    case "bad-email":
      return NextResponse.json({ error: "Enter a valid email address, like name@example.com." }, { status: 422 });
    case "bad-whatsapp":
      return NextResponse.json({ error: "Enter a WhatsApp number with the country code, digits only." }, { status: 422 });
    case "bad-name":
      return NextResponse.json({ error: "The name cannot be empty." }, { status: 422 });
    case "email-taken":
      return NextResponse.json({ error: "Another person on this page already uses that email. Their account is not changed." }, { status: 409 });
    default:
      return NextResponse.json({ error: "The details could not be saved. Try again." }, { status: 500 });
  }
}
