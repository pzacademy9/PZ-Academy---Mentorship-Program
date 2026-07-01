import Link from "next/link";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata = { title: "Sign In — PZ Academy" };

export default function LoginPage() {
  return (
    <div className="min-h-screen flex">
      {/* Left hero */}
      <div className="hidden lg:flex lg:w-[55%] bg-pz-forest flex-col justify-between p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-5"
          style={{ backgroundImage: "radial-gradient(circle at 2px 2px, #3ecf70 1px, transparent 0)", backgroundSize: "32px 32px" }} />
        <div className="relative z-10">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-pz-lime flex items-center justify-center">
              <span className="font-montserrat font-black text-pz-forest text-sm">PZ</span>
            </div>
            <span className="font-montserrat font-bold text-white text-lg">PZ Academy</span>
          </Link>
        </div>
        <div className="relative z-10 space-y-4">
          <h1 className="font-montserrat font-extrabold text-4xl text-white leading-tight">
            Your Pharmacy Career,<br /><span className="text-pz-lime">Elevated.</span>
          </h1>
          <p className="text-pz-mint text-lg max-w-sm leading-relaxed">
            Access your courses, sessions, and certificates — all in one place.
          </p>
        </div>
        <p className="relative z-10 text-pz-muted text-xs">© 2026 Pharmacozyme. All rights reserved.</p>
      </div>

      {/* Right form */}
      <div className="flex-1 flex flex-col justify-center items-center p-6 sm:p-12 bg-white">
        <div className="w-full max-w-md space-y-6">
          <div className="lg:hidden flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-full bg-pz-forest flex items-center justify-center">
              <span className="font-montserrat font-black text-pz-lime text-xs">PZ</span>
            </div>
            <span className="font-montserrat font-bold text-pz-forest">PZ Academy</span>
          </div>
          <div>
            <h2 className="font-montserrat font-bold text-2xl text-pz-forest">Welcome back</h2>
            <p className="text-pz-muted text-sm mt-1">Sign in to your account to continue.</p>
          </div>
          <Suspense>
            <LoginForm />
          </Suspense>
          <p className="text-center text-sm text-pz-muted">
            New to PZ Academy?{" "}
            <Link href="/register" className="text-pz-pine font-medium hover:underline">Create account</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
