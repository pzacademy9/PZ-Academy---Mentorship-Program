"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { loginSchema, magicLinkSchema } from "@/lib/validations/auth";
import { roleHome, type Role } from "@/lib/roles";
import { Loader2 } from "lucide-react";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get("returnUrl") ?? "/dashboard";

  const [loading, setLoading] = useState(false);
  const [magicSent, setMagicSent] = useState(false);
  const [emailForMagic, setEmailForMagic] = useState("");

  async function handlePasswordLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const raw = { email: fd.get("email") as string, password: fd.get("password") as string };
    const result = loginSchema.safeParse(raw);
    if (!result.success) {
      toast.error(result.error.issues[0].message);
      return;
    }
    setLoading(true);
    const supabase = createBrowserSupabase();
    const { data, error } = await supabase.auth.signInWithPassword(result.data);
    if (error) {
      setLoading(false);
      toast.error(error.message);
      return;
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .single();
    const home = profile?.role ? roleHome(profile.role as Role) : returnUrl;
    router.push(home);
  }

  async function handleMagicLink() {
    const result = magicLinkSchema.safeParse({ email: emailForMagic });
    if (!result.success) {
      toast.error("Enter a valid email address first");
      return;
    }
    setLoading(true);
    const supabase = createBrowserSupabase();
    const { error } = await supabase.auth.signInWithOtp({
      email: result.data.email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setMagicSent(true);
  }

  if (magicSent) {
    return (
      <div className="text-center space-y-3">
        <div className="w-16 h-16 rounded-full bg-pz-mint flex items-center justify-center mx-auto">
          <span className="text-3xl">✉️</span>
        </div>
        <h3 className="text-xl font-montserrat font-bold text-pz-forest">Magic link sent!</h3>
        <p className="text-pz-muted text-sm">Check your email and click the link to sign in.</p>
        <Button variant="ghost" size="sm" onClick={() => setMagicSent(false)}>Back to login</Button>
      </div>
    );
  }

  return (
    <form onSubmit={handlePasswordLogin} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email" name="email" type="email"
          placeholder="you@example.com" autoComplete="email"
          value={emailForMagic}
          onChange={(e) => setEmailForMagic(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <div className="flex justify-between items-center">
          <Label htmlFor="password">Password</Label>
          <Link href="/forgot-password" className="text-xs text-pz-pine hover:underline">Forgot password?</Link>
        </div>
        <Input id="password" name="password" type="password" placeholder="••••••••" autoComplete="current-password" />
      </div>

      <Button type="submit" disabled={loading} className="w-full bg-pz-lime text-pz-forest hover:bg-pz-mint font-semibold">
        {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
        Sign In to Dashboard
      </Button>

      <div className="relative">
        <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-pz-border" /></div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-white px-2 text-pz-muted">or</span>
        </div>
      </div>

      <Button
        type="button" variant="outline" disabled={loading}
        className="w-full border-pz-border text-pz-forest"
        onClick={handleMagicLink}
      >
        Send me a login link
      </Button>
    </form>
  );
}
