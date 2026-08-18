# Feedback Session Edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin edit a feedback session's name, speaker, date, and questions after creation, without ever destroying or corrupting a question's existing answers.

**Architecture:** A pure `diffFeedbackQuestions` function (unit-tested directly, no DB mocking) decides what's safe; two new DB-writer functions in `feedback-sessions.ts` apply that decision; the existing session `PATCH` route gains three more independently-optional fields; a new `EditSessionModal` reuses this admin area's existing modal/row/reorder patterns verbatim.

**Tech Stack:** Next.js App Router, Supabase (service-role client, no RLS policies on this table family), Zod, Vitest, Tailwind (`pz-*` dashboard token system — this is an admin-dashboard screen, not the marketing `/mentorship` pages, so `pz-*` is correct here).

**Spec:** [docs/superpowers/specs/2026-08-18-feedback-session-edit-design.md](../specs/2026-08-18-feedback-session-edit-design.md)

## Global Constraints

- A question with a real answer (`star_value` or `video_url` non-null on any `feedback_answers` row referencing it) can never be removed, and its `type` can never change. Its `text` can always be edited.
- Every integrity guard is enforced in the data layer (`diffFeedbackQuestions`), not just the UI — a bypassed client request must still be rejected.
- 3–5 questions total, same as session creation (`MIN_QUESTIONS`/`MAX_QUESTIONS` in `NewSessionModal.tsx`).
- No DB mocking in tests — this repo's established convention (see `mentor-reviews.test.ts`'s comment, `feedback-responses.test.ts`). Only pure functions get unit tests; DB-writer functions get none, matching every existing function in `feedback-sessions.ts`.
- No migration — no schema change, no `database.types.ts` edit needed.

---

### Task 1: `diffFeedbackQuestions` pure function + tests

**Files:**
- Modify: `src/lib/data/feedback-sessions.ts` (insert after `createFeedbackSession`, i.e. after the current line 236, before `setFeedbackSessionStatus`)
- Test: `tests/feedback-sessions.test.ts` (new file)

**Interfaces:**
- Produces: `ExistingQuestion`, `IncomingQuestion`, `QuestionDiff` types and `diffFeedbackQuestions(existing: ExistingQuestion[], incoming: IncomingQuestion[]): QuestionDiff`, all exported from `src/lib/data/feedback-sessions.ts`. Consumed by Task 2.

- [ ] **Step 1: Write the failing tests**

