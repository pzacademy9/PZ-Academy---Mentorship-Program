# Students and Certificates Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the admin Students list and Student record, the admin Certificates list, and the student Certificates page, with certificates read live (read-only) from the separate cert app's Firestore.

**Architecture:** One server-only cert reader (`src/lib/certs/`) split into a pure model (types, mapping, grouping, filtering) and a thin Firestore source with a 60 s in-memory cache of the whole collection (about 1,000 docs). Student data comes from a data layer (`src/lib/data/admin-students.ts`) built on pure metric functions. Pages are server components; interactivity (tabs, filters) uses URL search params so they stay server-rendered. Certificates are never written to.

**Tech Stack:** Next.js App Router, Supabase (existing), `firebase-admin` (new dependency, server only), vitest + @testing-library/react, Tailwind with the existing `pz-*` tokens.

**Spec:** `docs/superpowers/specs/2026-10-26-students-certificates-design.md` (read it first; Stitch screens listed there are the visual reference, project id 4651274386787527431).

## Global Constraints

- Read-only to the cert app. Never write to Firestore. Never reuse the full-power key in the owner's "Firebase Service key" folder.
- Cert key arrives only via server env var `CERT_FIREBASE_SERVICE_ACCOUNT_JSON` (base64 of a service account JSON). Missing or invalid -> `CertSourceError` with message `Certificates app is not connected yet.`; pages show the "could not reach" state in certificate parts only, everything else still loads.
- Admin pages: `requireAdminPage()` (from `@/lib/auth/require-admin`), `export const dynamic = "force-dynamic"`, data via `createAdminSupabase()` inside `import "server-only"` modules.
- Student certificates page: signed-in student, matched by their auth email, case-insensitive. Students never see `pending` or `revoked` certificates; they see "Issued" for cert status `generated` and `sent`.
- Cert categories mirror the cert app: General = Courses, Workshops, Webinars, MED-Q; Official = Central Team, Sub Team, Ambassadors, Affiliates, Mentors.
- "View certificate" link = cert doc `verificationUrl`, else `https://cert.pharmacozyme.com/verify?certId=<uniqueCertId>` (never `pdfUrl`/`driveLink`).
- Plain words in all visible text. Existing design tokens only (`pz-*`; `tests/pz-tokens.test.ts` must not list any new file; it already fails on `SalesTeamPanel.tsx`, not ours). Mobile layout required (use `ResponsiveList`).
- Left out of v1 (do not build): Export CSV, Sync Status, WhatsApp message button, Edit student, Enroll in course, Generate statement, Send reminder, the "Cryptographic Proof Ledger" panel, any Stitch decoration ("Viewport mode", "Simulate state", "Compliance Verified", "Academic License").
- No migration, no change to `database.types.ts`. Source files often use CRLF: use the Edit tool.
- Branch `students-certificates` (already exists, has the docs). New commits only, trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Never push or merge without the owner's yes.
- `npm run` is broken in this path. Use: `node node_modules/vitest/vitest.mjs run tests/<file>`, `node node_modules/typescript/bin/tsc --noEmit` (baseline 0 errors), `node node_modules/eslint/bin/eslint.js <paths>`. Never run the full suite or `next build`.

## Review Focus

1. Cert app unreachable or env var missing: certificate sections show the error state; Students list and Student record still render (tested in Tasks 2, 6, 8, 9).
2. A student with no certificates, one with only Official, and one with revoked/pending only (Tasks 1, 4).
3. Emails differing in case or with spaces between auth and cert records still match (Tasks 1, 2).
4. A certificate whose `databaseId` has no matching database doc, or with a category outside General/Official: shows under topic fallback or an "Other" group, never crashes (Task 1).
5. Search with special characters or an empty result, and page numbers past the last page: clamp, never throw (Tasks 1, 5, 7).

---

## File Structure

