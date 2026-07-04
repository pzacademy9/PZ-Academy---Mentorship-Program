# Context prompt — paste this as the first message of a new session

## Project

PZ Academy Mentorship Portal — a Next.js 14 App Router LMS platform for Pharmacozyme. The real
app is `pz-academy-platform/` (run `npm run dev -- -p 3945` from there). The sibling
`pz-academy-website/` is docs-only (PRD, old legacy HTML portals, Stitch mockup exports) — never
edit it as if it were the live app.

Stack: Next.js 14, TypeScript, Tailwind CSS, Supabase (Postgres + RLS + Auth), Brevo (email),
Vitest (unit tests), Stitch (design source, MCP-connected).

Supabase project ref: `whqdasotjlhvrjmgiffk`.

Test account: `Hamzaansari4you@gmail.com` / `@PZ2001009HA` — student, enrolled in
`ppc-batch-2` (12 lessons, 2/12 completed) and `mdc-workshop` (pending enrollment, for testing
the awaiting-verification screen).

## PRD phase status

- ✅ Phase 1 (Auth) — full, production-working.
- ✅ Phase 2 (LMS Core) — full: student portal, drip unlock, real quiz system (200 questions,
  server-scored), Kahoot-style quiz UI, resource links, light/dark theme.
- ❌ Not built: Phase 0 (GAS↔Supabase bridge), Phase 3 (Admin LMS Builder), Phase 4 (course
  catalog + enrollment), Phase 5 (sessions/booking), Phase 6 (admin panel), Phases 7–12. DB schema
  for all of these already exists in migrations 0001–0003 — only UI/API is missing.

## Stitch visual retheme (separate, parallel effort to the PRD phases)

The whole app is being visually rethemed to match a Stitch design project, screen by screen.

- Stitch project: `11864780675014894532` ("PZ Academy website", 60 screens). Requires the
  **API-key-based MCP connection** for write access (`claude mcp add --transport http stitch
  https://stitch.googleapis.com/mcp --header "X-Goog-Api-Key: ..."`, key in the `Important Links`
  file at the workspace root) — the default OAuth connection is READER-only and
  `apply_design_system`/`generate_variants` fail silently with it. A full Claude Code restart is
  required after `claude mcp add` for the new connection to take effect.
- Design system: **PharmaZyme Academy** preset (confirmed by the user via screenshot) — light,
  bright green `#7ED957` primary, gold `#C9960A` secondary, deep green `#0F3D22` tertiary,
  white/lab-clean surfaces, Montserrat headlines / Fredoka body / Handlee labels, 8px rounding.
  Two other presets exist in the same project (Forest Gold Modern, Clinical Precision) — do NOT
  use those.
- **Ask before building**: most of the 60 screens are parallel style *explorations*, not
  one-screen-per-page (e.g. 3 different "Login Variant" designs). Always ask the user which named
  variant to build — never auto-pick based on naming heuristics.
- `generate_variants` (Stitch's mobile-screen generator) is unreliable via MCP — times out with no
  screen ever created. Workaround: hand the user a ready-to-paste prompt, they generate the mobile
  screen manually in the Stitch UI, then pull it via `get_screen`/`list_screens`.
- Color tokens: a full `pz-*` Material-3-style palette was added to `pz-academy-platform/
  tailwind.config.ts` (namespaced under `pz.*` so it doesn't clobber shadcn's `primary`/
  `secondary`/`background`). Porting a Stitch screen's class names is mechanical: prefix each
  flat class with `pz-` (`bg-primary-container` → `bg-pz-primary-container`) and it maps 1:1 to
  the correct hex, no lookup needed.
- Fonts: Fredoka (`font-body`) and Handlee (`font-label`) were added alongside the existing
  Montserrat (`font-headline`) in `layout.tsx`. Body-wide default font is now Fredoka —
  this affects not-yet-rethemed pages too.
- **Dark mode is broken on rethemed pages** — PharmaZyme Academy is light-only in Stitch, so
  `dark:` overrides were dropped rather than invented on Login/Dashboard/LMS. Not-yet-rethemed
  pages still have working dark mode.
- Desktop and mobile Stitch exports for the same screen concept are often independently
  generated with real differences, not just a resize (e.g. different button colors) — build one
  responsive component using each breakpoint's own treatment via Tailwind `lg:`/`xl:` variants,
  don't assume mobile is a strict subset of desktop.
- **Already rethemed and browser-verified** (desktop 1440-1600px + mobile 390px, via
  chrome-devtools MCP, logged in as the test account): Login, Dashboard shell (Sidebar — now with
  a mobile bottom nav that didn't exist before — Topbar, StatCard, welcome banner), LMS lesson
  view (CourseSidebar, portal header, lesson page, `LessonSidePanel`).
- **Explicit UX rule learned this session**: every option available on desktop must also be
  reachable on mobile, "smartly responsive" — not a stripped-down mobile fallback. `LessonSidePanel`
  was originally split into a desktop-only sidebar + a separate mobile-only resources list; this
  was wrong and was consolidated into one responsive component with full tab parity on both
  breakpoints. Apply this standard to all future screens.
- **Not yet rethemed**: courses catalog, admin builder, sessions, admin panel, and the other ~55
  Stitch screens.

## Active work: DB-backed lesson notes (in progress, not yet executed)

`LessonSidePanel`'s "Quick Notes" tab currently persists to `localStorage` (built earlier this
session as a placeholder). The user asked for real server-backed notes, cross-device sync, a
rich-text editor (not plain textarea), a "My Notes" browsing hub, and PDF/DOC export.

Full design + implementation plan already written, reviewed, and committed to git:

- Spec: `pz-academy-platform/docs/superpowers/specs/2026-07-04-lesson-notes-design.md`
- Plan: `pz-academy-platform/docs/superpowers/plans/2026-07-04-lesson-notes.md` (7 tasks, every
  code step fully written out — this is ready to execute, not re-design)

**Your first task in this session:** execute that plan using
`superpowers:subagent-driven-development` — dispatch a fresh subagent per task, review between
tasks. Do not re-brainstorm or re-scope the feature; the spec and plan are already approved.

Before starting Task 1: confirm the dev server is running on port 3945, and that chrome-devtools
MCP tools are connected (Task 7's manual verification step needs them — reconnect/restart if not).

## After the lesson notes feature ships

Continue the Stitch retheme, next targeting **course catalog + enrollment (PRD Phase 4)** — it's
a genuine gap (unlike Login/Dashboard/LMS, which already existed and just needed a retheme), and
it's the highest-value next phase per the earlier plan-v2 audit (second only to Phase 0, the small
GAS↔Supabase bridge that unblocks live student signups — do that first instead if getting real
signups flowing matters more right now than the catalog page).

Treat "retheme + build the course catalog" as its own feature: brainstorm → design → plan, the
same way lesson notes was handled, before writing code.

## Known gotchas (avoid repeating)

- Login form occasionally does a native GET submit instead of the client handler on first paint
  in dev — retry with a fresh navigate+snapshot if login seems to "reload" instead of redirect.
- `CREATE OR REPLACE FUNCTION` can't change a `RETURNS TABLE` signature — must `DROP FUNCTION`
  first.
- No `jsonb::integer` cast in Postgres — use `integer[]` params instead of jsonb arrays.
- Dev server: check for stale processes on a port before reusing it; background bash tasks do
  not survive a session restart, so the dev server needs restarting at the top of a new session.
