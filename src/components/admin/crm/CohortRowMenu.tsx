"use client";

import { useEffect, useId, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import type { CohortRow } from "@/lib/data/admin-crm-import";
import { cohortExportUrl, cohortPlainUrl } from "@/lib/crm/cohort-export-url";

const ITEM =
  "flex min-h-11 w-full items-center rounded-lg px-3 py-2 text-left font-body text-sm text-pz-on-surface hover:bg-pz-surface-container-low focus-visible:bg-pz-surface-container-low focus-visible:outline-none md:min-h-9";

// A small per-row menu. The list opens in the flow of the row (never floating
// over a scroll area), so it can never be clipped.
export function CohortRowMenu({
  cohort,
  busy,
  locked,
  onDelete,
}: {
  cohort: CohortRow;
  busy: boolean; // this row is being deleted
  locked: boolean; // any row is being deleted
  onDelete: (c: CohortRow) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const items = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

  useEffect(() => {
    if (open) menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const closeToButton = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const list = items();
    const at = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.preventDefault();
      closeToButton();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      list[(at + 1) % list.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      list[(at - 1 + list.length) % list.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      list[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      list[list.length - 1]?.focus();
    } else if (e.key === "Tab") {
      // Let Tab do its normal job; just close and start from More.
      setOpen(false);
      buttonRef.current?.focus();
    }
  };

  return (
    <div ref={rootRef} className="min-w-0">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-busy={busy}
        aria-controls={menuId}
        aria-label={`More for ${cohort.sheetName}, ${cohort.tabName}`}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-xl px-2 font-body text-sm text-pz-on-surface hover:bg-pz-surface-container-low md:min-h-9"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        <span>{busy ? "Deleting…" : "More"}</span>
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={`Actions for ${cohort.sheetName}, ${cohort.tabName}`}
          onKeyDown={onKeyDown}
          className="mt-1 rounded-xl border border-pz-outline-variant bg-pz-surface-container-lowest p-1"
        >
          {cohort.contactCount === 0 ? (
            <p className="px-3 py-2 font-body text-sm text-pz-on-surface-variant">No people to download</p>
          ) : (
            <>
              <a role="menuitem" tabIndex={-1} href={cohortExportUrl([cohort.id])} download className={ITEM}>
                Download for Meta
              </a>
              <a role="menuitem" tabIndex={-1} href={cohortPlainUrl([cohort.id])} download className={ITEM}>
                Download plain version
              </a>
            </>
          )}
          <button
            role="menuitem"
            type="button"
            tabIndex={-1}
            disabled={busy || locked}
            onClick={() => {
              closeToButton();
              onDelete(cohort);
            }}
            className={`${ITEM} text-pz-danger disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {busy ? "Deleting…" : "Delete"}
          </button>
        </div>
      )}
    </div>
  );
}
