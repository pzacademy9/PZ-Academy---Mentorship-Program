import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Track Your Progress | PZ Academy",
  description: "Enter your PZ ID to see your attendance and results in your PZ Academy courses.",
};

// Server-rendered shell only: no student data is ever placed in this HTML.
export default function ProgressRoute() {
  return (
    <main className="min-h-screen bg-pz-offwhite px-4 py-12">
      <div className="mx-auto max-w-xl">
        <p className="text-sm font-semibold text-pz-mid">PZ Academy</p>
        <h1 className="mt-2 text-2xl font-bold">Track Your Progress</h1>
        {/* TODO(Task 6): mount <ProgressPage /> here. */}
      </div>
    </main>
  );
}
