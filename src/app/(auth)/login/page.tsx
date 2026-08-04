import Link from "next/link";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth/LoginForm";
import { FlaskConical, UserCircle2, ShieldCheck, GraduationCap, TrendingUp, Check } from "lucide-react";

export const metadata = { title: "Sign In — PZ Academy" };

const benefits = [
  { icon: ShieldCheck, label: "Certified Courses" },
  { icon: GraduationCap, label: "Expert Mentors" },
  { icon: TrendingUp, label: "Real Career Growth" },
];

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col bg-pz-surface">
      {/* Mobile top bar */}
      <header className="md:hidden fixed top-0 inset-x-0 z-50 bg-white shadow-sm flex justify-between items-center px-4 py-4">
        <Link href="/" className="flex items-center gap-2">
          <FlaskConical className="w-5 h-5 text-pz-primary" />
          <span className="font-headline font-black text-lg text-pz-primary">PharmaZyme Academy</span>
        </Link>
        <UserCircle2 className="w-6 h-6 text-pz-on-surface-variant" />
      </header>
      <div className="h-16 md:hidden" />

      <main className="flex-grow flex flex-col md:flex-row">
        {/* Mobile hero banner */}
        <section className="md:hidden bg-pz-primary-container p-6 relative overflow-hidden">
          <div className="relative z-10">
            <h2 className="font-headline text-2xl font-black text-pz-on-primary-container leading-tight">
              Your Pharmacy Career, Elevated.
            </h2>
            <ul className="mt-4 flex flex-col gap-2">
              {benefits.map(({ icon: Icon, label }) => (
                <li key={label} className="flex items-center gap-2 font-body text-pz-on-primary-container text-sm">
                  <span className="flex items-center justify-center w-4 h-4 bg-pz-on-primary-container text-pz-primary-container rounded-full">
                    <Check className="w-2.5 h-2.5" strokeWidth={3} />
                  </span>
                  {label}
                </li>
              ))}
            </ul>
          </div>
          <FlaskConical className="absolute -right-4 -bottom-4 w-32 h-32 text-pz-on-primary-container/10" />
        </section>

        {/* Desktop hero panel */}
        <section className="hidden md:flex md:w-3/5 bg-pz-forest p-16 flex-col justify-center relative overflow-hidden">
          <div
            className="absolute inset-0 opacity-5 pointer-events-none"
            style={{ backgroundImage: "radial-gradient(circle at 2px 2px, #7ed957 1px, transparent 0)", backgroundSize: "32px 32px" }}
          />
          <div className="relative z-10 max-w-xl">
            <div className="mb-12 w-20 h-20 rounded-full border-4 border-white/10 bg-white/5 flex items-center justify-center">
              <FlaskConical className="w-9 h-9 text-pz-bright" />
            </div>
            <h1 className="font-headline text-5xl xl:text-6xl font-extrabold mb-12 leading-tight text-white">
              Your Pharmacy Career, <br />
              <span className="text-pz-bright">Elevated</span>
            </h1>
            <div className="space-y-6">
              {benefits.map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-4">
                  <div className="w-12 h-12 flex items-center justify-center bg-white/10 rounded-lg border border-white/5">
                    <Icon className="w-6 h-6 text-pz-bright" />
                  </div>
                  <span className="font-headline text-lg font-bold text-white">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Form card */}
        <section className="flex-1 flex flex-col justify-center items-center relative md:p-12 -mt-4 md:mt-0 z-20">
          <div className="w-full md:max-w-md bg-white rounded-t-xl md:rounded-lg shadow-[-4px_-4px_20px_rgba(15,30,20,0.06)] md:shadow-xl border border-pz-outline-variant/60 px-6 md:px-10 pt-8 pb-10 md:py-10">
            <div className="mb-8 md:mb-10 md:text-center">
              <h2 className="font-headline text-xl font-bold text-pz-on-surface md:text-pz-deep uppercase tracking-widest mb-2">
                Welcome Back
              </h2>
              <p className="font-body text-pz-on-surface-variant md:text-pz-ink/60 text-sm md:italic">
                Pursuing clinical excellence through continuous learning.
              </p>
            </div>
            <Suspense>
              <LoginForm />
            </Suspense>
            <p className="mt-10 text-center text-sm font-body text-pz-on-surface-variant border-t border-pz-outline-variant/60 pt-6">
              New to PZ Academy?{" "}
              <Link href="/register" className="font-bold text-pz-primary hover:underline ml-1">
                Create Account
              </Link>
            </p>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-pz-deep md:bg-pz-deep px-6 md:px-16 py-6 flex flex-col md:flex-row justify-between items-center gap-4 text-[11px] font-body text-white/50 uppercase tracking-widest">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-pz-bright/10 flex items-center justify-center border border-pz-bright/20">
              <span className="text-[8px] font-black text-pz-bright">PZ</span>
            </div>
            <span className="font-headline font-bold text-white/90">PharmaZyme Academy</span>
          </div>
          <span className="hidden md:inline opacity-20">|</span>
          <span>© 2026 Pharmacozyme. All rights reserved.</span>
        </div>
        <nav className="flex gap-8">
          <a className="hover:text-pz-bright transition-colors" href="#">Privacy Policy</a>
          <a className="hover:text-pz-bright transition-colors" href="#">Terms of Service</a>
          <a className="hover:text-pz-bright transition-colors" href="#">Institutional Access</a>
        </nav>
      </footer>
    </div>
  );
}
