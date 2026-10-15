// src/components/admin/landing/registration/WaTestLinkButton.tsx
"use client";

import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { isValidWaGroupUrl } from "@/lib/landing/registration/wa-groups";

/** Opens a WhatsApp group invite in a new tab so the admin can check it is the right group. */
export function WaTestLinkButton({ url, className }: { url: string; className?: string }) {
  const valid = isValidWaGroupUrl(url);
  return (
    <button
      type="button"
      disabled={!valid}
      onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-pz-outline-variant px-3 py-2 font-body text-xs font-semibold text-pz-on-surface hover:bg-pz-surface-container-high focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 max-md:min-h-11",
        className,
      )}
    >
      Test link
      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
}
