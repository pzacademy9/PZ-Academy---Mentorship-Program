import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { roleHome, type Role } from "@/lib/roles";
import { linkGuestRegistrations } from "@/lib/landing/registration/link-student";
import { runInBackground } from "@/lib/landing/registration/background";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Landing-page registrations made as a guest with this email now belong to this account.
        // Runs after the redirect is sent, so sign-in never waits on it; it never throws.
        runInBackground(linkGuestRegistrations(user));
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();
        const home = profile?.role
          ? roleHome(profile.role as Role)
          : "/dashboard";
        return NextResponse.redirect(`${origin}${home}`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
