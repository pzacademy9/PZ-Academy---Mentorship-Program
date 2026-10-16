"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Copy, Globe2, Link2, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import type { VariantGridRow } from "@/lib/landing/variant-grid";
import type { LandingContent, Problem } from "@/lib/landing/content";
import type { PriceCell, RegionDef } from "@/lib/landing/registration/config";
import type { PaymentAccountSummary } from "../registration/RegistrationSetup";
import { copyText } from "../copy-text";
import { AddCountryDialog } from "./AddCountryDialog";
import { MAIN_FIRST } from "./LinkPublishSlot";
import type { PublishOutcome } from "./useLinkEditing";

/** The page's public web address for a link: https://<host>/e/<slug>/<path>. */
export function publicLinkUrl(origin: string, slug: string, path: string): string {
  return `${origin}/e/${slug}${path ? `/${path}` : ""}`;
}

function Status({ row, waiting }: { row: VariantGridRow; waiting: boolean }) {
  const [text, tone] = !row.enabled
    ? ["Off", "bg-pz-surface-container-high text-pz-on-surface-variant"]
    : waiting
      ? ["Waiting for the main page", "bg-pz-secondary-container text-pz-on-secondary-container"]
      : row.published
      ? ["Live", "bg-pz-primary-container text-pz-on-primary-container"]
      : ["Not published yet", "bg-pz-secondary-container text-pz-on-secondary-container"];
  return <span className={cn("shrink-0 rounded-full px-2 py-0.5 font-body text-[11px] font-semibold", tone)}>{text}</span>;
}

/**
 * Every link the page could have (each country, each module, each country with each module), each
 * off until switched on, with its web address, Publish button and whether it is live.
 */
export function LinksPanel({
  slug, grid, content, accounts, mainLive, blockedBy, problems, onSwitch, onPublish, onAddCountry,
}: {
  /** Why the live main page can't carry this link yet, or null (see linkMissingFromLive). */
  blockedBy: (row: VariantGridRow) => string | null;
  slug: string;
  grid: VariantGridRow[];
  content: Pick<LandingContent, "registration" | "modules">;
  accounts: PaymentAccountSummary[];
  mainLive: boolean;
  /** The server's not-ready list per link id after a refused publish. */
  problems: Record<string, Problem[]>;
  onSwitch: (row: VariantGridRow, on: boolean) => Promise<string | null>;
  onPublish: (variantId: string) => Promise<PublishOutcome>;
  onAddCountry: (region: RegionDef, prices: Record<string, PriceCell>) => void;
}) {
  const [adding, setAdding] = useState(false);
  const host = useRef<HTMLElement>(null);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const few = content.registration.regions.length <= 1 && content.modules.length === 0;

  const toggle = useAsyncAction(async (row: VariantGridRow) => {
    const error = await onSwitch(row, !row.enabled);
    if (error) toast.error(error);
  }, { getKey: (row) => row.path });

  const publish = useAsyncAction(async (row: VariantGridRow) => {
    if (!row.variantId) return;
    const r = await onPublish(row.variantId);
    if (r.ok) toast.success(`${row.label} link published`);
    else if (r.problems) toast.error("Not ready to publish yet");
    else toast.error(r.error ?? "Could not publish this link. Please try again.");
  }, { getKey: (row) => row.path });

  async function copy(url: string) {
    if (await copyText(url, host.current)) toast.success("Link copied");
    else toast.error("Could not copy. Select the link and copy it yourself.");
  }

  return (
    <section ref={host} aria-label="Links" className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="font-headline text-lg font-bold text-pz-on-surface">Links</h2>
          <p className="max-w-prose font-body text-sm text-pz-on-surface-variant">
            Give each country or module its own web address. Visitors on a country link see only that country&apos;s prices; on a module link, only that module.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)}>
          <Globe2 aria-hidden="true" />
          Add a country
        </Button>
      </div>

      {!mainLive && !few && (
        <p role="note" className="rounded-lg border border-pz-outline-variant bg-pz-surface-container-low px-3 py-2 font-body text-sm text-pz-on-surface">
          {MAIN_FIRST}. A link can go live once the main page is live.
        </p>
      )}

      {few ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-pz-outline-variant px-4 py-10 text-center">
          <Link2 className="h-7 w-7 text-pz-on-surface-variant" aria-hidden="true" />
          <p className="font-body text-sm font-semibold text-pz-on-surface">Add a country or module to create more links</p>
          <p className="max-w-sm font-body text-xs text-pz-on-surface-variant">Modules are added in Page settings, on course and workshop pages.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {grid.map((row) => {
            const url = publicLinkUrl(origin, slug, row.path);
            const rowProblems = row.variantId ? problems[row.variantId] ?? [] : [];
            const blocked = blockedBy(row);
            const publishTitle = blocked ?? (!row.enabled ? "Turn this link on first" : undefined);
            return (
              <li key={row.path} aria-label={row.label} className="space-y-2 rounded-xl border border-pz-outline-variant bg-pz-surface-container-lowest p-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={row.enabled}
                    aria-label={`${row.label} link`}
                    disabled={toggle.pendingKey === row.path}
                    onClick={() => void toggle.run(row)}
                    className={cn(
                      "relative h-5 w-9 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 max-md:h-7 max-md:w-12",
                      row.enabled ? "bg-pz-solid-forest" : "bg-pz-outline-variant",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "absolute top-0.5 h-4 w-4 rounded-full bg-pz-surface-container-lowest transition-all max-md:h-6 max-md:w-6",
                        row.enabled ? "left-[1.125rem] max-md:left-[1.375rem]" : "left-0.5",
                      )}
                    />
                  </button>
                  <span className="min-w-0 flex-1 font-body text-sm font-semibold text-pz-on-surface">{row.label}</span>
                  <Status row={row} waiting={!!blocked && row.published} />
                  <Button
                    type="button"
                    size="sm"
                    disabled={!!blocked || !row.enabled || !row.variantId}
                    loading={publish.pendingKey === row.path}
                    title={publishTitle}
                    onClick={() => void publish.run(row)}
                    className="bg-pz-solid-forest text-white hover:bg-pz-solid-forest/90 disabled:bg-pz-surface-container-high disabled:text-pz-on-surface-variant disabled:opacity-100"
                  >
                    <Rocket aria-hidden="true" />
                    Publish
                  </Button>
                </div>
                <div className="flex min-w-0 items-center gap-2 rounded-lg bg-pz-surface-container-high px-2.5 py-1.5">
                  <span className="min-w-0 flex-1 break-all font-body text-xs text-pz-on-surface-variant">{url}</span>
                  <button
                    type="button"
                    aria-label={`Copy the ${row.label} link`}
                    onClick={() => void copy(url)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 font-body text-xs font-semibold text-pz-primary hover:bg-pz-surface-container-lowest focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring max-md:min-h-11"
                  >
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    Copy
                  </button>
                </div>
                {rowProblems.length > 0 && (
                  <ul aria-label={`What to fix before publishing ${row.label}`} className="space-y-1">
                    {rowProblems.map((p, i) => (
                      <li key={`${i}:${p.message}`} className="rounded-lg border border-pz-warning/30 bg-pz-warning/10 px-2 py-1 font-body text-xs text-pz-on-surface">
                        {p.message}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <AddCountryDialog open={adding} onOpenChange={setAdding} content={content} accounts={accounts} onAdd={onAddCountry} />
    </section>
  );
}
