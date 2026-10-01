"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { MessageCircle, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { SegmentBuilder } from "./SegmentBuilder";
import { TemplatePicker } from "./TemplatePicker";
import { SELECTED_CONTACTS_STORAGE_KEY, type SegmentFilter } from "@/lib/crm/segment";
import type { ConversionTag } from "@/lib/crm/conversion";

type BatchListRow = {
  id: string;
  name: string;
  messageTemplate: string;
  recipientCount: number;
  sentCount: number;
  createdAt: string;
  conversionTag: ConversionTag;
  conversionCourseTitle: string | null;
  conversion: { converted: number; total: number } | null;
};

// Minimal type for duplicateBatch API response casting
type BatchDetail = { segment: SegmentFilter[] };

const MERGE_TAGS = [
  { label: "First name", tag: "{{first_name}}" },
  { label: "Full name", tag: "{{full_name}}" },
] as const;

const DEFAULT_MESSAGE = "Hi {{first_name}},\n\n";

export function WhatsAppPanel({ initialBatches }: { initialBatches: BatchListRow[] }) {
  const [batches, setBatches] = useState(initialBatches);
  const [name, setName] = useState("");
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [segment, setSegment] = useState<SegmentFilter[]>([]);
  const [createError, setCreateError] = useState<string | null>(null);
  const confirm = useConfirm();
  const [courses, setCourses] = useState<{ id: string; title: string }[]>([]);
  const [conversionMode, setConversionMode] = useState<"course" | "label" | "none" | "">("");
  const [conversionCourseId, setConversionCourseId] = useState("");
  const [conversionLabel, setConversionLabel] = useState("");
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const [batchSearch, setBatchSearch] = useState("");
  const filteredBatches =
    batchSearch.trim() === "" ? batches : batches.filter((b) => b.name.toLowerCase().includes(batchSearch.trim().toLowerCase()));

  // Picks up a bulk selection handed off from the Contacts tab, once, on
  // mount. Read-then-remove so revisiting this tab later (without a fresh
  // handoff) never re-seeds a stale selection into a new draft. Mirrors
  // CampaignsPanel's identical effect for the email channel.
  useEffect(() => {
    let ids: unknown;
    try {
      const raw = sessionStorage.getItem(SELECTED_CONTACTS_STORAGE_KEY);
      sessionStorage.removeItem(SELECTED_CONTACTS_STORAGE_KEY);
      ids = raw ? JSON.parse(raw) : null;
    } catch {
      return;
    }
    if (!Array.isArray(ids) || ids.length === 0) return;

    setSegment((prev) => [...prev, { field: "contact_id", op: "in", values: ids as string[] }]);
    toast.success(`${ids.length} contact${ids.length === 1 ? "" : "s"} added from Contacts.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetch("/api/admin/crm/courses")
      .then((r) => r.json())
      .then((j: { courses?: { id: string; title: string }[] }) => setCourses(j.courses ?? []))
      .catch(() => {});
  }, []);

  function buildConversionTag(): ConversionTag | null {
    if (conversionMode === "course") return conversionCourseId ? { kind: "course", courseId: conversionCourseId } : null;
    if (conversionMode === "label") return conversionLabel.trim() ? { kind: "label", pattern: conversionLabel.trim() } : null;
    if (conversionMode === "none") return { kind: "none" };
    return null;
  }

  const { run: createBatch, pending: creating } = useAsyncAction(async () => {
    setCreateError(null);
    const conversionTag = buildConversionTag();
    if (!conversionTag) return;
    try {
      const res = await fetch("/api/admin/crm/whatsapp/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, messageTemplate: message, segment, conversionTag }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCreateError(json.error ?? "Could not create this batch.");
        return;
      }
      toast.success(`Batch created — ${json.recipientCount} contacts.`);
      setName("");
      setMessage(DEFAULT_MESSAGE);
      setSegment([]);
      setConversionMode("");
      setConversionCourseId("");
      setConversionLabel("");
      const list = await fetch("/api/admin/crm/whatsapp/batches");
      if (list.ok) setBatches((await list.json()).batches);
    } catch {
      setCreateError("Could not create this batch.");
    }
  });

  // Inserts at the cursor rather than always at the end — matches the
  // merge-tag insert pattern already used by CampaignsPanel's body editor.
  function insertTag(tag: string) {
    const el = messageRef.current;
    if (!el) { setMessage((m) => m + tag); return; }
    const start = el.selectionStart ?? message.length;
    const end = el.selectionEnd ?? message.length;
    setMessage(message.slice(0, start) + tag + message.slice(end));
  }


  const { run: deleteBatch, pending: deleting, pendingKey: deletingId } = useAsyncAction(async (b: BatchListRow) => {
    if (!(await confirm({ title: `Delete "${b.name}"?`, description: `${b.sentCount} sent. This cannot be undone.`, confirmLabel: "Delete", destructive: true }))) return;
    try {
      const res = await fetch(`/api/admin/crm/whatsapp/batches/${b.id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toast.error(json.error ?? "Could not delete this batch.");
        return;
      }
      setBatches((prev) => prev.filter((x) => x.id !== b.id));
      toast.success("Batch deleted.");
    } catch {
      toast.error("Could not delete this batch.");
    }
  }, { getKey: (b) => b.id });

  // Clones a batch's message + a fresh re-resolve of its segment into a new
  // batch, everyone starting pending — the "send a follow-up to the same
  // cohort" path, since nothing here auto-sequences (every send is a manual
  // click). Re-resolving (not copying the recipient row list) picks up any
  // contacts that started matching the segment since the source batch was
  // created, same as an edited-segment reconcile does.
  const { run: duplicateBatch, pending: duplicating, pendingKey: duplicatingId } = useAsyncAction(async (b: BatchListRow) => {
    try {
      const detailRes = await fetch(`/api/admin/crm/whatsapp/batches/${b.id}`);
      if (!detailRes.ok) {
        toast.error("Could not load that batch.");
        return;
      }
      const { segment: sourceSegment } = (await detailRes.json()) as BatchDetail;
      const res = await fetch("/api/admin/crm/whatsapp/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `${b.name} (copy)`, messageTemplate: b.messageTemplate, segment: sourceSegment }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? "Could not duplicate this batch.");
        return;
      }
      toast.success(`Batch duplicated — ${json.recipientCount} contacts.`);
      const list = await fetch("/api/admin/crm/whatsapp/batches");
      if (list.ok) setBatches((await list.json()).batches);
    } catch {
      toast.error("Could not duplicate this batch.");
    }
  }, { getKey: (b) => b.id });
  const rowBusy = deleting || duplicating;


  return (
    <div className="space-y-6">
      <div className="bg-pz-surface-container-high rounded-2xl p-5 space-y-3">
        <h2 className="font-headline font-bold text-lg">New batch</h2>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Batch name, e.g. W20 WhatsApp follow-up"
          className="w-full rounded-xl border border-pz-outline-variant px-4 py-2 font-body text-sm max-md:min-h-11 max-md:text-base"
        />
        <div className="flex gap-2 flex-wrap">
          {MERGE_TAGS.map((t) => (
            <button
              key={t.tag}
              onClick={() => insertTag(t.tag)}
              className="px-3 py-1 rounded-full bg-pz-surface-variant text-pz-on-surface-variant font-body text-xs font-medium max-md:min-h-11"
            >
              {t.label}
            </button>
          ))}
        </div>
        <textarea
          ref={messageRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={5}
          className="w-full rounded-xl border border-pz-outline-variant px-4 py-2 font-body text-sm max-md:text-base"
        />
        <TemplatePicker channel="whatsapp" currentBody={message} onLoad={(t) => setMessage(t.body)} />
        <SegmentBuilder value={segment} onChange={setSegment} channel="whatsapp" />
        <div className="space-y-2">
          <h3 className="font-headline text-sm font-semibold">Track conversion</h3>
          <div className="flex gap-3 flex-wrap">
            <label className="flex items-center gap-1.5 text-sm font-body cursor-pointer max-md:min-h-11">
              <input type="radio" name="whatsappConversionMode" checked={conversionMode === "course"} onChange={() => setConversionMode("course")} />
              Existing course
            </label>
            <label className="flex items-center gap-1.5 text-sm font-body cursor-pointer max-md:min-h-11">
              <input type="radio" name="whatsappConversionMode" checked={conversionMode === "label"} onChange={() => setConversionMode("label")} />
              Other course (type to match)
            </label>
            <label className="flex items-center gap-1.5 text-sm font-body cursor-pointer max-md:min-h-11">
              <input type="radio" name="whatsappConversionMode" checked={conversionMode === "none"} onChange={() => setConversionMode("none")} />
              Not tracking conversion
            </label>
          </div>
          {conversionMode === "course" && (
            <select
              value={conversionCourseId}
              onChange={(e) => setConversionCourseId(e.target.value)}
              className="w-full rounded-xl border border-pz-outline-variant px-4 py-2 font-body text-sm max-md:min-h-11 max-md:text-base"
            >
              <option value="">Select a course…</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
          )}
          {conversionMode === "label" && (
            <input
              value={conversionLabel}
              onChange={(e) => setConversionLabel(e.target.value)}
              placeholder="Text to match in the purchase's product label, e.g. Advanced Mixing"
              className="w-full rounded-xl border border-pz-outline-variant px-4 py-2 font-body text-sm max-md:min-h-11 max-md:text-base"
            />
          )}
        </div>
        {createError && <p className="font-body text-sm text-pz-danger">{createError}</p>}
        <Button
          variant="bare"
          size="bare"
          loading={creating}
          onClick={() => createBatch()}
          disabled={name.trim() === "" || message.trim() === "" || buildConversionTag() === null}
          className="px-5 py-2 rounded-full bg-pz-primary text-pz-on-primary font-headline text-sm font-semibold max-md:min-h-11"
        >
          {creating ? "Creating…" : "Create batch"}
        </Button>
      </div>

      <div>
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <h2 className="font-headline font-bold text-lg">Batches</h2>
          {batches.length > 0 && (
            <input
              value={batchSearch}
              onChange={(e) => setBatchSearch(e.target.value)}
              placeholder="Search batches…"
              className="rounded-xl border border-pz-outline-variant px-3 py-1.5 font-body text-sm w-64 max-md:w-full max-md:min-h-11 max-md:text-base"
            />
          )}
        </div>
        {batches.length === 0 ? (
          <EmptyState icon={MessageCircle} title="No WhatsApp batches yet" description="Create a batch above to start a follow-up." />
        ) : filteredBatches.length === 0 ? (
          <EmptyState icon={SearchX} title="No batches match" description={`Nothing matches "${batchSearch}".`} />
        ) : (
          <div className="space-y-2">
            {filteredBatches.map((b) => (
              <div key={b.id} className="bg-pz-surface-container-high rounded-2xl p-4">
                <div className="flex items-center gap-2 max-md:flex-wrap">
                  <Link href={`/dashboard/admin/crm/whatsapp/${b.id}`} className="flex-1 flex items-center justify-between text-left max-md:basis-full max-md:flex-col max-md:items-start max-md:min-h-11 max-md:justify-center">
                  <span className="font-body font-semibold text-sm">{b.name}</span>
                  <span className="font-body text-xs text-pz-on-surface-variant tabular-nums">
                    {b.sentCount} / {b.recipientCount} sent
                    {b.conversion && (
                      <>
                        {" · "}
                        {b.conversion.total > 0 ? Math.round((b.conversion.converted / b.conversion.total) * 100) : 0}% converted (
                        {b.conversion.converted}/{b.conversion.total}) · Not converted (yet): {b.conversion.total - b.conversion.converted}
                      </>
                    )}
                  </span>
                </Link>
                  <Button
                    variant="bare"
                    size="bare"
                    loading={duplicatingId === b.id}
                    disabled={rowBusy}
                    onClick={() => duplicateBatch(b)}
                    className="font-body text-xs font-semibold text-pz-primary hover:underline shrink-0 max-md:min-h-11 max-md:min-w-11 max-md:px-2"
                  >
                    {duplicatingId === b.id ? "Duplicating…" : "Duplicate"}
                  </Button>
                  <Button
                    variant="bare"
                    size="bare"
                    loading={deletingId === b.id}
                    disabled={rowBusy}
                    onClick={() => deleteBatch(b)}
                    className="font-body text-xs font-semibold text-pz-danger hover:underline shrink-0 max-md:min-h-11 max-md:min-w-11 max-md:px-2"
                  >
                    {deletingId === b.id ? "Deleting…" : "Delete"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