Create `tests/feedback-sessions.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { diffFeedbackQuestions, type ExistingQuestion, type IncomingQuestion } from "@/lib/data/feedback-sessions";

function q(id: string, text: string, type: "stars" | "video", hasRealAnswer: boolean): ExistingQuestion {
  return { id, text, type, hasRealAnswer };
}

describe("diffFeedbackQuestions", () => {
  it("inserts every incoming question with no id as toInsert, 1-indexed order", () => {
    const incoming: IncomingQuestion[] = [
      { text: "How was the pacing?", type: "stars" },
      { text: "Any final thoughts?", type: "video" },
    ];
    const diff = diffFeedbackQuestions([], incoming);
    expect(diff.toDelete).toEqual([]);
    expect(diff.toUpdate).toEqual([]);
    expect(diff.toInsert).toEqual([
      { text: "How was the pacing?", type: "stars", order: 1 },
      { text: "Any final thoughts?", type: "video", order: 2 },
    ]);
  });

  it("removes an existing question with zero real answers when it's missing from incoming", () => {
    const existing = [q("q1", "Old question", "stars", false)];
    const diff = diffFeedbackQuestions(existing, []);
    expect(diff.toDelete).toEqual(["q1"]);
    expect(diff.toUpdate).toEqual([]);
    expect(diff.toInsert).toEqual([]);
  });

  it("throws instead of removing an answered question, naming it in the message", () => {
    const existing = [q("q1", "How was the pacing?", "stars", true)];
    expect(() => diffFeedbackQuestions(existing, [])).toThrow(
      '"How was the pacing?" already has responses and can\'t be removed.',
    );
  });

  it("updates text/type/order for a kept, unanswered question", () => {
    const existing = [q("q1", "Old text", "stars", false)];
    const incoming: IncomingQuestion[] = [{ id: "q1", text: "New text", type: "video" }];
    const diff = diffFeedbackQuestions(existing, incoming);
    expect(diff.toUpdate).toEqual([{ id: "q1", text: "New text", type: "video", order: 1 }]);
    expect(diff.toDelete).toEqual([]);
  });

  it("allows a text-only edit on an answered question (type unchanged)", () => {
    const existing = [q("q1", "Old text", "stars", true)];
    const incoming: IncomingQuestion[] = [{ id: "q1", text: "Fixed typo", type: "stars" }];
    const diff = diffFeedbackQuestions(existing, incoming);
    expect(diff.toUpdate).toEqual([{ id: "q1", text: "Fixed typo", type: "stars", order: 1 }]);
  });

  it("throws instead of changing type on an answered question, naming it in the message", () => {
    const existing = [q("q1", "How was the pacing?", "stars", true)];
    const incoming: IncomingQuestion[] = [{ id: "q1", text: "How was the pacing?", type: "video" }];
    expect(() => diffFeedbackQuestions(existing, incoming)).toThrow(
      '"How was the pacing?" already has responses — its type can\'t change.',
    );
  });

  it("reassigns order when reordering kept questions", () => {
    const existing = [q("q1", "First", "stars", false), q("q2", "Second", "stars", false)];
    const incoming: IncomingQuestion[] = [
      { id: "q2", text: "Second", type: "stars" },
      { id: "q1", text: "First", type: "stars" },
    ];
    const diff = diffFeedbackQuestions(existing, incoming);
    expect(diff.toUpdate).toEqual([
      { id: "q2", text: "Second", type: "stars", order: 1 },
      { id: "q1", text: "First", type: "stars", order: 2 },
    ]);
  });

  it("throws when an incoming id doesn't belong to any existing question", () => {
    const incoming: IncomingQuestion[] = [{ id: "not-real", text: "Ghost", type: "stars" }];
    expect(() => diffFeedbackQuestions([], incoming)).toThrow("Question not-real does not belong to this session.");
  });

  it("handles a combined insert + delete + reorder + text edit in one call", () => {
    const existing = [
      q("q1", "Keep me, reorder me", "stars", false),
      q("q2", "Delete me", "stars", false),
      q("q3", "Edit my text", "stars", true),
    ];
    const incoming: IncomingQuestion[] = [
      { text: "Brand new question", type: "video" },
      { id: "q3", text: "Edited text", type: "stars" },
      { id: "q1", text: "Keep me, reorder me", type: "stars" },
    ];
    const diff = diffFeedbackQuestions(existing, incoming);
    expect(diff.toInsert).toEqual([{ text: "Brand new question", type: "video", order: 1 }]);
    expect(diff.toUpdate).toEqual([
      { id: "q3", text: "Edited text", type: "stars", order: 2 },
      { id: "q1", text: "Keep me, reorder me", type: "stars", order: 3 },
    ]);
    expect(diff.toDelete).toEqual(["q2"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `./node_modules/.bin/vitest run tests/feedback-sessions.test.ts`
Expected: FAIL — `diffFeedbackQuestions` is not exported (module has no such export).

- [ ] **Step 3: Implement `diffFeedbackQuestions`**

In `src/lib/data/feedback-sessions.ts`, insert immediately after `createFeedbackSession`'s closing brace (currently line 236) and before `export async function setFeedbackSessionStatus`:

```ts
export interface ExistingQuestion {
  id: string;
  text: string;
  type: FeedbackQuestionType;
  hasRealAnswer: boolean;
}

export interface IncomingQuestion {
  id?: string;
  text: string;
  type: FeedbackQuestionType;
}

export interface QuestionDiff {
  toDelete: string[];
  toUpdate: { id: string; text: string; type: FeedbackQuestionType; order: number }[];
  toInsert: { text: string; type: FeedbackQuestionType; order: number }[];
}

/**
 * Pure decision logic for editing a session's questions, pulled out of
 * updateFeedbackSessionQuestions so it can be unit-tested directly — this
 * repo's convention is no DB mocking (see mentor-reviews.test.ts), so the
 * DB-touching wrapper around this gets no test coverage of its own, same
 * as every other write function in this file.
 *
 * Never removes or retypes a question with a real answer
 * (feedback_answers.question_id cascades on delete, and a stars-valued
 * answer under a question retyped to "video" would be silently
 * meaningless) — throws instead, naming the question, so the caller
 * writes nothing rather than writing a partial result.
 */
