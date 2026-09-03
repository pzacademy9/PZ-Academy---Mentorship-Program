# CRM contacts spine, sheet ingest, and first campaign — design

## Problem

PZ Academy has no marketing system and no CRM. Two distinct failures follow
from that, and the business owner ranked them as the top two priorities
(ahead of mid-funnel enrollment stall, and well ahead of analytics):

- **Anonymous traffic does not convert and is not captured.** A visitor who
  does not pay leaves no trace. There is no lead entity, no capture surface,
  no attribution on any enrollment.
- **Existing buyers do not come back.** There is no way to reach past
  customers as a group, no segmentation, and no repeat-purchase motion —
  despite a real ascension ladder already existing in the schema
  (`course_type` = `webinar` → `workshop` → `course` → `mentorship`).

The second failure is the more expensive one, because the asset already
exists and is idle: **roughly 3,000+ past buyers sit in 25+ separate Google
Sheets**, one per cohort, and are not addressable from the platform at all.
Some of those people appear in several sheets — they are repeat customers,
and nothing in the current system knows that.

What already exists and must be reused rather than rebuilt:

- **A working transactional email spine.** `email_queue` (status, retry
  count, exponential backoff, `next_retry_at`), the `process-email-queue`
  edge function that drains it via Brevo, and `brevo-webhook-handler`
  writing delivery/open/click/bounce/complaint events into `email_metrics`.
- **A Google Apps Script relay** (`gas/sheets-sync/Code.gs`) — a
  shared-secret action router already handling `registerSheet`,
  `applyStatus`, and Drive upload/fetch/trash. It runs as the account that
  owns the sheets, so it needs no service account, no OAuth consent screen,
  and no re-sharing of 25 spreadsheets.
- **Rich behavioural data** for segmentation once contacts exist:
  `enrollments`, `lesson_progress`, `quiz_attempts`, `certificates`,
  `mentorship_bookings`, `feedback_responses`.
- **A marketing CMS** (banners, featured items) shipped 2026-09-03.

The sheets are in better shape than "scattered across 25 spreadsheets"
suggests. A representative sheet (`MDC3 Master Sheet`, tab
`Form Responses 1`) carries: `Name`, `Email`, `WhatsApp`, `Profession`,
`Discovery` (Instagram / Facebook / WhatsApp), `Registration Option`
(e.g. `Individual — PKR 2,700 [Early Bird]`,
`Group — PKR 6,480 (3 × PKR 2,160/person) [Early Bird]`,
`Individual — AED 80 [Early Bird]`), `Consent`, `Row Type`
(Individual / Group Leader / Group Member), and `Promo Code`. Attribution,
purchase history, referral codes, and group-recruiter status have all been
collected historically — they have simply never been queryable.

Every row in these sheets is a **confirmed purchaser** (final registrants,
not enquiries), which makes the consent position clean.

## Decision

Build the CRM as five sequential sub-projects, each with its own spec, plan,
and implementation cycle. This document specifies **slice 1 only**.

1. **Contacts spine + sheet ingest + first campaign** — this spec
2. Capture surfaces (lead magnets, abandoned enrollment, WhatsApp-ad landing)
3. Segmentation depth + campaign templates
4. Lifecycle automation (drip, win-back, post-certificate upsell)
5. Funnel analytics and source ROI

Slice 1 was chosen over "capture first" because the 3,000 warm buyers are an
existing asset with an existing product ladder to sell them, and the send
infrastructure is already built. It is the shortest path from here to
revenue. Capture surfaces are worth more once there is a machine to feed.

Slice 1 ends with the ability to send one segmented broadcast to the
consolidated list. Anything less is unverifiable plumbing.

### Channel decision

Email and in-app only for now. **WhatsApp Business API is intended but not
yet affordable**, and most customers currently arrive via WhatsApp from paid
ads. Two consequences bind this design:

