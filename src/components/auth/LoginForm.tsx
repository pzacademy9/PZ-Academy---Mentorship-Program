"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { loginSchema, magicLinkSchema } from "@/lib/validations/auth";
import { roleHome, type Role } from "@/lib/roles";
import { Loader2, Mail, Lock, Eye, EyeOff, ArrowRight, Sparkles, Mail as MailOpen } from "lucide-react";
import { cn } from "@/lib/utils";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get("returnUrl") ?? "/dashboard";

  const [loading, setLoading] = useState(false);
  const [magicSent, setMagicSent] = useState(false);
  const [emailForMagic, setEmailForMagic] = useState("");
  const [showPassword, setShowPassword] = useState(false);

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
        <div className="w-16 h-16 rounded-full bg-pz-primary-container flex items-center justify-center mx-auto">
          <MailOpen className="w-7 h-7 text-pz-on-primary-container" />
        </div>
        <h3 className="font-headline text-xl font-bold text-pz-on-surface uppercase tracking-wide">Magic link sent!</h3>
        <p className="font-body text-pz-on-surface-variant text-sm">Check your email and click the link to sign in.</p>
        <button
          type="button"
          onClick={() => setMagicSent(false)}
          className="font-label text-sm text-pz-primary hover:underline"
        >
          Back to login
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handlePasswordLogin} className="space-y-6">
      {/* Email */}
      <div className="space-y-2">
        <label
          htmlFor="email"
          className="font-label text-sm text-pz-primary flex items-center gap-1.5"
        >
          <Mail className="w-3.5 h-3.5" />
          Email Address
        </label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-pz-outline pointer-events-none" />
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="name@pharmacy.edu"
            value={emailForMagic}
            onChange={(e) => setEmailForMagic(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-white border border-pz-outline-variant rounded-lg font-body text-sm text-pz-on-surface placeholder:text-pz-on-surface-variant/40 focus:outline-none focus:ring-2 focus:ring-pz-primary/40 focus:border-pz-primary transition-all"
          />
        </div>
      </div>

      {/* Password */}
      <div className="space-y-2">
        <label
          htmlFor="password"
          className="font-label text-sm text-pz-primary flex items-center gap-1.5"
        >
          <Lock className="w-3.5 h-3.5" />
          Password
        </label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-pz-outline pointer-events-none" />
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            placeholder="••••••••"
            className="w-full pl-10 pr-11 py-3 bg-white border border-pz-outline-variant rounded-lg font-body text-sm text-pz-on-surface placeholder:text-pz-on-surface-variant/40 focus:outline-none focus:ring-2 focus:ring-pz-primary/40 focus:border-pz-primary transition-all"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-pz-outline hover:text-pz-primary transition-colors"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Remember & Forgot */}
      <div className="flex items-center justify-between text-xs">
        <label className="flex items-center gap-2 cursor-pointer group text-pz-on-surface-variant hover:text-pz-on-surface transition-colors">
          <input
            type="checkbox"
            className="w-4 h-4 rounded border-pz-outline-variant text-pz-primary focus:ring-pz-primary/50"
          />
          <span className="font-label">Remember me</span>
        </label>
        <Link href="/forgot-password" className="font-label font-semibold text-pz-secondary hover:underline underline-offset-4">
          Forgot Password?
        </Link>
      </div>

      {/* Sign In */}
      <button
        type="submit"
        disabled={loading}
        className={cn(
          "w-full py-3.5 bg-pz-gold text-white font-headline font-bold uppercase tracking-widest text-sm rounded-lg shadow-lg transition-all flex items-center justify-center gap-2",
          "hover:brightness-105 hover:-translate-y-px active:translate-y-0 disabled:opacity-70",
        )}
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Sign In</span>}
        {!loading && <ArrowRight className="w-4 h-4" />}
      </button>

      {/* Divider */}
      <div className="relative py-1">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-pz-outline-variant" />
        </div>
        <div className="relative flex justify-center">
          <span className="px-4 bg-white font-label text-[10px] text-pz-on-surface-variant/60 tracking-[0.3em] uppercase">
            Or
          </span>
        </div>
      </div>

      {/* Magic Link */}
      <button
        type="button"
        disabled={loading}
        onClick={handleMagicLink}
        className="w-full py-3 border border-pz-outline-variant text-pz-on-surface-variant font-label font-semibold text-xs uppercase tracking-widest hover:bg-pz-surface-container-low transition-all flex items-center justify-center gap-2 rounded-lg disabled:opacity-70"
      >
        <Sparkles className="w-4 h-4 text-pz-primary" />
        Request Magic Link
      </button>
    </form>
  );
}
