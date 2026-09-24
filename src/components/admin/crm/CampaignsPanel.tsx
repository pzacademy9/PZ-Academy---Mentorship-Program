"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import DOMPurify from "isomorphic-dompurify";
import { SegmentBuilder } from "./SegmentBuilder";
import { TemplatePicker } from "./TemplatePicker";
import { SELECTED_CONTACTS_STORAGE_KEY, type SegmentFilter } from "@/lib/crm/segment";

type Campaign = {
  id: string; name: string; subject: string; status: string; createdAt: string;
  recipients: number; sent: number; delivered: number; opened: number; clicked: number; bounced: number;
};

// Preview-only substitution so an admin can see roughly what a recipient
// sees without actually sending a test. Never touches the stored bodyHtml.
const PREVIEW_SAMPLE = { first_name: "Jordan", full_name: "Jordan Ahmed", email: "jordan@example.com" };
// Sanitized before render — this is a live preview of whatever the admin
// currently has typed (or pasted) into the raw-HTML body, not vetted content.
function renderPreviewHtml(html: string): string {
  const withTags = html
    .replaceAll("{{first_name}}", PREVIEW_SAMPLE.first_name)
    .replaceAll("{{full_name}}", PREVIEW_SAMPLE.full_name)
    .replaceAll("{{email}}", PREVIEW_SAMPLE.email);
  return DOMPurify.sanitize(withTags);
}

const MERGE_TAGS = [
  { label: "First name", tag: "{{first_name}}" },
  { label: "Full name", tag: "{{full_name}}" },
  { label: "Email", tag: "{{email}}" },
] as const;

