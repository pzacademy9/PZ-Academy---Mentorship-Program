import { NextRequest, NextResponse } from "next/server";
import { mentorshipApplicationSchema } from "@/lib/validations/mentorship-application";
import { findStudentIdByEmail } from "@/lib/data/sheet-sync";
import { insertApplication } from "@/lib/data/mentorship-applications";
import { sendMentorshipEmail } from "@/lib/emails/mentorship";
import { createAdminSupabase } from "@/lib/supabase/admin";

const GAS_URL = process.env.GAS_WEBAPP_URL ?? "";
const GAS_SHARED_SECRET = process.env.GAS_SHARED_SECRET ?? "";
const MENTOR_SCRIPT_URL = process.env.NEXT_PUBLIC_MENTOR_SCRIPT_URL ?? "";

// CV + photo upload and GAS forward can take a while on a slow connection.
export const maxDuration = 60;

async function uploadMentorshipFile(mimeType: string, base64: string, filename: string): Promise<string | null> {
  if (!GAS_URL) return null;
  try {
    const gasRes = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "uploadMentorshipFile",
        secret: GAS_SHARED_SECRET,
        folder: "Applications",
        mimeType,
        base64,
        filename,
      }),
    });
    const json: { ok: boolean; url?: string } = await gasRes.json();
    return json.ok && json.url ? json.url : null;
  } catch (error) {
    console.error("[mentorship-applications] file upload failed:", error);
    return null;
  }
}

/**
 * Public — no auth, matching the recruitment form's own public nature.
 * Inserts into Supabase, uploads the CV and photos via the shared GAS
 * dispatcher, then forwards the original payload to the team's existing
 * Sheet exactly as before this feature.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = mentorshipApplicationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const input = parsed.data;

  // Rate limit: the Supabase table itself is the store (no shared
  // in-memory state across serverless invocations, and no existing
  // Redis/Upstash dependency to add one for). Applications are rarer than
  // bookings, so the threshold is tighter.
  const admin = createAdminSupabase();
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { count: recentCount } = await admin
    .from("mentor_applications")
    .select("id", { count: "exact", head: true })
    .eq("email", input.email)
    .gte("created_at", tenMinutesAgo);
  if ((recentCount ?? 0) >= 2) {
    return NextResponse.json(
      { error: "Too many submissions. Please wait a few minutes and try again, or contact us on WhatsApp." },
      { status: 429 },
    );
  }

  const cvUrl = await uploadMentorshipFile("application/octet-stream", input.cvBase64, input.cvFileName);
  const photoUrls: string[] = [];
  for (const photo of input.photos) {
    const url = await uploadMentorshipFile("image/jpeg", photo.base64, photo.name);
    if (url) photoUrls.push(url);
  }

  const applicantId = await findStudentIdByEmail(input.email);

  // The Sheet is still the team's operational system of record — a
  // Supabase insert failure must not skip the GAS forward below, so it's
  // never lost from both systems at once.
  let id: string | null = null;
  try {
    id = (
      await insertApplication({
        applicantId,
        fullName: input.fullName,
        email: input.email,
        phone: input.phone,
        country: input.country ?? null,
        profession: input.profession ?? null,
        position: input.position ?? null,
        expertise: input.expertise ?? null,
        organization: input.organization ?? null,
        yearsExperience: input.years ?? null,
        linkedinUrl: input.linkedin ?? null,
        roles: input.roles ?? null,
        whyJoin: input.whyJoin ?? null,
        valueProvide: input.valueProvide ?? null,
        cvUrl,
        photoUrls,
      })
    ).id;
  } catch (error) {
    console.error("[mentorship-applications] Supabase insert failed:", error);
  }

  if (MENTOR_SCRIPT_URL) {
    try {
      await fetch(MENTOR_SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify({
          fullName: input.fullName,
          email: input.email,
          phone: input.phone,
          country: input.country ?? "",
          profession: input.profession ?? "",
          position: input.position ?? "",
          expertise: input.expertise ?? "",
          organization: input.organization ?? "",
          years: input.years ?? "",
          linkedin: input.linkedin ?? "",
          roles: input.roles ?? "",
          whyJoin: input.whyJoin ?? "",
          valueProvide: input.valueProvide ?? "",
          cvBase64: input.cvBase64,
          cvFileName: input.cvFileName,
          photos: input.photos,
        }),
      });
    } catch (error) {
      console.error("[mentorship-applications] GAS forward failed:", error);
    }
  }

  await sendMentorshipEmail("applicationReceived", input.email, { fullName: input.fullName });

  return NextResponse.json({ ok: true, id });
}