export function diffFeedbackQuestions(existing: ExistingQuestion[], incoming: IncomingQuestion[]): QuestionDiff {
  const existingById = new Map(existing.map((q) => [q.id, q]));
  const incomingIds = new Set(incoming.filter((q) => q.id).map((q) => q.id as string));

  const toDelete: string[] = [];
  for (const q of existing) {
    if (incomingIds.has(q.id)) continue;
    if (q.hasRealAnswer) throw new Error(`"${q.text}" already has responses and can't be removed.`);
    toDelete.push(q.id);
  }

  const toUpdate: QuestionDiff["toUpdate"] = [];
  const toInsert: QuestionDiff["toInsert"] = [];
  incoming.forEach((q, i) => {
    const order = i + 1;
    if (!q.id) {
      toInsert.push({ text: q.text, type: q.type, order });
      return;
    }
    const current = existingById.get(q.id);
    if (!current) throw new Error(`Question ${q.id} does not belong to this session.`);
    if (current.type !== q.type && current.hasRealAnswer) {
      throw new Error(`"${current.text}" already has responses — its type can't change.`);
    }
    toUpdate.push({ id: q.id, text: q.text, type: q.type, order });
  });

  return { toDelete, toUpdate, toInsert };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `./node_modules/.bin/vitest run tests/feedback-sessions.test.ts`
Expected: PASS, all 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/feedback-sessions.ts tests/feedback-sessions.test.ts
git commit -m "feat(feedback): add diffFeedbackQuestions pure diff/guard logic"
```

---

### Task 2: `updateFeedbackSessionDetails` + `updateFeedbackSessionQuestions`

**Files:**
- Modify: `src/lib/data/feedback-sessions.ts` (insert right after Task 1's `diffFeedbackQuestions`; update the `@/lib/validations/feedback` import line)

**Interfaces:**
- Consumes: `diffFeedbackQuestions`, `ExistingQuestion`, `IncomingQuestion` from Task 1 (same file). `createAdminSupabase` from `@/lib/supabase/admin`. `logFeedbackAudit` from `@/lib/data/feedback-audit`. `cleanText`, `MAX_NAME_LEN`, `MAX_QUESTION_LEN` from `@/lib/validations/feedback`.
- Produces: `updateFeedbackSessionDetails(id: string, input: { name: string; speakerName: string; sessionDate: string | null }, actorProfileId: string | null): Promise<void>` and `updateFeedbackSessionQuestions(sessionId: string, questions: IncomingQuestion[], actorProfileId: string | null): Promise<void>`, both exported from `src/lib/data/feedback-sessions.ts`. Consumed by Task 3.

- [ ] **Step 1: Add `MAX_QUESTION_LEN` to the existing import**

In `src/lib/data/feedback-sessions.ts`, change line 6:

```ts
import { cleanText, MAX_NAME_LEN, uniqueSlug, randomSlugSuffix } from "@/lib/validations/feedback";
```

to:

```ts
import { cleanText, MAX_NAME_LEN, MAX_QUESTION_LEN, uniqueSlug, randomSlugSuffix } from "@/lib/validations/feedback";
```

- [ ] **Step 2: Implement both functions**

Insert immediately after Task 1's `diffFeedbackQuestions` function:

```ts
export async function updateFeedbackSessionDetails(
  id: string,
  input: { name: string; speakerName: string; sessionDate: string | null },
  actorProfileId: string | null,
): Promise<void> {
  const admin = createAdminSupabase();
  const name = cleanText(input.name, MAX_NAME_LEN);
  const speakerName = cleanText(input.speakerName, MAX_NAME_LEN);
  if (!name) throw new Error("Session name is required.");
  if (!speakerName) throw new Error("Speaker name is required.");

  const { error } = await admin
    .from("feedback_sessions")
    .update({ name, speaker_name: speakerName, session_date: input.sessionDate })
    .eq("id", id);
  if (error) throw new Error(error.message);
  await logFeedbackAudit({ action: "updateFeedbackSessionDetails", detail: `${id} · ${name}`, actorProfileId });
}

/**
 * Diffs the incoming question list against the DB via diffFeedbackQuestions
 * (which throws before anything is written if a guard fails), then applies
 * the result as delete/update/insert. Sequential, non-transactional writes
 * — matches createFeedbackSession's existing session-then-questions pattern
 * in this same file.
 */
export async function updateFeedbackSessionQuestions(
  sessionId: string,
  questions: IncomingQuestion[],
  actorProfileId: string | null,
): Promise<void> {
  const admin = createAdminSupabase();

  const { data: existingRows } = await admin
    .from("feedback_questions")
    .select("id, text, type")
    .eq("feedback_session_id", sessionId);
  const rows = existingRows ?? [];

  let answeredIds = new Set<string>();
  if (rows.length > 0) {
    const { data: answerRows } = await admin
      .from("feedback_answers")
      .select("question_id, star_value, video_url")
      .in("question_id", rows.map((r) => r.id));
    answeredIds = new Set(
      (answerRows ?? []).filter((a) => a.star_value != null || a.video_url != null).map((a) => a.question_id),
    );
  }

  const existing: ExistingQuestion[] = rows.map((r) => ({
    id: r.id,
    text: r.text,
    type: r.type,
    hasRealAnswer: answeredIds.has(r.id),
  }));
  const cleanedIncoming: IncomingQuestion[] = questions.map((q) => ({
    id: q.id,
    text: cleanText(q.text, MAX_QUESTION_LEN),
    type: q.type,
  }));

  const diff = diffFeedbackQuestions(existing, cleanedIncoming);

  if (diff.toDelete.length > 0) {
    const { error } = await admin.from("feedback_questions").delete().in("id", diff.toDelete);
    if (error) throw new Error(error.message);
  }
  for (const u of diff.toUpdate) {
    const { error } = await admin
      .from("feedback_questions")
      .update({ text: u.text, type: u.type, question_order: u.order })
      .eq("id", u.id);
    if (error) throw new Error(error.message);
  }
  if (diff.toInsert.length > 0) {
    const { error } = await admin.from("feedback_questions").insert(
      diff.toInsert.map((q) => ({ feedback_session_id: sessionId, text: q.text, type: q.type, question_order: q.order })),
    );
    if (error) throw new Error(error.message);
  }

  await logFeedbackAudit({
    action: "updateFeedbackSessionQuestions",
    detail: `${sessionId} · +${diff.toInsert.length} -${diff.toDelete.length} ~${diff.toUpdate.length}`,
    actorProfileId,
  });
}
```

- [ ] **Step 3: Type-check**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/data/feedback-sessions.ts
git commit -m "feat(feedback): add session details/questions update functions"
```

---

### Task 3: Extend the session `PATCH` route

**Files:**
- Modify: `src/app/api/admin/feedback/sessions/[id]/route.ts`

**Interfaces:**
- Consumes: `updateFeedbackSessionDetails`, `updateFeedbackSessionQuestions` from Task 2 (`@/lib/data/feedback-sessions`).
- Produces: `PATCH /api/admin/feedback/sessions/[id]` accepts `{ name?, speakerName?, sessionDate?, questions? }` alongside the existing `{ status?, mentorId? }`. Consumed by Task 5's `EditSessionModal`.

- [ ] **Step 1: Replace the schema and imports**

In `src/app/api/admin/feedback/sessions/[id]/route.ts`, replace the whole top of the file through the schema:

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  setFeedbackSessionStatus,
  setFeedbackSessionMentor,
  updateFeedbackSessionDetails,
  updateFeedbackSessionQuestions,
  deleteFeedbackSession,
} from "@/lib/data/feedback-sessions";
import { MAX_NAME_LEN, MAX_QUESTION_LEN } from "@/lib/validations/feedback";

