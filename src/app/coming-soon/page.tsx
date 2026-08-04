import { FlaskConical } from "lucide-react";

export const metadata = { title: "Coming Soon — PZ Academy" };

export default function ComingSoonPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-pz-forest px-6 text-center relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-5 pointer-events-none"
        style={{ backgroundImage: "radial-gradient(circle at 2px 2px, #7ed957 1px, transparent 0)", backgroundSize: "32px 32px" }}
      />
      <div className="relative z-10 flex flex-col items-center max-w-md">
        <div className="mb-8 w-20 h-20 rounded-full border-4 border-white/10 bg-white/5 flex items-center justify-center">
          <FlaskConical className="w-9 h-9 text-pz-bright" />
        </div>
        <h1 className="font-headline text-3xl font-black text-white mb-4">
          We&apos;re putting the finishing touches on PZ Academy
        </h1>
        <p className="font-body text-white/70">
          The platform is being tested before launch. Your account and enrollment are safe —
          check back soon, or reach out if you have questions.
        </p>
      </div>
    </div>
  );
}
