"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui/error-state";

export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("Route error", error.digest ?? error.message); }, [error]);
  return <ErrorState onRetry={reset} homeHref="/" homeLabel="Go home" />;
}