- **Phone is a first-class identity key from day one**, normalized to E.164,
  even though nothing sends to it yet. Deferring this would mean buying the
  WhatsApp API and discovering the contacts table holds only emails.
- **Channel dispatch sits behind one interface** so WhatsApp arrives later
  as a driver, not a rewrite. Concretely: the `campaigns` module resolves a
  segment to contacts and then hands them to a per-channel dispatcher
  (`dispatchEmail` in slice 1). Segment resolution, recipient snapshotting,
  suppression, and consent checks live above that boundary and are shared;
  only the send call itself is channel-specific. Adding WhatsApp means
  adding `dispatchWhatsApp` and a `channel` column on `campaigns`, not
  touching segment or campaign logic.

### Sheet access decision

Read sheets live through **two new actions on the existing GAS relay**, not
via `googleapis` with a service account. The relay already authenticates by
shared secret and already runs as the sheets' owner. Adding a dependency, a
service account, and 25 sheet-share operations to accomplish the same thing
is strictly worse.

Rejected: manual CSV upload per sheet (viable, but the column-mapping UI is
needed either way, so live reads cost little extra and support re-import);
GAS push webhooks like `sheet_leads` (built for ongoing per-course
reconciliation, wrong shape for a one-time bulk backfill).

## Module boundaries

Four modules, each independently testable.

| Module | Purpose | Depends on |
|---|---|---|
| `sheet-ingest` | GAS `listSheetTabs` / `readSheetRows`, column mapping, dry-run preview | GAS relay (exists) |
| `identity` | Phone/email/name normalization, duplicate scoring, merge. Pure functions — no DB, no network | nothing |
| `contacts` | Contacts store, purchase history, consent, unsubscribe | `identity` |
| `campaigns` | Segment evaluation, broadcast send | `contacts`, `email_queue` (exists) |

`identity` is deliberately pure and dependency-free. It is the component most
likely to be wrong — the `WhatsApp` column contains five distinct formats
within fourteen consecutive rows — and pure functions are where TDD pays.

## Data model (migration `0047`)

Fixed-value columns below (`consent_basis`, `import_batches.status`,
`merge_candidates.status`, `campaigns.status`, `contact_purchases.row_type`,
`contacts.discovery_source`) are declared as **Postgres enums**, consistent
with the existing schema's heavy use of them (`banner_slot`,
`course_status`, `enrollment_status`, `mentor_tier`, and others). They are
written as `text` in the sketches below only for readability.

### `contacts` — one row per human

```
id                        uuid pk
email                     text          -- normalized lowercase; unique index; nullable
phone_e164                text          -- unique index; nullable
phone_raw                 text          -- verbatim original, kept for audit
full_name                 text
profession                text
country                   text          -- 'PK' | 'AE' | 'SA'; from phone prefix / purchase currency
discovery_source          text          -- instagram | facebook | whatsapp | other | unknown (first touch)
consent_basis             text          -- 'purchase' | 'enquiry'
email_unsubscribed_at     timestamptz
whatsapp_unsubscribed_at  timestamptz
unsubscribe_token         uuid default gen_random_uuid()
profile_id                uuid null -> profiles(id)
created_at, updated_at    timestamptz
```

Both `email` and `phone_e164` are nullable and both carry unique indexes.
Today every sheet row has both; slice 2's WhatsApp-ad leads will arrive
phone-only. Allowing it now costs nothing.

There is no stored `lifetime_value` column. It is computed by RPC over
`contact_purchases`, following the precedent set by the mentor review stats
fix (aggregate in Postgres, not JS). Mixed PKR/AED purchases make a single
denormalized total misleading in any case.

`consent_basis` is `'purchase'` for every row imported in slice 1. The field
exists because slice 2's capture surfaces will introduce `'enquiry'`
contacts, which must never receive a campaign by default.

### `contact_purchases` — one row per purchasing sheet row