- Create `src/lib/certs/cert-model.ts` (pure): types, constants, mapping, student status, grouping, filtering, paging.
- Create `src/lib/certs/cert-source.ts` (server-only): Firestore access + cache.
- Create `src/components/certs/CertificateGroups.tsx`: shared grouped display (admin record tab and student page).
- Create `src/app/dashboard/certificates/page.tsx` + `loading.tsx` (student).
- Create `src/app/dashboard/admin/certificates/page.tsx` + `loading.tsx`, `src/components/admin/certs/AdminCertificates.tsx`.
- Create `src/lib/students/student-metrics.ts` (pure).
- Create `src/lib/data/admin-students.ts` (server-only).
- Create `src/app/dashboard/admin/students/page.tsx` + `loading.tsx`, `src/components/admin/students/StudentsList.tsx`.
- Create `src/app/dashboard/admin/students/[id]/page.tsx` + `loading.tsx`, `src/components/admin/students/StudentRecord.tsx` and tab files in `src/components/admin/students/tabs/`.
- Modify `src/components/dashboard/nav.ts` (admin "Certificates" entry), `src/lib/data/admin-enrollments.ts` (export `resolveEmails`), `package.json` (+ `firebase-admin`).
- Create `docs/cert-connection-setup.md` (owner steps).

---

### Task 1: Cert model (pure)

**Files:**
- Create: `src/lib/certs/cert-model.ts`
- Test: `tests/cert-model.test.ts`

**Interfaces:**
- Produces:
  - `export type CertCategory = "General" | "Official"`
  - `export const CATEGORY_SUBCATS: Record<CertCategory, readonly string[]>` (the lists in Global Constraints, in that order)
  - `export type CertStatus = "pending" | "generated" | "sent" | "revoked"`
  - `export type CertRecord = { id: string; certId: string; name: string; email: string; category: CertCategory | "Other"; subCategory: string; topic: string; batchId: string; batchName: string; issueDate: string; status: CertStatus; viewUrl: string }`
  - `export type CertBatch = { id: string; name: string; category: CertCategory | "Other"; subCategory: string; topic: string }`
  - `export function mapCert(id: string, raw: Record<string, unknown>, batches: Map<string, CertBatch>): CertRecord`
  - `export function normEmail(v: string | null | undefined): string` (trim + lowercase)
  - `export function isIssuedForStudent(c: CertRecord): boolean` (status `generated` or `sent`)
  - `export function groupCerts(certs: CertRecord[]): { category: CertCategory | "Other"; groups: { subCategory: string; certs: CertRecord[] }[] }[]` (order: General, Official, Other; sub-groups in `CATEGORY_SUBCATS` order, unknown sub-categories last; newest first within a group; empty groups omitted)
  - `export type CertQuery = { category?: CertCategory; subCategory?: string; batchId?: string; status?: CertStatus; search?: string; page?: number; pageSize?: number }`
  - `export function queryCerts(all: CertRecord[], q: CertQuery): { rows: CertRecord[]; total: number; page: number; pageCount: number; counts: { byCategory: Record<string, number>; bySubCategory: Record<string, number>; byStatus: Record<string, number> } }` (filters, then search "contains" case-insensitive over name, email, certId; sorts newest issueDate first; `page` clamped to 1..pageCount; `counts` computed with every filter except the one they describe, so chips show useful numbers; default pageSize 25)
  - `export function batchesFor(all: CertRecord[], category: CertCategory, subCategory?: string): { id: string; name: string; topic: string; count: number }[]`

- [ ] **Step 1: Write failing tests** in `tests/cert-model.test.ts` with explicit fixtures:
  - `mapCert` uses `verificationUrl` when present, else `https://cert.pharmacozyme.com/verify?certId=PZ-2026-AAAA1111`; ignores `pdfUrl`/`driveLink`.
  - `mapCert` with a `databaseId` absent from the batch map uses the cert's own `topic` as `batchName`; with `category: "Weird"` gives `"Other"`; with a missing `status` gives `"pending"`.
  - `normEmail("  Ayesha@X.COM ")` equals `"ayesha@x.com"`; `normEmail(null)` equals `""`.
  - `isIssuedForStudent` true for generated/sent, false for pending/revoked.
  - `groupCerts` ordering as specified, omits empty groups, puts unknown sub-category last, newest first.
  - `queryCerts`: status filter, search `"fatima"` matches name, search by half an email, search by certId, search with regex characters (`"(a+"`) returns zero rows and does not throw, page 99 clamps to last page, empty input gives `total: 0, pageCount: 1, page: 1`.
  - `batchesFor` returns batches with counts for a category/sub-category.
