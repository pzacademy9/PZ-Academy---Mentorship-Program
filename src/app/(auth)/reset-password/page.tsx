"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { resetPasswordSchema } from "@/lib/validations/auth";
import { Loader2 } from "lucide-react";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ password?: string; confirm_password?: string }>({});

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    const fd = new FormData(e.currentTarget);
    const result = resetPasswordSchema.safeParse({
      password: fd.get("password"),
      confirm_password: fd.get("confirm_password"),
    });
    if (!result.success) {
      const errs: typeof errors = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof typeof errors;
        errs[key] = issue.message;
      }
      setErrors(errs);
      return;
    }
    setLoading(true);
    const supabase = createBrowserSupabase();
    const { error } = await supabase.auth.updateUser({ password: result.data.password });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Password updated! Please sign in.");
    router.push("/login");
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
          <h2 className="font-montserrat font-bold text-2xl text-pz-forest">Set new password</h2>
          <p className="text-pz-muted text-sm">Must be at least 8 chars with uppercase, number, and special character.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="password">New password</Label>
            <Input id="password" name="password" type="password" autoComplete="new-password" />
            {errors.password && <p className="text-xs text-pz-danger">{errors.password}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm_password">Confirm password</Label>
            <Input id="confirm_password" name="confirm_password" type="password" autoComplete="new-password" />
            {errors.confirm_password && <p className="text-xs text-pz-danger">{errors.confirm_password}</p>}
          </div>
          <Button type="submit" disabled={loading} className="w-full bg-pz-lime text-pz-forest hover:bg-pz-mint font-semibold">
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Update password
          </Button>
        </form>
      </div>
    </div>
  );
}
