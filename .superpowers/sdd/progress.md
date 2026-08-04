# Brevo Auth Email System - Progress Ledger (complete, prior feature)

## Tasks

- **Task 1: Complete** (commit ec3d166, review: spec ✅ + quality ✅, no findings)
- **Task 2: Complete** (commit aa917f0, review: spec ✅ + quality ✅, no findings)
- **Task 3: Complete** (commit 5118306, review: spec ✅ + quality ✅, false positive on created_minute verified)
- **Task 4: Complete** (commit 6f03fac, review: spec ✅ + quality ✅, no blockers)
- **Task 5: Complete** (commit 924b696, review: spec ✅ + quality ✅, minor timing attack note)

---

# Lesson Notes (DB-backed) - Progress Ledger

Plan: `docs/superpowers/plans/2026-07-04-lesson-notes.md`

## Tasks

- **Task 1: Complete** (commit ac4b204, review: spec ✅ + quality ✅, no findings — migration + types regen)
- **Task 2: Complete** (commits 1a1cb08..ec12385, review: spec ✅ + quality ✅, minor notes on swallowed errors [pre-existing pattern] and global server-only mock — data layer + vitest setup)
- **Task 3: Complete** (commit c12e228, review: spec ✅ + quality ✅, no findings — saveNote server action)
- **Task 4: Complete** (commit dcda966, review: spec ✅ + quality ✅ [Important note: 7 tsc "ChainedCommands" errors are a whole-program augmentation artifact — no file yet value-imports @tiptap/starter-kit; verified transient, must confirm gone via clean non-cached `tsc --noEmit` in Task 5's review] — Tiptap toolbar component)
- **Task 5: Complete** (commits 7875337 + fix f97f4ae, review: spec ✅ + quality ✅ after fix — ChainedCommands errors confirmed resolved; fixed missing debounce-timer unmount cleanup [Important]; accepted as non-blocking: unrelated pre-existing QuizModal CSS keyframes rode along in globals.css commit [Important, commit-hygiene only, no functional risk, not rewriting history] — Tiptap wired into LessonSidePanel + lesson page)
- **Task 6: Complete** (commit c85d2d5, review: spec ✅ for page.tsx + nav entry; reviewer flagged Critical "undisclosed Sidebar.tsx redesign" — controller verified via `git diff 4e1def5 c85d2d5 -- Sidebar.tsx` that the mobile-bottom-nav + color-token content predates Task 6 entirely [pre-existing uncommitted retheme work swept in by `git add <file>`, same root cause as Task 5's stray CSS]; overriding reviewer verdict to Approved on that basis, not rewriting history — My Notes hub page + sidebar nav entry)
- **Task 7 (code, Steps 1-4): Complete** (commit 3d55af3, review: spec ✅ + quality ✅, no findings — full project `tsc --noEmit` clean for first time in plan, notes-export module + html-docx-js.d.ts).
- **Task 7 (Step 5, manual verification): Complete** (run directly by controller via chrome-devtools MCP, test account Hamzaansari4you@gmail.com, lesson `ppc-batch-2`/lesson 3). Found and fixed two real bugs along the way:
  1. Stale/orphaned dev-server node process on :3945 was 404ing on `main-app.js`/login page chunks, causing the login form to native-GET-submit (looked like the known hydration-race gotcha but wasn't — root cause was the stale server, not timing); killed orphaned PID, cleared `.next`, restarted clean.
  2. User reported (with screenshots) the downloaded PDF had clipped text and an oddly oversized/mostly-blank page. Root cause: `exportNotePdf` hardcoded `orientation: "portrait"`, but jsPDF's format-resolution swaps width/height to enforce portrait when the format array is wider than tall (our sidebar-shaped canvas always is) — `addImage` still drew at the original wider dimensions, overflowing the now-narrower page. Fixed by deriving orientation from `canvas.width > canvas.height`, plus added the `px_scaling` hotfix for correct physical page sizing. Commit `8d49427`. Re-verified by reading the actual downloaded PDF bytes (via Read tool) before and after — confirmed full text visible, correctly proportioned page after the fix.
  After both fixes: login worked, typed H2 heading + bold text + bullet list in Quick Notes editor with toolbar active-states toggling correctly, note round-tripped through Postgres (survived hard reload, not localStorage), My Notes hub listed it with correct course/lesson/preview, PDF export now correct, DOC export ran with no console errors, mobile 390×844 resize confirmed editor+toolbar render correctly in the stacked card layout. No console errors at any step.
- **Final whole-branch review: Complete** (opus, range 4e1def5..8d49427). Found 1 Critical + 2 Important issues that survived all task-level review + manual testing (all three only manifest across multiple lessons, which single-lesson manual verification never exercised):
  1. **Critical**: `LessonSidePanel` rendered without `key={lesson.id}` — in-app soft navigation between lessons (Previous/Next, sidebar links) reused the same editor instance, showing stale note content and silently overwriting the new lesson's note with the old lesson's content on the next debounced save. Data-corruption risk.
  2. **Important**: `saveLessonNote`/`saveNote` swallowed upsert errors and always reported `{ ok: true }`, so a DB-level save failure would still show "Saved" in the UI.
  3. **Important**: PDF/DOC export filenames were hardcoded to `lesson-notes`, colliding across different lessons' exports.
  All three fixed in one dispatch, commit `63202bd`. Re-verified live: navigated Lesson 2 → Lesson 3 via in-app "Next" link (soft nav) — Lesson 3's real note content loaded correctly with no leak from Lesson 2; re-ran PDF export — filename now `day-3-prescription-writing-and-interpretation-notes.pdf` (slugified lesson title). `tsc --noEmit` and `vitest run tests/notes.test.ts` both clean.
- **Feature complete.** Final range: `4e1def5..63202bd`, 11 commits.