```
id                  uuid pk
contact_id          uuid -> contacts
import_batch_id     uuid -> import_batches
source_sheet_id     text
source_row_ref      text          -- tab name + row number
product_label       text          -- raw, e.g. "Individual — PKR 2,700 [Early Bird]"
course_id           uuid null -> courses
amount              numeric null
currency            text null     -- PKR | AED
is_early_bird       boolean
row_type            text          -- individual | group_leader | group_member
promo_code          text null
purchased_at        timestamptz null
UNIQUE (source_sheet_id, source_row_ref)
```

The unique constraint makes **re-import idempotent**. Given 25 sheets and a
mapping step that will be got wrong at least once, a bad import must be
fixable by re-running rather than by manual repair.

`product_label` stays raw and `course_id` stays nullable by design: labels
are free text and sheet-specific, and most of the 25 historical cohorts have
no corresponding `courses` row. Course mapping is best-effort enrichment,
never a blocker on import.

### `import_batches`

```
id, sheet_id, sheet_name, tab_name
column_mapping      jsonb
status              text          -- draft | previewed | committed | failed
rows_total, rows_imported, contacts_created, contacts_merged, rows_skipped
created_by          uuid -> profiles
created_at
```

One row per sheet-tab import. Every contact traces back to its origin.

### `merge_candidates`

```
id, contact_a_id, contact_b_id, reason, confidence
status              text          -- pending | merged | rejected
created_at, resolved_at, resolved_by
```

The human review queue for ambiguous duplicates.

### `campaigns` and `campaign_recipients`

```
campaigns
  id, name, subject, html_content
  segment           jsonb
  status            text          -- draft | scheduled | sending | sent | cancelled
  scheduled_at, started_at, completed_at, created_by, created_at

campaign_recipients
  id, campaign_id -> campaigns, contact_id -> contacts
  email_queue_id  uuid null -> email_queue
  status, created_at
  UNIQUE (campaign_id, contact_id)
```

`UNIQUE (campaign_id, contact_id)` makes double-sending structurally
impossible.

### Send path reuses `email_queue` wholesale

Sending a campaign inserts N rows into `email_queue` and links each through
`campaign_recipients.email_queue_id`. The existing `process-email-queue` edge
function drains and retries them; `brevo-webhook-handler` already records
opens, clicks, bounces, and complaints into `email_metrics`. Campaign
analytics come free from a three-table join, and no second sender exists to
diverge from the first.

**Throughput risk to verify before implementation.** `process-email-queue`
uses `BATCH_SIZE = 10`. Its cron cadence is configured in the Supabase
dashboard, not in migrations, and must be confirmed. At one run per minute a
3,000-recipient broadcast takes about five hours. That is tolerable but
should be a deliberate choice, and campaign-type rows likely warrant a larger
batch size.

## Ingest and identity resolution

### Import flow

1. Admin pastes a Sheet URL; `sheetId` is extracted.
2. GAS `listSheetTabs` returns tab names, header rows, and row counts.
3. Admin selects the tab.
4. **Column mapping**, auto-guessed from headers (`Name`, `Email`,
   `WhatsApp`, `Profession`, `Discovery`, `Registration Option`, `Consent`,
   `Row Type`, `Promo Code` are consistent enough across the sheets that most
   guesses land). Admin confirms or overrides. When a previous batch used
   identical headers, its mapping is prefilled.
5. **Dry run.** Parses everything and writes nothing. Reports rows parsed,
   new contacts, merges into existing, phone-normalization failures, distinct
   product labels found, and ten sample parsed rows.
6. Admin commits. Writes occur in one transaction; `import_batches` records
   the mapping used.

Step 5 is mandatory, not optional. Three thousand rows are not written on
faith.

### New GAS actions

Added to the existing `gas/sheets-sync/Code.gs` router under the same
shared-secret authentication:

- `listSheetTabs {sheetId}` → `[{name, headers[], rowCount}]`
- `readSheetRows {sheetId, tabName, offset, limit}` → `rows[][]`

