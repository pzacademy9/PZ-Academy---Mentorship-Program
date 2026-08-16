import { NextRequest, NextResponse } from "next/server";
import { getNativePublicSession } from "@/lib/data/feedback-sessions";
import { submitFeedbackResponse } from "@/lib/data/feedback-responses";
import { createServerSupabase } from "@/lib/supabase/server";

const GAS_URL = process.env.MENTORSHIP_GAS_WEBAPP_URL ?? "";

interface SubmitBody {
  id: string;
  name: string;
  email: string;
  website: string;
  answers: { question: string; answer: string | number }[];
  comments: string;
}

export async function POST(req: NextRequest) {
  let body: SubmitBody;
  try {
    body = await req.json();

    const native = await getNativePublicSession(body.id);
    if (native) {
      const supabase = await createServerSupabase();
      const { data: { user } } = await supabase.auth.getUser();

      const result = await submitFeedbackResponse({
        sessionId: body.id,
        name: body.name,
        email: user?.email ?? body.email,
        website: body.website,
        comments: body.comments,
        answers: body.answers,
        participantProfileId: user?.id ?? null,
      });
      if (!result.ok) return NextResponse.json({ ok: false, error: result.message });
      return NextResponse.json({ ok: true });
    }
  } catch (e) {
    // Malformed JSON body, or an unexpected failure in the native-session path —
    // degrade gracefully instead of letting Next.js's default 500 page handle it.
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Invalid request." },
      { status: 400 }
    );
  }

  // Legacy session — unchanged pass-through to GAS.
  if (!GAS_URL) {
    return NextResponse.json({ ok: false, error: "MENTORSHIP_GAS_WEBAPP_URL not configured." }, { status: 500 });
  }
  try {
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