const questionSchema = z.object({
  id: z.string().uuid().optional(),
  text: z.string().trim().min(1).max(MAX_QUESTION_LEN),
  type: z.enum(["stars", "video"]),
});

const patchSchema = z
  .object({
    status: z.enum(["active", "closed"]).optional(),
    mentorId: z.string().uuid().nullable().optional(),
    name: z.string().trim().min(1).max(MAX_NAME_LEN).optional(),
    speakerName: z.string().trim().min(1).max(MAX_NAME_LEN).optional(),
    sessionDate: z.string().nullable().optional(),
    questions: z.array(questionSchema).min(3).max(5).optional(),
  })
  .refine(
    (v) =>
      v.status !== undefined ||
      v.mentorId !== undefined ||
      v.name !== undefined ||
      v.speakerName !== undefined ||
      v.sessionDate !== undefined ||
      v.questions !== undefined,
    { message: "No changes provided" },
  )
  .refine(
    (v) => {
      const any = v.name !== undefined || v.speakerName !== undefined || v.sessionDate !== undefined;
      const all = v.name !== undefined && v.speakerName !== undefined && v.sessionDate !== undefined;
      return !any || all;
    },
    { message: "name, speakerName, and sessionDate must be provided together" },
  );
```

- [ ] **Step 2: Extend the `PATCH` handler**

Replace the `PATCH` function body's `try` block:

```ts
  try {
    if (parsed.data.status !== undefined) await setFeedbackSessionStatus(id, parsed.data.status, auth.user.id);
    if (parsed.data.mentorId !== undefined) await setFeedbackSessionMentor(id, parsed.data.mentorId, auth.user.id);
    if (parsed.data.name !== undefined) {
      await updateFeedbackSessionDetails(
        id,
        { name: parsed.data.name, speakerName: parsed.data.speakerName!, sessionDate: parsed.data.sessionDate ?? null },
        auth.user.id,
      );
    }
    if (parsed.data.questions !== undefined) {
      await updateFeedbackSessionQuestions(id, parsed.data.questions, auth.user.id);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not update session." }, { status: 400 });
  }
```

(The `DELETE` handler below is unchanged.)

- [ ] **Step 3: Type-check**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/admin/feedback/sessions/[id]/route.ts
git commit -m "feat(feedback): extend session PATCH route with details/questions"
```

---

### Task 4: Export `TypeToggle`, remove the "Edit (coming soon)" stub

**Files:**
- Modify: `src/app/dashboard/admin/feedback/NewSessionModal.tsx`

**Interfaces:**
- Produces: `export function TypeToggle(...)` (was unexported), same signature as today (`{ value: QuestionType; onChange: (type: QuestionType) => void; disabled: boolean }`). Consumed by Task 5's `EditSessionModal`.

- [ ] **Step 1: Export `TypeToggle`**

At line 136, change:

```ts
function TypeToggle({
```

to:

```ts
export function TypeToggle({
```

- [ ] **Step 2: Remove the disabled "Edit" menu item**

In `SessionRowActions`, delete these lines (currently 1069–1072):

```tsx
          <DropdownMenuItem disabled className="gap-2 font-body opacity-50 cursor-not-allowed">
            <Pencil className="w-4 h-4" />
            Edit (coming soon)
          </DropdownMenuItem>
```

Leave the rest of the dropdown (`toggleStatus`, share, export, delete items) untouched. `Pencil` (line 20 of the `lucide-react` import list) has no other use in this file — remove it from that import list too, or `next lint` will flag it as unused.

- [ ] **Step 3: Type-check and lint**

Run: `./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/next lint`
Expected: no new errors or warnings.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/admin/feedback/NewSessionModal.tsx
git commit -m "refactor(feedback): export TypeToggle, drop disabled Edit stub"
```

---

### Task 5: `EditSessionModal` component

**Files:**
- Create: `src/app/dashboard/admin/feedback/[id]/EditSessionModal.tsx`

**Interfaces:**
- Consumes: `TypeToggle` from Task 4 (`../NewSessionModal`). `FeedbackSessionQuestion`, `FeedbackQuestionType` types from `@/lib/data/feedback-sessions`. `ResponseDetail` type from `@/lib/data/feedback-responses`. `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogFooter` from `@/components/ui/dialog`. The `PATCH /api/admin/feedback/sessions/[id]` route from Task 3.
- Produces: `export function EditSessionModal(props: EditSessionModalProps)` where

```ts
interface EditSessionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  name: string;
  speakerName: string;
  sessionDate: string | null;
  questions: FeedbackSessionQuestion[];
  responses: ResponseDetail[];
}
```

  Consumed by Task 6's `SessionDetailClient.tsx`.

- [ ] **Step 1: Write the component**

Create `src/app/dashboard/admin/feedback/[id]/EditSessionModal.tsx`:

```tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { TypeToggle } from "../NewSessionModal";
import type { FeedbackSessionQuestion, FeedbackQuestionType } from "@/lib/data/feedback-sessions";
import type { ResponseDetail } from "@/lib/data/feedback-responses";

