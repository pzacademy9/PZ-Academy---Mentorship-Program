# UI Polish, Spec 1: Feel Fast and Solid

Date: 2026-10-01
Status: approved in brainstorming, awaiting written-spec review
Follow-up: Spec 2, "Delight" (beautiful, fun, engaging), is brainstormed after this spec is approved. It builds on the components defined here.

## Goal

Make every screen respond the moment it is clicked, and make every action safe to click.

- Navigation shows instant feedback: a top progress bar, then a skeleton shaped like the destination page.
- Action buttons show a spinner while working and cannot submit twice.
- Errors, missing pages and empty lists look intentional and on-brand, never bare framework screens or blank space.
- Native browser `confirm()` and `alert()` popups are gone.

Out of scope: visual redesign, new features, motion and celebration work (Spec 2), and converting mutations to server actions.

## Current state (surveyed 2026-10-01)

- 61 `page.tsx` routes. 0 `loading.tsx`, 0 `error.tsx`, 0 `not-found.tsx`. Pages are server components that block on data, so clicks show nothing until the next page is ready.
- 52 files call `fetch(` from client handlers. Each guards its own button ad hoc (`disabled={saving}`, local `setSaving`, or `useTransition`). A state-only guard can let a very fast double click through before React re-renders.
- 71 files use raw `<button>`; only 5 use the shared `<Button>` (`src/components/ui/button.tsx`, shadcn + cva).
- Spinners are inconsistent: `Loader2`/`animate-spin` in 7 files, no Skeleton component.
- `confirm()`: `TemplatePicker.tsx`, `WhatsAppPanel.tsx`, `BannersPanel.tsx`. `alert()`: 3 calls in `BookingClient.tsx`.
- Sonner is mounted in `app/layout.tsx` and used in about 50 files. Radix Dialog exists in `components/ui/dialog.tsx`.
- Theme: HSL tokens in `app/globals.css` (`--muted`, `--border`, `--primary`, and so on) with a `.dark` variant. Tailwind `darkMode: ["class"]`.
- Layouts: `app/layout.tsx`, `app/dashboard/layout.tsx` (sidebar and header), `app/portal/[slug]/layout.tsx`.

## Design reference

Stitch project "PZ Academy Platform 1" (11811490301995978699) has these screens: "Loading Skeleton State", "404: Page Not Found", "Empty Dashboard State", "Course Catalog: Empty State" and "Attendance: Error States". Take structure and layout from them, and colors from the live theme tokens. The Stitch screens use an older dark and yellow palette; the live app is green with light and dark modes.

- Skeleton: the sidebar and header stay real; only the content area becomes soft shimmer blocks that mirror the real layout.
- 404: illustration or icon tile, "Page Not Found" heading, one line of copy, primary "Go to Dashboard" and outline "Browse Courses".
- Empty state: icon tile, heading, one line of copy, primary action and optional secondary action.
- Error: tinted card with a coloured left border, icon, title, message and a Retry button.

## Section 1: Shared building blocks

All new UI primitives go in `src/components/ui/`.

1. **`skeleton.tsx`.** `<Skeleton className>` is a `bg-muted` rounded block with a shimmer sweep, a keyframe added to the Tailwind config. The shimmer is disabled under `motion-reduce`. It is `aria-hidden`.
2. **`skeletons/` layout shapes**, built only from `<Skeleton>`:
   - `TableSkeleton`: optional title, filter bar and `rows` rows (default 8) with `cols` columns.
   - `DetailSkeleton`: back-link, title and `sections` section cards.
   - `CardGridSkeleton`: optional stat-tile row (`stats`, default 4) and a grid of `cards` cards.
   - `FormSkeleton`: `fields` label-plus-input pairs and a button.
   - `ChatSkeleton`: thread list column and message bubbles alternating sides.

   Each shape matches the real page's outer spacing and widths so nothing jumps when content arrives. Each wraps its contents in `role="status"` with an `sr-only` "Loading…" label.
