# CRM UX Overhaul: Detail Pages, Search, Manual Conversion

**Status:** Approved for planning
**Date:** 2026-09-30

## Problem

The CRM admin panel (`/dashboard/admin/crm`) has grown eight tabs deep, and the
sections with real lists (Contacts, Campaigns, Cohorts, WhatsApp, Agents) all
share the same pattern: clicking a row expands an inline accordion *underneath*
it, while the create-form above and every other row in the list stay on
screen. With WhatsApp batches running into dozens of recipients, Contacts
running into the thousands, and Cohorts about to grow from 2 imported sheets
to ~25, this clutters fast and makes it hard to focus on one thing.

Two other gaps: only Contacts and Campaigns have any search/filter at all, and
there is no way to mark a contact as converted for a program except through
the fully-automatic purchase-matching system (tag a batch with a course, match
against imported purchase rows within 30 days of send) — which has no
provision for a sale that happened outside that window, outside a tracked
batch, or that the import data simply doesn't capture cleanly (see the
existing `product_label`-is-not-a-clean-course-field gap this repo already
tracks).

## Goals

1. Give Contacts, Campaigns, Cohorts, WhatsApp, and Agents a real detail page
   per item, replacing the inline accordion, so the admin sees one thing at a
   time — matching the pattern Courses and Mentors already use elsewhere in
   this app.
2. Add search/filter to every list above, and to every detail page's own
   sub-list (batch recipients, a cohort's imported contacts, an agent's
   leads).
3. Let an admin manually record that a contact converted for a program —
   independent of any batch, campaign, or the automatic purchase-matching
   window — singly from a contact's detail page, or in bulk from the Contacts
   list's existing multi-select.

## Non-goals

- Import (a linear wizard) and Merge Review (a review queue) are unchanged —
  neither benefits from a list/detail split.
- The automatic conversion-matching logic (`resolveConversions` in
  `src/lib/crm/conversion.ts`) is not touched. Manual conversions are a
  separate, parallel fact — they do not feed into or change any batch's
  computed "X% converted" number.
- No new pagination system beyond what Contacts already has; Cohorts,
  WhatsApp batches, and Agents stay small enough (tens, not thousands) for a
  full-list fetch with client-side filtering.

## Section 1: Detail pages

### Routing

New dynamic routes, one per section, following the same Server
Component-page-fetches-then-hands-to-client-component convention already used
by `/dashboard/admin/courses/[id]`:

- `/dashboard/admin/crm/contacts/[id]`
- `/dashboard/admin/crm/campaigns/[id]`
- `/dashboard/admin/crm/cohorts/[id]`
- `/dashboard/admin/crm/whatsapp/[id]`
- `/dashboard/admin/crm/agents/[id]`

Each page: `requireAdminPage()`, fetch that item's detail server-side, render
a "← Back to [Section]" link plus a client component carrying the same
interactive pieces the old accordion had. A 404 (`notFound()`) when the id
doesn't resolve.

### List pages lose their accordion

`ContactsPanel`, `CampaignsPanel`, `WhatsAppPanel`, `ConversionPanel` (which
duplicates the WhatsApp/Campaign recipient drill-down) all drop their
`openId`/`detail`/`toggleDetail` state and inline expansion markup. A row
click becomes `router.push(...)` (or a plain `<Link>`) to the item's new page.
Every action currently inside the accordion — edit batch, edit message, queue
mode, the recipient table, phone editing, merge-candidate resolution details —
moves onto the new page verbatim; nothing is removed, only relocated.

`CohortsPanel` and `AgentsPanel` currently have **no** drill-down at all — a
flat table only. They gain one:

- **Cohort detail**: sheet name, tab name, course tag, import date, total
  rows imported, and a searchable list of the contacts/purchases that came in
  through that sheet (`contact_purchases` joined on `import_batch_id`), each
  linking to that contact's own new detail page. Needs a new
  `getCohortDetail(id)` in `admin-crm-import.ts`.
- **Agent detail**: name, token (copy-link button, reusing the existing
  copy-link UI from `AgentsPanel`), active toggle, created date, and a
  searchable list of leads submitted through that agent's link — name, phone,
  profession, status, submitted date — queried from `public.leads` filtered
  on `agent_id` (index already exists: `leads_agent_id_idx`). Needs a new
  `getAgentDetail(id)` in `admin-crm-agents.ts`, following the read pattern
  already in `src/lib/data/leads.ts`.

### Conversion tab