const MIN_QUESTIONS = 3;
const MAX_QUESTIONS = 5;

interface Row {
  localId: string;
  id?: string;
  text: string;
  type: FeedbackQuestionType;
  hasRealAnswer: boolean;
}

function newLocalId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}

/** Every question id with at least one non-null star/video answer, across every response. */
function computeAnsweredQuestionIds(responses: ResponseDetail[]): Set<string> {
  const ids = new Set<string>();
  for (const r of responses) {
    for (const [questionId, a] of Object.entries(r.answers)) {
      if (a.starValue != null || a.videoUrl != null) ids.add(questionId);
    }
  }
  return ids;
}

interface EditSessionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  name: string;
  speakerName: string;
  sessionDate: string | null;
  questions: FeedbackSessionQuestion[];
  responses: ResponseDetail[];
}

/**
 * Edits name/speaker/date/questions — the fields left immutable when
 * mentor-linking and cover-image editing shipped inline on this same
 * page in Phase 2. Reuses this admin area's existing patterns instead of
 * inventing new ones: TypeToggle from NewSessionModal, the
 * ChevronUp/ChevronDown reorder row from QuestionBankEditor.tsx. A
 * question with a real answer can't be removed or retyped — see
 * diffFeedbackQuestions in feedback-sessions.ts for the enforced guard;
 * this component only disables the corresponding buttons for UX.
 */
