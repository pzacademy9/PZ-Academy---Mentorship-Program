"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Search, Lock, Users, UserPlus, AlarmClock } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { initials } from "@/lib/format";
import { outcomeLabel, type ContactRowJson, type TemplateJson } from "@/lib/crm/sales-ui";
import { ContactDetailPane } from "./ContactDetailPane";

type Tab = "mine" | "unclaimed" | "all";
const TAB_LABELS: Record<Tab, string> = { mine: "Mine", unclaimed: "Unclaimed", all: "All" };

export function ContactsWorkspace({
  viewerId,
  initialTab,
  initialOpenId,
  canClaim,
}: {
  viewerId: string;
  initialTab: Tab;
  initialOpenId: string | null;
  canClaim: boolean;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ rows: ContactRowJson[]; total: number; pageSize: number } | null>(null);
  const [error, setError] = useState(false);
  const [openId, setOpenId] = useState<string | null>(initialOpenId);
  // null until the templates request settles, so the send panel never starts with an empty list.
  const [templates, setTemplates] = useState<TemplateJson[] | null>(null);
  const [paneVersion, setPaneVersion] = useState(0);
  const [now] = useState(() => new Date());
  const latest = useRef(0);
  // Below lg the contact pane is a full-screen modal sheet; from lg it sits beside the list.
  const isPhone = useMediaQuery("(max-width: 1023px)");
  const sheetRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const sheetOpen = openId !== null && isPhone;

  useEffect(() => {
    if (!sheetOpen) return;
    const list = listRef.current as (HTMLElement & { inert?: boolean }) | null;
    if (list) list.inert = true;
    sheetRef.current?.focus();
    return () => {
      if (list) list.inert = false;
      returnFocus.current?.focus();
    };
  }, [sheetOpen]);

  // Escape goes back to the list from anywhere while the phone sheet is open. Focus can fall back to the body
  // after an inner dialog closes, so this listens on the document rather than on the sheet. While a Radix
  // dialog is open (focus is inside it) Escape belongs to that dialog alone.
  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const t = e.target as Element | null;
      if (t && (!t.isConnected || t.closest?.('[role="dialog"][data-state="open"]'))) return;
      if (document.querySelector('[role="dialog"][data-state="open"]')) return;
      setOpenId(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sheetOpen]);

  // Debounce search typing.
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(input.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [input]);

  const load = useCallback(async () => {
    const mine = ++latest.current;
    setError(false);
    try {
      const params = new URLSearchParams({ tab, page: String(page) });
      if (q) params.set("q", q);
      const res = await fetch(`/api/sales/contacts?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const body = await res.json();
      if (mine === latest.current) setData(body);
    } catch {
      if (mine === latest.current) setError(true);
    }
  }, [tab, q, page]);
  useEffect(() => void load(), [load]);

  useEffect(() => {
    void fetch("/api/sales/templates", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { templates: [] }))
      .then((d: { templates: TemplateJson[] }) => setTemplates(d.templates ?? []))
      .catch(() => setTemplates([]));
  }, []);

  // Keep the URL shareable without a navigation.
  useEffect(() => {
    const params = new URLSearchParams({ tab });
    if (openId) params.set("open", openId);
    window.history.replaceState(null, "", `/dashboard/sales/contacts?${params.toString()}`);
  }, [tab, openId]);

  const { run: claim, pendingKey } = useAsyncAction(
    async (id: string) => {
      try {
        const res = await fetch(`/api/sales/contacts/${id}/claim`, { method: "POST" });
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        if (!res.ok) toast.error(body?.error ?? "Could not claim this contact.");
        else toast.success("Claimed. They are in your Today list now.");
      } catch {
        toast.error("Could not claim this contact.");
      }
      await load();
      if (id === openId) setPaneVersion((v) => v + 1);
    },
    { getKey: (id) => id },
  );

  const owner = (r: ContactRowJson) =>
    r.owner_id === null ? "unclaimed" : r.owner_id === viewerId ? "mine" : "other";

  // The phone sheet uses z-40: above the top bar (z-30), below the z-50 dialog layers, so the
  // Not interested dialog opens on top of it.
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
      <section ref={listRef} className="lg:col-span-5 flex flex-col gap-4">
        <div className="bg-pz-surface-container-lowest rounded-xl p-4 sm:p-5 shadow-sm flex flex-col gap-4">
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-headline font-bold text-pz-on-surface tracking-tight">My Contacts</h1>
            {data && (
              <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-headline font-bold bg-pz-tertiary-fixed text-pz-on-tertiary-fixed">
                {data.total} {data.total === 1 ? "contact" : "contacts"}
              </span>
            )}
          </div>
          <label className="relative flex items-center w-full">
            <Search className="absolute left-3.5 w-5 h-5 text-pz-on-surface-variant pointer-events-none" aria-hidden="true" />
            <span className="sr-only">Search by name or phone</span>
            <input
              type="search"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Search by name or phone"
              className="w-full h-11 pl-10 pr-4 bg-pz-surface-container-low text-pz-on-surface placeholder:text-pz-on-surface-variant/70 rounded-lg text-sm font-body outline-none focus:bg-pz-surface-container-lowest focus:ring-2 focus:ring-pz-primary/25 transition-all"
            />
          </label>
          <div role="tablist" aria-label="Which contacts" className="flex items-center gap-2 overflow-x-auto pb-1 text-xs font-headline font-semibold">
            {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                type="button"
                onClick={() => {
                  setTab(t);
                  setPage(1);
                }}
                className={`px-3.5 py-2 min-h-11 lg:min-h-0 rounded-lg shrink-0 whitespace-nowrap transition-colors ${
                  tab === t
                    ? "bg-pz-primary text-pz-on-primary shadow-sm"
                    : "bg-pz-surface-container-low text-pz-on-surface-variant hover:bg-pz-surface-container hover:text-pz-on-surface"
                }`}
              >
                {TAB_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        {tab === "unclaimed" && !canClaim && (
          <p className="bg-pz-surface-container-low rounded-lg p-4 text-sm text-pz-on-surface-variant flex items-start gap-2">
            <Lock className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
            Unassigned contacts are view-only. Your admin assigns contacts to you.
          </p>
        )}

        {error ? (
          <ErrorState onRetry={() => void load()} />
        ) : data === null ? (
          <div role="status" aria-label="Loading contacts" className="h-48 rounded-xl bg-pz-surface-container-low animate-pulse" />
        ) : data.rows.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No contacts here"
            description={q ? "Nothing matches that search." : tab === "mine" ? (canClaim ? "Claim contacts from the Unclaimed tab to start." : "Your admin assigns contacts to you. They will show up here.") : "Nothing to show yet."}
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {data.rows.map((r) => {
              const o = owner(r);
              const selected = openId === r.id;
              const due = o !== "other" && r.next_followup_at !== null && Date.parse(r.next_followup_at) <= now.getTime();
              const stop = o !== "other" && r.do_not_contact_at !== null;
              return (
                <li key={r.id} aria-current={selected ? "true" : undefined}>
                  <div
                    className={`rounded-xl p-4 flex flex-col gap-3 transition-all ${
                      o === "other"
                        ? "bg-pz-surface-container"
                        : `bg-pz-surface-container-lowest shadow-sm hover:shadow-md ${selected ? "ring-2 ring-pz-primary bg-gradient-to-r from-pz-tertiary-fixed/30 to-pz-surface-container-lowest" : ""}`
                    }`}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        returnFocus.current = e.currentTarget;
                        setOpenId(r.id);
                      }}
                      className="flex items-start justify-between gap-3 text-left min-w-0 w-full min-h-11"
                    >
                      <span className="flex items-center gap-3 min-w-0">
                        <span
                          className={`w-11 h-11 rounded-lg flex items-center justify-center font-headline font-bold text-base shrink-0 ${
                            o === "unclaimed"
                              ? "bg-pz-secondary-fixed/50 text-pz-on-secondary-fixed"
                              : o === "other"
                                ? "bg-pz-surface-container-high text-pz-on-surface-variant opacity-60"
                                : "bg-pz-primary/15 text-pz-primary"
                          }`}
                        >
                          {o === "other" ? <Lock className="w-5 h-5" aria-hidden="true" /> : initials(r.full_name)}
                        </span>
                        <span className="flex flex-col min-w-0">
                          <span className="text-base font-headline font-bold text-pz-on-surface truncate">{r.full_name || "No name"}</span>
                          <span className="text-xs text-pz-on-surface-variant font-medium">{r.phone_e164 ?? "Phone hidden"}</span>
                        </span>
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-headline font-bold shrink-0 ${
                          o === "mine"
                            ? "bg-pz-primary text-pz-on-primary"
                            : o === "unclaimed"
                              ? "bg-pz-secondary-container text-pz-on-secondary-container"
                              : "bg-pz-surface-container-highest text-pz-on-surface-variant"
                        }`}
                      >
                        {o === "mine" ? "Yours" : o === "unclaimed" ? "Unclaimed" : "Locked"}
                      </span>
                    </button>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-pz-on-surface-variant">
                      {o === "other" && <span>{`Owned by ${r.owner_name || "another agent"}`}</span>}
                      <span className="inline-flex px-2.5 py-1 rounded-md bg-pz-surface-container-low font-headline font-semibold">{outcomeLabel(r.last_outcome)}</span>
                      {due && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-pz-secondary-fixed text-pz-on-secondary-fixed font-headline font-semibold">
                          <AlarmClock className="w-3.5 h-3.5" aria-hidden="true" /> Follow-up due
                        </span>
                      )}
                      {stop && <span className="font-headline font-semibold">Do not contact</span>}
                    </div>
                    {o === "unclaimed" && canClaim && (
                      <button
                        type="button"
                        disabled={pendingKey === r.id}
                        onClick={() => void claim(r.id)}
                        className="w-full h-11 min-h-11 px-4 rounded-lg bg-pz-surface-container-low hover:bg-pz-primary hover:text-pz-on-primary text-pz-primary font-headline font-bold text-xs flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                      >
                        <UserPlus className="w-4 h-4" aria-hidden="true" />
                        Claim
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {data && data.total > data.pageSize && (
          <div className="flex items-center justify-between text-xs font-headline">
            <button type="button" disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-2 min-h-11 lg:min-h-0 rounded-lg bg-pz-surface-container-lowest disabled:opacity-50">Previous</button>
            <span className="text-pz-on-surface-variant">Page {page} of {Math.ceil(data.total / data.pageSize)}</span>
            <button type="button" disabled={page * data.pageSize >= data.total} onClick={() => setPage((p) => p + 1)} className="px-3 py-2 min-h-11 lg:min-h-0 rounded-lg bg-pz-surface-container-lowest disabled:opacity-50">Next</button>
          </div>
        )}
      </section>

      {openId && (
        <section
          ref={sheetRef}
          tabIndex={-1}
          aria-label="Contact details"
          role={isPhone ? "dialog" : undefined}
          aria-modal={isPhone ? true : undefined}
          className="lg:col-span-7 fixed inset-0 z-40 overflow-y-auto bg-pz-surface p-4 pb-[calc(5rem+env(safe-area-inset-bottom))] outline-none lg:static lg:z-auto lg:p-0 lg:bg-transparent"
        >
          {templates === null ? (
            <div role="status" aria-label="Loading contact" className="h-64 rounded-xl bg-pz-surface-container-low animate-pulse" />
          ) : (
            <ContactDetailPane
              key={`${openId}:${paneVersion}`}
              contactId={openId}
              viewerId={viewerId}
              canClaim={canClaim}
              templates={templates}
              onClose={() => setOpenId(null)}
              onChanged={() => void load()}
            />
          )}
        </section>
      )}
    </div>
  );
}