- [ ] **Step 2: Run** `node node_modules/vitest/vitest.mjs run tests/cert-model.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `cert-model.ts` per the signatures. `issueDate` is a string in the cert app; if it is not a parsable date, sort it last. No Firestore imports here.
- [ ] **Step 4: Run** the test. Expected: PASS. Run `tsc --noEmit` and eslint on the two files.
- [ ] **Step 5: Commit** `feat(certs): cert model (mapping, grouping, query)`.

---

### Task 2: Cert source (Firestore, read-only, cached)

**Files:**
- Create: `src/lib/certs/cert-source.ts`
- Modify: `package.json` (add `firebase-admin` with a pinned current stable version via `npm install firebase-admin --save-exact`; use `node` to run npm if `npm` itself fails: `node "<node dir>/node_modules/npm/bin/npm-cli.js" ...`)
- Test: `tests/cert-source.test.ts`

**Interfaces:**
- Consumes: `mapCert`, `normEmail`, `CertRecord`, `CertBatch` from Task 1.
- Produces:
  - `export class CertSourceError extends Error {}`
  - `export async function getAllCerts(): Promise<CertRecord[]>` (reads `certificates` and `databases` once, maps, caches 60 s in module memory; concurrent callers share one in-flight load)
  - `export async function getCertsByEmail(email: string): Promise<CertRecord[]>` (filters `getAllCerts()` by `normEmail` equality, so it shares the cache)
  - `export function resetCertCacheForTests(): void`
  - Initialises a named firebase-admin app (`"cert-readonly"`) from `CERT_FIREBASE_SERVICE_ACCOUNT_JSON` (base64 JSON); never touches the default app. Missing/invalid env -> `CertSourceError("Certificates app is not connected yet.")`; Firestore failure -> `CertSourceError("Could not reach the Certificates app.")` (never leak the underlying message).

- [ ] **Step 1: Write failing tests** mocking `firebase-admin/app` and `firebase-admin/firestore` (vi.mock) so `collection("certificates").get()` and `collection("databases").get()` return fixtures:
  - returns mapped certs joined with database names; second call within 60 s does not call Firestore again (`vi.useFakeTimers`); after 61 s it does.
  - two concurrent calls trigger one load.
  - `getCertsByEmail("  AYESHA@x.com ")` matches a cert stored as `ayesha@x.com`.
  - env var missing -> rejects with `CertSourceError` and message `Certificates app is not connected yet.`; Firestore `get` rejecting -> `CertSourceError("Could not reach the Certificates app.")`, and the error message does not contain the underlying text.
  - a failed load is not cached (next call retries).
- [ ] **Step 2: Run** `tests/cert-source.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** with `import "server-only"`. Only `.get()` calls; no `set/update/add/delete` anywhere in the file (add a test that greps the source for those method names and fails if found).
- [ ] **Step 4: Run** test, tsc, eslint. Expected: PASS, 0 errors.
- [ ] **Step 5: Commit** `feat(certs): read-only Firestore source with cache`.

---

### Task 3: Shared grouped certificate display

**Files:**
- Create: `src/components/certs/CertificateGroups.tsx`
- Test: `tests/certificate-groups.test.tsx`

**Interfaces:**
- Consumes: `groupCerts`, `CertRecord` from Task 1.
- Produces: `export function CertificateGroups(props: { certs: CertRecord[]; variant: "student" | "admin"; pendingCount?: number; emptyText: string }): JSX.Element`
  - Headings "General" / "Official" (and "Other" only if present), small sub-group labels, a row/card per cert: topic, batch name, certificate number, issue date, status chip, link text `View certificate` (`target="_blank"`, `rel="noopener noreferrer"`, href = `viewUrl`).
  - `variant="student"`: status chip always "Issued"; the caller passes only issued certs. When `pendingCount > 0` render one calm amber card: `1 certificate is being prepared. We will tell you here when it is ready.` / `{n} certificates are being prepared. We will tell you here when they are ready.`
  - `variant="admin"`: chips Sent / Generated / Pending / Revoked; revoked rows get a muted class.
  - Empty (no certs, no pending): shows `emptyText`.

