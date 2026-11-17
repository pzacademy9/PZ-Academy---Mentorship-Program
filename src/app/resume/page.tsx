"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RESUME_KEY, RESUME_HOME, pickResumeTarget } from "@/lib/resume-path";

export default function ResumePage() {
  const router = useRouter();

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(RESUME_KEY);
    } catch {
      // Storage blocked: open the portal home.
    }
    router.replace(pickResumeTarget(saved));
  }, [router]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-sm text-muted-foreground">Opening your portal…</p>
      <Link href={RESUME_HOME} className="text-sm font-medium text-primary underline">
        Go to your dashboard
      </Link>
    </main>
  );
}
