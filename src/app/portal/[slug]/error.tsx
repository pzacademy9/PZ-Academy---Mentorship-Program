"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui/error-state";

export default function PortalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("Portal route error", error.digest ?? error.message); }, [error]);
  return <ErrorState onRetry={reset} homeHref="/dashboard/courses" homeLabel="Back to my courses" />;
}
