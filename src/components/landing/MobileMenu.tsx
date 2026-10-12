// src/components/landing/MobileMenu.tsx
"use client";

import { useState } from "react";
import { RegisterButton, type Register } from "./RegisterButton";

export interface NavItem { id: string; label: string }

/** Phone-only hamburger for the top nav (the Stitch phone design's slide-down menu). */
export function MobileMenu({ items, register }: { items: NavItem[]; register: Register }) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? "Close menu" : "Open menu"}
        className="rounded-landing p-2 text-landing-deep transition-colors hover:bg-landing-mint-light"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current" strokeWidth={2} strokeLinecap="round">
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>
      {open ? (
        <div className="absolute inset-x-0 top-full border-b border-landing-border bg-landing-surface-container-lowest px-4 pb-4 shadow-landing-soft-lg">
          <ul className="flex flex-col py-2 text-base font-medium text-landing-deep">
            {items.map((n) => (
              <li key={n.id}>
                <a href={`#${n.id}`} onClick={() => setOpen(false)} className="flex items-center justify-between border-b border-landing-border py-3 hover:text-landing-primary">
                  {n.label}
                </a>
              </li>
            ))}
          </ul>
          <RegisterButton register={register} className="mt-2 w-full" />
        </div>
      ) : null}
    </div>
  );
}
