"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  count: number;
  onEmail: () => void;
  onWhatsApp: () => void;
  onAssign: () => void;
  onClear: () => void;
  // The mark-as-converted form is rendered by the parent and shown here in a
  // panel opened from the More menu.
  convert: { open: boolean; onOpenChange: (open: boolean) => void; children: ReactNode };
};

const ITEM_CLASS =
  "block w-full rounded-xl px-3 py-2 text-left font-body text-sm text-pz-deep hover:bg-pz-surface-container-high focus:bg-pz-surface-container-high focus:outline-none max-md:min-h-11";

export function ContactsActions({ count, onEmail, onWhatsApp, onAssign, onClear, convert }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const wasConvertOpen = useRef(false);

  // Move focus into the menu when it opens.
  useEffect(() => {
    if (menuOpen) menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [menuOpen]);

  // Cancel, Escape or a finished save all close the form; focus goes back to More.
  useEffect(() => {
    if (wasConvertOpen.current && !convert.open) moreRef.current?.focus();
    wasConvertOpen.current = convert.open;
  }, [convert.open]);

  // A click elsewhere closes the menu.
  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || moreRef.current?.contains(target)) return;
      setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  function closeMenu(returnFocus: boolean) {
    setMenuOpen(false);
    if (returnFocus) moreRef.current?.focus();
  }

  function onMenuKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.preventDefault();
      closeMenu(true);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      items[(at + 1) % items.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[(at - 1 + items.length) % items.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      items[items.length - 1]?.focus();
    } else if (e.key === "Tab") {
      closeMenu(false);
    }
  }

  function choose(action: () => void) {
    closeMenu(false);
    action();
  }

  return (
    <section className="rounded-2xl border border-pz-outline-variant bg-pz-surface-container-lowest p-4 shadow-lg md:shadow-sm space-y-3">
      <h2 className="max-md:sr-only flex items-center gap-2 font-headline text-sm font-bold uppercase tracking-wide text-pz-secondary">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-pz-primary text-xs text-pz-on-primary">3</span>{" "}
        What do you want to do?
      </h2>

      {count === 0 ? (
        <p className="font-body text-sm text-pz-on-surface-variant">Tick people to see what you can do</p>
      ) : (
        <>
          <p className="font-body text-sm font-semibold text-pz-deep">
            {count === 1 ? "1 person selected" : `${count} people selected`}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="bare"
              size="bare"
              onClick={onEmail}
              className="flex-1 px-5 py-2 rounded-full bg-pz-primary text-pz-on-primary font-headline text-sm font-semibold max-md:min-h-11"
            >
              Send an email
            </Button>
            <div className="relative">
              <button
                ref={moreRef}
                type="button"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((v) => !v)}
                className="rounded-full border border-pz-outline-variant px-4 py-2 font-headline text-sm font-semibold text-pz-deep hover:bg-pz-surface-container-high max-md:min-h-11"
              >
                More
              </button>
              {menuOpen && (
                <div
                  ref={menuRef}
                  role="menu"
                  aria-label="More actions"
                  onKeyDown={onMenuKeyDown}
                  className="absolute right-0 z-20 w-60 rounded-2xl border border-pz-outline-variant bg-pz-surface-container-lowest p-1 shadow-lg bottom-full mb-2 md:bottom-auto md:top-full md:mt-2 md:mb-0"
                >
                  <button type="button" role="menuitem" className={ITEM_CLASS} onClick={() => choose(onWhatsApp)}>Send on WhatsApp</button>
                  <button type="button" role="menuitem" className={ITEM_CLASS} onClick={() => choose(onAssign)}>Give to a sales agent</button>
                  <button type="button" role="menuitem" className={ITEM_CLASS} onClick={() => choose(() => convert.onOpenChange(true))}>Mark as converted</button>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={onClear}
              className="font-body text-xs text-pz-on-surface-variant hover:text-pz-secondary max-md:min-h-11 max-md:px-2"
            >
              Clear
            </button>
          </div>

          {convert.open && (
            <div
              role="group"
              aria-label="Mark as converted"
              onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); convert.onOpenChange(false); } }}
              className="max-h-[40vh] overflow-y-auto rounded-2xl bg-pz-surface-container-high p-3"
            >
              {convert.children}
            </div>
          )}
        </>
      )}
    </section>
  );
}
