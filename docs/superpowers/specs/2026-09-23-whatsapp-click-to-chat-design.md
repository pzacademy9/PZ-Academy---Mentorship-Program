# WhatsApp click-to-chat outreach — design

## Problem

The CRM slice 1 spec (2026-09-03) explicitly deferred WhatsApp send: "WhatsApp
Business API is intended but not yet affordable." That is still true, but most
of the ~1,900 contacts now in the CRM were acquired through WhatsApp and are
best reached there — email open rates for this audience are low, and phone is
already a first-class identity key (`contacts.phone_e164`, normalized E.164).

The admin's request: prepare a message, pick a cohort/segment the same way an
email campaign does, then work through that list opening a pre-filled
WhatsApp chat per contact and hitting send manually from the PZ Academy
WhatsApp Business number (+92 370 0199429). No Business API, no automated
send — `wa.me` click-to-chat links, generated in bulk, with progress tracked
so a cohort of 100+ people can be worked over several sittings without losing
place or re-messaging someone.

## Decisions

Confirmed with the admin before this spec:

- **Reachability is phone-only**, not the email `is_sendable` guard. WhatsApp
  and email are separate channels — an email-unsubscribed contact has not
  opted out of WhatsApp.
- **`contacts.whatsapp_unsubscribed_at` already exists** (added in migration
  0047, unused until now — the CRM spine spec anticipated this feature). The
  reachability guard folds it in: `phone_e164 is not null AND
  whatsapp_unsubscribed_at is null`. This wasn't asked explicitly, but it's
  the same shape as the email guard and the column exists for no other
  reason; flagging it here rather than deciding it silently.
- **Audience picking reuses `SegmentBuilder`** (course, cohort, country, etc.
  — the same component email campaigns use), plus the bulk-select-from-
  Contacts-tab handoff already shipped, rather than a separate simpler
  picker.
- **Batches are named and resumable**, not one-off. A recipient list is
  **snapshotted at batch creation** (contact_id, full_name, phone_e164 copied
  into a batch-owned table), not live-joined against `contacts`. Consequence:
  fixing a contact's phone number after a batch is created does not change
  that batch's snapshot — fix the number first, then create the batch. This
  keeps a resumable list stable across sittings instead of reshuffling under
  the admin mid-click-through.
- **No automated send, no delivery tracking.** `wa.me` cannot detect whether
  the admin actually pressed send in WhatsApp. "Sent" is the admin manually
  marking a row after they've sent it — an honesty-based checklist, not a
  delivery receipt. This is explicitly acceptable per the request ("if I
  have to do manually that's okay").

## Data model

As of this spec, the latest applied migration is `0053` (the import-commit
collision-guard fix, shipped earlier 2026-09-23) — this feature's migration
takes the next number at implementation time.

```sql
do $$
begin
  if not exists (select 1 from pg_type where typname = 'whatsapp_send_status') then
    create type public.whatsapp_send_status as enum ('pending', 'sent');
  end if;
end $$;

create table if not exists public.whatsapp_batches (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  message_template  text not null,
  segment           jsonb not null default '[]'::jsonb,
  recipient_count   integer not null default 0,
  sent_count        integer not null default 0,
  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now()
);

-- Snapshotted, not live-joined — see Decisions. unique(batch_id, contact_id)
-- makes a double-submit of batch creation structurally harmless, same
-- pattern as campaign_recipients.
create table if not exists public.whatsapp_batch_recipients (
  id            uuid primary key default gen_random_uuid(),
  batch_id      uuid not null references public.whatsapp_batches(id) on delete cascade,
  contact_id    uuid references public.contacts(id) on delete set null,
  full_name     text not null,
  phone_e164    text not null,
  status        public.whatsapp_send_status not null default 'pending',
  sent_at       timestamptz,
  sent_by       uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (batch_id, contact_id)
);

create index if not exists whatsapp_batch_recipients_batch_idx
  on public.whatsapp_batch_recipients (batch_id);

alter table public.whatsapp_batches           enable row level security;
alter table public.whatsapp_batch_recipients  enable row level security;
-- Zero policies: service-role only, same convention as every other CRM
-- table (0047). All reads/writes go through createAdminSupabase() behind
-- requireAdmin().
```

`recipient_count` / `sent_count` are denormalized onto `whatsapp_batches` so
the batch list view (potentially many batches) doesn't need a join+count per
row. Updated at batch creation and on every recipient status PATCH.

`contact_id` is `on delete set null` rather than `cascade`: if a contact is
later deleted (merge review, say), the batch keeps its historical row — the
snapshot already carries the name and number needed to act on it, and the
send record shouldn't silently disappear.

## Segment reachability, generalized for two channels

`buildSegmentFilters` (`src/lib/crm/segment.ts`) currently hardcodes and
always appends one guard:

```ts
const SENDABLE_GUARD: QueryOp = { kind: "eq", column: "is_sendable", value: true };
```

This becomes a parameter with that as the default, so every existing call
site (email campaigns) is unchanged:

```ts
export function buildSegmentFilters(
  filters: SegmentFilter[],
  guard: QueryOp = EMAIL_SENDABLE_GUARD,
): QueryOp[]
```

A new `QueryOp` kind is needed — `is not null` doesn't exist yet:

```ts
| { kind: "not-null"; column: string }
```

mapped in `admin-crm-segments.ts`'s `applyOp` to `.not(column, "is", null)`.

The WhatsApp guard can't be a single `QueryOp` (it's two conditions: phone
present AND not unsubscribed), so `buildSegmentFilters` gets a `guard:
QueryOp[]` array parameter instead of a single `QueryOp`, appended in full:

