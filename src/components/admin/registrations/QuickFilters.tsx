"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { registrationHref, type RegistrationQuery } from "./query";

const BTN =
  "inline-flex items-center justify-center min-h-12 px-4 rounded-lg border border-pz-outline-variant/40 bg-pz-surface-container-lowest hover:bg-pz-surface-container text-sm font-headline font-semibold text-pz-on-surface transition-colors";

/**
 * Three one-tap filters for class mailings. They are plain links that set mode, optionScopes
 * and clear any "What they bought" pick, so the address stays shareable and nothing needs JS to apply.
 */
export function QuickFilters({ basePath, filters, onNavigate }: { basePath: string; filters: RegistrationQuery; onNavigate?: () => void }) {
  const [moduleText, setModuleText] = useState("1");
  const n = Number(moduleText);
  const validModule = Number.isInteger(n) && n >= 1 && n <= 12;
  const href = (optionScopes: string | undefined) =>
    registrationHref(basePath, filters, { mode: "live", optionScopes, optionLabel: undefined, p: 1 });
  return (
    <div className="flex flex-wrap items-center gap-3" role="group" aria-label="Quick filters">
      <Link href={href("full")} onClick={onNavigate} className={BTN}>Live full course</Link>
      <div className="flex flex-wrap items-center gap-2">
        {validModule ? (
          <Link href={href(`full,${n}`)} onClick={onNavigate} className={BTN}>Live + Module {n}</Link>
        ) : (
          <span aria-disabled="true" className={cn(BTN, "opacity-50 cursor-not-allowed")}>Live + Module N</span>
        )}
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={12}
          value={moduleText}
          onChange={(e) => setModuleText(e.target.value)}
          // Inside the Filters panel form, Enter would submit the whole form; the presets are links, so do nothing.
          onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
          aria-label="Module number (1 to 12)"
          className="min-h-12 w-20 px-3 rounded-lg border border-pz-outline-variant/40 bg-pz-surface-container-lowest text-sm font-body text-pz-on-surface"
        />
      </div>
      <Link href={href(undefined)} onClick={onNavigate} className={BTN}>All live</Link>
    </div>
  );
}
