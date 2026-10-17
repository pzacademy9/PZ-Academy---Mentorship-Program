"use client";

import { useEffect, useRef, useState } from "react";
import { openRegistration, prefetchRegistration } from "./registration/registration-bus";

type Mode = "live" | "recorded";
const LABEL: Record<Mode, string> = { live: "Join Live", recorded: "Join Recorded Lectures" };

/** Register button with a Live / Recorded choice. Dependency-free; picking an item opens the form with that mode already chosen. */
export function RegisterMenu({ className, children, modes }: { className: string; children: React.ReactNode; modes: Mode[] }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!open) return;
    items.current[0]?.focus();
    const away = (e: Event) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  const move = (from: number, step: number) => {
    const n = modes.length;
    items.current[(from + step + n) % n]?.focus();
  };

  return (
    <span
      ref={wrap}
      className={`relative ${/(^|\s)w-full(\s|$)/.test(className) ? "block w-full" : "inline-block"}`}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) { e.stopPropagation(); setOpen(false); trigger.current?.focus(); }
      }}
    >
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        className={className}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); } }}
        onPointerEnter={prefetchRegistration}
        onFocus={prefetchRegistration}
      >
        {children}
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && (
        <span role="menu" aria-label="Choose how to join" className="absolute left-0 right-0 top-full z-30 mt-2 flex min-w-[14rem] flex-col overflow-hidden rounded-landing border border-landing-outline-variant bg-landing-surface-container-lowest text-left shadow-landing-soft-lg md:left-auto md:right-0">
          {modes.map((m, i) => (
            <button
              key={m}
              ref={(el) => { items.current[i] = el; }}
              type="button"
              role="menuitem"
              className="flex min-h-11 w-full items-center px-4 py-2 text-left font-landing-body text-sm font-semibold text-landing-near-black hover:bg-landing-mint-light focus-visible:bg-landing-mint-light focus-visible:outline-none"
              onClick={() => { setOpen(false); openRegistration(trigger.current, { mode: m }); }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); move(i, 1); }
                else if (e.key === "ArrowUp") { e.preventDefault(); move(i, -1); }
                else if (e.key === "Tab") setOpen(false);
              }}
            >
              {LABEL[m]}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
