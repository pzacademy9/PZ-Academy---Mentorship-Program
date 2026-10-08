"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ResponsiveList } from "@/components/ui/responsive-list";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { SegmentBuilder } from "./SegmentBuilder";
import { buildWhatsAppLink, renderWhatsAppMessage } from "@/lib/crm/whatsapp-link";
import type { SegmentFilter } from "@/lib/crm/segment";
import type { WhatsAppBatchDetail, WhatsAppRecipientRow } from "@/lib/data/admin-crm-whatsapp";

export function WhatsAppBatchDetailClient({
  initialDetail,
  manualConvertedContactIds,
}: {
  initialDetail: WhatsAppBatchDetail;
  manualConvertedContactIds: string[];
}) {
  const manualSet = new Set(manualConvertedContactIds);
  const [detail, setDetail] = useState(initialDetail);
  const [editingMessage, setEditingMessage] = useState(false);
  const [messageDraft, setMessageDraft] = useState("");
  const [editingBatch, setEditingBatch] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [segmentDraft, setSegmentDraft] = useState<SegmentFilter[]>([]);
  const [editConversionMode, setEditConversionMode] = useState<"course" | "label" | "none" | "">("");
  const [editConversionCourseId, setEditConversionCourseId] = useState("");
  const [editConversionLabel, setEditConversionLabel] = useState("");
  const [queueMode, setQueueMode] = useState(false);
  const [lastQueueSentId, setLastQueueSentId] = useState<string | null>(null);
  const [courses, setCourses] = useState<{ id: string; title: string }[]>([]);
  const [recipientSearch, setRecipientSearch] = useState("");
  const queueLinkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    fetch("/api/admin/crm/courses")
      .then((r) => r.json())
      .then((j: { courses?: { id: string; title: string }[] }) => setCourses(j.courses ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (queueMode) queueLinkRef.current?.focus();
  }, [queueMode, detail]);

  function buildEditConversionTag() {
    if (editConversionMode === "course") return editConversionCourseId ? { kind: "course" as const, courseId: editConversionCourseId } : null;
    if (editConversionMode === "label") return editConversionLabel.trim() ? { kind: "label" as const, pattern: editConversionLabel.trim() } : null;
    if (editConversionMode === "none") return { kind: "none" as const };
    return null;
  }

  function loadEditConversionTag() {
    const tag = detail.conversionTag;
    if (tag.kind === "course") { setEditConversionMode("course"); setEditConversionCourseId(tag.courseId); setEditConversionLabel(""); }
    else if (tag.kind === "label") { setEditConversionMode("label"); setEditConversionLabel(tag.pattern); setEditConversionCourseId(""); }
    else { setEditConversionMode("none"); setEditConversionCourseId(""); setEditConversionLabel(""); }
  }

  const { run: saveBatchEdits, pending: savingBatch } = useAsyncAction(async () => {
    const conversionTag = buildEditConversionTag();
    if (!conversionTag) return;
    {
      const res = await fetch(`/api/admin/crm/whatsapp/batches/${detail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameDraft, segment: segmentDraft, conversionTag }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? "Could not update this batch.");
        return;
      }
      const refreshed = await fetch(`/api/admin/crm/whatsapp/batches/${detail.id}`);
      if (refreshed.ok) setDetail(await refreshed.json());
      setEditingBatch(false);
      toast.success("Batch updated.");
    }
  });

  const { run: saveMessage, pending: savingMessage } = useAsyncAction(async () => {
    {
      const res = await fetch(`/api/admin/crm/whatsapp/batches/${detail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageTemplate: messageDraft }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toast.error(json.error ?? "Could not update the message.");
        return;
      }
      setDetail((prev) => ({ ...prev, messageTemplate: messageDraft }));
      setEditingMessage(false);
      toast.success("Message updated.");
    }
  });

  const { run: toggleSent, pending: togglingRecipient, pendingKey: busyRecipientId } = useAsyncAction(async (recipient: WhatsAppRecipientRow) => {
    const nextStatus: "pending" | "sent" = recipient.status === "sent" ? "pending" : "sent";
    {
      const res = await fetch(`/api/admin/crm/whatsapp/batches/${detail.id}/recipients/${recipient.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toast.error(json.error ?? "Could not update this recipient.");
        return;
      }
      setDetail((prev) => {
        const recipients = prev.recipients.map((r) => (r.id === recipient.id ? { ...r, status: nextStatus } : r));
        return { ...prev, recipients, sentCount: recipients.filter((r) => r.status === "sent").length };
      });
    }
  }, { getKey: (recipient) => recipient.id });

  async function goBackInQueue() {
    if (!lastQueueSentId) return;
    const recipient = detail.recipients.find((r) => r.id === lastQueueSentId);
    setLastQueueSentId(null);
    if (!recipient) return;
    await toggleSent(recipient);
  }

  // Agent campaigns are watch-only here: the agent sends from their own
  // workspace, and the API refuses admin edits with a 409 anyway.
  const readOnly = detail.ownerAgentId !== null;

  const filteredRecipients =
    recipientSearch.trim() === ""
      ? detail.recipients
      : detail.recipients.filter((r) => r.fullName.toLowerCase().includes(recipientSearch.trim().toLowerCase()));

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/admin/sales-hub/whatsapp"
          className="inline-flex items-center gap-2 font-body text-sm text-pz-on-surface-variant hover:text-pz-primary transition-colors max-md:min-h-11"
        >
          <ArrowLeft className="w-4 h-4" /> Back to WhatsApp
        </Link>
        <h1 className="font-headline font-bold text-2xl text-pz-secondary mt-3">{detail.name}</h1>
        <p className="font-body text-xs text-pz-on-surface-variant tabular-nums mt-1">
          {detail.sentCount} / {detail.recipientCount} sent
          {detail.conversion && (
            <>
              {" · "}
              {detail.conversion.total > 0 ? Math.round((detail.conversion.converted / detail.conversion.total) * 100) : 0}%
              converted ({detail.conversion.converted}/{detail.conversion.total})
            </>
          )}
        </p>
      </div>

      {readOnly && (
        <div role="note" className="bg-pz-secondary-fixed text-pz-on-secondary-fixed rounded-xl p-3 font-body text-sm space-y-1">
          <p>Run by {detail.ownerAgentName ?? "a sales agent"}. You can watch progress here; sending happens in their workspace.</p>
          {detail.status === "paused" && detail.pausedReason && <p className="text-xs">Paused: {detail.pausedReason}</p>}
        </div>
      )}

      <div className="bg-pz-surface-container-highest rounded-xl p-3">
        {editingBatch && !readOnly ? (
          <div className="space-y-3">
            <input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              className="w-full rounded-xl border border-pz-outline-variant px-3 py-2 font-body text-sm font-semibold max-md:min-h-11 max-md:text-base"
            />
            <SegmentBuilder value={segmentDraft} onChange={setSegmentDraft} channel="whatsapp" />
            <p className="font-body text-xs text-pz-on-surface-variant">
              Re-applying the segment adds newly-matching contacts as pending and drops
              non-matching pending ones — anyone already sent stays in the batch either way.
            </p>
            <div className="space-y-2">
              <h3 className="font-headline text-sm font-semibold">Track conversion</h3>
              <div className="flex gap-3 flex-wrap">
                <label className="flex items-center gap-1.5 text-sm font-body cursor-pointer max-md:min-h-11">
                  <input type="radio" name="editConversionMode" checked={editConversionMode === "course"} onChange={() => setEditConversionMode("course")} />
                  Existing course
                </label>
                <label className="flex items-center gap-1.5 text-sm font-body cursor-pointer max-md:min-h-11">
                  <input type="radio" name="editConversionMode" checked={editConversionMode === "label"} onChange={() => setEditConversionMode("label")} />
                  Other course (type to match)
                </label>
                <label className="flex items-center gap-1.5 text-sm font-body cursor-pointer max-md:min-h-11">
                  <input type="radio" name="editConversionMode" checked={editConversionMode === "none"} onChange={() => setEditConversionMode("none")} />
                  Not tracking conversion
                </label>
              </div>
              {editConversionMode === "course" && (
                <select value={editConversionCourseId} onChange={(e) => setEditConversionCourseId(e.target.value)} className="w-full rounded-xl border border-pz-outline-variant px-4 py-2 font-body text-sm max-md:min-h-11 max-md:text-base">
                  <option value="">Select a course…</option>
                  {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              )}
              {editConversionMode === "label" && (
                <input value={editConversionLabel} onChange={(e) => setEditConversionLabel(e.target.value)} placeholder="Text to match in the purchase's product label"
                  className="w-full rounded-xl border border-pz-outline-variant px-4 py-2 font-body text-sm max-md:min-h-11 max-md:text-base" />
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="bare" size="bare" loading={savingBatch} onClick={() => saveBatchEdits()} disabled={nameDraft.trim() === "" || buildEditConversionTag() === null}
                className="px-4 py-1.5 rounded-full bg-pz-primary text-pz-on-primary font-headline text-xs font-semibold max-md:min-h-11">
                {savingBatch ? "Saving…" : "Save batch"}
              </Button>
              <button onClick={() => setEditingBatch(false)} disabled={savingBatch}
                className="px-4 py-1.5 rounded-full bg-pz-surface-variant text-pz-on-surface-variant font-headline text-xs font-semibold max-md:min-h-11">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-3">
            <p className="font-body font-semibold text-sm flex-1">{detail.name}</p>
            {!readOnly && (
            <button
              onClick={() => { setNameDraft(detail.name); setSegmentDraft(detail.segment); loadEditConversionTag(); setEditingBatch(true); }}
              className="font-body text-xs font-semibold text-pz-primary hover:underline shrink-0 max-md:min-h-11 max-md:min-w-11"
            >
              Edit batch
            </button>
            )}
          </div>
        )}
      </div>

      <div className="bg-pz-surface-container-highest rounded-xl p-3">
        {editingMessage && !readOnly ? (
          <div className="space-y-2">
            <textarea value={messageDraft} onChange={(e) => setMessageDraft(e.target.value)} rows={4}
              className="w-full rounded-xl border border-pz-outline-variant px-3 py-2 font-body text-sm max-md:text-base" />
            <div className="flex gap-2">
              <Button variant="bare" size="bare" loading={savingMessage} onClick={() => saveMessage()} disabled={messageDraft.trim() === ""}
                className="px-4 py-1.5 rounded-full bg-pz-primary text-pz-on-primary font-headline text-xs font-semibold max-md:min-h-11">
                {savingMessage ? "Saving…" : "Save message"}
              </Button>
              <button onClick={() => setEditingMessage(false)} disabled={savingMessage}
                className="px-4 py-1.5 rounded-full bg-pz-surface-variant text-pz-on-surface-variant font-headline text-xs font-semibold max-md:min-h-11">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-3">
            <p className="font-body text-xs text-pz-on-surface-variant whitespace-pre-wrap flex-1">{detail.messageTemplate}</p>
            {!readOnly && (
            <button onClick={() => { setMessageDraft(detail.messageTemplate); setEditingMessage(true); }}
              className="font-body text-xs font-semibold text-pz-primary hover:underline shrink-0 max-md:min-h-11 max-md:min-w-11">
              Edit message
            </button>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <input
          value={recipientSearch}
          onChange={(e) => setRecipientSearch(e.target.value)}
          placeholder="Search recipients…"
          className="rounded-xl border border-pz-outline-variant px-3 py-1.5 font-body text-sm w-64 max-md:w-full max-md:min-h-11 max-md:text-base"
        />
        {!readOnly && (
        <button onClick={() => setQueueMode((v) => !v)} className="font-body text-xs font-semibold text-pz-primary hover:underline max-md:min-h-11">
          {queueMode ? "Switch to table view" : "Switch to queue mode"}
        </button>
        )}
      </div>

      {readOnly ? (
        <ResponsiveList
          rows={filteredRecipients}
          getKey={(r) => r.id}
          empty={
            <EmptyState
              icon={Users}
              title={recipientSearch ? "No recipients match" : "No recipients yet"}
              description={recipientSearch ? `Nothing matches "${recipientSearch}".` : "This campaign has no recipients."}
            />
          }
          mobile={{
            title: (r) =>
              r.contactId ? (
                <Link href={`/dashboard/admin/sales-hub/contacts/${r.contactId}`} className="inline-flex min-h-11 items-center underline">
                  {r.fullName || "—"}
                </Link>
              ) : (
                r.fullName || "—"
              ),
            meta: (r) => [
              r.phoneE164,
              r.status,
              detail.conversion ? (r.convertedAt ? `Converted ${new Date(r.convertedAt).toLocaleDateString()}` : "Not converted (yet)") : null,
            ].filter(Boolean),
          }}
          table={
            <table className="w-full text-left font-body text-sm">
              <thead className="text-pz-on-surface-variant text-xs uppercase">
                <tr><th className="py-1">Name</th><th>Phone</th><th>Status</th><th>Converted</th></tr>
              </thead>
              <tbody>
                {filteredRecipients.map((r) => (
                  <tr key={r.id} className="border-t border-pz-outline-variant">
                    <td className="py-1">
                      {r.contactId ? (
                        <Link href={`/dashboard/admin/sales-hub/contacts/${r.contactId}`} className="underline">
                          {r.fullName || "—"}
                        </Link>
                      ) : (
                        r.fullName || "—"
                      )}
                    </td>
                    <td>{r.phoneE164}</td>
                    <td className="text-xs">{r.status}</td>
                    <td className="text-xs">
                      {detail.conversion ? (r.convertedAt ? new Date(r.convertedAt).toLocaleDateString() : "Not converted (yet)") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        />
      ) : queueMode ? (
        (() => {
          const pending = detail.recipients.filter((r) => r.status === "pending" && !r.doNotContact);
          const current = pending[0];
          return (
            <div className="bg-pz-surface-container-highest rounded-xl p-4 space-y-3">
              <p className="font-body text-xs text-pz-on-surface-variant tabular-nums">
                {detail.sentCount} / {detail.recipientCount} sent — {pending.length} left
              </p>
              {current ? (
                <>
                  <p className="font-body font-semibold text-sm">
                    {current.fullName || "—"} <span className="font-normal text-pz-on-surface-variant">{current.phoneE164}</span>
                  </p>
                  <p className="font-body text-sm whitespace-pre-wrap">{renderWhatsAppMessage(detail.messageTemplate, current.fullName)}</p>
                </>
              ) : (
                <p className="font-body text-sm text-pz-on-surface-variant py-2">All recipients sent.</p>
              )}
              <div className="flex items-center gap-3">
                {current && (
                  <a
                    ref={queueLinkRef}
                    href={buildWhatsAppLink(current.phoneE164, detail.messageTemplate, current.fullName)}
                    onClick={() => { toggleSent(current); setLastQueueSentId(current.id); }}
                    className="inline-flex items-center px-5 py-2 rounded-full bg-pz-primary text-pz-on-primary font-headline text-sm font-semibold max-md:min-h-11"
                  >
                    Open chat
                  </a>
                )}
                {lastQueueSentId && (
                  <button onClick={goBackInQueue} className="font-body text-xs font-semibold text-pz-on-surface-variant hover:underline max-md:min-h-11">
                    ← Back (undo last send)
                  </button>
                )}
              </div>
            </div>
          );
        })()
      ) : (
        <ResponsiveList
          rows={filteredRecipients}
          getKey={(r) => r.id}
          empty={
            <EmptyState
              icon={Users}
              title={recipientSearch ? "No recipients match" : "No recipients yet"}
              description={recipientSearch ? `Nothing matches "${recipientSearch}".` : "Edit the batch segment to add recipients."}
            />
          }
          selection={{
            isSelected: (r) => r.status === "sent",
            onToggle: (r) => { void toggleSent(r); },
            label: (r) => `Mark ${r.fullName || r.phoneE164} as sent`,
          }}
          mobile={{
            title: (r) =>
              r.contactId ? (
                <Link href={`/dashboard/admin/sales-hub/contacts/${r.contactId}`} className="inline-flex min-h-11 items-center underline">
                  {r.fullName || "—"}
                </Link>
              ) : (
                r.fullName || "—"
              ),
            meta: (r) => [
              r.phoneE164,
              r.contactId && manualSet.has(r.contactId) ? "Manually converted" : null,
              detail.conversion ? (r.convertedAt ? `Converted ${new Date(r.convertedAt).toLocaleDateString()}` : "Not converted (yet)") : null,
              r.doNotContact ? (
                <span key="chat" className="inline-flex min-h-11 items-center text-pz-error text-sm font-semibold">Do not contact</span>
              ) : (
                <a key="chat" href={buildWhatsAppLink(r.phoneE164, detail.messageTemplate, r.fullName)} className="inline-flex min-h-11 items-center text-pz-primary underline text-sm font-semibold">
                  Open chat
                </a>
              ),
            ].filter(Boolean),
          }}
          table={
            <table className="w-full text-left font-body text-sm">
              <thead className="text-pz-on-surface-variant text-xs uppercase">
                <tr><th className="py-1">Name</th><th>Phone</th><th></th><th></th><th>Converted</th></tr>
              </thead>
              <tbody>
                {filteredRecipients.map((r) => (
                  <tr key={r.id} className="border-t border-pz-outline-variant">
                    <td className="py-1">
                      {r.contactId ? (
                        <Link href={`/dashboard/admin/sales-hub/contacts/${r.contactId}`} className="underline">
                          {r.fullName || "—"}
                        </Link>
                      ) : (
                        r.fullName || "—"
                      )}
                      {r.contactId && manualSet.has(r.contactId) && (
                        <span className="ml-2 px-1.5 py-0.5 rounded-full bg-pz-primary-container text-pz-on-primary-container text-[10px] font-bold uppercase">
                          manually converted
                        </span>
                      )}
                    </td>
                    <td>{r.phoneE164}</td>
                    <td>
                      {r.doNotContact ? (
                        <span className="text-pz-error text-xs font-semibold">Do not contact</span>
                      ) : (
                        <a href={buildWhatsAppLink(r.phoneE164, detail.messageTemplate, r.fullName)} className="text-pz-primary underline text-xs font-semibold">
                          Open chat
                        </a>
                      )}
                    </td>
                    <td>
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input type="checkbox" checked={r.status === "sent"} disabled={togglingRecipient && busyRecipientId === r.id} onChange={() => toggleSent(r)} />
                        sent
                      </label>
                    </td>
                    <td className="text-xs">
                      {detail.conversion ? (r.convertedAt ? new Date(r.convertedAt).toLocaleDateString() : "Not converted (yet)") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        />
      )}
    </div>
  );
}