`readSheetRows` is **paginated at approximately 500 rows per call**. Apps
Script enforces a six-minute execution ceiling and response-size limits, and
several of these sheets are large.

### Phone normalization

```
strip all non-digit characters; drop a leading "00"

92  prefix, 12 digits total  -> PK   +92...     (923478539155, 923705109810)
971 prefix, 12 digits total  -> AE   +971...    (971568346151)
966 prefix, 12 digits total  -> SA   +966...
0   prefix, 11 digits total  -> PK   strip 0, prepend 92   (03255965790)
3   prefix, 10 digits total  -> PK   prepend 92            (3234267102, 3198071841)
anything else                -> AMBIGUOUS
```

Ambiguous values store `phone_raw`, leave `phone_e164` null, and are listed
in the batch report for manual review. Every number observed in the sample
sheet resolves cleanly under these rules. What deliberately does not resolve:
two numbers in one cell, landlines, and malformed entries.

Guessing is explicitly rejected. A wrongly normalized number is an
unreachable contact that fails silently, and the failure only surfaces after
the WhatsApp API is purchased.

### Duplicate detection

**Auto-merge**, high confidence: identical normalized `email`, or identical
`phone_e164`.

**Review queue** (`merge_candidates`): identical normalized name plus
identical last nine phone digits under differing normalization; or identical
normalized name plus identical email local-part on differing domains
(catching typos such as `@gmail.con`).

**Merge rule**: the earliest `created_at` contact is canonical. Non-null
values beat null field by field; where both are non-null, the more recent
import wins. All `contact_purchases` reattach to the canonical contact —
which is precisely how repeat buyers spread across 25 sheets become purchase
history instead of duplicate rows.

### Product label parsing

`product_label` is always stored raw. A best-effort parse extracts `amount`,
`currency`, and `is_early_bird` from strings such as
`Individual — PKR 2,700 [Early Bird]` and
`Group — PKR 6,480 (3 × PKR 2,160/person)`.

`course_id` is set only where the admin explicitly maps a batch to a course
during import — **one dropdown per batch, not per row**, since one sheet is
one cohort. Most historical cohorts have no `courses` row and stay null.
Segmentation works from `product_label` and `import_batch_id` regardless.

### Pure functions (TDD targets)

`normalizePhone`, `normalizeEmail`, `normalizeName`, `parseProductLabel`,
`scoreDuplicate`, `renderMergeTags`, `buildSegmentQuery`. All tested against
real rows drawn from the actual sheets, including the ambiguous ones, before
any database work begins.

## Segments and campaigns

### Segment definition

A list of typed filters, combined with AND. No nested boolean logic in v1 —
that is what turns a segment builder into its own project.

Filterable fields: `import_batch_id`, `product_label`, `course_id`,
`row_type`, `discovery_source`, `country`, `profession`, `promo_code`,
`purchase_count`, `last_purchase_at`, `has_platform_account`.

Evaluated by a single Postgres RPC that accepts the `jsonb` definition and
returns matching contact ids plus a count. At 3,000 contacts, live evaluation
is correct; nothing is materialized.

Segments this makes available immediately, entirely from data already in the
sheets:

- **Group Leaders** (`row_type = group_leader`) — people who each recruited
  two additional buyers. The highest-value segment, already labelled.
- Bought a workshop, never bought a course — the ascension pitch.
- `purchase_count >= 2` — proven repeat buyers.
- `last_purchase_at` older than six months — win-back.
- `has_platform_account = false` — buyers still living only in a
  spreadsheet, to be moved onto the LMS.
- `discovery_source = instagram` — creative matched to acquisition channel.

**Two exclusions are hardcoded into the query and are not exposed as
filters**: unsubscribed contacts, and contacts with no email address. An
administrator must not be able to omit them.

### Campaign send

