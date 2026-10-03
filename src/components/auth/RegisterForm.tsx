"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { registerSchema, type RegisterInput } from "@/lib/validations/auth";
import { useAsyncAction } from "@/hooks/useAsyncAction";

export function RegisterForm() {
  const router = useRouter();
  const [done, setDone] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof RegisterInput, string>>>({});

  const { run: handleSubmit, pending: loading } = useAsyncAction(async (formData: FormData) => {
    setErrors({});
    const raw = {
      full_name: formData.get("full_name") as string,
      email: formData.get("email") as string,
      password: formData.get("password") as string,
      phone: formData.get("phone") as string,
      profession: formData.get("profession") as string,
      city: formData.get("city") as string,
    };

    const result = registerSchema.safeParse(raw);
    if (!result.success) {
      const fieldErrors: typeof errors = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof RegisterInput;
        fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    try {
      const supabase = createBrowserSupabase();
      const { error } = await supabase.auth.signUp({
        email: result.data.email,
        password: result.data.password,
        options: {
          data: {
            full_name: result.data.full_name,
            phone: result.data.phone,
            profession: result.data.profession,
            city: result.data.city,
          },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        toast.error(error.message);
        return;
      }
      setDone(true);
    } catch {
      toast.error("Something went wrong. Please try again.");
    }
  });

  if (done) {
    return (
      <div className="text-center space-y-3">
        <div className="w-16 h-16 rounded-full bg-pz-mint flex items-center justify-center mx-auto">
          <span className="text-3xl">✉️</span>
        </div>
        <h3 className="text-xl font-montserrat font-bold text-pz-forest">Check your email</h3>
        <p className="text-pz-muted text-sm leading-relaxed">
          We sent a verification link to your email. Click it to activate your account.
          <br />The link expires in 24 hours.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void handleSubmit(new FormData(e.currentTarget));
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="full_name">Full Name</Label>
          <Input id="full_name" className="max-md:h-11" name="full_name" placeholder="Ali Khan" autoComplete="name" />
          {errors.full_name && <p className="text-xs text-pz-danger">{errors.full_name}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">Phone / WhatsApp</Label>
          <Input id="phone" className="max-md:h-11" name="phone" placeholder="03001234567" type="tel" />
          {errors.phone && <p className="text-xs text-pz-danger">{errors.phone}</p>}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" className="max-md:h-11" name="email" type="email" placeholder="you@example.com" autoComplete="email" />
        {errors.email && <p className="text-xs text-pz-danger">{errors.email}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" className="max-md:h-11" name="password" type="password" placeholder="Min 8 chars, 1 uppercase, 1 number, 1 special" autoComplete="new-password" />
        {errors.password && <p className="text-xs text-pz-danger">{errors.password}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="profession">Profession</Label>
          <Input id="profession" className="max-md:h-11" name="profession" placeholder="Pharmacist" />
          {errors.profession && <p className="text-xs text-pz-danger">{errors.profession}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="city">City</Label>
          <Input id="city" className="max-md:h-11" name="city" placeholder="Lahore" />
          {errors.city && <p className="text-xs text-pz-danger">{errors.city}</p>}
        </div>
      </div>

      <Button
        type="submit"
        loading={loading}
        className="w-full bg-pz-lime text-pz-forest dark:text-pz-solid-forest hover:bg-pz-mint font-semibold"
      >
        Create Account
      </Button>
    </form>
  );
}
