"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { forgotPasswordSchema } from "@/lib/validations/auth";
import { Loader2 } from "lucide-react";

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const result = forgotPasswordSchema.safeParse({ email: fd.get("email") });
    if (!result.success) { toast.error(result.error.issues[0].message); return; }

    setLoading(true);
    const supabase = createBrowserSupabase();
    const { error } = await supabase.auth.resetPasswordForEmail(result.data.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setSent(true);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-pz-frost p-6">
      <div className="w-full max-w-md bg-white rounded-xl shadow-card p-8 space-y-6">
        <div className="space-y-1">
          <Link href="/" className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-full bg-pz-forest flex items-center justify-center">
              <span className="font-montserrat font-black text-pz-lime text-xs">PZ</span>
            </div>
            <span className="font-montserrat font-bold text-pz-forest text-sm">PZ Academy</span>
          </Link>
          <h2 className="font-montserrat font-bold text-2xl text-pz-forest">Reset your password</h2>
          <p className="text-pz-muted text-sm">Enter your email and we&apos;ll send a reset link.</p>
        </div>

        {sent ? (
          <div className="text-center space-y-3 py-4">
            <div className="w-14 h-14 rounded-full bg-pz-mint flex items-center justify-center mx-auto text-2xl">✉️</div>
            <p className="text-pz-forest font-medium">Check your email for the reset link.</p>
            <Link href="/login" className="text-pz-pine text-sm hover:underline">Back to login</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" placeholder="you@example.com" autoComplete="email" />
            </div>
            <Button type="submit" disabled={loading} className="w-full bg-pz-lime text-pz-forest hover:bg-pz-mint font-semibold">
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Send reset link
            </Button>
            <Link href="/login" className="block text-center text-sm text-pz-muted hover:underline">Back to login</Link>
          </form>
        )}
      </div>
    </div>
  );
}