- [ ] **Step 1: Write failing tests**: grouped headings order; student variant shows "Issued" and the singular and plural pending card copy exactly as above; admin variant shows each status chip text and muted revoked row; link href equals `viewUrl` and has `rel`; empty shows `emptyText`; Official heading absent when there are no Official certs.
- [ ] **Step 2: Run** the test. Expected: FAIL.
- [ ] **Step 3: Implement** with existing tokens and `Badge`/`EmptyState` from `src/components/ui`. Follow Stitch "Grouped Certificates" screens.
- [ ] **Step 4: Run** test, tsc, eslint, `tests/pz-tokens.test.ts` (new files must not be listed).
- [ ] **Step 5: Commit** `feat(certs): grouped certificate display component`.

---

### Task 4: Student Certificates page

**Files:**
- Create: `src/app/dashboard/certificates/page.tsx`, `src/app/dashboard/certificates/loading.tsx`
- Create: `src/lib/data/student-certificates.ts` (server-only)
- Test: `tests/student-certificates.test.ts`

**Interfaces:**
- Consumes: `getCertsByEmail` (Task 2), `isIssuedForStudent`, `normEmail` (Task 1), `CertificateGroups` (Task 3).
- Produces: `export async function getMyCertificates(): Promise<{ state: "ok"; issued: CertRecord[]; pendingCount: number } | { state: "unavailable" }>` — uses the signed-in user (`createServerSupabase().auth.getUser()`), their email, and their active enrollments for the pending count.
  - `pendingCount` = `max(0, finishedGeneralCourses - issuedGeneralCerts)` where "finished course" = an enrollment whose course has every lesson `completed` in `lesson_progress` for that student (export a pure helper `countFinishedCourses(enrollments, lessonsByCourse, completedLessonIds): number` from `src/lib/students/student-metrics.ts` in Task 6; until then define it here and move it in Task 6, keeping the signature).
  - Official certificates are shown but never count toward the pending calculation.

- [ ] **Step 1: Write failing tests** for `getMyCertificates` with mocked supabase and cert source: only generated/sent returned; revoked and pending hidden; two finished courses and one issued General cert gives `pendingCount: 1`; Official-only certs give `pendingCount` unaffected; cert source throwing `CertSourceError` gives `{ state: "unavailable" }`; no signed-in user redirects to `/login` (match how `src/app/dashboard/courses/page.tsx` handles it).
- [ ] **Step 2: Run** the test. Expected: FAIL.
- [ ] **Step 3: Implement** the data function and the server page: heading "Certificates", `CertificateGroups variant="student"` with `emptyText="You do not have any certificates yet. Finish a course to earn one."`; unavailable state uses `ErrorState` with `We could not load your certificates. Try again in a minute.`
- [ ] **Step 4: Run** test, tsc, eslint.
- [ ] **Step 5: Commit** `feat(certs): student certificates page`.

---

### Task 5: Admin Certificates page

**Files:**
- Create: `src/app/dashboard/admin/certificates/page.tsx`, `loading.tsx`
- Create: `src/components/admin/certs/AdminCertificates.tsx`
- Modify: `src/components/dashboard/nav.ts` (add `{ label: "Certificates", href: "/dashboard/admin/certificates", icon: Award, roles: ["admin", "super_admin"] }` next to the Students entry)
- Test: `tests/admin-certificates.test.tsx`

