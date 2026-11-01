import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ProgressPage } from "@/components/progress/ProgressPage";
import { findMyIdByName, getMyProgress } from "./actions";

export const metadata: Metadata = {
  title: "Track Your Progress | PZ Academy",
  description: "Enter your PZ ID to see your attendance and results in your PZ Academy courses.",
};

// Server-rendered shell only: no student data is ever placed in this HTML.
// The two server actions are passed down; all lookups happen after the page loads.
export default function ProgressRoute() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-pz-surface px-4 pb-10 pt-4 sm:pt-8">
      <div className="mx-auto mb-4 flex w-full min-w-0 max-w-2xl items-center justify-between gap-3">
        <Link
          href="/"
          className="flex min-h-11 min-w-0 items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pz-primary"
        >
          <Image
            src="https://pharmacozyme.com/wp-content/uploads/2026/04/PZ-Academy-logo.png"
            alt=""
            width={40}
            height={40}
            className="h-10 w-10 shrink-0 object-contain"
            priority
            unoptimized
          />
          <span className="flex min-w-0 flex-col">
            <span className="font-headline text-sm font-bold leading-tight tracking-tight text-pz-on-surface">PZ ACADEMY</span>
            <span className="font-label text-sm leading-tight text-pz-secondary">Track your progress</span>
          </span>
        </Link>
      </div>
      <ProgressPage findId={findMyIdByName} getProgress={getMyProgress} />
    </main>
  );
}