```ts
export const EMAIL_SENDABLE_GUARD: QueryOp[] = [{ kind: "eq", column: "is_sendable", value: true }];
export const WHATSAPP_REACHABLE_GUARD: QueryOp[] = [
  { kind: "not-null", column: "phone_e164" },
  { kind: "is-null", column: "whatsapp_unsubscribed_at" },
];
```

(`is-null` is the same new-kind addition, inverse sense — both are one-line
additions to `applyOp`.)

Confirmed against the live view definition: `crm_contact_segment_source`
(the view `resolveSegment` reads) does **not** currently expose
`whatsapp_unsubscribed_at` — it was built for the email-only slice 1 and
selects `c.email_unsubscribed_at` but not the WhatsApp column. The migration
must `create or replace view` it with `c.whatsapp_unsubscribed_at` added to
the plain `SELECT c...` column list (appending, not reordering, so nothing
existing breaks). `phone_e164` is already selected — no change needed there.

`SegmentBuilder` and the `/api/admin/crm/segments/preview` endpoint both get
a `channel?: "email" | "whatsapp"` prop/param, defaulting to `"email"`. The
component's empty-state copy ("matches every contact who has an email, has
not unsubscribed, and has not bounced") becomes channel-conditional text.

## API

- `GET /api/admin/crm/whatsapp/batches` — list, with `recipientCount` /
  `sentCount` for the tab's progress display.
- `POST /api/admin/crm/whatsapp/batches` — `{ name, messageTemplate, segment
  }`. Resolves the segment server-side with `WHATSAPP_REACHABLE_GUARD`,
  snapshots matches into `whatsapp_batch_recipients`, sets
  `recipient_count`. Zero matches is a 400 ("no phone-reachable contacts
  match this segment"), mirroring the campaign send-guard pattern.
- `GET /api/admin/crm/whatsapp/batches/[id]` — batch + full recipient list.
- `PATCH /api/admin/crm/whatsapp/batches/[id]/recipients/[recipientId]` —
  `{ status: "pending" | "sent" }`. Updates `sent_at`/`sent_by` and the
  parent batch's `sent_count` (recomputed, not incremented — safe against
  any future bulk-status operation).

## UI

New "WhatsApp" tab on the CRM page, alongside Contacts / Import / Merge /
Campaigns / Cohorts.

**Batch list** (tab landing view): name, created date, "112 / 183 sent"
progress, click through to detail. "New batch" opens the compose form.

**Compose form**: name field, message textarea with First name / Full name
merge-tag insert buttons (same pattern as `CampaignsPanel`'s merge tags,
minus the Email tag — irrelevant on this channel), `SegmentBuilder` with
`channel="whatsapp"`, "Create batch" (disabled while submitting, per the
project's existing busy-state convention).

**Batch detail**: recipient table — Name, Phone, an "Open chat" link/button
per row, Status, a mark-sent toggle. `wa.me` link per row:

```
https://wa.me/<phone_e164 digits, no leading +>?text=<encodeURIComponent(rendered message)>
```

where the rendered message substitutes `{{first_name}}` (first token of the
snapshotted `full_name`) and `{{full_name}}` into `message_template`. Link
opens in a new tab (`target="_blank"`) so the batch list stays open.

## Error handling

- Empty audience at batch creation → 400, surfaced in the compose form (same
  spot the campaign composer shows segment errors).
- Batch name / message required → zod, 400.
- PATCH on a recipient that doesn't belong to the given batch, or a batch
  that doesn't exist → 404.
- Double-submitting "Create batch" is harmless (the unique constraint on
  `(batch_id, contact_id)` can't be hit twice from one POST since each POST
  makes its own new `batch_id`), but the client still disables the button
  while the request is in flight to avoid two batches from one click.

## Testing

- Unit: `buildSegmentFilters` with `WHATSAPP_REACHABLE_GUARD` (mirrors the
  existing `crm-segment.test.ts` style) — confirms the two-condition guard
  is appended correctly and doesn't affect the email default.
- Unit: a pure `buildWhatsAppLink(phoneE164, template, fullName)` helper in
  `src/lib/crm/` — first-name extraction, URL-encoding, plus-stripping.
- Live verification (as done for every other CRM feature this session):
  create a real batch against a small real segment, open a generated link,
  confirm it prefills correctly in a real WhatsApp Web tab, mark-sent
  round-trips through the API and updates the progress count.

## Out of scope

- Automated/API send (explicitly deferred — cost, per the 2026-09-03 spec).
- Delivery/read receipts (impossible without the Business API).
- An unsubscribe/opt-out UI for WhatsApp (the column exists; nothing writes
  to it yet outside this guard reading it — a future slice, not this one).
- Editing a batch's recipient list after creation (add/remove people). If
  needed later, the natural shape is "create a follow-up batch," not
  mutating a snapshot that's supposed to stay stable.