**Interfaces:**
- Consumes: `getAllCerts`, `queryCerts`, `batchesFor`, `CertQuery` (Tasks 1-2), `CertificateGroups`' status chip styling (reuse, do not copy).
- Produces: page reads `searchParams` `{ tab?: "general"|"official", group?, batch?, status?, q?, page? }`, calls `queryCerts`, renders `<AdminCertificates data=... />`. All controls are `<Link>`s that rebuild the query string (server-rendered, no client state); search is a GET form.
- Layout (Stitch "Enhanced Certificates Admin"): soft strip `Certificates are made in the Certificates app. This page shows them here.` + button `Open Certificates app` (`https://cert.pharmacozyme.com`, new tab); big tabs General/Official with counts; group chips with counts (All + sub-categories of the open tab); horizontally scrolling batch cards (All batches first; name, topic, `N certificates`); search box `Search by name, email or certificate number`; status chips All, Sent, Generated, Pending, Revoked; table via `ResponsiveList` (name, email, group chip, batch, topic, certificate number, issue date, status chip, `View certificate`); paging (Previous/Next + `Showing X to Y of N`); empty state `No certificates found.`; error state `We could not reach the Certificates app. Try again in a minute.` with a Try again link.

- [ ] **Step 1: Write failing tests** on `AdminCertificates` with fixture data: tab links carry `?tab=official`; chip hrefs preserve the other params and reset `page`; batch card links set `batch`; table shows all columns for a row and the correct `View certificate` href; empty state text; unavailable state text and a Try again link; `Open Certificates app` href; pagination text.
- [ ] **Step 2: Run** the test. Expected: FAIL.
- [ ] **Step 3: Implement** page + component. Page catches `CertSourceError` and renders the unavailable state. Add the nav entry; extend any nav test if one lists admin entries (run `tests` that import `nav.ts`).
- [ ] **Step 4: Run** test, tsc, eslint, `tests/pz-tokens.test.ts`, and nav-related tests (`grep -l "nav" tests`).
- [ ] **Step 5: Commit** `feat(certs): admin certificates page`.

---

### Task 6: Student metrics (pure)

**Files:**
- Create: `src/lib/students/student-metrics.ts`
- Test: `tests/student-metrics.test.ts`

**Interfaces:**
- Produces:
  - `export function progressPercent(totalLessons: number, completedLessons: number): number` (0 when no lessons; rounded; capped 100)
  - `export function countFinishedCourses(courses: { courseId: string; lessonIds: string[] }[], completedLessonIds: Set<string>): number` (a course with zero lessons is not finished)
  - `export function sessionsAttended(attended: number, held: number): { attended: number; held: number; label: string }` (label `5 of 6`; if `held` is 0 then `5`; attended is never shown above held: held becomes `max(held, attended)`)
  - `export function averageRating(stars: (number | null)[]): number | null` (ignores nulls; one decimal; `null` when none)
  - `export type AttentionItem = { key: string; title: string; detail: string }`
  - `export function needsAttention(input: { enrollments: { courseTitle: string; status: string }[]; finishedCourses: number; issuedGeneralCerts: number }): AttentionItem[]` — items: `Payment pending for <course>` for status `pending`; `Payment rejected for <course>` for `rejected`; `N certificate(s) not yet issued` when `finishedCourses > issuedGeneralCerts`.

