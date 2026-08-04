# Context prompt — paste this as the first message of a new session

## Project

PZ Academy Mentorship Portal — a Next.js 14 App Router LMS platform for Pharmacozyme. The real
app is `pz-academy-platform/` (run `npm run dev -- -p 3945` from there). Working dir has a `&` in
its path ("PZ Academy LMS & Site") — this breaks `npx`/`npm run` module resolution on Windows;
call binaries directly via `node_modules/.bin/<tool>` instead, and use POSIX-style paths (`/d/...`)
in Git Bash.

Stack: Next.js 14, TypeScript strict, Tailwind CSS, Supabase (Postgres + RLS + Auth), Brevo
(email), GAS + Google Drive (file storage — **never** Supabase Storage), Zod validation on every
API input, Vitest, Stitch (design source, MCP-connected).

Supabase project ref: `whqdasotjlhvrjmgiffk`. Branch: staying on `master`, no feature branches,
nothing pushed to any remote yet.

## Real accounts (do not fabricate credentials — these are genuine users)

| Email | Role |
|---|---|
| `pharmacozymeofficial@gmail.com` | admin |
| `hamzaansari4you@gmail.com` | student |
| `bp2001073hamzaahmed@gmail.com` | student |
| `hamzaansarilm10@gmail.com` | student |

Never reset passwords or trigger magic links for these unless explicitly asked — the user does
that themselves from the Supabase Auth dashboard. For automated testing, create disposable
`*@pharmacozyme.test` accounts via the service-role Admin API and delete them immediately after.

## PRD phase status

- Phase 1 (Auth) — full, production-working.
- Phase 2 (LMS Core) — full: student portal, drip unlock, quiz system, resource links.
- **Phase 4 (Course catalog + enrollment) — just shipped this session**, see below.
- Not built: Phase 0 (GAS↔Supabase payment webhook bridge), Phase 3 (Admin LMS Builder), Phase 5
  (sessions/booking), **Phase 6 (admin approval panel)**, Phases 7–12.

## Phase 4 — what shipped this session

- `supabase/migrations/0013_enrollment_insert_hardening.sql` — closed a self-enrollment exploit
  (student could previously insert their own `enrollments` row with `status='active'`,
  `cert_issued=true`, bypassing payment entirely). Applied live. Also added `courses.faqs jsonb`.
- API routes: `GET /api/courses/[slug]/curriculum` (public), `GET /api/students/me/enrollments`,
  `POST /api/enrollments` (hardcodes `status:'pending'` server-side), `POST
  /api/uploads/payment-screenshot` (relays to GAS, degrades gracefully — see gap below).
- `/courses` — DB-driven catalog, live search + type-filter pills, Stitch "Clinical Excellence +
  Modern Minimalist search bar" design.
- `/courses/[slug]` — Stitch "Clinical Excellence" single-flow detail page: hero, mentor row,
  stat cards, curriculum accordion, sticky sidebar with state-aware CTA (anon/none/pending/
  rejected+expired/active all handled).
- `/enroll/[slug]` — 3-step wizard (Confirm Info → Payment → Upload Proof) matching a
  purpose-generated Stitch "Enrollment Wizard: Clinical Excellence" screen, numbered stepper,
  success + verification-timeline state.
- `src/middleware.ts` — `/enroll/*` now auth-gated like `/dashboard/*`.
- Design discipline followed all session: `MarketingNav`/`MarketingFooter` untouched, no
  fabricated UI (no fake "seats left" widget, no per-outcome icons, no fake bank numbers).

## Gap 1 — CLOSED: GAS screenshot upload is live end-to-end

A brand-new GAS web app was built and deployed this session specifically for this (the old
deployment found on script.google.com was an unrelated dead stub returning a hardcoded fake
`voucherUrl` — confirmed via grep across both repos with zero matches for its `enroll` action or
`voucherUrl` field, so it was left alone/undeleted rather than reused).

