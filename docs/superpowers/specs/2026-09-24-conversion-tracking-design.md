# Conversion / drop-off tracking — design

## Problem

The admin runs WhatsApp batches and email campaigns but has no way to tell
whether a send actually worked: "How to track if the person got converted or
lost interest after my messaging campaign." Two halves of that question have
very different answers:

- **"Converted" is mechanically knowable.** Every recipient already has a
  `sent_at` (`whatsapp_batch_recipients.sent_at`, or `campaign_recipients` →
  `email_queue.sent_at` on the email side), and `contact_purchases` has a
  real `purchased_at` timestamp per contact. A new purchase after the send is
  a fact the database already contains.
- **"Lost interest" is not.** This is manual click-to-chat and one-way email
  — no read receipts, no reply capture. The only available proxy is "no
  qualifying purchase within the tracking window," which is an absence, not
  a signal. The design surfaces this honestly (see UI) rather than as a
  claimed fact.

## Decisions

Confirmed with the admin before this spec:

- **Tracked per batch/campaign**, not per bare recipient or per contact
  globally. The question being answered is "did *this send* work," matching
  how the admin already evaluates a batch by its sent-count.
- **Course tagging is required at creation**, with an explicit "not tracking
  conversion" choice as one of the options — never a silent default. Because
  messages are free text, the system cannot infer which course a batch was
  about; the admin states it.
- **Course tag has two forms**: pick an existing row from `courses`, or (for
  the ~78% of historical purchases whose `contact_purchases.course_id` is
  still null — see CRM course tagging gap) type a free-text pattern matched
  against `contact_purchases.product_label` instead. Exactly one of the two
  is set when tracking is on; both null means not tracking.
- **30-day fixed window** after `sent_at`. Not configurable per batch in
  this slice — a purchase 6 months later is presumed unrelated, and a fixed
  default avoids one more required field on every send. Revisit only if the
  default proves wrong in practice.
- **Non-converted recipients are labeled "Not converted (yet)"**, never "lost
  interest" — the absence-of-purchase proxy is not a fact about the
  recipient's state of mind, and the UI must not imply otherwise.
- **Computed at read time**, not a background job or stored column. Batch
  and recipient counts are small (hundreds per batch, low thousands of
  contacts total); a join at page-load time is simpler than a materialized
  table that needs invalidation whenever a new purchase lands.

## Data model

As of this spec, the latest applied migration is `0056`
(`crm_message_templates`) — this feature's migration takes the next number
(`0057`) at implementation time.

```sql
alter table public.whatsapp_batches
  add column if not exists conversion_course_id uuid references public.courses(id) on delete set null,
  add column if not exists conversion_label_match text;

alter table public.campaigns
  add column if not exists conversion_course_id uuid references public.courses(id) on delete set null,
  add column if not exists conversion_label_match text;

-- Exactly one of the two may be set, never both — "course" and "free-text
-- fallback" are alternative ways to specify the same single tag, not
-- independent facts. Both null is the valid "not tracking" state.
alter table public.whatsapp_batches
  add constraint whatsapp_batches_conversion_tag_exclusive
  check (conversion_course_id is null or conversion_label_match is null);

alter table public.campaigns
  add constraint campaigns_conversion_tag_exclusive
  check (conversion_course_id is null or conversion_label_match is null);
```

`conversion_course_id` is `on delete set null` rather than blocking course
deletion: a deleted course shouldn't lock the courses table, and a batch
that loses its course tag simply reverts to "not tracking" on next read
(the row itself is untouched — only the join target disappeared).

No new table for computed conversions — see "Computed at read time" above.

## Conversion computation

A pure function, mirroring how `whatsapp-batch-reconcile.ts` separates pure
logic from its Supabase-querying wrapper:

```ts
// src/lib/crm/conversion.ts

type Recipient = { contactId: string; sentAt: string };
type Purchase = {
  contactId: string;
  purchasedAt: string | null; // falls back to createdAt when null
  createdAt: string;
  courseId: string | null;
  productLabel: string;
};
type ConversionTag =
  | { kind: "course"; courseId: string }
  | { kind: "label"; pattern: string } // case-insensitive substring match
  | { kind: "none" };

type ConversionResult = { contactId: string; convertedAt: string | null };

const WINDOW_DAYS = 30;

export function resolveConversions(
  recipients: Recipient[],
  purchases: Purchase[],
  tag: ConversionTag,
): ConversionResult[]
```

For each recipient, finds the earliest matching purchase (by contact,
matching the tag, timestamp in `[sentAt, sentAt + 30 days]`) and returns its
timestamp, or `null` if none matches. `tag.kind === "none"` returns `null`
for every recipient without inspecting purchases — a not-tracking
batch/campaign never computes or displays a percentage.

