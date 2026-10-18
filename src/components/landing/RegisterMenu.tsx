"use client";

import { useEffect, useRef, useState } from "react";
import { openRegistration, prefetchRegistration } from "./registration/registration-bus";

type Mode = "live" | "recorded";
const LABEL: Record<Mode, string> = { live: "Join Live", recorded: "Join Recorded Lectures" };

/** Register button with a Live / Recorded choice. Dependency-free; picking an item opens the form with that mode already chosen. */
export function RegisterMenu({ className, children, modes, placement = "down", align = "left" }: { className: string; children: React.ReactNode; modes: Mode[]; placement?: "down" | "up"; align?: "left" | "right" }) {
  // The wrapper takes the caller's width classes (w-full, sm:w-auto, ...) so it sizes like the plain button.
  const widths = className.split(/\s+/).filter((c) => /^(?:[a-z0-9]+:)*w-/.test(c)).join(" ");
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
      className={`relative inline-block ${widths}`}
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
        <span role="menu" aria-label="Choose how to join" className={`absolute z-30 ${placement === "up" ? "bottom-full mb-2" : "top-full mt-2"} ${align === "right" ? "right-0" : "left-0"} flex w-max min-w-[14rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-landing border border-landing-outline-variant bg-landing-surface-container-lowest text-left shadow-landing-soft-lg`}>
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
