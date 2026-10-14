"use client";

import { useEffect, useState } from "react";

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(t);
  }, [copied]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // Old browsers: select the text so a long-press copy works.
      const el = document.createElement("textarea");
      el.value = value;
      document.body.appendChild(el);
      el.select();
      try { document.execCommand("copy"); setCopied(true); } catch { /* leave it selected */ }
      el.remove();
    }
  }
  return (
    <button
      type="button"
      aria-label={`Copy ${label}`}
      onClick={() => void copy()}
      className="inline-flex min-h-11 min-w-[5.5rem] items-center justify-center rounded-landing border border-landing-primary px-3 font-headline text-sm font-bold text-landing-primary hover:bg-landing-mint-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-landing-mint"
    >
      <span aria-live="polite">{copied ? "✓ Copied" : "Copy"}</span>
    </button>
  );
}
