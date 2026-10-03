"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui/error-state";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("Dashboard route error", error.digest ?? error.message); }, [error]);
  return <ErrorState onRetry={reset} />;
}