3. **`button.tsx` upgrade.** Add an optional `loading?: boolean` prop.
   - When true: the button is `disabled`, sets `aria-busy="true"`, and renders a `Loader2` spinner in place of any leading icon, or before the label if there is no icon.
   - The label stays, so the width does not change.
   - The prop is ignored when `asChild` is set.
   - Existing call sites are unaffected.
4. **`useAsyncAction` (`src/hooks/useAsyncAction.ts`).** `const { run, pending } = useAsyncAction(fn)`.
   - A `useRef` lock: a `run` call while one is in flight returns immediately without calling `fn`.
   - `pending` is React state for rendering.
   - The lock and `pending` release in `finally`, so a thrown error never leaves a button stuck.
   - `run` returns `fn`'s result, or `undefined` when the call was ignored.
5. **`confirm-dialog.tsx`.** A `ConfirmProvider` mounted once in the root layout, plus a `useConfirm()` hook.
   - Usage: `const ok = await confirm({ title, description?, confirmLabel?, destructive? })` resolves `true` or `false`.
   - Built on the existing Radix Dialog. Escape and overlay click resolve `false`.
   - A destructive confirmation uses the destructive button variant.
6. **`empty-state.tsx`.** `<EmptyState icon title description? action? secondaryAction? />`, following the Stitch layout and centered within its container. `action` takes a `{ label, href | onClick }` shape rendered with `<Button>`.
7. **Top progress bar.** Add the `nextjs-toploader` dependency and mount `<NextTopLoader>` once in `app/layout.tsx`. Settings: color `hsl(var(--primary))`, height 3, `showSpinner={false}`, no shadow glow beyond the default. This is the only new dependency.

## Section 2: Route placement

A segment's `loading.tsx` replaces only the page content, so persistent layouts (the sidebar and header in `dashboard/layout.tsx`, the portal layout) stay visible. A `loading.tsx` also covers child segments that lack their own.

| Segment (`src/app/...`) | Skeleton |
|---|---|
| `dashboard/` | CardGrid (stats + cards); also the fallback for children without their own |
| `dashboard/admin/` | CardGrid (stats) |
| `dashboard/admin/{crm,enrollments,feedback,mentors,courses,mentorship,sheet-sync,marketing}/` | Table |
| `dashboard/admin/feedback/{audit-log,question-bank}/` | Table |
| each `[id]/` under `dashboard/admin/` (crm contacts, campaigns, whatsapp, cohorts, agents; enrollments; feedback; mentors; courses) | Detail |
| `dashboard/mentor/feedback/[id]/` | Detail |
| `dashboard/admin/courses/[id]/builder/`, `dashboard/admin/courses/new/`, `dashboard/admin/mentors/new/`, `dashboard/admin/notifications/`, `dashboard/settings/`, `dashboard/mentor/profile/`, `dashboard/mentor/availability/`, `dashboard/mentor-application/` | Form |
| `dashboard/messages/`, `dashboard/mentor/messages/` (and their `[...]` children by inheritance) | Chat |
| `dashboard/{courses,sessions,notes,notifications}/`, `dashboard/mentor/`, `dashboard/mentor/feedback/` | Table or CardGrid, matching each page's real layout |
| `portal/[slug]/`, `portal/[slug]/lessons/[lessonId]/` | Detail (lesson shape: video block and text lines) |
| `courses/`, `webinars/`, `workshops/`, `mentorship/` | CardGrid |
| `courses/[slug]/`, `mentorship/mentors/[slug]/`, `mentorship/book/[slug]/`, `enroll/[slug]/`, `feedback/[id]/` | Detail or Form, matching each page |

Auth pages (`(auth)/*`), token pages (`review/[token]`, `unsubscribe/[token]`, `leads/add/[token]`), `coming-soon` and `mentorship/thank-you` are small and fast. They get no dedicated skeleton; the progress bar covers them.