`ConversionPanel`'s per-item accordion (WhatsApp batch / campaign recipient
drill-down) is redundant once WhatsApp and Campaign detail pages exist. It
becomes a summary list only — each row links out to that item's real detail
page (`/whatsapp/[id]` or `/campaigns/[id]`) instead of expanding in place.

## Section 2: Search

Every list page gets a search input:

- **Contacts**: already server-searched (`search` query param hitting
  `/api/admin/crm/contacts`) — unchanged.
- **Campaigns**: already has a `campaignSearch` state variable wired up in
  the component but worth confirming it actually filters the rendered list
  end-to-end during implementation; extend to also filter by status if not
  already covered.
- **Cohorts, WhatsApp, Agents**: new client-side instant filter over the
  already-fetched full list (sheet+tab name for Cohorts, batch name for
  WhatsApp, agent name for Agents) — no new API needed, since these lists are
  small.

Every detail page with a sub-list gets the same client-side instant filter:
WhatsApp batch's recipient table, Cohort detail's contact list, Agent
detail's lead list, and a Contact detail's purchase history if it's grown
long enough to matter.

## Section 3: Manual conversion

### Data model

New migration `0059_crm_manual_conversions.sql`, following this repo's
established RLS convention (enabled, zero policies — service-role only via
`createAdminSupabase()`):

```sql
create table if not exists public.manual_conversions (
  id            uuid primary key default gen_random_uuid(),
  contact_id    uuid not null references public.contacts(id) on delete cascade,
  course_id     uuid references public.courses(id) on delete set null,
  program_label text, -- free-text program name when course_id is null
  converted_at  date not null default current_date,
  note          text,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists manual_conversions_contact_idx on public.manual_conversions (contact_id);

alter table public.manual_conversions enable row level security;
```

A row must have exactly one of `course_id` / `program_label` set — enforced
in the data-layer function, mirroring how `ConversionTag`'s `course` vs
`label` kinds are already handled, not with a DB constraint (matches this
repo's existing pattern of keeping that kind of validation in code, e.g.
`toConversionTag`/`fromConversionTag` in `admin-crm-conversions.ts`).

### Data layer & API

New `src/lib/data/admin-crm-manual-conversions.ts`:
- `listManualConversions(contactId)` — for the Contact detail page.
- `createManualConversion(input)` — single contact.
- `createManualConversionsBulk(contactIds, program, convertedAt, note)` — bulk
  path, one insert per contact.
- `deleteManualConversion(id)` — undo.

New routes:
- `POST /api/admin/crm/manual-conversions` — body `{ contactIds: string[],
  courseId?: string, programLabel?: string, convertedAt?: string, note?:
  string }` — same shape serves both the single and bulk cases (single is
  just `contactIds.length === 1`).
- `DELETE /api/admin/crm/manual-conversions/[id]`

### UI

- **Contact detail page**: a "Mark converted…" button opens a small form —
  program picker (existing course dropdown, or a free-text field, same
  course-or-label radio-button pattern `WhatsAppPanel`/`CampaignsPanel`
  already use for conversion tags), date (defaults today), optional note.
  Below it, a list of that contact's existing manual conversions with an
  "undo" per row.
- **Contacts list**: the existing checkbox multi-select (already feeding
  WhatsApp/Campaign batch creation) gains one more action in its selection
  bar — "Mark N selected as converted…" — opening the same form, applied to
  every selected contact in one request.
- **Optional surfacing**: a WhatsApp/Campaign detail page's recipient table
  may show a small badge next to a recipient who has *any* manual conversion
  on file, as a hint — but this reads from `manual_conversions` purely for
  display and never feeds the batch's own computed conversion percentage.

## Testing

- Unit tests for the new manual-conversion data-layer functions (mirroring
  existing `admin-crm-*` test coverage) — course-or-label validation,
  bulk-insert behavior, delete/undo.
- Unit tests for any new pure filtering helpers used by the client-side
  search additions, if the filtering logic is non-trivial enough to warrant
  one (a straightforward case-insensitive substring filter probably doesn't
  need a dedicated test, consistent with how trivial filters are handled
  elsewhere in this codebase).
- No new integration/E2E harness exists in this repo; verification for the
  page/routing changes happens the way the rest of this session's work was
  verified — `tsc --noEmit`, `vitest run`, a real `next build`, then a live
  click-through pass.

## Migration & rollout notes

- This is entirely additive at the schema level (one new table); no existing
  columns change, so no backfill is needed.
- Because every list page's row-click behavior changes (accordion → navigate),
  this should ship as one coherent change per section rather than partially —
  a half-migrated section (some rows still expanding inline, others
  navigating) would be more confusing than the current state.
