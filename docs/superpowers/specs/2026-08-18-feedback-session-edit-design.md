# Feedback Session Edit

## Problem

`feedback_sessions.name`/`speaker_name`/`session_date` and a session's
`feedback_questions` are set once at creation and never editable —
`SessionRowActions`' "Edit" menu item is a permanently-disabled stub
("Edit (coming soon)"). This was explicitly deferred from the Phase 2 plan
([2026-08-17-feedback-phase-2.md](2026-08-17-feedback-phase-2.md)) and
logged as a follow-up rather than scoped then
(`pz-academy-feedback-phase2-status` memory).

The reason it wasn't a trivial UI unlock: `feedback_answers.question_id`
references `feedback_questions.id` `on delete cascade`. Editing a session's
question set naively — deleting removed rows, re-inserting changed ones —
silently destroys historical response data the moment any response exists.
Mentor/cover-image editing already shipped in Phase 2 via separate inline
controls on `SessionDetailClient.tsx`; this spec covers only the fields
Phase 2 left untouched: name, speaker, date, and questions.

## Decisions already made

- **Never destroy or corrupt an answered question.** A question with at
  least one real answer (`star_value` or `video_url` non-null on any
  `feedback_answers` row referencing it) cannot be removed, and its `type`
  cannot change. Its `text` can still be edited freely — a typo fix doesn't
  invalidate a numeric rating or a video URL the way removing the question
  or relabeling it stars↔video would. This mirrors the sessions_total-freeze
  precedent from subsystem C (`pz-academy-session-lifecycle-c-shipped`
  memory): freeze the parts of a record that historical data depends on,
  leave the rest open.
- **Enforced server-side, not just UI-disabled.** The edit modal computes
  "has a real answer" client-side (it already has every response's answers
  in scope) purely to disable buttons for UX. `updateFeedbackSessionQuestions`
  re-derives the same fact from the DB before any write and rejects the
  whole call if the client's guard was bypassed or stale — matching the
  `is_featured`/`is_public` PATCH route's existing convention of trusting
  no client-supplied state for a security- or integrity-relevant decision.
- **Full-array diff, not itemized add/remove/reorder endpoints.** The
  client always sends the complete desired question list (existing
  questions carry their `id`, new ones omit it); the data layer diffs it
  against the current DB rows in one pass. This mirrors how
  `setResponseFeatured`/`setResponseVisibility` already look — one call,
  one full-column intent — and avoids the client and server needing to
  agree on an ordered sequence of incremental operations.
- **Non-transactional, sequential writes.** `createFeedbackSession` already
  inserts the session row and then the question rows as two separate calls
  with no transaction wrapping them; `updateFeedbackSessionQuestions`
  follows the same established pattern (update/insert/delete rows in
  sequence) rather than introducing this feature area's first DB
  transaction.
- **Edit surface is a Dialog, not inline.** The current name/speaker/date
  render as white text over the cover-image scrim in
  `SessionDetailClient.tsx`'s hero — a bad place for input fields. A pencil
  button opens a modal instead, reusing the `Dialog` component already used
  elsewhere on this page (delete confirmations, `ShareReviewModal`).
