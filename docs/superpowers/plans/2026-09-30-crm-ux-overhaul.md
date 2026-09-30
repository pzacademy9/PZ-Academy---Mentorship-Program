# CRM UX Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the CRM panel's inline-accordion pattern with real per-item detail pages for Contacts, Campaigns, Cohorts, WhatsApp, and Agents; add search to every list and detail sub-list; and add a manual, batch-independent way to mark a contact converted for a program.

**Architecture:** Each of the five sections gets a `[id]` dynamic route mirroring the existing `/dashboard/admin/courses/[id]` pattern — a Server Component page that fetches the item's detail (reusing existing data-layer functions wherever they already exist) and hands it to a new client component carrying whatever interactivity the old inline accordion had. List panels drop their accordion state and turn the clicked cell into a `<Link>`. Manual conversion is a new, small, independent subsystem (one table, one pure validation module, one data-layer file, two API routes) that the Contact detail page and the Contacts list's existing multi-select both call into.

**Tech Stack:** Next.js 14.2.5 App Router, Supabase (service-role data layer, RLS-enabled/zero-policy tables), Zod validation, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-30-crm-ux-overhaul-design.md`

## Global Constraints

- Every new table follows the RLS convention already established in this repo (enabled, zero policies) — all reads/writes go through `createAdminSupabase()` behind `requireAdmin()`/`requireAdminPage()`, never a client-side Supabase query.
- Never regenerate `src/lib/supabase/database.types.ts` wholesale — hand-add the new table's `Row`/`Insert`/`Update`/`Relationships` entry only, appended after the last table entry (this file's newer tables are not kept in strict alphabetical order; match that, don't try to re-sort).
- Every admin API route starts with `const auth = await requireAdmin(); if (!auth.ok) return auth.response;` (route handlers) or `await requireAdminPage();` (Server Component pages) — copy the exact pattern already in `src/app/api/admin/crm/agents/[id]/route.ts`.
- Data-layer functions return discriminated-union results or `null`/`boolean` — never throw (matches every existing `admin-crm-*.ts` file).
- The "program" a manual conversion is recorded against reuses the existing `ConversionTag`'s `course`/`label` shape (`src/lib/crm/conversion.ts`) — do not invent a parallel enum.
- Manual conversions never feed `resolveConversions`/`computeConversions` or change any batch/campaign's computed percentage — they are a separate, parallel fact.
- Run `./node_modules/.bin/tsc --noEmit` and `./node_modules/.bin/vitest run` after every task (this workspace's path contains `&`, so `npm run` is broken — call binaries directly, per this repo's CLAUDE.md).

## Review Focus

- A manual-conversion request with neither `courseId` nor `programLabel` set, or both set — must be rejected at the schema/pure-function layer, not stored ambiguously. Covered by real Vitest tests (Tasks 11, 12) — this is pure logic, testable without I/O.
- Bulk-marking with an empty `contactIds` array — must be rejected, not silently "succeed" with zero rows. Covered by a real Vitest test (Task 12).
- Deleting a manual conversion by an `id` that doesn't exist — must return a clean not-found result, not throw or 500. This repo has no test harness for its service-role `admin-crm-*.ts` I/O functions (none of the existing ones — `deleteWhatsAppBatch`, `deleteImportBatch`, etc. — have unit tests either), so this is covered the same way those are: by the discriminated-result code path itself (Task 13's `count === 0` check) plus the plan's final live click-through, not a new automated test.
- A WhatsApp or campaign recipient row whose `contact_id` is `null` — the manual-conversion badge lookup must skip it rather than crash on a `null` map/set key. Covered by construction (Task 17 filters nulls out of the id list before the lookup, and guards the render on `contactId` being truthy) and TypeScript's `string | null` typing, not a dedicated test — this repo has no component-test harness (`@testing-library/react` is installed but unused by any existing test).
- An empty Cohorts/WhatsApp/Agents list, and a non-empty list where the search term matches nothing — both must render a clear message, not a blank table. Same as above: verified by the explicit empty-vs-no-match branches in Tasks 7-9's code and the final live click-through, consistent with this repo having zero existing component tests to extend.

---

## Task 1: Contact detail page

**Files:**
- Create: `src/app/dashboard/admin/crm/contacts/[id]/page.tsx`
- Create: `src/components/admin/crm/ContactDetailClient.tsx`
- Modify: `src/components/admin/crm/ContactsPanel.tsx`

**Interfaces:**
- Consumes: `getContactDetail(id): Promise<ContactDetail | null>` (already exists, `src/lib/data/admin-crm-contacts.ts:141`); `updateContactPhone` stays reached via the existing `PATCH /api/admin/crm/contacts/[id]` route (unchanged).
- Produces: `ContactDetailClient` component with props `{ detail: ContactDetail }`, exported for Task 15 to extend.

- [ ] **Step 1: Write the page**

```tsx
// src/app/dashboard/admin/crm/contacts/[id]/page.tsx
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { getContactDetail } from "@/lib/data/admin-crm-contacts";
import { ContactDetailClient } from "@/components/admin/crm/ContactDetailClient";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contact = await getContactDetail(id);
  return { title: contact ? `${contact.fullName || contact.email || "Contact"} — PZ Academy CRM` : "Contact — PZ Academy CRM" };
}

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  const detail = await getContactDetail(id);
  if (!detail) notFound();

  return <ContactDetailClient detail={detail} />;
}
```

- [ ] **Step 2: Write the client component, migrating the accordion body from `ContactsPanel`**

```tsx
// src/components/admin/crm/ContactDetailClient.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import type { ContactDetail } from "@/lib/data/admin-crm-contacts";

