# Landing "Watch a demo session" Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new landing-page section where the owner pastes one YouTube lecture link; while a visitor watches, the video pauses every 20 seconds (owner can pick 15 / 20 / 30) and a Register popup appears.

**Architecture:** A new section type `demo_video` (added next to the others in `SECTION_DEFS`, added by the owner with "Add section"; NOT put into the blank-page lists, so existing and new blank pages are unchanged). The public section shows a thumbnail first (so YouTube is not loaded until the visitor asks, like the video reviews). On click it loads YouTube's player script and plays the video; a small pure "watch clock" counts seconds actually watched and says when to pause. The popup is a fixed overlay whose Register button is the page's normal `RegisterButton`, so it opens the normal registration form (or the Live / Recorded menu, or shows "Registration is closed").

**Tech Stack:** Next.js App Router, React (client component for the player), YouTube IFrame Player API (`youtube-nocookie.com` host), Zod section definitions, Vitest + Testing Library.

**Spec:** The owner's request in the 2026-11-03 session (no separate spec file): "an option to add a demo session / watch her teach section where I can paste a YouTube link of their lecture; after the customer plays it, every 15 to 20 seconds the video must pause and a pop-up for registering must appear." Rulings are listed at the end.

**Branch:** `landing-demo-video`, cut from `origin/main`. No migration.

## Global Constraints

- Plain words in every label. Banned: "CTA", "redirect URL", "endpoint", "territory", "GeoIP".
- Pages already published must not change: the section only exists on a page where the owner adds it. Blank pages (`KIND_SECTIONS`) do not include it.
- Nothing from YouTube loads until the visitor clicks play (privacy; same rule as `YouTubeFacade`).
- Run checks directly (no `npm run`): `node node_modules/typescript/bin/tsc --noEmit` (0 errors), `node node_modules/vitest/vitest.mjs run <files>`, `node node_modules/eslint/bin/eslint.js <paths>`. Never regenerate `database.types.ts`. Files use CRLF: use the Edit tool on existing files; Python edits open files as UTF-8.
- Tests use fake links and fake people only. Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Visitor drags the video bar forward to skip ahead: the popup must still come after the right amount of time actually watched, not be skipped. (Task 1)
2. YouTube's script is blocked (ad blocker) or never loads: the video must still play (plain player, no popups), never a dead box. (Task 3)
3. Registration closed, or the page has two modes (Live / Recorded): the popup shows the same notice / menu the page's Register buttons show. (Task 3)
4. Visitor is in full screen when the pause happens: leave full screen so the popup is visible. (Task 3)
5. A very small phone (360 px wide): the popup card fits the screen with both buttons reachable, no sideways scroll. (Task 3)

---

### Task 1: The watch clock (pure logic)

**Files:**
- Create: `src/lib/landing/demo-watch.ts`
- Test: `tests/landing-demo-watch.test.ts`

**Interfaces:**
- Produces: `pauseSeconds(value: unknown): 15 | 20 | 30` (anything other than "15" / "20" / "30" gives 20); `type WatchClock = { watched: number; interval: number }`; `newClock(interval: number): WatchClock`; `tick(clock: WatchClock, seconds: number, playing: boolean): { clock: WatchClock; pause: boolean }` — adds `seconds` only while `playing`; when `watched >= interval` returns `pause: true` and a clock reset to `watched: 0`.