- **No question-bank browsing in edit mode.** `NewSessionModal` lets an
  admin pick from `feedback_question_bank` at creation time. The edit modal
  only supports adding a blank custom question (text + type, same shape as
  `NewSessionModal`'s `CustomQuestion`) — bank browsing is a create-time
  convenience being cut here to keep the modal smaller. Can be added later
  if it turns out to matter.
- **Reorder via the existing ChevronUp/ChevronDown pattern.** Copied from
  `QuestionBankEditor.tsx`'s already-shipped reorder controls in this same
  admin area, not a new drag-and-drop interaction.
- **3–5 questions, same as creation.** `MIN_QUESTIONS`/`MAX_QUESTIONS` from
  `NewSessionModal.tsx` apply identically to edit — the save button/API
  reject a count outside that range regardless of which questions are
  answered.

## Data flow

**`updateFeedbackSessionDetails(id, { name, speakerName, sessionDate },
actorProfileId)`** — new function in `feedback-sessions.ts`. Same
`cleanText`/`MAX_NAME_LEN` validation `createFeedbackSession` already uses.
Single `update` on `feedback_sessions`. Audit action
`updateFeedbackSessionDetails`.

**`diffFeedbackQuestions(existing, incoming)`** — new pure function,
exported for direct unit testing (this repo's established convention:
`summarizeStarValues`/`keyAnswersByQuestionId` are the same pattern —
DB-touching functions get no tests, the pure logic they lean on gets
extracted and tested directly; see `mentor-reviews.test.ts`'s comment on
why). Signature:

```ts
interface ExistingQuestion { id: string; text: string; type: FeedbackQuestionType; hasRealAnswer: boolean }
interface IncomingQuestion { id?: string; text: string; type: FeedbackQuestionType }

interface QuestionDiff {
  toDelete: string[];                                          // existing ids, safe to remove
  toUpdate: { id: string; text: string; type: FeedbackQuestionType; order: number }[];
  toInsert: { text: string; type: FeedbackQuestionType; order: number }[];
}

function diffFeedbackQuestions(existing: ExistingQuestion[], incoming: IncomingQuestion[]): QuestionDiff
// Throws Error(`"<text>" already has responses and can't be removed.`) or
// Error(`"<text>" already has responses — its type can't change.`) instead
// of returning, the moment either guard fails. Order values are the
// incoming array's index, 1-based, applied to both toUpdate and toInsert.
```

**`updateFeedbackSessionQuestions(sessionId, questions, actorProfileId)`**
— new function, `questions: { id?: string; text: string; type:
FeedbackQuestionType }[]`, length pre-validated to [3, 5] by the caller (API
route) before this runs:

1. Load current `feedback_questions` rows for the session, plus for each a
   count of `feedback_answers` where `star_value is not null or video_url
   is not null` (a single grouped query, not N+1) to build `hasRealAnswer`.
2. Call `diffFeedbackQuestions(existing, questions)` — a thrown error
   propagates straight out (nothing written yet, so no partial state).
3. Delete `toDelete` ids, update each `toUpdate` row's `text`/`type`/
   `question_order`, insert `toInsert` rows with their `question_order`.
4. Audit action `updateFeedbackSessionQuestions`, detail listing counts
   (e.g. `"<sessionId> · +1 -0 ~2"` for one insert, zero deletes, two
   updates).

**API** — `PATCH /api/admin/feedback/sessions/[id]/route.ts` gains three
more independently-optional fields alongside the existing `status`/
`mentorId`:

```ts
name: z.string().trim().min(1).max(MAX_NAME_LEN).optional(),
speakerName: z.string().trim().min(1).max(MAX_NAME_LEN).optional(),
sessionDate: z.string().nullable().optional(),
questions: z
  .array(z.object({ id: z.string().uuid().optional(), text: z.string().min(1).max(300), type: z.enum(["stars", "video"]) }))
  .min(3)
  .max(5)
  .optional(),
```

The route's `refine` (currently "at least one of status/mentorId") extends
to cover all five fields. Each present field calls its corresponding data-
layer function in sequence, same branching style already used for
`status`/`mentorId`.

## UI

`SessionDetailClient.tsx`: a pencil-icon button next to the hero's status
pill (not inside the image-overlay text block) opens a new `EditSessionModal`
(or an inline function component in the same file, matching how
`MentorLinkRow` is defined locally rather than extracted — final call left
to whichever keeps the file's existing organization, both are small).

Modal fields:
- Name, speaker, date — plain inputs, pre-filled from `session` props.
- Questions — one row per question: text input, star/video `TypeToggle`
  (copy the ~15-line component already in `NewSessionModal.tsx`, or export
  it from there if that's cleaner than duplicating), ChevronUp/ChevronDown
  reorder, Trash2 remove. Remove and the type half of `TypeToggle` are
  `disabled` with a `title` tooltip ("This question already has responses")
  when `responses.some(r => r.answers[q.id]?.starValue != null ||
  r.answers[q.id]?.videoUrl != null)` — computed once from the `responses`
  prop `SessionDetailClient` already holds, no new fetch.
- "Add question" button appends a blank custom row (disabled at 5 total,
  same `atMax` pattern as `NewSessionModal`).
- Save disabled below 3 total questions or while any row's text is blank.

Save handler: one `PATCH` to `/api/admin/feedback/sessions/${session.id}`
always sending all four fields (`name`, `speakerName`, `sessionDate`,
`questions`) — simpler than diffing which changed client-side, and the
route treats every field as independently idempotent regardless. Reuses
the existing `toast`/`router.refresh()` pattern every other mutation on
this page already follows.

`SessionRowActions`' disabled "Edit (coming soon)" `DropdownMenuItem` is
removed — the list row already links to this same detail page
(`page.tsx:85`), which now has the edit affordance directly on it.

No Stitch screen exists for a dedicated edit form or modal
(`8093496535280885471` project screens checked: only "Admin | New Session
Modal", no edit variant) — this reuses that modal's visual language
(labels, spacing, button styles) and `QuestionBankEditor.tsx`'s reorder
controls rather than inventing new UI, consistent with the project's
Stitch-first rule (no net-new screen needed here).

## Testing

Unit tests added to a new `tests/feedback-sessions.test.ts` (this file has
none today) covering `diffFeedbackQuestions` directly — no Supabase
mocking, matching this repo's established convention: add-only,
remove-only (zero answers), remove blocked (nonzero answers, throws with
the question's text in the message), type-change allowed (zero answers),
type-change blocked (nonzero answers, throws), text-only edit on an
answered question (allowed, no throw), reorder-only (order values reassigned
correctly, 1-based), and a combined case (one insert, one delete, one
reorder, one text edit, all in the same call).
`updateFeedbackSessionQuestions`/`updateFeedbackSessionDetails` themselves
get no tests, same as every other DB-writer in `feedback-sessions.ts`.

tsc/vitest/lint. Live click-through: edit a session with zero responses
(full freedom — remove, retype, reorder all work); edit a session with at
least one real response (confirm the answered question's remove/type
controls are disabled in the UI, and confirm a bypassed direct API call
against that same question is rejected with the DB still unchanged).
