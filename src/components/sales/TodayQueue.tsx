"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { initials } from "@/lib/format";
import type { QueueCardJson, TemplateJson } from "@/lib/crm/sales-ui";
import { QueueCard } from "./QueueCard";
import { SendPanel } from "./SendPanel";

export function TodayQueue({ greeting, firstName }: { greeting: string; firstName: string }) {
  const [items, setItems] = useState<QueueCardJson[] | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [templates, setTemplates] = useState<TemplateJson[]>([]);
  const [error, setError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setError(false);
    try {
      const [q, t] = await Promise.all([
        fetch("/api/sales/today", { cache: "no-store" }),
        fetch("/api/sales/templates", { cache: "no-store" }),
      ]);
      if (!q.ok) throw new Error(String(q.status));
      const data = (await q.json()) as { items: QueueCardJson[]; remaining: number };
      setItems(data.items);
      setRemaining(data.remaining);
      if (t.ok) setTemplates(((await t.json()) as { templates: TemplateJson[] }).templates);
    } catch {
      setError(true);
    }
  }, []);
  useEffect(() => void load(), [load]);

  const visible = useMemo(() => {
    if (!items) return [];
    const order = (id: string) => skipped.indexOf(id);
    return [...items].sort((a, b) => order(a.id) - order(b.id)); // not-skipped (-1) first, keeps server order
  }, [items, skipped]);
  const selected = visible.find((i) => i.id === selectedId) ?? visible[0] ?? null;

  const removeCard = (id: string) => {
    setItems((cur) => cur?.filter((i) => i.id !== id) ?? cur);
    setRemaining((r) => Math.max(0, r - 1));
    setSelectedId(null);
  };

  if (error) return <ErrorState onRetry={() => void load()} />;
  if (items === null) return <div role="status" aria-label="Loading your list" className="h-64 rounded-xl bg-pz-surface-container-low animate-pulse" />;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl lg:text-3xl font-headline font-black text-pz-on-surface tracking-tight">
        {firstName ? `${greeting}, ${firstName}` : greeting}
      </h1>

      {visible.length === 0 ? (
        <section className="bg-pz-surface-container-lowest rounded-xl shadow-sm">
          <EmptyState
            icon={CheckCircle2}
            title="All caught up"
            description="Nobody is due a message right now. Claim more contacts to keep going."
            action={{ label: "Claim more contacts", href: "/dashboard/sales/contacts?tab=unclaimed" }}
          />
        </section>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
          {/* Focus pane: first on phone, right column on desktop */}
          {selected && (
            <section className="lg:col-span-7 lg:order-2 flex flex-col gap-5">
              <div className="bg-pz-surface-container-lowest rounded-xl p-4 sm:p-6 shadow-sm flex items-center gap-3.5">
                <div className="w-14 h-14 rounded-full bg-pz-primary/10 text-pz-primary flex items-center justify-center font-headline font-black text-xl shrink-0">
                  {initials(selected.full_name)}
                </div>
                <div className="flex flex-col min-w-0">
                  <h2 className="text-xl font-headline font-bold text-pz-on-surface truncate">{selected.full_name || "No name"}</h2>
                  <span className="text-xs text-pz-on-surface-variant font-mono font-medium">{selected.phone_e164}</span>
                  {selected.last_note && <span className="text-xs text-pz-on-surface-variant truncate mt-0.5">{selected.last_note}</span>}
                </div>
              </div>
              <SendPanel
                key={selected.id}
                contact={selected}
                templates={templates}
                onSent={(id) => setSentIds((s) => new Set(s).add(id))}
                onOutcome={(id) => removeCard(id)}
              />
            </section>
          )}

          <section className="lg:col-span-5 lg:order-1 flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-headline font-bold text-pz-on-surface">Message next</h2>
              <span className="px-2 py-0.5 rounded-full text-xs font-headline font-bold bg-pz-primary/10 text-pz-primary">
                {remaining} left today
              </span>
            </div>
            <div className="flex flex-col gap-3.5">
              {visible.map((item) => (
                <QueueCard
                  key={item.id}
                  item={item}
                  selected={item.id === selected?.id}
                  sent={sentIds.has(item.id)}
                  onSelect={() => {
                    setSelectedId(item.id);
                    window.scrollTo?.({ top: 0, behavior: "smooth" });
                  }}
                  onSkip={() => {
                    setSkipped((s) => [...s.filter((x) => x !== item.id), item.id]);
                    if (item.id === selected?.id) setSelectedId(null);
                  }}
                  onDone={() => removeCard(item.id)}
                />
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
