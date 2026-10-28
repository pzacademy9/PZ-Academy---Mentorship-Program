"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Copy } from "lucide-react";
import { primaryBtn } from "./styles";

/** The link box and the Copy link button. The button comes first so it is the first thing to tap. */
export function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy. Select the link and copy it by hand.");
    }
  }
  return (
    <button type="button" onClick={copy} className={`${primaryBtn} max-md:w-full`}>
      {copied ? <Check className="size-5" aria-hidden /> : <Copy className="size-5" aria-hidden />}
      {copied ? "Copied" : "Copy link"}
    </button>
  );
}

export function LinkBox({ url }: { url: string }) {
  return (
    <code className="block truncate rounded-lg bg-pz-surface-container-low px-3 py-3 text-base text-pz-on-surface-variant">{url}</code>
  );
}