export function EditSessionModal({
  open,
  onOpenChange,
  sessionId,
  name: initialName,
  speakerName: initialSpeakerName,
  sessionDate: initialSessionDate,
  questions,
  responses,
}: EditSessionModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState(initialName);
  const [speakerName, setSpeakerName] = useState(initialSpeakerName);
  const [date, setDate] = useState(initialSessionDate ?? "");
  const [rows, setRows] = useState<Row[]>([]);

  // Reset every field from props each time the modal opens, so a previous
  // edit session (opened, changed, cancelled) never leaks into the next.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const answered = computeAnsweredQuestionIds(responses);
    setName(initialName);
    setSpeakerName(initialSpeakerName);
    setDate(initialSessionDate ?? "");
    setRows(
      questions
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((q) => ({
          localId: newLocalId(),
          id: q.id,
          text: q.text,
          type: q.type,
          hasRealAnswer: answered.has(q.id),
        })),
    );
  }, [open]);

  const totalQuestions = rows.length;
  const atMax = totalQuestions >= MAX_QUESTIONS;

  function addRow() {
    if (atMax) {
      toast.error(`You can have up to ${MAX_QUESTIONS} questions.`);
      return;
    }
    setRows((prev) => [...prev, { localId: newLocalId(), text: "", type: "stars", hasRealAnswer: false }]);
  }

  function removeRow(localId: string) {
    setRows((prev) => prev.filter((r) => r.localId !== localId));
  }

  function updateRow(localId: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.localId === localId ? { ...r, ...patch } : r)));
  }

  function moveRow(index: number, direction: -1 | 1) {
    setRows((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = prev.slice();
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function save() {
    if (!name.trim() || !speakerName.trim()) {
      toast.error("Session name and speaker are required.");
      return;
    }
    const clean = rows.filter((r) => r.text.trim().length > 0);
    if (clean.length < MIN_QUESTIONS) {
      toast.error(`Pick at least ${MIN_QUESTIONS} questions.`);
      return;
    }

    startTransition(async () => {
      const res = await fetch(`/api/admin/feedback/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          speakerName: speakerName.trim(),
          sessionDate: date || null,
          questions: clean.map((r) => ({ id: r.id, text: r.text.trim(), type: r.type })),
        }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(payload?.error ?? "Could not update this session.");
        return;
      }
      toast.success("Session updated.");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-headline text-pz-on-surface">Edit Session</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="edit-session-name" className="font-headline text-xs font-semibold uppercase tracking-wide text-pz-on-surface-variant">
              Session Name
            </label>
            <input
              id="edit-session-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-pz-outline-variant bg-white focus:border-pz-primary focus:ring-2 focus:ring-pz-primary/20 outline-none font-body text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="edit-speaker-name" className="font-headline text-xs font-semibold uppercase tracking-wide text-pz-on-surface-variant">
              Speaker Name
            </label>
            <input
              id="edit-speaker-name"
              type="text"
              value={speakerName}
              onChange={(e) => setSpeakerName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-pz-outline-variant bg-white focus:border-pz-primary focus:ring-2 focus:ring-pz-primary/20 outline-none font-body text-sm"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="edit-session-date" className="font-headline text-xs font-semibold uppercase tracking-wide text-pz-on-surface-variant">
            Date
          </label>
          <input
            id="edit-session-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-pz-outline-variant bg-white focus:border-pz-primary focus:ring-2 focus:ring-pz-primary/20 outline-none font-body text-sm"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-headline text-xs font-semibold uppercase tracking-wide text-pz-on-surface-variant">
              Questions
            </h3>
            <span className="font-body text-xs text-pz-on-surface-variant">
              {totalQuestions} / {MAX_QUESTIONS}
            </span>
          </div>
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div
                key={r.localId}
                className="flex items-start gap-3 bg-pz-surface-container p-3 rounded-xl border border-pz-outline-variant/40"
              >
                <div className="flex flex-col shrink-0 mt-0.5">
                  <button
                    type="button"
                    aria-label="Move up"
                    disabled={i === 0}
                    onClick={() => moveRow(i, -1)}
                    className="p-0.5 rounded text-pz-on-surface-variant hover:text-pz-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Move down"
                    disabled={i === rows.length - 1}
                    onClick={() => moveRow(i, 1)}
                    className="p-0.5 rounded text-pz-on-surface-variant hover:text-pz-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>

                <input
                  type="text"
                  value={r.text}
                  onChange={(e) => updateRow(r.localId, { text: e.target.value })}
                  placeholder="Type a question…"
                  className="flex-1 bg-transparent border-b border-pz-outline-variant/60 focus:border-pz-primary outline-none font-body text-sm text-pz-on-surface py-1.5"
                />

                <TypeToggle value={r.type} onChange={(type) => updateRow(r.localId, { type })} disabled={r.hasRealAnswer} />

                <button
                  type="button"
                  onClick={() => removeRow(r.localId)}
                  disabled={r.hasRealAnswer}
                  aria-label="Remove question"
                  title={r.hasRealAnswer ? "This question already has responses" : "Remove question"}
                  className={cn(
                    "p-1.5 mt-0.5 rounded transition-colors shrink-0",
                    r.hasRealAnswer
                      ? "text-pz-on-surface-variant/40 cursor-not-allowed"
                      : "text-pz-on-surface-variant hover:text-pz-danger",
                  )}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addRow}
            disabled={atMax}
            className="mt-2 inline-flex items-center gap-1.5 font-headline text-xs font-semibold text-pz-primary hover:text-pz-on-primary-container transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus className="w-3.5 h-3.5" />
            Add question
          </button>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
            className="px-4 py-2.5 rounded-lg font-headline text-sm font-semibold bg-pz-surface-container-high text-pz-on-surface-variant hover:bg-pz-surface-variant transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={isPending}
            className="px-4 py-2.5 rounded-lg font-headline text-sm font-semibold bg-pz-primary text-pz-on-primary hover:bg-pz-on-primary-container transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? "Saving…" : "Save Changes"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Type-check and lint**

Run: `./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/next lint`
Expected: no errors or warnings.

- [ ] **Step 3: Commit**

```bash
git add "src/app/dashboard/admin/feedback/[id]/EditSessionModal.tsx"
git commit -m "feat(feedback): add EditSessionModal component"
```

---

### Task 6: Wire `EditSessionModal` into `SessionDetailClient.tsx`

**Files:**
- Modify: `src/app/dashboard/admin/feedback/[id]/SessionDetailClient.tsx`

**Interfaces:**
- Consumes: `EditSessionModal` from Task 5 (`./EditSessionModal`).

- [ ] **Step 1: Add the `Pencil` import**

At the top `lucide-react` import (currently lines 7–25), add `Pencil` to the list — e.g. change:

```ts
  Eye,
  EyeOff,
  User,
  Search,
  Sparkles,
} from "lucide-react";
```

to:

```ts
  Eye,
  EyeOff,
  User,
  Search,
  Sparkles,
  Pencil,
} from "lucide-react";
```

- [ ] **Step 2: Import `EditSessionModal`**

Add near the other local imports (after `import { StarRating } from "@/components/ui/StarRating";`):

```ts
import { EditSessionModal } from "./EditSessionModal";
```

- [ ] **Step 3: Add modal-open state**

Next to the existing `const [shareModalOpen, setShareModalOpen] = useState(false);` (currently line 360), add:

```ts
  const [editModalOpen, setEditModalOpen] = useState(false);
```

- [ ] **Step 4: Add the "Edit details" button**

In the button row (currently lines 571–597), add a new button as the first child of that row, right before the existing `toggleStatus` button:

```tsx
        <div className="flex items-center justify-end gap-2 flex-wrap mt-4">
          <button
            type="button"
            onClick={() => setEditModalOpen(true)}
            disabled={isPending}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full font-headline text-sm font-semibold border border-pz-outline-variant text-pz-on-surface-variant hover:bg-pz-surface-container transition-colors disabled:opacity-50"
          >
            <Pencil className="w-4 h-4" />
            Edit Details
          </button>
          <button
            type="button"
            onClick={toggleStatus}
```

(Leave every following button in that row unchanged.)

- [ ] **Step 5: Render the modal**

Right after the existing `<ShareReviewModal ... />` block (currently lines 675–682), add:

```tsx
      <EditSessionModal
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
        sessionId={session.id}
        name={session.name}
        speakerName={session.speakerName}
        sessionDate={session.sessionDate}
        questions={session.questions}
        responses={responses}
      />
```

- [ ] **Step 6: Type-check and lint**

Run: `./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/next lint`
Expected: no errors or warnings.

- [ ] **Step 7: Commit**

```bash
git add "src/app/dashboard/admin/feedback/[id]/SessionDetailClient.tsx"
git commit -m "feat(feedback): wire EditSessionModal into the session detail page"
```

---

### Task 7: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `./node_modules/.bin/vitest run`
Expected: all tests pass, including the 9 new `diffFeedbackQuestions` tests.

- [ ] **Step 2: Type-check and lint, whole project**

Run: `./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/next lint`
Expected: no errors; no new warnings beyond the pre-existing `<img>`/LCP warnings in `FeedbackClient.tsx`/`ReviewClient.tsx`.

- [ ] **Step 3: Live click-through — unanswered session**

Against the real Supabase project, open a feedback session with zero responses in `/dashboard/admin/feedback/[id]`. Click "Edit Details". Confirm: name/speaker/date pre-fill correctly; every question's remove button and type toggle are enabled; edit a question's text, add a new question, remove one, reorder two via the chevrons, save; confirm the page reflects all changes after refresh and `feedback_audit_log` gained `updateFeedbackSessionDetails`/`updateFeedbackSessionQuestions` rows.

- [ ] **Step 4: Live click-through — answered session**

Open a session with at least one real response. Click "Edit Details". Confirm: the answered question's remove button is disabled with the "This question already has responses" tooltip, and its type toggle is disabled; its text field is still editable and saves correctly; adding a new question and reordering still work; saving with only a text edit on the answered question succeeds.

- [ ] **Step 5: Bypass check**

With that same answered session, send a direct `PATCH` to `/api/admin/feedback/sessions/[id]` (e.g. via the browser devtools console while signed in as admin, or `curl` with the admin session cookie) with a `questions` payload that omits the answered question's id (attempting removal) or changes its `type`. Confirm the response is a 400 with the expected error message, and that `feedback_questions`/`feedback_answers` in the DB are unchanged.

- [ ] **Step 6: Update memory**

Update the `pz-academy-feedback-phase2-status` memory: move "session edit ... explicitly out of this plan's scope" to a "fixed" note, same style as the `is_featured` and `MentorReviews` entries already there.
