import Link from "next/link";
import { RegisterForm } from "@/components/auth/RegisterForm";

export const metadata = { title: "Create Account — PZ Academy" };

export default function RegisterPage() {
  return (
    <div className="min-h-screen flex">
      {/* Left hero panel */}
      <div className="hidden lg:flex lg:w-[55%] bg-pz-forest flex-col justify-between p-12 relative overflow-hidden">
        {/* Background pattern */}
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
        <div className="relative z-10 space-y-6">
          <h1 className="font-montserrat font-extrabold text-4xl text-white leading-tight">
            Start Your Pharmacy
            <br /><span className="text-pz-lime">Career Journey</span>
          </h1>
          <p className="text-pz-mint text-lg leading-relaxed max-w-sm">
            Join thousands of pharmacy professionals advancing their careers with expert-led courses and mentorship.
          </p>
          <div className="flex flex-col gap-3 pt-4">
            {["Certified Pharmacy Courses", "1-on-1 Expert Mentorship", "Real Career Growth"].map((t) => (
              <div key={t} className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-pz-lime flex items-center justify-center flex-shrink-0">
                  <span className="text-pz-forest text-xs">✓</span>
                </div>
                <span className="text-pz-mint text-sm">{t}</span>
              </div>
            ))}
          </div>
        </div>
        <p className="relative z-10 text-pz-muted text-xs">© 2026 Pharmacozyme. All rights reserved.</p>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex flex-col justify-center items-center p-6 sm:p-12 bg-white">
        <div className="w-full max-w-md space-y-6">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-full bg-pz-forest flex items-center justify-center">
              <span className="font-montserrat font-black text-pz-lime text-xs">PZ</span>
            </div>
            <span className="font-montserrat font-bold text-pz-forest">PZ Academy</span>
          </div>

          <div>
            <h2 className="font-montserrat font-bold text-2xl text-pz-forest">Create your account</h2>
            <p className="text-pz-muted text-sm mt-1">Free to join. No credit card required.</p>
          </div>

          <RegisterForm />

          <p className="text-center text-sm text-pz-muted">
            Already have an account?{" "}
            <Link href="/login" className="text-pz-pine font-medium hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
