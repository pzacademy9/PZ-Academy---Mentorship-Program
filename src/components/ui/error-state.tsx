"use client";

import Link from "next/link";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ErrorState({
  title = "Something went wrong",
  message = "We couldn't load this page. It's usually temporary — please try again.",
  onRetry,
  homeHref = "/dashboard",
  homeLabel = "Go to dashboard",
}: {
  title?: string; message?: string; onRetry?: () => void; homeHref?: string; homeLabel?: string;
}) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4 py-10">
      <div role="alert" className="w-full max-w-md rounded-xl border border-destructive/30 bg-destructive/5 p-5">
        <div className="flex gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="font-headline text-base font-bold text-foreground">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{message}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-2 md:flex-row">
          {onRetry && (
            <Button onClick={onRetry} className="max-md:w-full">
              <RotateCw aria-hidden="true" /> Try again
            </Button>
          )}
          <Button asChild variant="outline" className="max-md:w-full">
            <Link href={homeHref}>{homeLabel}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