export function CampaignsPanel({ initialCampaigns }: { initialCampaigns: Campaign[] }) {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("<p>Hi {{first_name}},</p>\n<p></p>");
  const [segment, setSegment] = useState<SegmentFilter[]>([]);
  const [draftId, setDraftId] = useState<string | null>(null);
  // The campaign row this composer session is bound to, independent of
  // draftId (which invalidateDraft nulls on every keystroke). Once bound —
  // by "Edit", or by the first successful save of a brand-new campaign —
  // every further "Save draft" updates that same row instead of inserting a
  // new one, so retesting after a wording tweak no longer means a fresh
  // "Sent campaigns" row every time.
  const [boundId, setBoundId] = useState<string | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [bodyView, setBodyView] = useState<"edit" | "preview">("edit");
  const [campaignSearch, setCampaignSearch] = useState("");
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Picks up a bulk selection handed off from the Contacts tab, once, on
  // mount. Read-then-remove so revisiting this tab later (without a fresh
  // handoff) never re-seeds a stale selection into a new draft.
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
    setDraftId(null);
    toast.success(`${ids.length} contact${ids.length === 1 ? "" : "s"} added from Contacts.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredCampaigns = campaignSearch.trim() === ""
    ? campaigns
    : campaigns.filter((c) => {
        const q = campaignSearch.trim().toLowerCase();
        return c.name.toLowerCase().includes(q) || c.subject.toLowerCase().includes(q);
      });

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

  // Reuses the course-image relay (Google Drive, public link, correct
  // cross-origin-safe thumbnail URL) — campaign images have the same
  // "public marketing asset" shape as course thumbnails, just a different
  // folder. Inserted at the textarea cursor rather than replacing the body.
  async function insertImage(file: File) {
    setUploadingImage(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("courseSlug", "crm-campaigns");
      form.append("kind", "campaign");

      const res = await fetch("/api/admin/uploads/course-image", { method: "POST", body: form });
      const payload = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!res.ok || !payload?.url) {
        toast.error(payload?.error ?? "Image upload failed.");
        return;
      }

      const tag = `<img src="${payload.url}" alt="" style="max-width:100%" />`;
      const el = bodyRef.current;
      const pos = el?.selectionStart ?? bodyHtml.length;
      const next = bodyHtml.slice(0, pos) + tag + bodyHtml.slice(pos);
      editBody(next);
      toast.success("Image uploaded and inserted.");
    } finally {
      setUploadingImage(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  }

  function insertTag(tag: string) {
    const el = bodyRef.current;
    const pos = el?.selectionStart ?? bodyHtml.length;
    editBody(bodyHtml.slice(0, pos) + tag + bodyHtml.slice(pos));
  }

  // "Duplicate" loads any campaign back into the composer as a fresh,
  // unbound draft — a new row on save, never touching the original. This is
  // how a sent campaign gets resent (it is immutable history), and how a
  // draft gets forked into a variant instead of edited in place.
  async function duplicateCampaign(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/admin/crm/campaigns/${id}`);
      if (!res.ok) throw new Error();
      const json = (await res.json()) as { name: string; subject: string; bodyHtml: string; segment: SegmentFilter[] };
      setName(`${json.name} (copy)`);
      setSubject(json.subject);
      setBodyHtml(json.bodyHtml);
      setSegment(json.segment);
      setBoundId(null);
      invalidateDraft();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setError("Could not load that campaign.");
    }
  }

  // "Edit" loads a draft back into the composer BOUND to its own row —
  // "Save draft" then updates it in place, so retest-after-edit does not
  // create a new campaign each time. Only a draft can be edited; sent/
  // sending campaigns are history — the server enforces this too.
  async function editCampaign(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/admin/crm/campaigns/${id}`);
      if (!res.ok) throw new Error();
      const json = (await res.json()) as { name: string; subject: string; bodyHtml: string; segment: SegmentFilter[] };
      setName(json.name);
      setSubject(json.subject);
      setBodyHtml(json.bodyHtml);
      setSegment(json.segment);
      setBoundId(id);
      invalidateDraft();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setError("Could not load that campaign.");
    }
  }

  async function deleteCampaign(id: string) {
    if (!window.confirm("Delete this draft? This cannot be undone.")) return;
    setError(null);
    try {
      const res = await fetch(`/api/admin/crm/campaigns/${id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Could not delete the campaign.");
      // If the composer was bound to the row just deleted, unbind it —
      // "Save draft" would otherwise PATCH a row that no longer exists.
      if (boundId === id) newCampaign();
      await reload();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete the campaign.");
    }
  }

  function newCampaign() {
    setName("");
    setSubject("");
    setBodyHtml("<p>Hi {{first_name}},</p>\n<p></p>");
    setSegment([]);
    setBoundId(null);
    invalidateDraft();
    setError(null);
  }

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
      const url = boundId ? `/api/admin/crm/campaigns/${boundId}` : "/api/admin/crm/campaigns";
      const res = await fetch(url, {
        method: boundId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, subject, bodyHtml, segment }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not save the draft.");
      setBoundId(json.id);
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
      setBoundId(null);
      await reload();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the campaign.");
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <section className="bg-pz-surface-container-high rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-headline font-semibold text-pz-secondary">{boundId ? "Editing draft" : "New campaign"}</h2>
          {boundId && (
            <button onClick={newCampaign} className="font-body text-xs font-semibold text-pz-on-surface-variant hover:text-pz-secondary">
              Start a new campaign instead
            </button>
          )}
        </div>

        <input value={name} onChange={(e) => editName(e.target.value)} placeholder="Internal name"
          className="w-full rounded-xl border border-pz-outline-variant px-4 py-2 font-body text-sm" />
        <input value={subject} onChange={(e) => editSubject(e.target.value)} placeholder="Subject — {{first_name}} works here too"
          className="w-full rounded-xl border border-pz-outline-variant px-4 py-2 font-body text-sm" />
        <div className="flex items-center gap-1 border-b border-pz-outline-variant">
          <button type="button" onClick={() => setBodyView("edit")}
            className={`px-3 py-1.5 text-xs font-bold border-b-2 -mb-px transition-colors ${bodyView === "edit" ? "border-pz-primary text-pz-primary" : "border-transparent text-pz-on-surface-variant hover:text-pz-secondary"}`}>
            Edit
          </button>
          <button type="button" onClick={() => setBodyView("preview")}
            className={`px-3 py-1.5 text-xs font-bold border-b-2 -mb-px transition-colors ${bodyView === "preview" ? "border-pz-primary text-pz-primary" : "border-transparent text-pz-on-surface-variant hover:text-pz-secondary"}`}>
            Preview
          </button>
        </div>

        {bodyView === "edit" ? (
          <textarea ref={bodyRef} value={bodyHtml} onChange={(e) => editBody(e.target.value)} rows={8}
            className="w-full rounded-xl border border-pz-outline-variant px-4 py-2 font-mono text-xs" />
        ) : (
          <div className="rounded-xl border border-pz-outline-variant overflow-hidden">
            <div style={{ fontFamily: "-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif", background: "#ffffff", padding: "24px 16px" }}>
              <div style={{ maxWidth: 560, margin: "0 auto", color: "#222222", lineHeight: 1.6, fontSize: 15 }}
                dangerouslySetInnerHTML={{ __html: renderPreviewHtml(bodyHtml) }} />
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <button type="button" onClick={() => imageInputRef.current?.click()} disabled={uploadingImage}
            className="px-3 py-1.5 rounded-lg border border-pz-outline-variant text-xs font-bold text-pz-on-surface-variant hover:bg-pz-surface-container-low transition-colors disabled:opacity-50">
            {uploadingImage ? "Uploading…" : "Insert image"}
          </button>
          <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void insertImage(f); }} />
          {MERGE_TAGS.map((t) => (
            <button key={t.tag} type="button" onClick={() => insertTag(t.tag)}
              className="px-3 py-1.5 rounded-lg border border-pz-outline-variant text-xs font-bold text-pz-on-surface-variant hover:bg-pz-surface-container-low transition-colors">
              {t.label}
            </button>
          ))}
        </div>
        <p className="font-body text-xs text-pz-on-surface-variant">
          Tags: <code>{"{{first_name}}"}</code>, <code>{"{{full_name}}"}</code>, <code>{"{{email}}"}</code>.
          The PZ Academy header and the unsubscribe footer are added automatically.
        </p>
        <TemplatePicker
          channel="email"
          currentSubject={subject}
          currentBody={bodyHtml}
          onLoad={(t) => { editSubject(t.subject ?? ""); editBody(t.body); }}
        />

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
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="font-headline font-semibold text-pz-secondary">Sent campaigns</h2>
          {campaigns.length > 0 && (
            <input value={campaignSearch} onChange={(e) => setCampaignSearch(e.target.value)} placeholder="Search by name or subject…"
              className="rounded-xl border border-pz-outline-variant px-3 py-1.5 font-body text-sm w-64" />
          )}
        </div>
        {campaigns.length === 0 ? (
          <p className="font-body text-sm text-pz-on-surface-variant">No campaigns yet.</p>
        ) : filteredCampaigns.length === 0 ? (
          <p className="font-body text-sm text-pz-on-surface-variant">No campaigns match &quot;{campaignSearch}&quot;.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-body text-sm">
              <thead className="text-pz-on-surface-variant text-xs uppercase">
                <tr><th className="py-2">Name</th><th>Status</th><th>Recipients</th><th>Sent</th><th>Delivered</th><th>Opened</th><th>Clicked</th><th>Bounced</th><th></th></tr>
              </thead>
              <tbody>
                {filteredCampaigns.map((c) => (
                  <tr key={c.id} className="border-t border-pz-outline-variant">
                    <td className="py-2">{c.name}</td>
                    <td>{c.status}</td>
                    <td className="tabular-nums">{c.recipients}</td>
                    <td className="tabular-nums">{c.sent}</td>
                    <td className="tabular-nums">{c.delivered}</td>
                    <td className="tabular-nums">{c.opened}</td>
                    <td className="tabular-nums">{c.clicked}</td>
                    <td className={`tabular-nums ${c.bounced > 0 ? "text-pz-danger" : ""}`}>{c.bounced}</td>
                    <td className="whitespace-nowrap space-x-3">
                      {c.status === "draft" && (
                        <button onClick={() => editCampaign(c.id)} className="text-pz-primary font-body text-xs font-semibold">
                          Edit
                        </button>
                      )}
                      <button onClick={() => duplicateCampaign(c.id)} className="text-pz-primary font-body text-xs font-semibold">
                        Duplicate
                      </button>
                      {c.status === "draft" && (
                        <button onClick={() => deleteCampaign(c.id)} className="text-pz-danger font-body text-xs font-semibold">
                          Delete
                        </button>
                      )}
                    </td>
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
