"use client";

import { useEffect } from "react";

export default function StudentRecordError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Student record route error", error.digest ?? error.message);
  }, [error]);
  return (
    <div role="alert" className="space-y-3 rounded-xl border border-pz-outline-variant bg-pz-surface-container-lowest p-6">
      <p className="font-body text-base text-pz-on-surface">We could not load this student. Try again in a minute.</p>
      <button
        type="button"
        onClick={reset}
        className="inline-flex min-h-11 items-center rounded-lg bg-pz-primary px-4 font-body text-sm font-bold text-pz-on-primary hover:opacity-90"
      >
        Try again
      </button>
    </div>
  );
}
