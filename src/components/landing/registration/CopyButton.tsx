"use client";

import { useEffect, useRef, useState } from "react";

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!copied && !failed) return;
    const t = setTimeout(() => { setCopied(false); setFailed(false); }, copied ? 1800 : 5000);
    return () => clearTimeout(t);
  }, [copied, failed]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setFailed(false);
      setCopied(true);
    } catch {
      // Old browsers: the fallback textarea lives inside the dialog (outside it, the focus trap steals focus back).
      const el = document.createElement("textarea");
      el.value = value;
      el.setAttribute("aria-hidden", "true");
      el.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
      (btn.current?.parentElement ?? document.body).appendChild(el);
      el.select();
      let ok = false;
      try { ok = document.execCommand("copy") === true; } catch { ok = false; }
      el.remove();
      btn.current?.focus();
      setCopied(ok);
      setFailed(!ok);
    }
  }
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        ref={btn}
        type="button"
        aria-label={`Copy ${label}`}
        onClick={() => void copy()}
        className="inline-flex min-h-11 min-w-[5.5rem] items-center justify-center rounded-landing border border-landing-primary px-3 font-headline text-sm font-bold text-landing-primary hover:bg-landing-mint-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-landing-mint"
      >
        <span aria-live="polite">{copied ? "✓ Copied" : "Copy"}</span>
      </button>
      {failed && <span role="status" className="max-w-[10rem] text-right font-landing-body text-xs text-landing-muted">Couldn&apos;t copy, press and hold to copy</span>}
    </span>
  );
}
