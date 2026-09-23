"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { SegmentBuilder } from "./SegmentBuilder";
import { buildWhatsAppLink } from "@/lib/crm/whatsapp-link";
import { SELECTED_CONTACTS_STORAGE_KEY, type SegmentFilter } from "@/lib/crm/segment";

type BatchListRow = {
  id: string;
  name: string;
  messageTemplate: string;
  recipientCount: number;
  sentCount: number;
  createdAt: string;
};

type Recipient = { id: string; fullName: string; phoneE164: string; status: "pending" | "sent"; sentAt: string | null };
type BatchDetail = BatchListRow & { recipients: Recipient[] };

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
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<BatchDetail | null>(null);
  const [busyRecipientId, setBusyRecipientId] = useState<string | null>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);

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

  async function createBatch() {
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/admin/crm/whatsapp/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, messageTemplate: message, segment }),
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
      const list = await fetch("/api/admin/crm/whatsapp/batches");
      if (list.ok) setBatches((await list.json()).batches);
    } finally {
      setCreating(false);
    }
  }

  // Inserts at the cursor rather than always at the end — matches the
  // merge-tag insert pattern already used by CampaignsPanel's body editor.
  function insertTag(tag: string) {
    const el = messageRef.current;
    if (!el) { setMessage((m) => m + tag); return; }
    const start = el.selectionStart ?? message.length;
    const end = el.selectionEnd ?? message.length;
    setMessage(message.slice(0, start) + tag + message.slice(end));
  }

  async function toggleDetail(id: string) {
    if (openId === id) { setOpenId(null); setDetail(null); return; }
    setOpenId(id);
    setDetail(null);
    const res = await fetch(`/api/admin/crm/whatsapp/batches/${id}`);
    if (res.ok) setDetail(await res.json());
  }

  async function toggleSent(recipient: Recipient) {
    if (!detail) return;
    const nextStatus: "pending" | "sent" = recipient.status === "sent" ? "pending" : "sent";
    setBusyRecipientId(recipient.id);
    try {
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
      const currentDetailId = detail.id;
      setDetail((prev) => {
        if (!prev) return prev;
        const recipients = prev.recipients.map((r) => (r.id === recipient.id ? { ...r, status: nextStatus } : r));
        return { ...prev, recipients, sentCount: recipients.filter((r) => r.status === "sent").length };
      });
      setBatches((prev) =>
        prev.map((b) =>
          b.id === currentDetailId ? { ...b, sentCount: b.sentCount + (nextStatus === "sent" ? 1 : -1) } : b,
        ),
      );
    } finally {
      setBusyRecipientId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-pz-surface-container-high rounded-2xl p-5 space-y-3">
        <h2 className="font-headline font-bold text-lg">New batch</h2>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Batch name, e.g. W20 WhatsApp follow-up"
          className="w-full rounded-xl border border-pz-outline-variant px-4 py-2 font-body text-sm"
        />
        <div className="flex gap-2">
          {MERGE_TAGS.map((t) => (
            <button
              key={t.tag}
              onClick={() => insertTag(t.tag)}
              className="px-3 py-1 rounded-full bg-pz-surface-variant text-pz-on-surface-variant font-body text-xs font-medium"
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
          className="w-full rounded-xl border border-pz-outline-variant px-4 py-2 font-body text-sm"
        />
        <SegmentBuilder value={segment} onChange={setSegment} channel="whatsapp" />
        {createError && <p className="font-body text-sm text-pz-danger">{createError}</p>}
        <button
          onClick={createBatch}
          disabled={creating || name.trim() === "" || message.trim() === ""}
          className="px-5 py-2 rounded-full bg-pz-primary text-pz-on-primary font-headline text-sm font-semibold disabled:opacity-50"
        >
          {creating ? "Creating…" : "Create batch"}
        </button>
      </div>

      <div>
        <h2 className="font-headline font-bold text-lg mb-3">Batches</h2>
        {batches.length === 0 ? (
          <p className="font-body text-sm text-pz-on-surface-variant py-8 text-center">No WhatsApp batches yet.</p>
        ) : (
          <div className="space-y-2">
            {batches.map((b) => (
              <div key={b.id} className="bg-pz-surface-container-high rounded-2xl p-4">
                <button onClick={() => toggleDetail(b.id)} className="w-full flex items-center justify-between text-left">
                  <span className="font-body font-semibold text-sm">{b.name}</span>
                  <span className="font-body text-xs text-pz-on-surface-variant tabular-nums">
                    {b.sentCount} / {b.recipientCount} sent
                  </span>
                </button>

                {openId === b.id && (
                  <div className="mt-4 overflow-x-auto">
                    {detail === null ? (
                      <p className="font-body text-xs text-pz-on-surface-variant">Loading…</p>
                    ) : (
                      <table className="w-full text-left font-body text-sm">
                        <thead className="text-pz-on-surface-variant text-xs uppercase">
                          <tr><th className="py-1">Name</th><th>Phone</th><th></th><th></th></tr>
                        </thead>
                        <tbody>
                          {detail.recipients.map((r) => (
                            <tr key={r.id} className="border-t border-pz-outline-variant">
                              <td className="py-1">{r.fullName || "—"}</td>
                              <td>{r.phoneE164}</td>
                              <td>
                                {/* No target="_blank": whatsapp:// is a protocol
                                    link, not a page — the browser hands it to the
                                    OS before any navigation happens, so opening it
                                    in a new tab would only risk a stray blank one. */}
                                <a
                                  href={buildWhatsAppLink(r.phoneE164, detail.messageTemplate, r.fullName)}
                                  className="text-pz-primary underline text-xs font-semibold"
                                >
                                  Open chat
                                </a>
                              </td>
                              <td>
                                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={r.status === "sent"}
                                    disabled={busyRecipientId === r.id}
                                    onChange={() => toggleSent(r)}
                                  />
                                  sent
                                </label>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