- [ ] **Step 1: Write failing tests** `tests/landing-demo-watch.test.ts`: `pauseSeconds maps "15","20","30" and falls back to 20 for anything else (undefined, "", "99", 15 as a number)`; `a clock does not pause before the interval` (19.5 s of 0.5 ticks on interval 20: every result `pause: false`); `pauses exactly when the interval is reached, then starts again from zero` (40 s of ticks gives two pauses, at 20 s and 40 s); `time while not playing is not counted` (a long run of `playing: false` ticks never pauses and `watched` stays 0); `a big jump in time (tab slept) still gives one pause, not several` (`tick(newClock(20), 90, true)` gives `pause: true` and `watched: 0`).
- [ ] **Step 2: Run** `node node_modules/vitest/vitest.mjs run tests/landing-demo-watch.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** the three functions as pure code (no timers, no DOM).
- [ ] **Step 4: Run** the file. Expected: PASS.
- [ ] **Step 5: Commit** `feat(landing): watch clock for the demo video`.

---

### Task 2: The section definition

**Files:**
- Modify: `src/lib/landing/sections.ts` (`SECTION_TYPES`, `BASE_SECTION_DEFS.demo_video`)
- Modify: `src/lib/landing/import/prompts.ts` (`SAMPLE_BLOCKS.demo_video`, because the record is keyed by every section type)
- Modify: `src/components/landing/LandingRenderer.tsx` (`SECTION_COMPONENTS.demo_video: DemoVideo`; the component arrives in Task 3, so import it there and make this edit in Task 3's commit if tsc is run per task; the data tests below do not need it)
- Test: `tests/landing-demo-section-data.test.ts`

**Interfaces:**
- Produces: section type `"demo_video"`, label "Watch a demo session", description "A lecture video visitors can try. It pauses every few seconds with a Register popup.", `navLabel: "Demo"`. Fields in order: `heading` text (default "Watch a demo session"); `subheading` text (max 200, example "See how the course is taught"); `url` youtube, **not** required (an empty section simply shows nothing), help "Paste the YouTube link of a lecture."; `pauseEvery` choice "Pause the video and show the Register popup" with options `15` "Every 15 seconds", `20` "Every 20 seconds", `30` "Every 30 seconds", default `"20"`; `popupTitle` text (max 80, default "Enjoying the session?"); `popupText` text (max 200, default "Register now to join the full course."). Order in `SECTION_TYPES`: right after `"video_reviews"`. Not added to any `KIND_SECTIONS` list.

- [ ] **Step 1: Write failing tests** `tests/landing-demo-section-data.test.ts`: `demo_video is a section type with the plain-word label`; `a new demo section defaults pauseEvery to "20" and has the default popup texts`; `an unknown pauseEvery normalizes to "20"`; `a bad YouTube link normalizes to empty and a good one is kept`; `blank pages of every kind do not contain demo_video` (`emptyContent(kind)` for course, workshop, webinar); `the section appears in the Add section menu list` (`SECTION_TYPES` includes it and `SECTION_DEFS.demo_video.label` is set).
- [ ] **Step 2: Run** the file. Expected: FAIL.
- [ ] **Step 3: Implement** the section def and the `SAMPLE_BLOCKS.demo_video` entry (`() => "heading: Watch a demo session\nurl: \"https://www.youtube.com/watch?v=aqz-KE-bpKQ\""`). Imported pages: the existing "extras" path in `build-content.ts` already accepts section types outside the kind's list; confirm with one added assertion in `tests/landing-import-prompts.test.ts` that the prompt for each kind still passes its existing checks (length limit stays under 13000).
- [ ] **Step 4: Run** the new file, `tests/landing-import-prompts.test.ts`, `tests/landing-sections.test.ts`, `tests/landing-content.test.ts`. Expected: PASS. (`tsc` will fail on `SECTION_COMPONENTS` until Task 3; that is expected here.)
- [ ] **Step 5: Commit** `feat(landing): demo video section definition`.

---

### Task 3: The public section and player

**Files:**
- Create: `src/lib/landing/youtube-api.ts` — `loadYouTubeApi(): Promise<YTApi | null>` loads `https://www.youtube.com/iframe_api` once (shared promise), resolves with `window.YT` when `YT.Player` exists, resolves `null` after 8 seconds or on script error.
- Create: `src/components/landing/sections/DemoVideo.tsx` (server component, same shape as `VideoReviews`: returns `null` without a valid link; heading, subheading, the player).
- Create: `src/components/landing/sections/DemoPlayer.tsx` (`"use client"`).
- Modify: `src/components/landing/sections/YouTubeFacade.tsx` — add optional prop `onPlay?: () => void`, called when the thumbnail is clicked (it still switches to the plain embedded player when `onPlay` is absent; with `onPlay` present the facade does not render the iframe itself, the parent takes over).
- Modify: `src/components/landing/LandingRenderer.tsx` (register `demo_video: DemoVideo`).
- Test: `tests/landing-demo-video-render.test.tsx`

**Interfaces:**
- Consumes: Task 1 (`pauseSeconds`, `newClock`, `tick`), Task 2 fields, `RegisterButton` and its `Register` type, `onOpenRegistration` from `registration/registration-bus`, `youtubeId`, `SectionProps`.
- Produces: `DemoPlayer({ id, title, seconds, popupTitle, popupText, register }: { id: string; title: string; seconds: 15 | 20 | 30; popupTitle: string; popupText: string; register: Register })`.
- Behaviour of `DemoPlayer`: (a) first paint is the thumbnail (via `YouTubeFacade`, nothing from YouTube loaded). (b) After click: `loadYouTubeApi()`; if it returns `null`, render the same plain embed `YouTubeFacade` uses (video plays, no popups). (c) Otherwise create `new YT.Player(el, { host: "https://www.youtube-nocookie.com", videoId: id, playerVars: { autoplay: 1, rel: 0, playsinline: 1 } })`; every 500 ms while `player.getPlayerState() === 1` (playing) call `tick(clock, 0.5, true)`; on `pause: true` call `player.pauseVideo()`, leave full screen (`document.fullscreenElement && document.exitFullscreen()`), and show the popup. (d) The popup is a fixed overlay (`fixed inset-0 z-40`, dark backdrop, centred card with `role="dialog"`, `aria-label` = `popupTitle`, max height with scroll so it fits a 360 px phone) with `popupTitle`, `popupText`, the page's `RegisterButton` (size lg, full width) and a "Keep watching" button that hides the popup and calls `player.playVideo()`; Escape does the same as "Keep watching". (e) When registration opens (`onOpenRegistration`), the popup hides and the video stays paused. (f) On unmount clear the interval and `player.destroy()`. Because the clock counts only seconds actually played, dragging the bar forward cannot skip a popup.