export function ContactDetailClient({ detail }: { detail: ContactDetail }) {
  const [phoneDraft, setPhoneDraft] = useState(String(detail.phoneRaw ?? detail.phoneE164 ?? ""));
  const [phoneE164, setPhoneE164] = useState(detail.phoneE164);
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  async function savePhone() {
    setPhoneBusy(true);
    setPhoneError(null);
    try {
      const res = await fetch(`/api/admin/crm/contacts/${detail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneRaw: phoneDraft }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPhoneError(json.error ?? "Could not save this number.");
        return;
      }
      setPhoneE164(json.phoneE164);
      toast.success("Phone number updated.");
    } finally {
      setPhoneBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/admin/crm?tab=contacts"
          className="inline-flex items-center gap-2 font-body text-sm text-pz-on-surface-variant hover:text-pz-primary transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Contacts
        </Link>
        <div className="flex flex-wrap items-center gap-3 mt-3">
          <h1 className="font-headline font-bold text-2xl text-pz-secondary">{detail.fullName || "—"}</h1>
          {detail.unsubscribed && <span className="text-xs text-pz-danger">unsubscribed</span>}
        </div>
      </div>

      <div className="bg-pz-surface-container-high rounded-2xl p-5 space-y-3 font-body text-sm">
        <p>Email: {detail.email ?? "—"}</p>
        <p>Country: {detail.country ?? "—"}</p>
        <p>Profession: {detail.profession ?? "—"} · Platform account: {detail.hasPlatformAccount ? "yes" : "no"}</p>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold">Phone:</span>
          <input
            value={phoneDraft}
            onChange={(e) => setPhoneDraft(e.target.value)}
            className="rounded-lg border border-pz-outline-variant px-2 py-1 font-body text-sm"
          />
          <button
            onClick={savePhone}
            disabled={phoneBusy || phoneDraft.trim() === ""}
            className="px-3 py-1 rounded-full bg-pz-primary text-pz-on-primary font-headline text-xs font-semibold disabled:opacity-50"
          >
            {phoneBusy ? "Saving…" : "Save"}
          </button>
          {phoneE164 && <span className="text-pz-on-surface-variant text-xs">({phoneE164})</span>}
          {phoneError && <span className="text-pz-danger">{phoneError}</span>}
        </div>
      </div>

      <div>
        <h2 className="font-headline font-bold text-lg mb-3">Purchase history ({detail.purchases.length})</h2>
        {detail.purchases.length === 0 ? (
          <p className="font-body text-sm text-pz-on-surface-variant py-4">No purchases on file.</p>
        ) : (
          <div className="space-y-2">
            {detail.purchases.map((p) => (
              <p key={p.id} className="font-body text-xs bg-pz-surface-container-high rounded-xl p-3">
                {p.productLabel || "—"} · {p.amount === null ? "—" : `${p.currency ?? ""} ${p.amount}`}
                {p.isEarlyBird ? " · early bird" : ""} · {p.rowType}
                {p.promoCode ? ` · promo ${p.promoCode}` : ""} · {p.sourceRowRef}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Remove the accordion from `ContactsPanel` and navigate instead**

In `src/components/admin/crm/ContactsPanel.tsx`:
- Delete the `openId`, `detail`, `phoneDraft`, `phoneBusy`, `phoneError` state and the `toggleDetail`/`savePhone` functions (lines 39-40, 45-47, 95-128) — this behavior now lives entirely in `ContactDetailClient`.
- Add `import Link from "next/link";` (already imported for `useRouter`, add `Link` alongside).
- Replace the name cell (lines 279-284):

```tsx
<td>
  <Link href={`/dashboard/admin/crm/contacts/${c.id}`} className="text-left underline">
    {c.fullName || "—"}
  </Link>
  {c.unsubscribed && <span className="ml-2 text-xs text-pz-danger">unsubscribed</span>}
</td>
```
- Remove the trailing `{openId === c.id && (...)}` accordion row entirely (the block that was lines 300-335).
- The `runSearch` function's `setOpenId(null);` line becomes dead — delete it.

- [ ] **Step 4: Typecheck and test**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: no errors.

Run: `./node_modules/.bin/vitest run`
Expected: all existing tests still pass (no test currently covers `ContactsPanel`'s accordion, so none should need updating).

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/admin/crm/contacts src/components/admin/crm/ContactDetailClient.tsx src/components/admin/crm/ContactsPanel.tsx
git commit -m "feat: add Contact detail page, drop inline accordion from Contacts list"
```

---

## Task 2: Campaign detail page

**Files:**
- Create: `src/app/dashboard/admin/crm/campaigns/[id]/page.tsx`
- Create: `src/components/admin/crm/CampaignDetailClient.tsx`
- Modify: `src/components/admin/crm/CampaignsPanel.tsx`

**Interfaces:**
- Consumes: `listCampaigns(): Promise<CampaignRow[]>` and `getCampaignConversionDetail(id): Promise<CampaignConversionDetail>` (both already exist, `src/lib/data/admin-crm-campaigns.ts`).
- Produces: `CampaignDetailClient` component with props `{ campaign: CampaignRow; conversionDetail: CampaignConversionDetail }`, exported for Task 17 to extend.

- [ ] **Step 1: Write the page**

Campaigns has no single-row fetch — `listCampaigns()` returns the small full list (same list `CampaignsPanel` already receives), so find the match server-side rather than adding a new query:

```tsx
// src/app/dashboard/admin/crm/campaigns/[id]/page.tsx
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { listCampaigns, getCampaignConversionDetail } from "@/lib/data/admin-crm-campaigns";
import { CampaignDetailClient } from "@/components/admin/crm/CampaignDetailClient";

export const metadata = { title: "Campaign — PZ Academy CRM" };

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  const [campaigns, conversionDetail] = await Promise.all([listCampaigns(), getCampaignConversionDetail(id)]);
  const campaign = campaigns.find((c) => c.id === id);
  if (!campaign) notFound();

  return <CampaignDetailClient campaign={campaign} conversionDetail={conversionDetail} />;
}
```

- [ ] **Step 2: Write the client component**

```tsx
// src/components/admin/crm/CampaignDetailClient.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { CampaignRow, CampaignConversionDetail } from "@/lib/data/admin-crm-campaigns";

export function CampaignDetailClient({
  campaign,
  conversionDetail,
}: {
  campaign: CampaignRow;
  conversionDetail: CampaignConversionDetail;
}) {
  const [recipientSearch, setRecipientSearch] = useState("");
  const recipients = conversionDetail?.recipients ?? [];
  const filteredRecipients =
    recipientSearch.trim() === ""
      ? recipients
      : recipients.filter((r) => r.fullName.toLowerCase().includes(recipientSearch.trim().toLowerCase()));

  const stats: { label: string; value: number | string }[] = [
    { label: "Recipients", value: campaign.recipients },
    { label: "Sent", value: campaign.sent },
    { label: "Delivered", value: campaign.delivered },
    { label: "Opened", value: campaign.opened },
    { label: "Clicked", value: campaign.clicked },
    { label: "Bounced", value: campaign.bounced },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/admin/crm?tab=campaigns"
          className="inline-flex items-center gap-2 font-body text-sm text-pz-on-surface-variant hover:text-pz-primary transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Campaigns
        </Link>
        <div className="flex flex-wrap items-center gap-3 mt-3">
          <h1 className="font-headline font-bold text-2xl text-pz-secondary">{campaign.name}</h1>
          <span className="font-body text-xs text-pz-on-surface-variant">{campaign.status}</span>
        </div>
        <p className="font-body text-sm text-pz-on-surface-variant mt-1">{campaign.subject}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-6 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-pz-surface-container-lowest p-4 rounded-lg border border-pz-outline-variant">
            <p className="text-[10px] font-bold uppercase tracking-widest text-pz-on-surface-variant">{s.label}</p>
            <p className="font-headline text-xl font-bold mt-1 tabular-nums">{s.value}</p>
          </div>
        ))}
      </div>

      <div>
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <h2 className="font-headline font-bold text-lg">
            Conversion{" "}
            {conversionDetail && (
              <span className="font-body text-sm font-normal text-pz-on-surface-variant">
                {conversionDetail.total > 0 ? Math.round((conversionDetail.converted / conversionDetail.total) * 100) : 0}%
                ({conversionDetail.converted}/{conversionDetail.total})
              </span>
            )}
          </h2>
          {recipients.length > 0 && (
            <input
              value={recipientSearch}
              onChange={(e) => setRecipientSearch(e.target.value)}
              placeholder="Search recipients…"
              className="rounded-xl border border-pz-outline-variant px-3 py-1.5 font-body text-sm w-64"
            />
          )}
        </div>
        {!conversionDetail ? (
          <p className="font-body text-sm text-pz-on-surface-variant py-4">This campaign isn&apos;t tagged with a conversion program.</p>
        ) : filteredRecipients.length === 0 ? (
          <p className="font-body text-sm text-pz-on-surface-variant py-4">
            {recipientSearch ? `No recipients match "${recipientSearch}".` : "No recipients yet."}
          </p>
        ) : (
          <table className="w-full text-left font-body text-sm">
            <thead className="text-pz-on-surface-variant text-xs uppercase">
              <tr><th className="py-1">Name</th><th>Converted</th></tr>
            </thead>
            <tbody>
              {filteredRecipients.map((r) => (
                <tr key={r.contactId} className="border-t border-pz-outline-variant">
                  <td className="py-1">
                    <Link href={`/dashboard/admin/crm/contacts/${r.contactId}`} className="underline">
                      {r.fullName || "—"}
                    </Link>
                  </td>
                  <td>{r.convertedAt ? new Date(r.convertedAt).toLocaleDateString() : "Not converted (yet)"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Link the campaign name in `CampaignsPanel`**

In `src/components/admin/crm/CampaignsPanel.tsx`, add `import Link from "next/link";` and change the name cell (currently `<td className="py-2">{c.name}</td>`) to:

```tsx
<td className="py-2">
  <Link href={`/dashboard/admin/crm/campaigns/${c.id}`} className="underline">
    {c.name}
  </Link>
</td>
```

`Edit`/`Duplicate`/`Delete` stay exactly as they are today (unchanged inline actions on the row) — only the name becomes a link.

- [ ] **Step 4: Typecheck and test**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: no errors.

Run: `./node_modules/.bin/vitest run`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/admin/crm/campaigns src/components/admin/crm/CampaignDetailClient.tsx src/components/admin/crm/CampaignsPanel.tsx
git commit -m "feat: add Campaign detail page with recipient-level conversion view"
```

---

## Task 3: WhatsApp batch detail page

**Files:**
- Create: `src/app/dashboard/admin/crm/whatsapp/[id]/page.tsx`
- Create: `src/components/admin/crm/WhatsAppBatchDetailClient.tsx`
- Modify: `src/components/admin/crm/WhatsAppPanel.tsx`

**Interfaces:**
- Consumes: `getWhatsAppBatchDetail(id): Promise<WhatsAppBatchDetail | null>` (already exists, `src/lib/data/admin-crm-whatsapp.ts:260`).
- Produces: `WhatsAppBatchDetailClient` component with props `{ initialDetail: WhatsAppBatchDetail }`, exported for Task 17 to extend.

This is the largest migration — everything currently inside `WhatsAppPanel`'s `openId === b.id` block (lines 445-689 of the current file: edit batch, edit message, queue mode, recipient table) moves here verbatim, adapted from reading `detail`/`openId` state to just using props plus its own local state (since this is now its own page, not one row among many).

- [ ] **Step 1: Write the page**

```tsx
// src/app/dashboard/admin/crm/whatsapp/[id]/page.tsx
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { getWhatsAppBatchDetail } from "@/lib/data/admin-crm-whatsapp";
import { WhatsAppBatchDetailClient } from "@/components/admin/crm/WhatsAppBatchDetailClient";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const batch = await getWhatsAppBatchDetail(id);
  return { title: batch ? `${batch.name} — PZ Academy CRM` : "WhatsApp Batch — PZ Academy CRM" };
}

export default async function WhatsAppBatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  const detail = await getWhatsAppBatchDetail(id);
  if (!detail) notFound();

  return <WhatsAppBatchDetailClient initialDetail={detail} />;
}
```

- [ ] **Step 2: Write the client component**

Move `SegmentFilter`/`ConversionTag` imports, the `Recipient`/`BatchDetail` types (reuse `WhatsAppBatchDetail`/`WhatsAppRecipientRow` from the data layer instead of the panel's local duplicates), `MERGE_TAGS`, and every piece of state/handler that operated on `detail` in the old `WhatsAppPanel` (`editingMessage`, `messageDraft`, `savingMessage`, `editingBatch`, `nameDraft`, `segmentDraft`, `savingBatch`, `editConversionMode`/`editConversionCourseId`/`editConversionLabel`, `busyRecipientId`, `queueMode`, `lastQueueSentId`, `courses`, `queueLinkRef`, `saveBatchEdits`, `saveMessage`, `toggleSent`, `goBackInQueue`, `buildEditConversionTag`, `loadEditConversionTag`) into this new component. Replace every `detail`/`setDetail` reference with local state seeded from `initialDetail`, and add a recipient search filter:

```tsx
// src/components/admin/crm/WhatsAppBatchDetailClient.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { SegmentBuilder } from "./SegmentBuilder";
import { buildWhatsAppLink, renderWhatsAppMessage } from "@/lib/crm/whatsapp-link";
import type { SegmentFilter } from "@/lib/crm/segment";
import type { WhatsAppBatchDetail, WhatsAppRecipientRow } from "@/lib/data/admin-crm-whatsapp";

export function WhatsAppBatchDetailClient({ initialDetail }: { initialDetail: WhatsAppBatchDetail }) {
  const [detail, setDetail] = useState(initialDetail);
  const [editingMessage, setEditingMessage] = useState(false);
  const [messageDraft, setMessageDraft] = useState("");
  const [savingMessage, setSavingMessage] = useState(false);
  const [editingBatch, setEditingBatch] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [segmentDraft, setSegmentDraft] = useState<SegmentFilter[]>([]);
  const [savingBatch, setSavingBatch] = useState(false);
  const [editConversionMode, setEditConversionMode] = useState<"course" | "label" | "none" | "">("");
  const [editConversionCourseId, setEditConversionCourseId] = useState("");
  const [editConversionLabel, setEditConversionLabel] = useState("");
  const [busyRecipientId, setBusyRecipientId] = useState<string | null>(null);
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

  async function saveBatchEdits() {
    const conversionTag = buildEditConversionTag();
    if (!conversionTag) return;
    setSavingBatch(true);
    try {
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
    } finally {
      setSavingBatch(false);
    }
  }

  async function saveMessage() {
    setSavingMessage(true);
    try {
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
    } finally {
      setSavingMessage(false);
    }
  }

  async function toggleSent(recipient: WhatsAppRecipientRow) {
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
      setDetail((prev) => {
        const recipients = prev.recipients.map((r) => (r.id === recipient.id ? { ...r, status: nextStatus } : r));
        return { ...prev, recipients, sentCount: recipients.filter((r) => r.status === "sent").length };
      });
    } finally {
      setBusyRecipientId(null);
    }
  }

  async function goBackInQueue() {
    if (!lastQueueSentId) return;
    const recipient = detail.recipients.find((r) => r.id === lastQueueSentId);
    setLastQueueSentId(null);
    if (!recipient) return;
    await toggleSent(recipient);
  }

  const filteredRecipients =
    recipientSearch.trim() === ""
      ? detail.recipients
      : detail.recipients.filter((r) => r.fullName.toLowerCase().includes(recipientSearch.trim().toLowerCase()));

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/admin/crm?tab=whatsapp"
          className="inline-flex items-center gap-2 font-body text-sm text-pz-on-surface-variant hover:text-pz-primary transition-colors"
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

      <div className="bg-pz-surface-container-highest rounded-xl p-3">
        {editingBatch ? (
          <div className="space-y-3">
            <input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              className="w-full rounded-xl border border-pz-outline-variant px-3 py-2 font-body text-sm font-semibold"
            />
            <SegmentBuilder value={segmentDraft} onChange={setSegmentDraft} channel="whatsapp" />
            <div className="space-y-2">
              <h3 className="font-headline text-sm font-semibold">Track conversion</h3>
              <div className="flex gap-3 flex-wrap">
                <label className="flex items-center gap-1.5 text-sm font-body cursor-pointer">
                  <input type="radio" name="editConversionMode" checked={editConversionMode === "course"} onChange={() => setEditConversionMode("course")} />
                  Existing course
                </label>
                <label className="flex items-center gap-1.5 text-sm font-body cursor-pointer">
                  <input type="radio" name="editConversionMode" checked={editConversionMode === "label"} onChange={() => setEditConversionMode("label")} />
                  Other course (type to match)
                </label>
                <label className="flex items-center gap-1.5 text-sm font-body cursor-pointer">
                  <input type="radio" name="editConversionMode" checked={editConversionMode === "none"} onChange={() => setEditConversionMode("none")} />
                  Not tracking conversion
                </label>
              </div>
              {editConversionMode === "course" && (
                <select value={editConversionCourseId} onChange={(e) => setEditConversionCourseId(e.target.value)} className="w-full rounded-xl border border-pz-outline-variant px-4 py-2 font-body text-sm">
                  <option value="">Select a course…</option>
                  {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              )}
              {editConversionMode === "label" && (
                <input value={editConversionLabel} onChange={(e) => setEditConversionLabel(e.target.value)} placeholder="Text to match in the purchase's product label"
                  className="w-full rounded-xl border border-pz-outline-variant px-4 py-2 font-body text-sm" />
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={saveBatchEdits} disabled={savingBatch || nameDraft.trim() === "" || buildEditConversionTag() === null}
                className="px-4 py-1.5 rounded-full bg-pz-primary text-pz-on-primary font-headline text-xs font-semibold disabled:opacity-50">
                {savingBatch ? "Saving…" : "Save batch"}
              </button>
              <button onClick={() => setEditingBatch(false)} disabled={savingBatch}
                className="px-4 py-1.5 rounded-full bg-pz-surface-variant text-pz-on-surface-variant font-headline text-xs font-semibold">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-3">
            <p className="font-body font-semibold text-sm flex-1">{detail.name}</p>
            <button
              onClick={() => { setNameDraft(detail.name); setSegmentDraft(detail.segment); loadEditConversionTag(); setEditingBatch(true); }}
              className="font-body text-xs font-semibold text-pz-primary hover:underline shrink-0"
            >
              Edit batch
            </button>
          </div>
        )}
      </div>

      <div className="bg-pz-surface-container-highest rounded-xl p-3">
        {editingMessage ? (
          <div className="space-y-2">
            <textarea value={messageDraft} onChange={(e) => setMessageDraft(e.target.value)} rows={4}
              className="w-full rounded-xl border border-pz-outline-variant px-3 py-2 font-body text-sm" />
            <div className="flex gap-2">
              <button onClick={saveMessage} disabled={savingMessage || messageDraft.trim() === ""}
                className="px-4 py-1.5 rounded-full bg-pz-primary text-pz-on-primary font-headline text-xs font-semibold disabled:opacity-50">
                {savingMessage ? "Saving…" : "Save message"}
              </button>
              <button onClick={() => setEditingMessage(false)} disabled={savingMessage}
                className="px-4 py-1.5 rounded-full bg-pz-surface-variant text-pz-on-surface-variant font-headline text-xs font-semibold">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-3">
            <p className="font-body text-xs text-pz-on-surface-variant whitespace-pre-wrap flex-1">{detail.messageTemplate}</p>
            <button onClick={() => { setMessageDraft(detail.messageTemplate); setEditingMessage(true); }}
              className="font-body text-xs font-semibold text-pz-primary hover:underline shrink-0">
              Edit message
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <input
          value={recipientSearch}
          onChange={(e) => setRecipientSearch(e.target.value)}
          placeholder="Search recipients…"
          className="rounded-xl border border-pz-outline-variant px-3 py-1.5 font-body text-sm w-64"
        />
        <button onClick={() => setQueueMode((v) => !v)} className="font-body text-xs font-semibold text-pz-primary hover:underline">
          {queueMode ? "Switch to table view" : "Switch to queue mode"}
        </button>
      </div>

      {queueMode ? (
        (() => {
          const pending = detail.recipients.filter((r) => r.status === "pending");
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
                    className="inline-block px-5 py-2 rounded-full bg-pz-primary text-pz-on-primary font-headline text-sm font-semibold"
                  >
                    Open chat
                  </a>
                )}
                {lastQueueSentId && (
                  <button onClick={goBackInQueue} className="font-body text-xs font-semibold text-pz-on-surface-variant hover:underline">
                    ← Back (undo last send)
                  </button>
                )}
              </div>
            </div>
          );
        })()
      ) : filteredRecipients.length === 0 ? (
        <p className="font-body text-sm text-pz-on-surface-variant py-4">
          {recipientSearch ? `No recipients match "${recipientSearch}".` : "No recipients yet."}
        </p>
      ) : (
        <table className="w-full text-left font-body text-sm">
          <thead className="text-pz-on-surface-variant text-xs uppercase">
            <tr><th className="py-1">Name</th><th>Phone</th><th></th><th></th><th>Converted</th></tr>
          </thead>
          <tbody>
            {filteredRecipients.map((r) => (
              <tr key={r.id} className="border-t border-pz-outline-variant">
                <td className="py-1">
                  {/* WhatsAppRecipientRow has no contactId yet — plain text
                      here; Task 17 adds contactId and turns this into a link. */}
                  {r.fullName || "—"}
                </td>
                <td>{r.phoneE164}</td>
                <td>
                  <a href={buildWhatsAppLink(r.phoneE164, detail.messageTemplate, r.fullName)} className="text-pz-primary underline text-xs font-semibold">
                    Open chat
                  </a>
                </td>
                <td>
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input type="checkbox" checked={r.status === "sent"} disabled={busyRecipientId === r.id} onChange={() => toggleSent(r)} />
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
      )}
    </div>
  );
}
```

- [ ] **Step 3: Strip the accordion from `WhatsAppPanel` and navigate instead**

In `src/components/admin/crm/WhatsAppPanel.tsx`:
- Delete: `openId`, `detail`, `busyRecipientId`, `editingMessage`, `messageDraft`, `savingMessage`, `editingBatch`, `nameDraft`, `segmentDraft`, `savingBatch`, `editConversionMode`/`editConversionCourseId`/`editConversionLabel`, `queueMode`, `lastQueueSentId`, `queueLinkRef` state and the `toggleDetail`, `saveBatchEdits`, `deleteBatch`'s `if (openId === b.id) {...}` clause (keep the rest of `deleteBatch`), `saveMessage`, `toggleSent`, `goBackInQueue`, `buildEditConversionTag`, `loadEditConversionTag` functions, and the `useEffect` that focuses `queueLinkRef`.
- Keep: `name`, `message`, `segment`, `creating`, `createError`, `conversionMode`/`conversionCourseId`/`conversionLabel`, `courses`, `duplicatingId`, `deletingId`, `createBatch`, `insertTag`, `duplicateBatch`, `buildConversionTag` — all of that is create-form and list-row behavior, unrelated to the accordion.
- Replace the batch name button (line 416) with a `Link`:

```tsx
<Link href={`/dashboard/admin/crm/whatsapp/${b.id}`} className="flex-1 flex items-center justify-between text-left">
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
```
- Add `import Link from "next/link";` at the top.
- Delete the entire `{openId === b.id && (...)}` block that followed the row's action buttons.

- [ ] **Step 4: Typecheck and test**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: no errors.

Run: `./node_modules/.bin/vitest run`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/admin/crm/whatsapp src/components/admin/crm/WhatsAppBatchDetailClient.tsx src/components/admin/crm/WhatsAppPanel.tsx
git commit -m "feat: add WhatsApp batch detail page, drop inline accordion from batch list"
```

---

## Task 4: Cohort detail page

**Files:**
- Modify: `src/lib/data/admin-crm-import.ts`
- Create: `src/app/dashboard/admin/crm/cohorts/[id]/page.tsx`
- Create: `src/components/admin/crm/CohortDetailClient.tsx`
- Modify: `src/components/admin/crm/CohortsPanel.tsx`

**Interfaces:**
- Consumes: nothing new from other tasks.
- Produces: `getCohortDetail(id): Promise<CohortDetail | null>`, exported from `admin-crm-import.ts` for this task's page to call.

- [ ] **Step 1: Add `getCohortDetail` to the data layer**

Add to `src/lib/data/admin-crm-import.ts`, directly after `listCohorts` (after line 106):

```ts
export type CohortContactRow = {
  contactId: string;
  fullName: string;
  email: string | null;
  phoneE164: string | null;
  productLabel: string;
};

export type CohortDetail = CohortRow & { contacts: CohortContactRow[] };

/** Feeds the Cohort detail page — every purchase this sheet import produced, joined back to its contact. */
export async function getCohortDetail(id: string): Promise<CohortDetail | null> {
  const admin = createAdminSupabase();
  const { data: batch } = await admin
    .from("import_batches")
    .select("id, sheet_name, tab_name, rows_imported, created_at, course_id, courses(title)")
    .eq("id", id)
    .maybeSingle();
  if (!batch) return null;

  const { data: purchases } = await admin
    .from("contact_purchases")
    .select("contact_id, product_label, contacts(full_name, email, phone_e164)")
    .eq("import_batch_id", id);

  const rows = purchases ?? [];
  const contacts: CohortContactRow[] = rows.map((p) => {
    const contact = p.contacts as { full_name: string; email: string | null; phone_e164: string | null } | null;
    return {
      contactId: p.contact_id,
      fullName: contact?.full_name ?? "",
      email: contact?.email ?? null,
      phoneE164: contact?.phone_e164 ?? null,
      productLabel: p.product_label,
    };
  });

  return {
    id: batch.id,
    sheetName: batch.sheet_name || "(untitled sheet)",
    tabName: batch.tab_name,
    rowsImported: batch.rows_imported,
    createdAt: batch.created_at,
    courseId: batch.course_id,
    courseTitle: (batch.courses as { title: string } | null)?.title ?? null,
    purchaseCount: rows.length,
    contacts,
  };
}
```

- [ ] **Step 2: Write the page**

```tsx
// src/app/dashboard/admin/crm/cohorts/[id]/page.tsx
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { getCohortDetail } from "@/lib/data/admin-crm-import";
import { CohortDetailClient } from "@/components/admin/crm/CohortDetailClient";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cohort = await getCohortDetail(id);
  return { title: cohort ? `${cohort.sheetName} — PZ Academy CRM` : "Cohort — PZ Academy CRM" };
}

export default async function CohortDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  const cohort = await getCohortDetail(id);
  if (!cohort) notFound();

  return <CohortDetailClient cohort={cohort} />;
}
```

- [ ] **Step 3: Write the client component**

```tsx
// src/components/admin/crm/CohortDetailClient.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { formatDate } from "@/lib/format";
import type { CohortDetail } from "@/lib/data/admin-crm-import";

export function CohortDetailClient({ cohort }: { cohort: CohortDetail }) {
  const [search, setSearch] = useState("");
  const filtered =
    search.trim() === ""
      ? cohort.contacts
      : cohort.contacts.filter((c) => c.fullName.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/admin/crm?tab=cohorts"
          className="inline-flex items-center gap-2 font-body text-sm text-pz-on-surface-variant hover:text-pz-primary transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Cohorts
        </Link>
        <h1 className="font-headline font-bold text-2xl text-pz-secondary mt-3">
          {cohort.sheetName} — {cohort.tabName}
        </h1>
        <p className="font-body text-sm text-pz-on-surface-variant mt-1">
          {cohort.courseTitle ? <span>{cohort.courseTitle}</span> : <span className="text-pz-danger">untagged</span>}
          {" · "}Imported {formatDate(cohort.createdAt)} · {cohort.purchaseCount} of {cohort.rowsImported} rows still attached
        </p>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-headline font-bold text-lg">Contacts</h2>
        {cohort.contacts.length > 0 && (
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search contacts…"
            className="rounded-xl border border-pz-outline-variant px-3 py-1.5 font-body text-sm w-64"
          />
        )}
      </div>
      {filtered.length === 0 ? (
        <p className="font-body text-sm text-pz-on-surface-variant py-4">
          {search ? `No contacts match "${search}".` : "No contacts attached to this cohort."}
        </p>
      ) : (
        <table className="w-full text-left font-body text-sm">
          <thead className="text-pz-on-surface-variant text-xs uppercase">
            <tr><th className="py-1">Name</th><th>Email</th><th>Phone</th><th>Product</th></tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={`${c.contactId}-${c.productLabel}`} className="border-t border-pz-outline-variant">
                <td className="py-1">
                  <Link href={`/dashboard/admin/crm/contacts/${c.contactId}`} className="underline">
                    {c.fullName || "—"}
                  </Link>
                </td>
                <td>{c.email ?? "—"}</td>
                <td>{c.phoneE164 ?? "—"}</td>
                <td>{c.productLabel || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Link the sheet name in `CohortsPanel`**

In `src/components/admin/crm/CohortsPanel.tsx`, add `import Link from "next/link";` and change the sheet-name cell:

```tsx
<td className="py-2">
  <Link href={`/dashboard/admin/crm/cohorts/${c.id}`} className="underline">
    {c.sheetName}
  </Link>
</td>
```

- [ ] **Step 5: Typecheck and test**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: no errors.

Run: `./node_modules/.bin/vitest run`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/data/admin-crm-import.ts src/app/dashboard/admin/crm/cohorts src/components/admin/crm/CohortDetailClient.tsx src/components/admin/crm/CohortsPanel.tsx
git commit -m "feat: add Cohort detail page listing its imported contacts"
```

---

## Task 5: Agent detail page

**Files:**
- Modify: `src/lib/data/leads.ts`
- Modify: `src/lib/data/admin-crm-agents.ts`
- Create: `src/app/dashboard/admin/crm/agents/[id]/page.tsx`
- Create: `src/components/admin/crm/AgentDetailClient.tsx`
- Modify: `src/components/admin/crm/AgentsPanel.tsx`

**Interfaces:**
- Consumes: nothing new from other tasks.
- Produces: `listLeadsByAgent(agentId): Promise<AgentLeadRow[]>` (`src/lib/data/leads.ts`); `getAgentDetail(id): Promise<AgentDetail | null>` (`src/lib/data/admin-crm-agents.ts`).

- [ ] **Step 1: Add `listLeadsByAgent` to the leads data layer**

Add to `src/lib/data/leads.ts`, after `countRecentLeadsByAgent` (after line 56):

```ts
export type AgentLeadRow = {
  id: string;
  name: string | null;
  phone: string;
  profession: string | null;
  status: string;
  createdAt: string;
};

export async function listLeadsByAgent(agentId: string): Promise<AgentLeadRow[]> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("leads")
    .select("id, name, phone, profession, status, created_at")
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false });
  return (data ?? []).map((l) => ({
    id: l.id,
    name: l.name,
    phone: l.phone,
    profession: l.profession,
    status: l.status,
    createdAt: l.created_at,
  }));
}
```

- [ ] **Step 2: Add `getAgentDetail` to the agents data layer**

Add to `src/lib/data/admin-crm-agents.ts`:

```ts
import { listLeadsByAgent, type AgentLeadRow } from "./leads";

export type AgentDetail = Agent & { leads: AgentLeadRow[] };

export async function getAgentDetail(id: string): Promise<AgentDetail | null> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("agents")
    .select("id, name, token, active, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;

  const leads = await listLeadsByAgent(id);
  return { id: data.id, name: data.name, token: data.token, active: data.active, createdAt: data.created_at, leads };
}
```

(Add the `import` line at the top of the file, alongside the existing `createAdminSupabase` import.)

- [ ] **Step 3: Write the page**

```tsx
// src/app/dashboard/admin/crm/agents/[id]/page.tsx
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { getAgentDetail } from "@/lib/data/admin-crm-agents";
import { AgentDetailClient } from "@/components/admin/crm/AgentDetailClient";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agent = await getAgentDetail(id);
  return { title: agent ? `${agent.name} — PZ Academy CRM` : "Agent — PZ Academy CRM" };
}

export default async function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  const agent = await getAgentDetail(id);
  if (!agent) notFound();

  return <AgentDetailClient agent={agent} />;
}
```

- [ ] **Step 4: Write the client component**

Reuse the exact `agentLink`/`CopyLinkButton` helpers already in `AgentsPanel.tsx` (copy them into this file rather than importing from a `"use client"` panel file, to keep the two components independent):

```tsx
// src/components/admin/crm/AgentDetailClient.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";
import type { AgentDetail } from "@/lib/data/admin-crm-agents";

function agentLink(token: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/leads/add/${token}`;
}

function CopyLinkButton({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard
      .writeText(agentLink(token))
      .then(() => { setCopied(true); toast.success("Link copied."); setTimeout(() => setCopied(false), 2000); })
      .catch(() => toast.error("Could not copy the link."));
  }
  return (
    <button type="button" onClick={copy} title="Copy link"
      className="inline-flex items-center gap-1.5 rounded-md border border-pz-outline-variant px-3 py-1.5 font-body text-xs font-medium text-pz-on-surface-variant hover:bg-pz-surface-container-highest transition-colors">
      {copied ? <Check className="w-3.5 h-3.5 text-pz-primary" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? "Copied" : "Copy link"}
    </button>
  );
}

export function AgentDetailClient({ agent }: { agent: AgentDetail }) {
  const [search, setSearch] = useState("");
  const filtered =
    search.trim() === ""
      ? agent.leads
      : agent.leads.filter((l) => (l.name ?? "").toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/admin/crm?tab=agents"
          className="inline-flex items-center gap-2 font-body text-sm text-pz-on-surface-variant hover:text-pz-primary transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Agents
        </Link>
        <div className="flex flex-wrap items-center gap-3 mt-3">
          <h1 className="font-headline font-bold text-2xl text-pz-secondary">{agent.name}</h1>
          <span className={agent.active ? "inline-flex rounded-full bg-pz-primary-container px-2.5 py-1 text-xs font-semibold text-pz-on-primary-container" : "inline-flex rounded-full bg-pz-surface-container-highest px-2.5 py-1 text-xs font-semibold text-pz-on-surface-variant"}>
            {agent.active ? "Active" : "Inactive"}
          </span>
        </div>
        <p className="font-body text-sm text-pz-on-surface-variant mt-1">Created {formatDate(agent.createdAt)}</p>
        <div className="mt-2"><CopyLinkButton token={agent.token} /></div>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-headline font-bold text-lg">Leads ({agent.leads.length})</h2>
        {agent.leads.length > 0 && (
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search leads…"
            className="rounded-xl border border-pz-outline-variant px-3 py-1.5 font-body text-sm w-64"
          />
        )}
      </div>
      {filtered.length === 0 ? (
        <p className="font-body text-sm text-pz-on-surface-variant py-4">
          {search ? `No leads match "${search}".` : "No leads submitted through this link yet."}
        </p>
      ) : (
        <table className="w-full text-left font-body text-sm">
          <thead className="text-pz-on-surface-variant text-xs uppercase">
            <tr><th className="py-1">Name</th><th>Phone</th><th>Profession</th><th>Status</th><th>Submitted</th></tr>
          </thead>
          <tbody>
            {filtered.map((l) => (
              <tr key={l.id} className="border-t border-pz-outline-variant">
                <td className="py-1">{l.name || "—"}</td>
                <td>{l.phone}</td>
                <td>{l.profession ?? "—"}</td>
                <td>{l.status}</td>
                <td>{formatDate(l.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Link the agent name in `AgentsPanel`**

In `src/components/admin/crm/AgentsPanel.tsx`, add `import Link from "next/link";` and change the name cell:

```tsx
<td className="py-2">
  <Link href={`/dashboard/admin/crm/agents/${a.id}`} className="underline">
    {a.name}
  </Link>
</td>
```

- [ ] **Step 6: Typecheck and test**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: no errors.

Run: `./node_modules/.bin/vitest run`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/data/leads.ts src/lib/data/admin-crm-agents.ts src/app/dashboard/admin/crm/agents src/components/admin/crm/AgentDetailClient.tsx src/components/admin/crm/AgentsPanel.tsx
git commit -m "feat: add Agent detail page listing leads submitted through their link"
```

---

## Task 6: Simplify the Conversion tab

**Files:**
- Modify: `src/components/admin/crm/ConversionPanel.tsx`

**Interfaces:**
- Consumes: nothing new (still takes `items: ConversionTrackedItem[]`, unchanged prop shape).
- Produces: nothing new for later tasks.

Now that WhatsApp and Campaign both have real detail pages with recipient-level views, `ConversionPanel`'s own accordion (which fetched the same data a second way) is redundant. Replace it with a plain summary list that links out.

- [ ] **Step 1: Replace the component body**

```tsx
// src/components/admin/crm/ConversionPanel.tsx
"use client";

import Link from "next/link";
import type { ConversionTag } from "@/lib/crm/conversion";

export type ConversionTrackedItem = {
  kind: "whatsapp" | "campaign";
  id: string;
  name: string;
  conversionTag: ConversionTag;
  conversionCourseTitle: string | null;
  conversion: { converted: number; total: number };
};

export function ConversionPanel({ items }: { items: ConversionTrackedItem[] }) {
  const sorted = [...items].sort((a, b) => {
    const pctA = a.conversion.total > 0 ? a.conversion.converted / a.conversion.total : 0;
    const pctB = b.conversion.total > 0 ? b.conversion.converted / b.conversion.total : 0;
    return pctB - pctA;
  });

  return (
    <div className="space-y-3">
      <div>
        <h2 className="font-headline font-bold text-lg">Conversion</h2>
        <p className="font-body text-xs text-pz-on-surface-variant mt-1 max-w-2xl">
          A recipient counts as converted if they bought the tagged course within 30 days of being sent this
          batch or campaign. Everyone else is &quot;Not converted (yet)&quot; — an absence, not a claim that
          they lost interest. Click through to a batch or campaign for the full recipient list.
        </p>
      </div>
      {sorted.length === 0 ? (
        <p className="font-body text-sm text-pz-on-surface-variant py-8 text-center">
          No tracked batches or campaigns yet. Tag one with a course when you create it.
        </p>
      ) : (
        <div className="space-y-2">
          {sorted.map((item) => {
            const pct = item.conversion.total > 0 ? Math.round((item.conversion.converted / item.conversion.total) * 100) : 0;
            const courseLabel =
              item.conversionTag.kind === "course"
                ? item.conversionCourseTitle ?? "—"
                : item.conversionTag.kind === "label"
                  ? `"${item.conversionTag.pattern}"`
                  : "";
            const href = item.kind === "whatsapp" ? `/dashboard/admin/crm/whatsapp/${item.id}` : `/dashboard/admin/crm/campaigns/${item.id}`;
            return (
              <Link key={`${item.kind}:${item.id}`} href={href} className="block bg-pz-surface-container-high rounded-2xl p-4 hover:bg-pz-surface-container-highest transition-colors">
                <div className="w-full flex items-center justify-between text-left gap-3">
                  <span className="font-body font-semibold text-sm flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded-full bg-pz-surface-variant text-pz-on-surface-variant text-[10px] font-bold uppercase shrink-0">
                      {item.kind === "whatsapp" ? "WhatsApp" : "Email"}
                    </span>
                    {item.name}
                    <span className="font-normal text-pz-on-surface-variant text-xs">{courseLabel}</span>
                  </span>
                  <span className="font-body text-xs text-pz-on-surface-variant tabular-nums shrink-0">
                    {pct}% converted ({item.conversion.converted}/{item.conversion.total})
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and test**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: no errors.

Run: `./node_modules/.bin/vitest run`
Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/crm/ConversionPanel.tsx
git commit -m "refactor: simplify Conversion tab into a summary list linking to real detail pages"
```

---

## Task 7: Cohorts list search

**Files:**
- Modify: `src/components/admin/crm/CohortsPanel.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new for later tasks.

- [ ] **Step 1: Add a client-side instant filter**

In `src/components/admin/crm/CohortsPanel.tsx`, add search state and a filtered list:

```tsx
const [search, setSearch] = useState("");
const filtered =
  search.trim() === ""
    ? cohorts
    : cohorts.filter((c) => {
        const q = search.trim().toLowerCase();
        return c.sheetName.toLowerCase().includes(q) || c.tabName.toLowerCase().includes(q);
      });
```

Replace the early-return empty state and the `cohorts.map` in the render with `filtered`-aware versions:

```tsx
return (
  <div className="space-y-3">
    {cohorts.length > 0 && (
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by sheet or tab name…"
        className="rounded-xl border border-pz-outline-variant px-3 py-1.5 font-body text-sm w-64"
      />
    )}
    {cohorts.length === 0 ? (
      <p className="font-body text-sm text-pz-on-surface-variant py-8 text-center">No cohorts imported yet.</p>
    ) : filtered.length === 0 ? (
      <p className="font-body text-sm text-pz-on-surface-variant py-8 text-center">No cohorts match &quot;{search}&quot;.</p>
    ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-left font-body text-sm">
          <thead className="text-pz-on-surface-variant text-xs uppercase">
            <tr>
              <th className="py-2">Sheet</th>
              <th>Tab</th>
              <th>Course</th>
              <th>Purchases</th>
              <th>Imported</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              // ...existing row markup, unchanged...
            ))}
          </tbody>
        </table>
      </div>
    )}
  </div>
);
```

(Keep the existing row markup — including the Task 4 `Link` change — exactly as-is inside the `filtered.map`; only the wrapping structure and the `cohorts.map`→`filtered.map` swap change here.)

- [ ] **Step 2: Typecheck and test**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: no errors.

Run: `./node_modules/.bin/vitest run`
Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/crm/CohortsPanel.tsx
git commit -m "feat: add search to the Cohorts list"
```

---

## Task 8: WhatsApp batches list search

**Files:**
- Modify: `src/components/admin/crm/WhatsAppPanel.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new for later tasks.

- [ ] **Step 1: Add a client-side instant filter**

In `src/components/admin/crm/WhatsAppPanel.tsx`, add:

```tsx
const [batchSearch, setBatchSearch] = useState("");
const filteredBatches =
  batchSearch.trim() === "" ? batches : batches.filter((b) => b.name.toLowerCase().includes(batchSearch.trim().toLowerCase()));
```

In the render, add the search input next to the "Batches" heading and swap `batches.map`/`batches.length === 0` for `filteredBatches`:

```tsx
<div className="flex items-center justify-between flex-wrap gap-2 mb-3">
  <h2 className="font-headline font-bold text-lg">Batches</h2>
  {batches.length > 0 && (
    <input
      value={batchSearch}
      onChange={(e) => setBatchSearch(e.target.value)}
      placeholder="Search batches…"
      className="rounded-xl border border-pz-outline-variant px-3 py-1.5 font-body text-sm w-64"
    />
  )}
</div>
{batches.length === 0 ? (
  <p className="font-body text-sm text-pz-on-surface-variant py-8 text-center">No WhatsApp batches yet.</p>
) : filteredBatches.length === 0 ? (
  <p className="font-body text-sm text-pz-on-surface-variant py-8 text-center">No batches match &quot;{batchSearch}&quot;.</p>
) : (
  <div className="space-y-2">
    {filteredBatches.map((b) => (
      // ...existing row markup from Task 3, unchanged...
    ))}
  </div>
)}
```

- [ ] **Step 2: Typecheck and test**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: no errors.

Run: `./node_modules/.bin/vitest run`
Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/crm/WhatsAppPanel.tsx
git commit -m "feat: add search to the WhatsApp batches list"
```

---

## Task 9: Agents list search

**Files:**
- Modify: `src/components/admin/crm/AgentsPanel.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new for later tasks.

- [ ] **Step 1: Add a client-side instant filter**

In `src/components/admin/crm/AgentsPanel.tsx`, add:

```tsx
const [search, setSearch] = useState("");
const filteredAgents = search.trim() === "" ? agents : agents.filter((a) => a.name.toLowerCase().includes(search.trim().toLowerCase()));
```

Add the search input above the table and swap `agents.map`/`agents.length === 0` for `filteredAgents`:

```tsx
{agents.length > 0 && (
  <input
    value={search}
    onChange={(e) => setSearch(e.target.value)}
    placeholder="Search agents…"
    className="rounded-xl border border-pz-outline-variant px-3 py-1.5 font-body text-sm w-64"
  />
)}
{agents.length === 0 ? (
  <p className="font-body text-sm text-pz-on-surface-variant py-8 text-center">No agents yet.</p>
) : filteredAgents.length === 0 ? (
  <p className="font-body text-sm text-pz-on-surface-variant py-8 text-center">No agents match &quot;{search}&quot;.</p>
) : (
  <div className="overflow-x-auto">
    <table className="w-full text-left font-body text-sm">
      {/* ...unchanged thead... */}
      <tbody>
        {filteredAgents.map((a) => (
          // ...existing row markup from Task 5, unchanged...
        ))}
      </tbody>
    </table>
  </div>
)}
```

- [ ] **Step 2: Typecheck and test**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: no errors.

Run: `./node_modules/.bin/vitest run`
Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/crm/AgentsPanel.tsx
git commit -m "feat: add search to the Agents list"
```

---

## Task 10: Manual conversions migration

**Files:**
- Create: `supabase/migrations/0059_crm_manual_conversions.sql`
- Modify: `src/lib/supabase/database.types.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `public.manual_conversions` table, hand-typed in `database.types.ts` for later tasks' data layer to use.

- [ ] **Step 1: Write the migration**

```sql
-- 0059_crm_manual_conversions.sql
--
-- Lets an admin record that a contact converted for a program independent
-- of any batch/campaign and the automatic purchase-matching window in
-- src/lib/crm/conversion.ts. Exactly one of course_id/program_label is set
-- per row (enforced in application code, mirroring how ConversionTag's
-- course-vs-label duality is validated elsewhere — see toConversionTag /
-- fromConversionTag in admin-crm-conversions.ts) — never counted into any
-- batch/campaign's computed conversion percentage.

create table if not exists public.manual_conversions (
  id            uuid primary key default gen_random_uuid(),
  contact_id    uuid not null references public.contacts(id) on delete cascade,
  course_id     uuid references public.courses(id) on delete set null,
  program_label text,
  converted_at  date not null default current_date,
  note          text,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists manual_conversions_contact_idx on public.manual_conversions (contact_id);

alter table public.manual_conversions enable row level security;
```

- [ ] **Step 2: Hand-add the `database.types.ts` entry**

In `src/lib/supabase/database.types.ts`, insert the following immediately after the `crm_contact_segment_source` table's closing `}` (the line right before the `Tables` object's own closing `}` and `Functions: {`):

```ts
      manual_conversions: {
        Row: {
          contact_id: string
          converted_at: string
          course_id: string | null
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          program_label: string | null
        }
        Insert: {
          contact_id: string
          converted_at?: string
          course_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          program_label?: string | null
        }
        Update: {
          contact_id?: string
          converted_at?: string
          course_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          program_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "manual_conversions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_conversions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
```

- [ ] **Step 3: Typecheck**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: no errors (this table isn't referenced by any code yet, so this step only confirms the hand-added types themselves are syntactically valid TypeScript).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0059_crm_manual_conversions.sql src/lib/supabase/database.types.ts
git commit -m "feat: add manual_conversions table"
```

---

## Task 11: Manual conversion pure helpers

**Files:**
- Create: `src/lib/crm/manual-conversion.ts`
- Test: `tests/crm-manual-conversion.test.ts`

**Interfaces:**
- Consumes: `ConversionTag` type from `src/lib/crm/conversion.ts` (already exists).
- Produces: `ManualConversionProgram` type, `toManualConversionProgram(courseId, programLabel): ManualConversionProgram | null`, `fromManualConversionProgram(program): { course_id: string | null; program_label: string | null }` — for Task 13's data layer.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/crm-manual-conversion.test.ts
import { describe, it, expect } from "vitest";
import { toManualConversionProgram, fromManualConversionProgram } from "@/lib/crm/manual-conversion";

describe("toManualConversionProgram", () => {
  it("returns a course program when course_id is set", () => {
    expect(toManualConversionProgram("course-1", null)).toEqual({ kind: "course", courseId: "course-1" });
  });

  it("returns a label program when program_label is set", () => {
    expect(toManualConversionProgram(null, "Advanced Mixing")).toEqual({ kind: "label", pattern: "Advanced Mixing" });
  });

  it("returns null when neither is set", () => {
    expect(toManualConversionProgram(null, null)).toBeNull();
  });

  it("returns null when both are set — ambiguous, not a valid stored row", () => {
    expect(toManualConversionProgram("course-1", "Advanced Mixing")).toBeNull();
  });
});

describe("fromManualConversionProgram", () => {
  it("maps a course program to course_id only", () => {
    expect(fromManualConversionProgram({ kind: "course", courseId: "course-1" })).toEqual({
      course_id: "course-1",
      program_label: null,
    });
  });

  it("maps a label program to program_label only", () => {
    expect(fromManualConversionProgram({ kind: "label", pattern: "Advanced Mixing" })).toEqual({
      course_id: null,
      program_label: "Advanced Mixing",
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `./node_modules/.bin/vitest run tests/crm-manual-conversion.test.ts`
Expected: FAIL — `Cannot find module '@/lib/crm/manual-conversion'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/crm/manual-conversion.ts
/**
 * A manual conversion's program reuses ConversionTag's course/label shape
 * (never "none" — a manual conversion always names a program) so the
 * concept of "which program" stays in one vocabulary across the automatic
 * and manual conversion systems. Pure translation only; no I/O — mirrors
 * toConversionTag/fromConversionTag in admin-crm-conversions.ts.
 */
export type ManualConversionProgram = { kind: "course"; courseId: string } | { kind: "label"; pattern: string };

export function toManualConversionProgram(courseId: string | null, programLabel: string | null): ManualConversionProgram | null {
  if (courseId !== null && programLabel !== null) return null;
  if (courseId !== null) return { kind: "course", courseId };
  if (programLabel !== null) return { kind: "label", pattern: programLabel };
  return null;
}

export function fromManualConversionProgram(program: ManualConversionProgram): { course_id: string | null; program_label: string | null } {
  if (program.kind === "course") return { course_id: program.courseId, program_label: null };
  return { course_id: null, program_label: program.pattern };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `./node_modules/.bin/vitest run tests/crm-manual-conversion.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/crm/manual-conversion.ts tests/crm-manual-conversion.test.ts
git commit -m "feat: add pure course-or-label translation for manual conversions"
```

---

## Task 12: Manual conversion validation schemas

**Files:**
- Modify: `src/lib/validations/crm.ts`
- Modify: `tests/crm.schema.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `manualConversionProgramSchema`, `manualConversionCreateSchema` — for Task 14's API routes.

- [ ] **Step 1: Write the failing tests**

Add to `tests/crm.schema.test.ts` — add `manualConversionCreateSchema` to the existing `import { ... } from "@/lib/validations/crm";` block, and append:

```ts
describe("manualConversionCreateSchema", () => {
  it("accepts a single contact with a course program", () => {
    const parsed = manualConversionCreateSchema.safeParse({
      contactIds: ["11111111-1111-1111-1111-111111111111"],
      program: { kind: "course", courseId: "22222222-2222-2222-2222-222222222222" },
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts several contacts with a label program, plus a note", () => {
    const parsed = manualConversionCreateSchema.safeParse({
      contactIds: ["11111111-1111-1111-1111-111111111111", "33333333-3333-3333-3333-333333333333"],
      program: { kind: "label", pattern: "Advanced Mixing" },
      note: "Confirmed by phone",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an empty contactIds array", () => {
    const parsed = manualConversionCreateSchema.safeParse({
      contactIds: [],
      program: { kind: "label", pattern: "Advanced Mixing" },
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a program with neither courseId nor pattern (kind omitted)", () => {
    const parsed = manualConversionCreateSchema.safeParse({
      contactIds: ["11111111-1111-1111-1111-111111111111"],
      program: {},
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a program of kind 'none' — a manual conversion always names a program", () => {
    const parsed = manualConversionCreateSchema.safeParse({
      contactIds: ["11111111-1111-1111-1111-111111111111"],
      program: { kind: "none" },
    });
    expect(parsed.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `./node_modules/.bin/vitest run tests/crm.schema.test.ts`
Expected: FAIL — `manualConversionCreateSchema` is not exported.

- [ ] **Step 3: Write the schemas**

Add to `src/lib/validations/crm.ts`, after `conversionTagSchema` (after line 109):

```ts
export const manualConversionProgramSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("course"), courseId: z.string().uuid() }),
  z.object({ kind: z.literal("label"), pattern: z.string().trim().min(1, "Pattern is required").max(200) }),
]);

export const manualConversionCreateSchema = z.object({
  contactIds: z.array(z.string().uuid()).min(1, "Select at least one contact").max(500),
  program: manualConversionProgramSchema,
  convertedAt: z.string().trim().min(1).optional(),
  note: z.string().trim().max(1000).optional(),
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `./node_modules/.bin/vitest run tests/crm.schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validations/crm.ts tests/crm.schema.test.ts
git commit -m "feat: add validation schema for manual conversion requests"
```

---

## Task 13: Manual conversion data layer

**Files:**
- Create: `src/lib/data/admin-crm-manual-conversions.ts`

**Interfaces:**
- Consumes: `toManualConversionProgram`/`fromManualConversionProgram`/`ManualConversionProgram` (Task 11).
- Produces: `ManualConversionRow`, `listManualConversions(contactId)`, `createManualConversions(contactIds, program, convertedAt, note, createdBy)`, `deleteManualConversion(id): Promise<{ ok: true } | { ok: false; reason: "not-found" | "db-error" }>`, `listContactIdsWithManualConversion(contactIds): Promise<Set<string>>` — the last one for Task 17.

- [ ] **Step 1: Write the data layer**

```ts
// src/lib/data/admin-crm-manual-conversions.ts
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { toManualConversionProgram, fromManualConversionProgram, type ManualConversionProgram } from "@/lib/crm/manual-conversion";

/**
 * Manual, batch-independent conversion records. Deliberately separate from
 * admin-crm-conversions.ts / src/lib/crm/conversion.ts — these rows never
 * feed resolveConversions or change any batch/campaign's computed
 * percentage; they are their own parallel fact about a contact.
 */

export type ManualConversionRow = {
  id: string;
  contactId: string;
  program: ManualConversionProgram;
  programCourseTitle: string | null;
  convertedAt: string;
  note: string | null;
  createdAt: string;
};

export async function listManualConversions(contactId: string): Promise<ManualConversionRow[]> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("manual_conversions")
    .select("id, contact_id, course_id, program_label, converted_at, note, created_at, courses(title)")
    .eq("contact_id", contactId)
    .order("converted_at", { ascending: false });

  return (data ?? [])
    .map((row) => {
      const program = toManualConversionProgram(row.course_id, row.program_label);
      if (!program) return null; // defensive: a row that somehow has neither/both set is unrenderable, not a crash
      return {
        id: row.id,
        contactId: row.contact_id,
        program,
        programCourseTitle: (row.courses as { title: string } | null)?.title ?? null,
        convertedAt: row.converted_at,
        note: row.note,
        createdAt: row.created_at,
      };
    })
    .filter((r): r is ManualConversionRow => r !== null);
}

export type CreateManualConversionsResult = { ok: true; count: number } | { ok: false; reason: "db-error" };

export async function createManualConversions(
  contactIds: string[],
  program: ManualConversionProgram,
  convertedAt: string | undefined,
  note: string | undefined,
  createdBy: string,
): Promise<CreateManualConversionsResult> {
  const admin = createAdminSupabase();
  const { course_id, program_label } = fromManualConversionProgram(program);
  const rows = contactIds.map((contactId) => ({
    contact_id: contactId,
    course_id,
    program_label,
    converted_at: convertedAt ?? new Date().toISOString().slice(0, 10),
    note: note ?? null,
    created_by: createdBy,
  }));

  const { error, count } = await admin.from("manual_conversions").insert(rows, { count: "exact" });
  if (error) return { ok: false, reason: "db-error" };
  return { ok: true, count: count ?? rows.length };
}

export type DeleteManualConversionResult = { ok: true } | { ok: false; reason: "not-found" | "db-error" };

export async function deleteManualConversion(id: string): Promise<DeleteManualConversionResult> {
  const admin = createAdminSupabase();
  const { error, count } = await admin.from("manual_conversions").delete({ count: "exact" }).eq("id", id);
  if (error) return { ok: false, reason: "db-error" };
  if (!count) return { ok: false, reason: "not-found" };
  return { ok: true };
}

/** Feeds Task 17's recipient-row badge — which of these contacts have any manual conversion on file. */
export async function listContactIdsWithManualConversion(contactIds: string[]): Promise<Set<string>> {
  if (contactIds.length === 0) return new Set();
  const admin = createAdminSupabase();
  const { data } = await admin.from("manual_conversions").select("contact_id").in("contact_id", contactIds);
  return new Set((data ?? []).map((r) => r.contact_id));
}
```

- [ ] **Step 2: Typecheck**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/admin-crm-manual-conversions.ts
git commit -m "feat: add manual conversions data layer"
```

---

## Task 14: Manual conversion API routes

**Files:**
- Create: `src/app/api/admin/crm/manual-conversions/route.ts`
- Create: `src/app/api/admin/crm/manual-conversions/[id]/route.ts`

**Interfaces:**
- Consumes: `manualConversionCreateSchema` (Task 12); `createManualConversions`, `deleteManualConversion` (Task 13).
- Produces: `POST /api/admin/crm/manual-conversions`, `DELETE /api/admin/crm/manual-conversions/[id]` — for Tasks 15 and 16's UI.

- [ ] **Step 1: Write the POST route**

```ts
// src/app/api/admin/crm/manual-conversions/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { manualConversionCreateSchema } from "@/lib/validations/crm";
import { createManualConversions } from "@/lib/data/admin-crm-manual-conversions";

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = manualConversionCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const { contactIds, program, convertedAt, note } = parsed.data;
  const result = await createManualConversions(contactIds, program, convertedAt, note, auth.user.id);
  if (!result.ok) return NextResponse.json({ error: "Could not record this conversion." }, { status: 500 });

  return NextResponse.json({ ok: true, count: result.count });
}
```

(`auth.user.id` is correct: `requireAdmin()` returns `{ ok: true; user: User; supabase }` where `user` is Supabase's `User` type — see `src/lib/auth/require-admin.ts:28-29`.)

- [ ] **Step 2: Write the DELETE route**

```ts
// src/app/api/admin/crm/manual-conversions/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { deleteManualConversion } from "@/lib/data/admin-crm-manual-conversions";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const result = await deleteManualConversion(id);
  if (!result.ok) {
    const status = result.reason === "not-found" ? 404 : 500;
    return NextResponse.json({ error: result.reason === "not-found" ? "Not found" : "Could not delete this record." }, { status });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Typecheck**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/admin/crm/manual-conversions
git commit -m "feat: add manual conversion API routes"
```

---

## Task 15: "Mark converted" on the Contact detail page

**Files:**
- Modify: `src/app/dashboard/admin/crm/contacts/[id]/page.tsx`
- Modify: `src/components/admin/crm/ContactDetailClient.tsx`

**Interfaces:**
- Consumes: `listManualConversions` (Task 13); `POST /api/admin/crm/manual-conversions`, `DELETE /api/admin/crm/manual-conversions/[id]` (Task 14); `/api/admin/crm/courses` (already exists, used by WhatsApp/Campaigns for the same course picker).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Fetch manual conversions in the page**

In `src/app/dashboard/admin/crm/contacts/[id]/page.tsx`, add the import and fetch, passing the result down:

```tsx
import { listManualConversions } from "@/lib/data/admin-crm-manual-conversions";

// inside ContactDetailPage, after `if (!detail) notFound();`:
const manualConversions = await listManualConversions(id);

return <ContactDetailClient detail={detail} initialManualConversions={manualConversions} />;
```

- [ ] **Step 2: Add the form and list to `ContactDetailClient`**

Extend the props and add state/handlers in `src/components/admin/crm/ContactDetailClient.tsx`:

```tsx
import { useEffect, useState } from "react";
import type { ManualConversionRow } from "@/lib/data/admin-crm-manual-conversions";
// ...existing imports...

export function ContactDetailClient({
  detail,
  initialManualConversions,
}: {
  detail: ContactDetail;
  initialManualConversions: ManualConversionRow[];
}) {
  // ...existing phone state...
  const [manualConversions, setManualConversions] = useState(initialManualConversions);
  const [courses, setCourses] = useState<{ id: string; title: string }[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [programMode, setProgramMode] = useState<"course" | "label">("course");
  const [courseId, setCourseId] = useState("");
  const [label, setLabel] = useState("");
  const [convertedAt, setConvertedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/crm/courses")
      .then((r) => r.json())
      .then((j: { courses?: { id: string; title: string }[] }) => setCourses(j.courses ?? []))
      .catch(() => {});
  }, []);

  async function markConverted() {
    const program = programMode === "course" ? { kind: "course" as const, courseId } : { kind: "label" as const, pattern: label.trim() };
    if (programMode === "course" && !courseId) return;
    if (programMode === "label" && label.trim() === "") return;

    setSaving(true);
    try {
      const res = await fetch("/api/admin/crm/manual-conversions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds: [detail.id], program, convertedAt, note: note.trim() || undefined }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toast.error(json.error ?? "Could not record this conversion.");
        return;
      }
      toast.success("Marked converted.");
      setShowForm(false);
      setCourseId("");
      setLabel("");
      setNote("");
      // There is no GET-by-contact route (Task 14 only added POST/DELETE) —
      // the POST body already carries everything needed to render the new
      // row, so append it directly rather than refetching.
      setManualConversions((prev) => [
        {
          id: crypto.randomUUID(),
          contactId: detail.id,
          program,
          programCourseTitle: programMode === "course" ? courses.find((c) => c.id === courseId)?.title ?? null : null,
          convertedAt,
          note: note.trim() || null,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
    } finally {
      setSaving(false);
    }
  }

  async function removeConversion(id: string) {
    setRemovingId(id);
    try {
      const res = await fetch(`/api/admin/crm/manual-conversions/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toast.error(json.error ?? "Could not remove this record.");
        return;
      }
      setManualConversions((prev) => prev.filter((m) => m.id !== id));
      toast.success("Removed.");
    } finally {
      setRemovingId(null);
    }
  }

  // ...existing savePhone...
```

Add the UI block to the render, after the purchase history section:

```tsx
<div>
  <div className="flex items-center justify-between flex-wrap gap-2">
    <h2 className="font-headline font-bold text-lg">Manual conversions</h2>
    <button
      onClick={() => setShowForm((v) => !v)}
      className="px-4 py-1.5 rounded-full bg-pz-primary text-pz-on-primary font-headline text-xs font-semibold"
    >
      {showForm ? "Cancel" : "Mark converted…"}
    </button>
  </div>

  {showForm && (
    <div className="mt-3 bg-pz-surface-container-high rounded-2xl p-4 space-y-3">
      <div className="flex gap-3 flex-wrap">
        <label className="flex items-center gap-1.5 text-sm font-body cursor-pointer">
          <input type="radio" name="programMode" checked={programMode === "course"} onChange={() => setProgramMode("course")} />
          Existing course
        </label>
        <label className="flex items-center gap-1.5 text-sm font-body cursor-pointer">
          <input type="radio" name="programMode" checked={programMode === "label"} onChange={() => setProgramMode("label")} />
          Other program (type a name)
        </label>
      </div>
      {programMode === "course" ? (
        <select value={courseId} onChange={(e) => setCourseId(e.target.value)} className="w-full rounded-xl border border-pz-outline-variant px-4 py-2 font-body text-sm">
          <option value="">Select a course…</option>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
      ) : (
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Program name" className="w-full rounded-xl border border-pz-outline-variant px-4 py-2 font-body text-sm" />
      )}
      <input type="date" value={convertedAt} onChange={(e) => setConvertedAt(e.target.value)} className="rounded-xl border border-pz-outline-variant px-4 py-2 font-body text-sm" />
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="w-full rounded-xl border border-pz-outline-variant px-4 py-2 font-body text-sm" />
      <button
        onClick={markConverted}
        disabled={saving || (programMode === "course" ? !courseId : label.trim() === "")}
        className="px-5 py-2 rounded-full bg-pz-primary text-pz-on-primary font-headline text-sm font-semibold disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  )}

  {manualConversions.length === 0 ? (
    <p className="font-body text-sm text-pz-on-surface-variant py-4">No manual conversions recorded.</p>
  ) : (
    <div className="space-y-2 mt-3">
      {manualConversions.map((m) => (
        <div key={m.id} className="flex items-center justify-between gap-3 bg-pz-surface-container-high rounded-xl p-3 font-body text-sm">
          <span>
            {m.program.kind === "course" ? m.programCourseTitle ?? "—" : m.program.kind === "label" ? m.program.pattern : ""}
            {" · "}{new Date(m.convertedAt).toLocaleDateString()}
            {m.note && <span className="text-pz-on-surface-variant"> · {m.note}</span>}
          </span>
          <button onClick={() => removeConversion(m.id)} disabled={removingId === m.id} className="text-pz-danger text-xs font-semibold shrink-0 disabled:opacity-50">
            {removingId === m.id ? "Removing…" : "undo"}
          </button>
        </div>
      ))}
    </div>
  )}
</div>
```

- [ ] **Step 3: Typecheck and test**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: no errors.

Run: `./node_modules/.bin/vitest run`
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/admin/crm/contacts/[id]/page.tsx src/components/admin/crm/ContactDetailClient.tsx
git commit -m "feat: add manual conversion marking to the Contact detail page"
```

---

## Task 16: Bulk "mark converted" from the Contacts list

**Files:**
- Modify: `src/components/admin/crm/ContactsPanel.tsx`

**Interfaces:**
- Consumes: `POST /api/admin/crm/manual-conversions` (Task 14).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Add the bulk-mark form to the selection action bar**

In `src/components/admin/crm/ContactsPanel.tsx`, add state (alongside the existing `selected` state):

```tsx
const [showBulkConvertForm, setShowBulkConvertForm] = useState(false);
const [bulkProgramMode, setBulkProgramMode] = useState<"course" | "label">("course");
const [bulkCourseId, setBulkCourseId] = useState("");
const [bulkLabel, setBulkLabel] = useState("");
const [bulkConvertedAt, setBulkConvertedAt] = useState(() => new Date().toISOString().slice(0, 10));
const [bulkSaving, setBulkSaving] = useState(false);
```

Add the handler, near `useSelectedInWhatsApp`:

```tsx
async function markSelectedConverted() {
  const program = bulkProgramMode === "course" ? { kind: "course" as const, courseId: bulkCourseId } : { kind: "label" as const, pattern: bulkLabel.trim() };
  if (bulkProgramMode === "course" && !bulkCourseId) return;
  if (bulkProgramMode === "label" && bulkLabel.trim() === "") return;

  setBulkSaving(true);
  try {
    const res = await fetch("/api/admin/crm/manual-conversions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactIds: Array.from(selected), program, convertedAt: bulkConvertedAt }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.error ?? "Could not record these conversions.");
      return;
    }
    toast.success(`Marked ${json.count} contact${json.count === 1 ? "" : "s"} converted.`);
    setShowBulkConvertForm(false);
    setBulkCourseId("");
    setBulkLabel("");
    setSelected(new Set());
  } finally {
    setBulkSaving(false);
  }
}
```

`courseOptions` in this file is currently a `string[]` of course *names* (used by the search filter), not `{ id, title }` pairs — the bulk form needs real course ids to send. Add a second fetch for that, alongside the existing `courseOptions`/`batches` effect:

```tsx
const [courseChoices, setCourseChoices] = useState<{ id: string; title: string }[]>([]);
// inside the existing useEffect(() => { ... }, []) that fetches courseOptions/batches, add:
fetch("/api/admin/crm/courses")
  .then((r) => r.json())
  .then((j: { courses?: { id: string; title: string }[] }) => setCourseChoices(j.courses ?? []))
  .catch(() => {});
```

- [ ] **Step 2: Add the UI to the selection bar**

In the selection bar (inside `{selected.size > 0 && (...)}`), add a new button and a conditional form, alongside the existing "Use in new campaign"/"Use in WhatsApp batch" buttons:

```tsx
<button
  onClick={() => setShowBulkConvertForm((v) => !v)}
  className="font-body text-xs font-semibold text-pz-primary hover:underline"
>
  Mark {selected.size} selected as converted…
</button>
```

And, just below the selection-bar `div` (still inside the `{selected.size > 0 && (...)}` block, as a sibling), the form itself:

```tsx
{showBulkConvertForm && (
  <div className="bg-pz-surface-container-high rounded-2xl p-4 space-y-3 mt-2">
    <div className="flex gap-3 flex-wrap">
      <label className="flex items-center gap-1.5 text-sm font-body cursor-pointer">
        <input type="radio" name="bulkProgramMode" checked={bulkProgramMode === "course"} onChange={() => setBulkProgramMode("course")} />
        Existing course
      </label>
      <label className="flex items-center gap-1.5 text-sm font-body cursor-pointer">
        <input type="radio" name="bulkProgramMode" checked={bulkProgramMode === "label"} onChange={() => setBulkProgramMode("label")} />
        Other program (type a name)
      </label>
    </div>
    {bulkProgramMode === "course" ? (
      <select value={bulkCourseId} onChange={(e) => setBulkCourseId(e.target.value)} className="w-full rounded-xl border border-pz-outline-variant px-4 py-2 font-body text-sm">
        <option value="">Select a course…</option>
        {courseChoices.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
      </select>
    ) : (
      <input value={bulkLabel} onChange={(e) => setBulkLabel(e.target.value)} placeholder="Program name" className="w-full rounded-xl border border-pz-outline-variant px-4 py-2 font-body text-sm" />
    )}
    <input type="date" value={bulkConvertedAt} onChange={(e) => setBulkConvertedAt(e.target.value)} className="rounded-xl border border-pz-outline-variant px-4 py-2 font-body text-sm" />
    <button
      onClick={markSelectedConverted}
      disabled={bulkSaving || (bulkProgramMode === "course" ? !bulkCourseId : bulkLabel.trim() === "")}
      className="px-5 py-2 rounded-full bg-pz-primary text-pz-on-primary font-headline text-sm font-semibold disabled:opacity-50"
    >
      {bulkSaving ? "Saving…" : `Mark ${selected.size} converted`}
    </button>
  </div>
)}
```

- [ ] **Step 3: Typecheck and test**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: no errors.

Run: `./node_modules/.bin/vitest run`
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/crm/ContactsPanel.tsx
git commit -m "feat: add bulk manual-conversion marking from the Contacts list"
```

---

## Task 17: Manual conversion badge on batch/campaign recipient rows

**Files:**
- Modify: `src/lib/data/admin-crm-whatsapp.ts`
- Modify: `src/components/admin/crm/WhatsAppBatchDetailClient.tsx`
- Modify: `src/components/admin/crm/CampaignDetailClient.tsx`
- Modify: `src/app/dashboard/admin/crm/campaigns/[id]/page.tsx`

**Interfaces:**
- Consumes: `listContactIdsWithManualConversion` (Task 13).
- Produces: `WhatsAppRecipientRow` gains `contactId: string | null`; nothing else downstream.

- [ ] **Step 1: Add `contact_id` to `WhatsAppRecipientRow` and the query**

In `src/lib/data/admin-crm-whatsapp.ts`:
- Add `contactId: string | null;` to the `WhatsAppRecipientRow` type (after `id`).
- In `getWhatsAppBatchDetail`, add `contact_id` to the recipients `.select(...)` (`"id, full_name, phone_e164, status, sent_at, contact_id"`) and map it: `contactId: r.contact_id,` in the `rows.map(...)` return.

- [ ] **Step 2: Show the badge on the WhatsApp detail page**

`listContactIdsWithManualConversion` is a server-only data-layer call — it cannot run inside `WhatsAppBatchDetailClient.tsx` (a client component). Fetch it in the page instead and pass the result down as a prop.

In `src/app/dashboard/admin/crm/whatsapp/[id]/page.tsx`, add:

```tsx
import { listContactIdsWithManualConversion } from "@/lib/data/admin-crm-manual-conversions";

// inside WhatsAppBatchDetailPage, after `if (!detail) notFound();`:
const contactIds = detail.recipients.map((r) => r.contactId).filter((id): id is string => id !== null);
const manualConvertedContactIds = await listContactIdsWithManualConversion(contactIds);

return <WhatsAppBatchDetailClient initialDetail={detail} manualConvertedContactIds={Array.from(manualConvertedContactIds)} />;
```

In `WhatsAppBatchDetailClient.tsx`, accept the new prop and use it:

```tsx
export function WhatsAppBatchDetailClient({
  initialDetail,
  manualConvertedContactIds,
}: {
  initialDetail: WhatsAppBatchDetail;
  manualConvertedContactIds: string[];
}) {
  const manualSet = new Set(manualConvertedContactIds);
  // ...existing state...
```

Update the recipient name cell (from Step 2 of Task 3, which was plain text) to a link with a badge, now that `contactId` exists:

```tsx
<td className="py-1">
  {r.contactId ? (
    <Link href={`/dashboard/admin/crm/contacts/${r.contactId}`} className="underline">
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
```

- [ ] **Step 3: Same for the Campaign detail page**

`CampaignConversionDetail.recipients` already has `contactId` (Task 2 already links it). In `src/app/dashboard/admin/crm/campaigns/[id]/page.tsx`:

```tsx
import { listContactIdsWithManualConversion } from "@/lib/data/admin-crm-manual-conversions";

// after fetching campaigns/conversionDetail and confirming `campaign` exists:
const contactIds = (conversionDetail?.recipients ?? []).map((r) => r.contactId);
const manualConvertedContactIds = await listContactIdsWithManualConversion(contactIds);

return <CampaignDetailClient campaign={campaign} conversionDetail={conversionDetail} manualConvertedContactIds={Array.from(manualConvertedContactIds)} />;
```

In `CampaignDetailClient.tsx`, accept the prop and add the same badge next to the recipient name:

```tsx
export function CampaignDetailClient({
  campaign,
  conversionDetail,
  manualConvertedContactIds,
}: {
  campaign: CampaignRow;
  conversionDetail: CampaignConversionDetail;
  manualConvertedContactIds: string[];
}) {
  const manualSet = new Set(manualConvertedContactIds);
  // ...existing state...
```

```tsx
<td className="py-1">
  <Link href={`/dashboard/admin/crm/contacts/${r.contactId}`} className="underline">
    {r.fullName || "—"}
  </Link>
  {manualSet.has(r.contactId) && (
    <span className="ml-2 px-1.5 py-0.5 rounded-full bg-pz-primary-container text-pz-on-primary-container text-[10px] font-bold uppercase">
      manually converted
    </span>
  )}
</td>
```

- [ ] **Step 4: Typecheck and test**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: no errors.

Run: `./node_modules/.bin/vitest run`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/admin-crm-whatsapp.ts src/components/admin/crm/WhatsAppBatchDetailClient.tsx src/components/admin/crm/CampaignDetailClient.tsx src/app/dashboard/admin/crm/whatsapp/[id]/page.tsx src/app/dashboard/admin/crm/campaigns/[id]/page.tsx
git commit -m "feat: badge recipients who have a manual conversion on file"
```

---

## Final verification

- [ ] **Step 1: Full regression**

Run: `./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/vitest run`
Expected: no type errors, all tests pass.

- [ ] **Step 2: Real production build**

Run: `./node_modules/.bin/next build`
Expected: builds clean — this is the only way this repo has reliably caught routing/webpack-level issues (see the ERR_REQUIRE_ESM incident earlier this project), `next dev` alone is not sufficient sign-off.

- [ ] **Step 3: Live click-through**

With a dev server up (`./node_modules/.bin/next dev`, not while `next build` output is still warm — building and dev-serving at once has previously corrupted this repo's dev server), walk each of the five sections: open a Contact/Campaign/Cohort/WhatsApp batch/Agent detail page from its list, confirm the "← Back to..." link returns to the right tab, confirm search narrows each list and each detail sub-list, and mark one contact converted both singly (from its detail page) and via the Contacts list's bulk action — confirm the badge appears on that contact's recipient row inside a batch/campaign that reached them, if any did.
