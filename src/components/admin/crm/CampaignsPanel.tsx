"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SegmentBuilder } from "./SegmentBuilder";
import type { SegmentFilter } from "@/lib/crm/segment";

type Campaign = {
  id: string; name: string; subject: string; status: string; createdAt: string;
  recipients: number; sent: number; delivered: number; opened: number; clicked: number; bounced: number;
};

export function CampaignsPanel({ initialCampaigns }: { initialCampaigns: Campaign[] }) {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("<p>Hi {{first_name}},</p>\n<p></p>");
  const [segment, setSegment] = useState<SegmentFilter[]>([]);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Any edit after a draft is saved invalidates it: the saved draft no longer
  // matches what is on screen, so the test/send buttons (gated on draftId)
  // must hide until "Save draft" is pressed again.
  function invalidateDraft() {
    setDraftId(null);
    setNotice(null);
  }

  const editName = (v: string) => { setName(v); invalidateDraft(); };
  const editSubject = (v: string) => { setSubject(v); invalidateDraft(); };
  const editBody = (v: string) => { setBodyHtml(v); invalidateDraft(); };
  const editSegment = (v: SegmentFilter[]) => { setSegment(v); invalidateDraft(); };

  async function reload() {
    const res = await fetch("/api/admin/crm/campaigns");
    if (!res.ok) return;
    const json = await res.json();
    // Local state, not router.refresh() — refresh() cannot resync this
    // component's own useState.
    setCampaigns(json.campaigns);
  }

  async function saveDraft() {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/admin/crm/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, subject, bodyHtml, segment }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not save the draft.");
      setDraftId(json.id);
      setNotice("Draft saved. Send a test to yourself before sending to the segment.");
      await reload();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the draft.");
    } finally { setBusy(false); }
  }

  async function sendTest() {
    if (!draftId) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/admin/crm/campaigns/${draftId}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: testEmail }),
      });
      if (!res.ok) throw new Error("Could not send the test email.");
      setNotice(`Test sent to ${testEmail}. Check the rendering and the unsubscribe link before the real send.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the test email.");
    } finally { setBusy(false); }
  }

  async function sendReal() {
    if (!draftId) return;

    // Confirm against the real recipient count, fetched fresh — an admin must
    // not approve a "send to the segment" without knowing how many people that
    // is. A failed count fetch blocks the send rather than sending blind.
    setBusy(true); setError(null);
    let total: number;
    try {
      const res = await fetch("/api/admin/crm/segments/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segment }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || typeof json.total !== "number") throw new Error();
      total = json.total;
    } catch {
      setBusy(false);
      setError("Could not confirm the recipient count — try again.");
      return;
    }
    setBusy(false);

    // Irreversible and outward-facing: once enqueued, these emails cannot be
    // recalled. Explicit confirmation is required.
    if (!window.confirm(`Send to ${total} contacts? This sends real emails and cannot be undone.`)) return;

    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/admin/crm/campaigns/${draftId}/send`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Could not send the campaign.");
      setNotice("Queued. Delivery happens in the background — watch the stats below.");
      setDraftId(null);
      await reload();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the campaign.");
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <section className="bg-pz-surface-container-high rounded-2xl p-5 space-y-4">
        <h2 className="font-headline font-semibold text-pz-secondary">New campaign</h2>

        <input value={name} onChange={(e) => editName(e.target.value)} placeholder="Internal name"
          className="w-full rounded-xl border border-pz-outline-variant px-4 py-2 font-body text-sm" />
        <input value={subject} onChange={(e) => editSubject(e.target.value)} placeholder="Subject — {{first_name}} works here too"
          className="w-full rounded-xl border border-pz-outline-variant px-4 py-2 font-body text-sm" />
        <textarea value={bodyHtml} onChange={(e) => editBody(e.target.value)} rows={8}
          className="w-full rounded-xl border border-pz-outline-variant px-4 py-2 font-mono text-xs" />
        <p className="font-body text-xs text-pz-on-surface-variant">
          Tags: <code>{"{{first_name}}"}</code>, <code>{"{{full_name}}"}</code>, <code>{"{{email}}"}</code>.
          The PZ Academy header and the unsubscribe footer are added automatically.
        </p>

        <div>
          <h3 className="font-headline text-sm font-semibold mb-2">Who receives it</h3>
          <SegmentBuilder value={segment} onChange={editSegment} />
        </div>

        <div className="flex gap-2 flex-wrap items-center">
          <button onClick={saveDraft} disabled={busy}
            className="px-5 py-2 rounded-full bg-pz-primary text-pz-on-primary font-headline text-sm font-semibold disabled:opacity-50">
            {busy ? "Saving…" : "Save draft"}
          </button>

          {draftId && (
            <>
              <input value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="your@email.com"
                className="rounded-xl border border-pz-outline-variant px-3 py-2 font-body text-sm" />
              <button onClick={sendTest} disabled={busy || testEmail === ""}
                className="px-5 py-2 rounded-full bg-pz-surface-variant text-pz-on-surface-variant font-headline text-sm font-medium disabled:opacity-50">
                Send test
              </button>
              <button onClick={sendReal} disabled={busy}
                className="px-5 py-2 rounded-full bg-pz-danger text-white font-headline text-sm font-semibold disabled:opacity-50">
                Send to segment
              </button>
            </>
          )}
        </div>

        {error && <p className="font-body text-sm text-pz-danger">{error}</p>}
        {notice && <p className="font-body text-sm text-pz-primary">{notice}</p>}
      </section>

      <section className="space-y-2">
        <h2 className="font-headline font-semibold text-pz-secondary">Sent campaigns</h2>
        {campaigns.length === 0 ? (
          <p className="font-body text-sm text-pz-on-surface-variant">No campaigns yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-body text-sm">
              <thead className="text-pz-on-surface-variant text-xs uppercase">
                <tr><th className="py-2">Name</th><th>Status</th><th>Recipients</th><th>Sent</th><th>Delivered</th><th>Opened</th><th>Clicked</th><th>Bounced</th></tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id} className="border-t border-pz-outline-variant">
                    <td className="py-2">{c.name}</td>
                    <td>{c.status}</td>
                    <td className="tabular-nums">{c.recipients}</td>
                    <td className="tabular-nums">{c.sent}</td>
                    <td className="tabular-nums">{c.delivered}</td>
                    <td className="tabular-nums">{c.opened}</td>
                    <td className="tabular-nums">{c.clicked}</td>
                    <td className={`tabular-nums ${c.bounced > 0 ? "text-pz-danger" : ""}`}>{c.bounced}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
