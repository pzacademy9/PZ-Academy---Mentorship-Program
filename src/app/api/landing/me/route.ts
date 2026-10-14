import { createServerSupabase } from "@/lib/supabase/server";
import { publicJson } from "@/lib/api/landing-public-http";

// Session based: must run per request and must never be cached.
export const dynamic = "force-dynamic";

/**
 * Prefill for the registration widget when the visitor is signed in. The public page itself is
 * static (ISR), so it asks here instead of reading cookies. Guests (and any error) get null.
 */
export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return publicJson(null);
    const { data: profile } = await supabase.from("profiles").select("full_name, phone, profession").eq("id", user.id).maybeSingle();
    return publicJson({
      name: profile?.full_name ?? "",
      email: user.email ?? "",
      whatsapp: profile?.phone ?? "",
      profession: profile?.profession ?? "",
    });
  } catch {
    return publicJson(null);
  }
}
