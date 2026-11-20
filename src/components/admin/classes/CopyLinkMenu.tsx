"use client";

import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, Copy } from "lucide-react";
import { dsFocus } from "./ds";

const ITEM = `flex min-h-11 w-full items-center rounded-xl px-3 text-left font-poppins text-base font-semibold text-[#1A2E1F] hover:bg-[#F7FAF5] dark:text-pz-on-surface dark:hover:bg-pz-surface-container-high ${dsFocus}`;

/**
 * Copy button with a small menu: copy the link alone, or the link inside a ready message.
 * Menu behaviour follows SharePodium: Escape and click outside close it, focus returns to the button.
 */
export function CopyLinkMenu({
  label, link, message, className, variant = "button",
}: {
  label: string;
  link: string;
  message: string;
  className: string;
  variant?: "button" | "icon";
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuId = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  async function copy(text: string) {
    setOpen(false);
    button.current?.focus();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy. Select the link and copy it by hand.");
    }
  }

  const Icon = copied ? Check : Copy;
  const text = copied ? "Copied" : label;
  return (
    <div ref={wrap} className="relative min-w-0 shrink-0 max-md:[&>button]:w-full">
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        className={className}
      >
        <Icon className="size-5" strokeWidth={1.75} aria-hidden />
        {variant === "icon" ? <span className="sr-only md:not-sr-only">{text}</span> : text}
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className="absolute right-0 top-full z-30 mt-2 flex w-60 max-w-[calc(100vw-2rem)] flex-col gap-1 rounded-2xl border border-[#D4EACC] bg-white p-2 shadow-[0_8px_30px_-12px_rgba(25,75,50,0.25)] dark:border-pz-outline-variant/60 dark:bg-pz-surface-container-lowest"
        >
          <button type="button" role="menuitem" className={ITEM} onClick={() => copy(link)}>
            Copy link
          </button>
          <button type="button" role="menuitem" className={ITEM} onClick={() => copy(message)}>
            Copy with message
          </button>
        </div>
      )}
    </div>
  );
}