Data-layer wrapper (`getWhatsAppBatchConversions(batchId)` in
`admin-crm-whatsapp.ts`; equivalent `getCampaignConversions(campaignId)` in
`admin-crm-campaigns.ts`) fetches the batch's/campaign's recipients (with
`sent_at`, excluding still-pending ones — an unsent recipient cannot have
converted), fetches `contact_purchases` for those contact IDs, and calls
`resolveConversions`.

## API

- `POST /api/admin/crm/whatsapp/batches` and `POST /api/admin/crm/campaigns`
  (draft creation) gain an optional `conversionTag: ConversionTag` field,
  validated by a new `conversionTagSchema` in `src/lib/validations/crm.ts`
  (discriminated union on `kind`, mirroring the existing channel-conditional
  `templateCreateSchema` pattern). Omitted defaults to `{ kind: "none" }`.
- `GET /api/admin/crm/whatsapp/batches/[id]` and the equivalent campaign
  detail route include a `conversion: { converted: number; total: number;
  recipients: { contactId, fullName, convertedAt }[] } | null` field —
  `null` when the tag is `"none"`. Computed inline in the existing detail
  handler, not a separate endpoint (same trip already fetches recipients).
- `PATCH` batch/campaign gains `conversionTag` as an independently
  updatable field, following the existing pattern where `name` /
  `messageTemplate` / `segment` are already independently patchable.

## UI

**Creation form** (both `WhatsAppPanel` and `CampaignsPanel`): a required
"Track conversion" control alongside the existing name/message/segment
fields — a course `<select>` (populated from `courses`, sorted by title),
an "Other course (type to match)" text input as the alternative, and a "Not
tracking conversion" radio/option as the third explicit choice. "Create
batch" / "Save draft" stays disabled until one is chosen, same disabled-
until-valid convention `createBatch` already uses for name/message.

**Row badge** (collapsed batch/campaign row, next to the existing sent-count
text): `"12% converted (17/139) · Not converted (yet): 122"` when tracked;
nothing extra when `conversion` is `null`.

**Recipient table** (expanded detail): existing Name/Phone(or Email)/Status
columns gain a "Converted" column — a checkmark + date, or "Not converted
(yet)" — only rendered when the batch/campaign is tracked.

**New "Conversion" tab** on the CRM page (alongside Contacts / Import /
Merge / Campaigns / Cohorts / WhatsApp): lists every tracked batch and
campaign, both channels together, sorted by conversion % descending — name,
channel icon, course tag, converted/total, %. Read-only; click-through
reuses the existing batch/campaign detail views rather than duplicating the
recipient list here.

## Error handling

- Creating a batch/campaign with neither a course, a label pattern, nor
  explicit "not tracking" selected → the client blocks submission (same
  disabled-button pattern as the existing required fields); the API 400s
  defensively if it somehow arrives empty (zod: the discriminated union has
  no fourth "unset" variant, so a missing `conversionTag` after the client
  default is a schema validation failure, not a silent `"none"`).
- Both `conversion_course_id` and `conversion_label_match` set → blocked by
  the DB check constraint; the API validates the same exclusivity via the
  discriminated union before it can construct such a row.
- A `conversion_course_id` whose course was later deleted → reads as
  `conversion: null` (tag silently reverted, per the data-model note above)
  rather than an error.

## Testing

- Unit: `resolveConversions` (TDD, RED→GREEN) — window boundaries (exactly
  at `sentAt`, exactly at `sentAt + 30 days`, one second past), course-match
  vs label-match (case-insensitive substring) vs `"none"`, `purchasedAt`
  null falling back to `createdAt`, multiple purchases per contact resolving
  to the earliest qualifying one, a still-pending recipient never appearing
  as a candidate.
- Unit: `conversionTagSchema` validation (mirrors `crm.schema.test.ts`'s
  existing style for `templateCreateSchema`).
- Live verification: tag a throwaway WhatsApp batch (created against the
  "PPC B3" cohort per the project's existing test convention) with a real
  course, insert one synthetic `contact_purchases` row inside the window and
  one outside it for two of its four contacts via `execute_sql`, mark all
  four "sent," confirm the badge reads the correct 1/4 (or however many the
  window logic yields), then delete both the test batch and the synthetic
  purchase rows.

## Out of scope

- "Lost interest" as a tracked, named signal — deliberately not built; see
  Decisions. The UI only ever shows an absence of conversion, never a claim
  about intent.
- Per-batch/campaign configurable time window — fixed at 30 days this slice.
- Attributing a purchase to a specific batch when a contact received
  multiple tracked sends before purchasing (e.g., two follow-up batches for
  the same course, both within the window). This slice reports each
  batch's/campaign's own conversion count independently; a contact who
  converted can be counted as "converted" under more than one send. De-
  duplicating credit across overlapping sends is a future refinement if it
  turns out to matter.
- Backfilling `conversion_course_id`/`conversion_label_match` onto the two
  existing production WhatsApp batches (DMC B1 → AMS 1 / MDC 3) — those
  predate this feature and are out of scope to retroactively tag here; the
  admin can tag them manually via the same PATCH path once shipped, if
  wanted.