Draft (name, subject, body) → send test to self → resolve segment →
**snapshot** recipients into `campaign_recipients` → confirmation dialog
showing the exact recipient count → chunked insert into `email_queue` →
existing edge function drains → `brevo-webhook-handler` populates
`email_metrics`.

Recipients are snapshotted rather than resolved live at send time, so the
list cannot shift underneath a running send.

The body is a branded HTML shell reusing the styling already present in
`welcomeEmailHtml` (`src/lib/brevo.ts`), with a body slot and
`{{first_name}}` merge tags. The tag renderer is a pure function with a
tested fallback for missing names.

Per-campaign statistics derive from joining `campaign_recipients` →
`email_queue` → `email_metrics`.

### Unsubscribe and list hygiene

- Public `/unsubscribe/[token]` route, no authentication, single click, sets
  `email_unsubscribed_at`. The token is the `unsubscribe_token` column.
- The footer link is **injected by the sender, not authored in the
  template**. It cannot be omitted.
- **Automatic suppression**: any address with a hard bounce or complaint
  recorded in `email_metrics` is excluded from all future sends.

**Warm-up requirement.** The first broadcast targets addresses collected over
several years, so a meaningful dead-address rate should be expected. A large
bounce spike on a cold sending domain invites throttling or suspension by
Brevo, which is slow to reverse. Sends proceed in waves — newest cohorts
first — with the bounce rate reviewed between waves and an abort threshold.
The `import_batch_id` filter already provides the mechanism.

## Surfaces

Admin UI at `/dashboard/admin/crm`, following the tabbed pattern established
by the marketing CMS shipped 2026-09-03:

- **Contacts** — table, search, filters; contact detail showing purchase
  history
- **Import** — the wizard described above
- **Merge review** — pending `merge_candidates`, side by side, merge or
  reject
- **Segments** — builder with live matching count
- **Campaigns** — list, composer, per-campaign statistics

Per the project's standing rule, each screen is checked against the Stitch
project before any UI is written. `Admin: Marketing CMS` screens already
exist there; whether they cover the CRM surfaces is resolved during planning,
and any gap is handed back as a generation prompt rather than improvised.

## Error handling

Following existing project conventions:

- Data-layer mutations return discriminated `MutationResult` unions, as in
  `admin-lms.ts` and `admin-marketing.ts`.
- GAS calls never throw into the request path, mirroring the contract
  documented on `trashDriveFile` in `src/lib/data/drive-cleanup.ts`.
- Import commits are transactional; a failed import leaves no partial writes.
- Campaign send failures are per-recipient. One bad address never halts a
  run.

## Testing

- Pure functions in `identity` and `campaigns` are built test-first, against
  real rows extracted from the actual sheets.
- Data-layer and route tests follow the existing suite's patterns.
- Manual click-through of the full flow is required before the work is called
  done. Phase 7 shipped with clean `tsc`, `lint`, and `vitest` runs and still
  contained three real bugs that only clicking through revealed.

## Implementation phasing

Slice 1 is large for a single sitting — six tables, two GAS actions, an
import wizard, a merge-review queue, a segment builder, a campaign composer,
and a public unsubscribe route. The implementation plan splits it at a clean
seam, with a working, verifiable checkpoint at the end of each phase:

- **Phase 1a — get the data in.** Migration, `identity` pure functions, GAS
  actions, import wizard, merge review, contacts table and detail view.
  Checkpoint: all 25 sheets imported, duplicates resolved, purchase history
  visible per contact. Deliverable on its own even if 1b slipped.
- **Phase 1b — send to it.** Segment builder, campaign composer, send path
  over `email_queue`, unsubscribe route, suppression, per-campaign stats.
  Checkpoint: one real segmented broadcast delivered, with opens and clicks
  visible.

The phases are sequential, not parallel: 1b's segment builder is meaningless
without 1a's data.

## Out of scope for slice 1

Capture surfaces; lifecycle automation; WhatsApp sending; funnel analytics
dashboards. These are slices 2 through 5, each with its own spec.