**Errors.**
- `app/error.tsx`, `app/dashboard/error.tsx` and `app/portal/[slug]/error.tsx`, all client components, render a shared `<ErrorState>` card in the Stitch error style. It shows "Something went wrong", a short reassuring line, a **Try again** button calling `reset()`, and a "Go to dashboard" link (or "Go home" outside the dashboard).
- `app/global-error.tsx` covers a root-layout crash with a minimal self-contained version, since it renders its own `<html>`.
- No error details are shown to users; `error.digest` is logged with `console.error`.

**404.** `app/not-found.tsx` follows the Stitch 404 layout: a large icon tile (an illustration only if a brand asset already exists in `public/`), "Page Not Found", one line of copy, and buttons "Go to Dashboard" (primary) and "Browse Courses" (outline, `/courses`).

**Client-loaded panels.** Components that fetch in the browser and currently render "Loading…" text or nothing while loading switch to the matching skeleton shape. Examples are the CRM tabs and admin panels; the sweep finds the rest.

**Empty states.** Lists and tables that currently render plain "No … yet" text or blank space switch to `<EmptyState>`, with an action wherever an obvious next step exists ("Import contacts", "Create campaign", "Browse courses").

## Section 3: Double-submit sweep

- **Action buttons.** Every client handler that calls `fetch(` (52 files) moves to `useAsyncAction` with `<Button loading={pending}>`. Raw `<button>` elements become `<Button>` only where they trigger a mutation. Navigation buttons, tabs and toggles without requests stay as they are.
- **Forms.** A form `onSubmit` runs through `run`, so a double Enter or Enter plus click submits once.
- **`useTransition` call sites.** These keep `useTransition` where it wraps `router.refresh()`. The request itself still goes through `useAsyncAction`, so the lock covers the fetch.
- **Native popups.** The three `confirm()` calls become `await confirm({...})`. The three `alert()` calls in `BookingClient.tsx` become `toast.error(...)`. The "please wait before submitting again" case becomes `toast.info(...)`.
- **Behavior preserved.** No request payloads, endpoints or success and error handling change beyond wrapping. Existing toasts stay.

## Testing

Vitest unit tests:
- `useAsyncAction`: two synchronous `run` calls call `fn` once. After `fn` rejects, `pending` is false and a new `run` calls `fn` again. The return value passes through.
- `Button`: `loading` sets `disabled` and `aria-busy` and renders the spinner. Without `loading`, the output is unchanged.
- `useConfirm`: resolves `true` on confirm, and `false` on cancel and on Escape.
- `EmptyState`: renders the title and the action link or button.

The existing suite (50 files, 545 tests) stays green. Components whose tests click a submit button may need their assertions updated for the new `disabled` state while pending.

Live verification on a preview deploy, before production:
- Each area (CRM, admin, mentor, student, portal, public) shows a skeleton on navigation, not a blank or frozen screen.
- A double click on representative action buttons (save contact phone, mark converted, delete template, book session) sends exactly one request, checked in the network panel.
- A forced error shows the error card, and **Try again** recovers. An unknown URL shows the 404.
- Dark mode: skeletons and empty states use the dark tokens correctly.

## Rollout

Ship in waves. Each wave is independently deployable and verified before the next.

1. **Shared building blocks:** components and hook, the progress bar, `ConfirmProvider`, tests.
2. **Route coverage:** route skeletons, error pages and the 404.
3. **Sweep by area:** CRM, then admin (non-CRM), then mentor and student, then portal and public. Each area's sweep includes its action buttons, popups, client-panel skeletons and empty states.

## Constraints and gotchas

- `npm run` is broken by the `&` in the repo path. Use `node node_modules/typescript/bin/tsc --noEmit` and `node node_modules/vitest/vitest.mjs run`.
- Never run `next build` while a dev server is running.
- Pushing `master:main` deploys to production. Push only with explicit approval.
- Do not regenerate `database.types.ts`. This spec needs no schema changes.