- Source of truth: `gas/payment-screenshots/Code.gs` (version-controlled in this repo — the deployed
  copy lives in its own Apps Script project, "PZ Academy Platform", separate from the mentorship
  portal's GAS project).
- Deployed exec URL and a generated shared secret are both set in `.env.local` as `GAS_WEBAPP_URL`
  and `GAS_SHARED_SECRET`. The secret travels in the JSON body (not a header) because GAS `doPost`
  can't reliably read custom inbound headers — this is why it differs from the `X-GAS-Secret`
  header convention used for the *inbound* Phase 0 webhook direction.
- Folder structure confirmed working live: `PZ Academy/Payment Screenshots/<course-slug>/` is
  auto-created in the script owner's Drive, file gets `ANYONE_WITH_LINK` view access, response is
  `{ ok: true, url: <drive-url> }`.
- Verified twice: once via raw `fetch` (matching exactly what `payment-screenshot/route.ts` does)
  hitting the real deployed URL, both times a real file landed in Drive. Two `smoke-test*.png`
  files from this verification are still sitting in `ppc-batch-2`/`mdc-workshop` subfolders in the
  user's real Drive — harmless, but worth deleting whenever convenient.
- `src/components/enroll/EnrollWizard.tsx` now sends `courseSlug` in the upload `FormData`;
  `src/app/api/uploads/payment-screenshot/route.ts` now forwards `courseSlug` + `secret` to GAS.

**If GAS starts rejecting uploads next session**, check in this order: (1) `.env.local` still has
both vars set after any `git`/env changes, (2) the Apps Script's Script Properties still has
`SHARED_SECRET` matching `GAS_SHARED_SECRET` exactly, (3) the deployment is still the same one
(redeploying as a *new* deployment in Apps Script changes the `/exec` URL).

## Known gap 2 — placeholder content to replace before real launch

- `src/components/enroll/EnrollWizard.tsx` — `BANK_DETAILS` object is still placeholder values,
  explicitly TODO-commented. Needs real bank/account info before accepting real payments.
- `/courses` FAQ copy still references the old "AMS" naming in a couple of spots — user has been
  told this exists but has not asked for a fix yet.

## Next up: Phase 6 (admin approval panel)

**This is the confirmed next phase to build.** Phase 4's whole enrollment pipeline (catalog →
detail → wizard → GAS-backed screenshot upload) is now fully working end-to-end, but there is
still **no UI anywhere** to approve/reject a pending enrollment — admins must flip
`enrollments.status` manually via the Supabase Table Editor, and there's no way for an admin to
even *see* the payment screenshot without opening the Drive link by hand from a raw DB query.
`/dashboard/admin` is linked from `Sidebar.tsx` and `dashboard/admin/page.tsx` but the enrollments
sub-page 404s (unbuilt, expected).

Scope for Phase 6: an admin-only page listing pending enrollments (student, course, amount,
submitted-at, a link/preview to the payment screenshot), with approve (→ `status='active'`, the
existing `on_enrollment_activated` trigger auto-unlocks lesson 1 — don't reimplement that) and
reject (→ `status='rejected'` + a required `rejection_reason`) actions. Needs its own RLS-safe API
route(s) gated to `profiles.role='admin'`, matching the JWT+role validation rule already followed
by every other route this session.

**Your first task in this session:** brainstorm this fresh (same process as Phase 4 — spec → plan
→ build one file at a time → `tsc --noEmit` + `npm run build` after each), don't skip straight to
code.

## Known gotchas (avoid repeating)

- `CREATE OR REPLACE FUNCTION` can't change a `RETURNS TABLE` signature — must `DROP FUNCTION` first.
- No `jsonb::integer` cast in Postgres — use `integer[]` params instead of jsonb arrays.
- Dev server: background bash/task processes do not survive a session restart — check port 3945
  for a stale process before assuming the dev server is down, but expect to restart it.
- Never run a broad `taskkill //F //IM node.exe` (or equivalent) to clear a stuck dev server — it
  kills every Node process system-wide, not just the one you want. Find and kill the specific PID.
- Playwright/chrome-devtools file-upload tools reject a mismatched drive-letter case
  (`D:\...` vs the allowed-roots list's `d:\...`) — resubmit with the exact case from the error.
- Stitch MCP: if tools go missing mid-session, it's almost always the API key (fresh key lives in
  `.claude/Stitch API Key`) or the `-H` header flag needing to come **after** the positional URL in
  `claude mcp add stitch --transport http <url> -H "X-Goog-Api-Key: ..."` (it's variadic and
  swallows args placed before it).