- [ ] **Step 1: Write failing tests** with the exact examples above (e.g. `sessionsAttended(5,6).label === "5 of 6"`, `sessionsAttended(7,6).label === "7 of 7"`, `averageRating([5,4,null]) === 4.5`, `averageRating([]) === null`, `countFinishedCourses` with an empty-lessons course returns 0 for it).
- [ ] **Step 2: Run** `tests/student-metrics.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the functions. Move `countFinishedCourses` here if Task 4 defined a local copy and update Task 4's import.
- [ ] **Step 4: Run** the tests (also `tests/student-certificates.test.ts`), tsc, eslint.
- [ ] **Step 5: Commit** `feat(students): pure student metric helpers`.

---

### Task 7: Students data layer

**Files:**
- Create: `src/lib/data/admin-students.ts` (server-only)
- Modify: `src/lib/data/admin-enrollments.ts` (export `resolveEmails`; no behaviour change)
- Test: `tests/admin-students.test.ts`

**Interfaces:**
- Consumes: `resolveEmails`, Task 6 metrics, `getAllCerts`/`normEmail`/`isIssuedForStudent` (Tasks 1-2).
- Produces:
  - `export type StudentFilter = "all" | "active" | "payment-pending" | "finished"` (the "No login for 30 days" filter is dropped: no cheap last-login source; note this in the final report)
  - `export type StudentListRow = { id: string; fullName: string; email: string | null; phone: string | null; joinedAt: string; courses: { title: string; status: string }[]; progress: number; attended: string; certificate: "issued" | "pending" | "none" | "unknown" }`
  - `export async function listStudents(q: { search?: string; filter?: StudentFilter; page?: number }): Promise<{ rows: StudentListRow[]; total: number; page: number; pageCount: number }>` — a student = `profiles.role = 'student'` OR has at least one enrollment. Search is case-insensitive "contains" over name, email, phone. Page size 25. `certificate`: `issued` if they have an issued cert, else `pending` if finished courses exceed issued General certs, else `none`; `unknown` when the cert source is unavailable (list still works).
  - `export type StudentRecordData = { profile: {...}; tiles: {...}; enrollments: {...}[]; progressByCourse: {...}[]; attendance: {...}[]; feedback: {...}[]; mentorship: {...}[]; certs: { state: "ok"; certs: CertRecord[]; pendingCount: number } | { state: "unavailable" }; recentActivity: { at: string; text: string }[]; attention: AttentionItem[] }`
  - `export async function getStudentRecord(id: string): Promise<StudentRecordData | null>` (null when the profile is neither role student nor enrolled -> page calls `notFound()`).
- Data rules (the builder maps tables; these definitions are fixed): progress = completed `lesson_progress` rows over total lessons in the student's active enrollments' courses (`modules` -> `lessons`); sessions attended = rows in `attendance` for the student; sessions held = distinct (`course_id`, `session_date`) in `attendance` across all students for the student's enrolled courses; average feedback = mean `star_value` of `feedback_answers` joined through `feedback_responses.participant_profile_id = student id` (fall back to matching `participant_email`); mentorship = `mentorship_bookings` where `student_id` = id; recent activity = latest 8 of enrollments, attendance, feedback responses and issued certificates by date.

- [ ] **Step 1: Write failing tests** with a stubbed Supabase and cert source: search by email returns the right student; filter `payment-pending` returns only students with a pending enrollment; page clamps; an enrolled mentor profile appears, a plain mentor with no enrollments does not; cert source throwing gives `certificate: "unknown"` for every row and rows still returned; `getStudentRecord` returns `null` for a non-student without enrollments; record's certs `unavailable` when the cert source throws while the rest is populated.
- [ ] **Step 2: Run** `tests/admin-students.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Fetch in a few set-based queries per page (no per-student query loops). Email search needs emails for all candidate profiles: call `resolveEmails` for all student ids once per request (accepted at current size).
- [ ] **Step 4: Run** tests, tsc, eslint, and `tests/admin-enrollments-*.test.ts` (unchanged behaviour).
- [ ] **Step 5: Commit** `feat(students): admin students data layer`.

---

### Task 8: Students list page

**Files:**
- Create: `src/app/dashboard/admin/students/page.tsx`, `loading.tsx`
- Create: `src/components/admin/students/StudentsList.tsx`
- Test: `tests/students-list.test.tsx`

**Interfaces:**
- Consumes: `listStudents`, `StudentListRow`, `StudentFilter` (Task 7).
- Page reads `searchParams` `{ q?, filter?, page? }` (invalid `filter` falls back to `all`).
- Layout (Stitch "Students Directory"): search box `Search by name, email or phone` (GET form); chips All, Active, Payment pending, Finished course; table via `ResponsiveList`: avatar initials (`Avatar`), name, email, up to two course chips then `+N`, progress bar + percent, sessions attended, certificate chip (`Issued` / `Pending` / `None`; `unknown` shows a muted dash), joined date; row links to `/dashboard/admin/students/<id>`; count line `126 students` (singular `1 student`); empty `No students match your search.`; paging like Task 5.

