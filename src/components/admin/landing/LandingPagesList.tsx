"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Copy, ExternalLink, LayoutTemplate, Lock, LockOpen, Pencil, Plus, Search,
  GraduationCap, FlaskConical, Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { cn } from "@/lib/utils";
import type { LandingPageSummary } from "@/lib/data/landing-pages";
import type { PageKind, PageStatus } from "@/lib/landing/content";
import { NewPageDialog } from "./NewPageDialog";
import { DuplicatePageDialog } from "./DuplicatePageDialog";
import { StatusBadge, UnpublishedChip } from "./StatusBadge";

const KIND_META: Record<PageKind, { label: string; icon: typeof GraduationCap }> = {
  course: { label: "Course", icon: GraduationCap },
  workshop: { label: "Workshop", icon: FlaskConical },
  webinar: { label: "Webinar", icon: Video },
};

type StatusFilter = "all" | PageStatus;
const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "published", label: "Live" },
  { value: "draft", label: "Draft" },
  { value: "closed", label: "Closed" },
];

const SELECT =
  "h-9 rounded-md border border-input bg-transparent px-3 text-sm text-pz-on-surface shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring max-md:min-h-11";
const ICON_LINK =
  "inline-flex h-9 w-9 items-center justify-center rounded-md text-pz-on-surface-variant hover:bg-pz-surface-container-high hover:text-pz-on-surface focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function LandingPagesList({ pages }: { pages: LandingPageSummary[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [newOpen, setNewOpen] = useState(false);
  const [dupPage, setDupPage] = useState<LandingPageSummary | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [kindFilter, setKindFilter] = useState<PageKind | "all">("all");
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = { all: pages.length, published: 0, draft: 0, closed: 0 };
    for (const p of pages) c[p.status] += 1;
    return c;
  }, [pages]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pages.filter((p) =>
      (filter === "all" || p.status === filter) &&
      (kindFilter === "all" || p.kind === kindFilter) &&
      (!q || p.title.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q)),
    );
  }, [pages, filter, kindFilter, query]);

  const { run: setStatus, pendingKey } = useAsyncAction(
    async (page: LandingPageSummary, status: "closed" | "published") => {
      const closing = status === "closed";
      const ok = await confirm({
        title: closing ? "Close registration?" : "Reopen registration?",
        description: closing
          ? `"${page.title}" will stay visible, but its Register button is replaced by a "registration closed" message.`
          : `"${page.title}" will accept registrations again.`,
        confirmLabel: closing ? "Close registration" : "Reopen registration",
        destructive: closing,
      });
      if (!ok) return;
      const res = await fetch(`/api/admin/landing-pages/${page.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        toast.error(payload?.error ?? "Could not update the page.");
        return;
      }
      toast.success(closing ? "Registration closed." : "Registration reopened.");
      router.refresh();
    },
    { getKey: (page) => page.id },
  );

  if (pages.length === 0) {
    return (
      <>
        <div className="rounded-xl border border-dashed border-pz-outline-variant bg-pz-surface-container-lowest">
          <EmptyState
            icon={LayoutTemplate}
            title="No pages yet"
            description="Start creating high-converting landing pages for your courses, workshops and webinars."
            action={{ label: "Create your first page", onClick: () => setNewOpen(true) }}
          />
        </div>
        <NewPageDialog open={newOpen} onOpenChange={setNewOpen} />
      </>
    );
  }

  function statusButton(page: LandingPageSummary, className?: string) {
    if (page.status === "draft") return null;
    const closing = page.status === "published";
    const Icon = closing ? Lock : LockOpen;
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pendingKey === page.id}
        onClick={() => void setStatus(page, closing ? "closed" : "published")}
        className={className}
      >
        <Icon aria-hidden="true" />
        {closing ? "Close registration" : "Reopen registration"}
      </Button>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div role="group" aria-label="Filter by status" className="flex gap-2 overflow-x-auto">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={filter === f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "shrink-0 rounded-full px-4 py-2 font-headline text-sm transition-all max-md:min-h-11",
                filter === f.value
                  ? "bg-pz-primary-container font-semibold text-pz-on-primary-container"
                  : "bg-pz-surface-container-high font-medium text-pz-on-surface-variant hover:bg-pz-surface-variant",
              )}
            >
              {f.label} <span className="ml-1 tabular-nums">{counts[f.value]}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pz-on-surface-variant" aria-hidden="true" />
            <Input
              type="search"
              aria-label="Search pages"
              placeholder="Search name or link"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9 md:w-60 max-md:min-h-11"
            />
          </div>
          <select
            aria-label="Filter by type"
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as PageKind | "all")}
            className={SELECT}
          >
            <option value="all">All types</option>
            <option value="course">Course</option>
            <option value="workshop">Workshop</option>
            <option value="webinar">Webinar</option>
          </select>
          <Button type="button" onClick={() => setNewOpen(true)}>
            <Plus aria-hidden="true" />
            New page
          </Button>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-xl bg-pz-surface-container-lowest px-4 py-8 text-center text-sm text-pz-on-surface-variant">
          No pages match these filters.
        </p>
      ) : (
        <>
          {/* Phone: cards */}
          <ul className="space-y-3 md:hidden">
            {visible.map((p) => {
              const { label, icon: Icon } = KIND_META[p.kind];
              const live = p.status !== "draft";
              return (
                <li key={p.id} className="space-y-3 rounded-xl border border-pz-outline-variant bg-pz-surface-container-lowest p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-pz-on-surface-variant">
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                      {label}
                    </span>
                    <StatusBadge status={p.status} />
                    {p.hasUnpublishedChanges && live && <UnpublishedChip />}
                  </div>
                  <div className="min-w-0">
                    <p className="font-headline text-base font-bold text-pz-on-surface">{p.title}</p>
                    <p className="truncate font-mono text-xs text-pz-on-surface-variant">{`/e/${p.slug}`}</p>
                    <p className="mt-1 text-xs text-pz-on-surface-variant">Edited {formatDate(p.updatedAt)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/dashboard/admin/landing-pages/${p.id}`}>
                        <Pencil aria-hidden="true" />
                        {live ? "Edit" : "Resume editing"}
                      </Link>
                    </Button>
                    {live && (
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/e/${p.slug}`} target="_blank" rel="noopener noreferrer" aria-label="View live">
                          <ExternalLink aria-hidden="true" />
                          View live
                        </Link>
                      </Button>
                    )}
                    <Button type="button" size="sm" variant="outline" onClick={() => setDupPage(p)}>
                      <Copy aria-hidden="true" />
                      Duplicate
                    </Button>
                    {statusButton(p)}
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Laptop: table */}
          <div className="hidden overflow-hidden rounded-xl border border-pz-outline-variant bg-pz-surface-container-lowest md:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-pz-surface-container-high font-headline text-xs uppercase tracking-wide text-pz-on-surface-variant">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Page name &amp; link</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Type</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Last modified</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pz-outline-variant">
                {visible.map((p) => {
                  const { label, icon: Icon } = KIND_META[p.kind];
                  const live = p.status !== "draft";
                  return (
                    <tr key={p.id}>
                      <td className="px-4 py-3">
                        <p className="font-headline font-bold text-pz-on-surface">{p.title}</p>
                        <p className="font-mono text-xs text-pz-on-surface-variant">{`/e/${p.slug}`}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 text-pz-on-surface-variant">
                          <Icon className="h-4 w-4" aria-hidden="true" />
                          {label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusBadge status={p.status} />
                          {p.hasUnpublishedChanges && live && <UnpublishedChip />}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-pz-on-surface-variant">{formatDate(p.updatedAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Link href={`/dashboard/admin/landing-pages/${p.id}`} aria-label={`Edit ${p.title}`} title="Edit" className={ICON_LINK}>
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                          </Link>
                          {live && (
                            <Link href={`/e/${p.slug}`} target="_blank" rel="noopener noreferrer" aria-label="View live" title="View live" className={ICON_LINK}>
                              <ExternalLink className="h-4 w-4" aria-hidden="true" />
                            </Link>
                          )}
                          <button type="button" aria-label={`Duplicate ${p.title}`} title="Duplicate" onClick={() => setDupPage(p)} className={ICON_LINK}>
                            <Copy className="h-4 w-4" aria-hidden="true" />
                          </button>
                          {statusButton(p)}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <NewPageDialog open={newOpen} onOpenChange={setNewOpen} />
      {dupPage && (
        <DuplicatePageDialog page={dupPage} open onOpenChange={(o) => { if (!o) setDupPage(null); }} />
      )}
    </div>
  );
}