- [ ] **Step 1: Write failing tests** `tests/landing-demo-video-render.test.tsx` (fake `window.YT.Player` that records its options and lets the test set the state and fire intervals with fake timers; mock `loadYouTubeApi` where simpler): `renders nothing without a valid link`; `first paint is a thumbnail button and loads nothing from YouTube` (no `<iframe>`, no script tag added); `with a good link shows the heading and subheading`; `after play, it creates the player on the nocookie host with the video id`; `after 20 s of playing the video is paused and the popup shows its title, text and the Register button` (uses `pauseEvery` "20"); `pausing is counted in watched time only: 40 s in the paused state never shows the popup`; `Keep watching hides the popup and plays again, and the popup comes back after another interval`; `Escape works like Keep watching`; `popup uses the closed notice when registration is closed` (`register.closed: true` shows "Registration is closed", no register link); `popup shows the Live / Recorded menu when the page has two modes` (`builtIn: true, modes: ["live","recorded"]`); `opening registration hides the popup` (call `openRegistration()` from the bus); `full screen is left when the popup shows` (spy `document.exitFullscreen` with `fullscreenElement` set); `if the YouTube script cannot load, a plain video embed is shown and no popup ever appears`; `the popup card has a max height and scroll so it fits a small phone` (class assertions `max-h-` and `overflow-y-auto`); `pauseEvery 15 pauses at 15 s`.
- [ ] **Step 2: Run** the file. Expected: FAIL.
- [ ] **Step 3: Implement** the files above per the Interfaces block. Use the `landing-*` colour tokens and the look of `VideoReviews` (section wrapper, `SectionHeader`). The video box is `aspect-video`, `max-w-4xl`, centred.
- [ ] **Step 4: Run** the new file, `tests/landing-renderer.test.tsx`, `tests/landing-public-polish.test.tsx`, `tests/landing-register-menu.test.tsx`; `tsc --noEmit`; eslint on the new and changed files. Expected: PASS, 0 errors, clean.
- [ ] **Step 5: Commit** `feat(landing): demo video section with pause and Register popup`.

---

### Task 4: Whole-build verification and notes

- [ ] **Step 1:** Run `tsc --noEmit`. Expected: 0 errors.
- [ ] **Step 2:** Run eslint on every file this plan created or changed. Expected: clean.
- [ ] **Step 3:** Run all test files named in Tasks 1 to 3 plus `tests/landing-admin-ui.test.tsx`, `tests/landing-hero-render.test.tsx`. Expected: PASS. (Known unrelated failing files: pz-tokens, participant-recipients, participant-whatsapp-ui, landing-route-hardening, gas-apply-registration-status, landing-event-sheet, migrations-segment-source-dnc. Re-run any slow UI file alone before calling it a failure.)
- [ ] **Step 4:** Add a memory file `pz-academy-landing-demo-video-status.md` and its index line.
- [ ] **Step 5:** Hand the owner a short test list: add the section with "Add section" on a copy of a page, paste a lecture link, publish the copy, play it on a phone and a laptop, wait for the popup, press Register and Keep watching, try with registration closed.

---

## Rulings made while planning (the owner can overrule)

- **Every 20 seconds by default, a dropdown of 15 / 20 / 30.** You said "15 to 20", so 20 is the default and 15 is one click away.
- **The popup comes back every time**, with no limit, because that is what you asked for. If it feels too pushy, a "stop after 3 times" choice is a small later change.
- **"Keep watching" is always there.** A popup with no way back would trap visitors; they can always continue the lecture.
- **Time is counted as seconds actually watched**, so dragging the video bar cannot skip a popup.
- **The section is added by hand with "Add section"**, not placed on every new page, so no existing page changes and blank pages stay as they are.
- **One video per section.** If you want two demo lectures, add the section twice.
- **If the visitor's browser blocks YouTube's script**, the lecture still plays but without popups, because a dead video box is worse than a missing popup.