- [ ] **Step 1: Write failing tests**: a row links to its record; `+N` chip appears with 3 courses; certificate chip texts; `unknown` shows a dash and no chip; count line singular/plural; empty state text; chip hrefs preserve `q`.
- [ ] **Step 2: Run** the test. Expected: FAIL.
- [ ] **Step 3: Implement** page and component.
- [ ] **Step 4: Run** test, tsc, eslint, `tests/pz-tokens.test.ts`.
- [ ] **Step 5: Commit** `feat(students): students list page`.

---

### Task 9: Student record page

**Files:**
- Create: `src/app/dashboard/admin/students/[id]/page.tsx`, `loading.tsx`
- Create: `src/components/admin/students/StudentRecord.tsx` and `src/components/admin/students/tabs/{Overview,CoursesPayments,Progress,Attendance,Feedback,Certificates,Mentorship}.tsx`
- Test: `tests/student-record.test.tsx`

**Interfaces:**
- Consumes: `getStudentRecord`, `StudentRecordData` (Task 7), `CertificateGroups` (Task 3).
- Tab selection is `?tab=overview|courses|progress|attendance|feedback|certificates|mentorship` (default overview; invalid falls back); tabs are `<Link>`s; only the open tab renders.
- Header: back link `Back to Students`, name, email, phone, joined date, status chips. Five tiles: Courses, Progress, Sessions attended, Average feedback (`—` when none), Certificate. Overview tab: cards `Recent activity` and `Needs attention` (empty text `Nothing needs attention.`). Courses and payments: row per enrollment (course, status chip Paid/Pending/Rejected mapped from enrollment status, amount in PKR via `formatPkr`, date, plain link `Open enrollment` to `/dashboard/admin/enrollments/<enrollmentId>`). Certificates tab: `CertificateGroups variant="admin"` with `emptyText="No certificates found for this email."`; when `certs.state === "unavailable"` show `We could not reach the Certificates app. Try again in a minute.` in that tab and the Certificate tile shows a dash. Other tabs: simple tables with an empty state each.
- Page calls `requireAdminPage()`; `notFound()` when `getStudentRecord` returns null.

- [ ] **Step 1: Write failing tests** on `StudentRecord`: tile texts for a fixture; default tab is Overview; `?tab=certificates` shows grouped certificates; invalid tab falls back to Overview; unavailable certs show the error text in the Certificates tab while Overview still renders; no action buttons from the "left out" list appear; `Open enrollment` href.
- [ ] **Step 2: Run** the test. Expected: FAIL.
- [ ] **Step 3: Implement** page, component and tabs. Keep each tab file small and presentational.
- [ ] **Step 4: Run** test, tsc, eslint, `tests/pz-tokens.test.ts`.
- [ ] **Step 5: Commit** `feat(students): student record page`.

---

### Task 10: Owner setup doc and final check

**Files:**
- Create: `docs/cert-connection-setup.md`

- [ ] **Step 1: Write** `docs/cert-connection-setup.md` in plain words for the owner: create a service account in the cert Firebase project with only the `Cloud Datastore Viewer` role; download its JSON key; base64-encode it (give one Windows PowerShell command); add as `CERT_FIREBASE_SERVICE_ACCOUNT_JSON` in `.env.local` and in Vercel (Production and Preview); redeploy; how to check it worked (open Admin, Certificates); never reuse the full-power key.
- [ ] **Step 2: Run** the new test files together (`cert-model`, `cert-source`, `certificate-groups`, `student-certificates`, `admin-certificates`, `student-metrics`, `admin-students`, `students-list`, `student-record`), plus `tests/pz-tokens.test.ts` (expected: only the known `SalesTeamPanel.tsx` failure), `tsc --noEmit` (0 errors), eslint on all new paths.
- [ ] **Step 3: Commit** `docs: cert connection setup for the owner`.
- [ ] **Step 4:** Report: what was built, what was left out (list from Global Constraints), the dropped "No login for 30 days" filter, the owner-owed key.
