"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Image as ImageIcon } from "lucide-react";
import { LibraryImageField } from "@/components/admin/landing/LibraryImageField";
import {
  saveSetup,
  type SetupState,
} from "@/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/sessions/setup-actions";
import type { ClassDayInput } from "@/lib/classes/plan";
import { ClassCalendar, dateWords } from "./ClassCalendar";
import { ClassDayRow, type DayState } from "./ClassDayRow";
import { MAX_QUESTIONS, MIN_QUESTIONS, QuestionPicker, type BankEntry, type Question } from "./QuestionPicker";
import { cardCls, fieldCls, labelCls, primaryBtn, quietBtn } from "./styles";

const BASE = "/dashboard/admin/enrollments/registrations";
const TYPE_WORDS = { course: "Course", workshop: "Workshop", webinar: "Webinar" } as const;

function startingMonth(state: SetupState): string {
  const first = state.classes.map((c) => c.date).sort()[0];
  if (first) return first.slice(0, 7);
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function initialDays(state: SetupState): DayState[] {
  return state.classes.map((c) => ({
    date: c.date,
    existingId: c.id,
    number: c.number,
    hasData: c.hasData,
    title: c.title,
    speaker: c.speaker,
    start: c.ownStart ?? "",
    end: c.ownEnd ?? "",
    zoom: c.ownZoom ?? "",
    editing: false,
  }));
}

export function SetupForm({ pageId, state, initialMonth }: { pageId: string; state: SetupState; initialMonth?: string }) {
  const router = useRouter();
  const back = `${BASE}/campaign/${pageId}/sessions`;
  // A webinar is one day, but a webinar that already has several classes keeps them (the limit is max(1, existing)).
  const webinar = state.type === "webinar" && state.classes.length <= 1;

  const [month, setMonth] = useState(initialMonth ?? startingMonth(state));
  const [days, setDays] = useState<DayState[]>(() => initialDays(state));
  const [defaults, setDefaults] = useState(state.defaults ?? { start: "19:00", end: "21:00", zoom: "" });
  const [cover, setCover] = useState(state.coverUrl ?? "");
  const [questions, setQuestions] = useState<Question[]>(state.questions);
  const [bank, setBank] = useState<BankEntry[] | null>(null);
  const [confirmIds, setConfirmIds] = useState<string[]>([]);
  const [asking, setAsking] = useState<DayState | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Existing classes unticked in this visit, so ticking the same date again brings back the same class.
  const [removed, setRemoved] = useState<Record<string, DayState>>({});
  const keepRef = useRef<HTMLButtonElement>(null);
  // Phones show one step at a time; from the lg breakpoint up every section is visible.
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const topRef = useRef<HTMLDivElement>(null);
  const firstStep = useRef(true);
  useEffect(() => {
    // Only on a real step change: not when the page first opens.
    if (firstStep.current) {
      firstStep.current = false;
      return;
    }
    topRef.current?.scrollIntoView?.({ block: "start" });
  }, [step]);

  useEffect(() => {
    if (asking) keepRef.current?.focus();
  }, [asking]);

  useEffect(() => {
    let live = true;
    fetch("/api/admin/feedback/question-bank")
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((payload: { questions: BankEntry[] }) => {
        if (!live) return;
        setBank(payload.questions);
        // A new batch starts with the first few questions chosen, so the admin only has to adjust.
        setQuestions((cur) => (cur.length === 0 ? payload.questions.slice(0, MIN_QUESTIONS).map((q) => ({ text: q.text, type: q.type })) : cur));
      })
      .catch(() => {
        if (live) {
          setBank([]);
          toast.error("Could not load the question bank.");
        }
      });
    return () => {
      live = false;
    };
  }, []);

  const sorted = useMemo(() => [...days].sort((a, b) => a.date.localeCompare(b.date)), [days]);
  const dropDay = (date: string) => {
    const gone = days.find((d) => d.date === date);
    if (gone?.existingId) setRemoved((cur) => ({ ...cur, [date]: gone }));
    setDays((cur) => cur.filter((d) => d.date !== date));
  };
  const patchDay = (date: string, patch: Partial<DayState>) =>
    setDays((cur) => cur.map((d) => (d.date === date ? { ...d, ...patch } : d)));

  function removeRequest(day: DayState) {
    if (day.existingId && day.hasData) setAsking(day);
    else dropDay(day.date);
  }

  function toggle(date: string) {
    setNote(null);
    const present = days.find((d) => d.date === date);
    if (present) return removeRequest(present);
    if (webinar && days.length >= 1) {
      setNote("A webinar has only one day. Untick the current day first to pick a different one.");
      return;
    }
    const restored = removed[date];
    if (restored) {
      setDays((cur) => [...cur, { ...restored, editing: false }]);
      setRemoved((cur) => {
        const rest = { ...cur };
        delete rest[date];
        return rest;
      });
      setConfirmIds((cur) => cur.filter((id) => id !== restored.existingId));
      return;
    }
    setDays((cur) => [...cur, { date, hasData: false, title: "", speaker: "", start: "", end: "", zoom: "", editing: false }]);
  }

  function confirmRemoval() {
    if (!asking) return;
    if (asking.existingId) setConfirmIds((cur) => [...cur, asking.existingId as string]);
    dropDay(asking.date);
    setAsking(null);
  }

  const questionsOk = questions.length >= MIN_QUESTIONS && questions.length <= MAX_QUESTIONS;
  const QUESTION_ERROR = `Please pick ${MIN_QUESTIONS} to ${MAX_QUESTIONS} feedback questions.`;
  function goToQuestions() {
    if (days.length === 0) {
      setNote("Pick at least one class day.");
      toast.error("Pick at least one class day.");
      return;
    }
    setNote(null);
    setStep(2);
  }
  function goToCover() {
    if (!questionsOk) {
      toast.error(QUESTION_ERROR);
      return;
    }
    setStep(3);
  }

  async function submit() {
    if (!questionsOk) {
      toast.error(QUESTION_ERROR);
      return;
    }
    const input: ClassDayInput[] = sorted.map((d) => {
      const out: ClassDayInput = { date: d.date, title: d.title, speaker: d.speaker };
      if (d.existingId) out.existingId = d.existingId;
      if (d.start) out.start = d.start;
      if (d.end) out.end = d.end;
      if (d.zoom) out.zoom = d.zoom;
      return out;
    });
    const stillThere = new Set(sorted.flatMap((d) => (d.existingId ? [d.existingId] : [])));
    setSaving(true);
    try {
      const res = await saveSetup(pageId, {
        days: input,
        defaults,
        coverUrl: cover.trim() === "" ? null : cover.trim(),
        questions,
        confirmRemoveIds: confirmIds.filter((id) => !stillThere.has(id)),
      });
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success(res.message);
      router.push(back);
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const exists = state.classes.length > 0;

  return (
    <div ref={topRef} className="scroll-mt-20 space-y-6 pb-56 lg:pb-28">
      <div className="space-y-2 lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <p className="font-headline text-lg font-bold text-pz-on-surface">Step {step} of 3</p>
          <Link href={back} className="inline-flex min-h-12 items-center text-base font-headline font-bold text-pz-primary">Back to classes</Link>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-pz-surface-container-high" aria-hidden>
          <div className="h-2 rounded-full bg-pz-primary transition-all" style={{ width: `${(step / 3) * 100}%` }} />
        </div>
      </div>
      <section className={`${cardCls} ${step === 1 ? "" : "max-lg:hidden"}`}>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-headline text-xl font-bold text-pz-on-surface">1. When are the classes?</h2>
          <span className="rounded-full bg-pz-primary/10 px-3 py-1 font-headline text-sm font-bold text-pz-primary">{TYPE_WORDS[state.type]}</span>
        </div>
        <p className="mt-1 text-base text-pz-on-surface-variant">
          {webinar ? "A webinar has one day. Tap that day on the calendar." : "Tap each class day on the calendar. Tap it again to remove it."}
        </p>
        {note && <p role="alert" className="mt-2 text-base font-bold text-pz-danger">{note}</p>}

        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          <ClassCalendar month={month} selected={days.map((d) => d.date)} labels={Object.fromEntries(sorted.map((d, i) => [d.date, `Day ${i + 1}`]))} max={webinar ? 1 : null} onToggle={toggle} onMonthChange={setMonth} />

          <div className="rounded-xl border border-pz-outline-variant/60 p-4">
            <h3 className="font-headline text-lg font-bold text-pz-on-surface">Usual time and Zoom link</h3>
            <p className="text-base text-pz-on-surface-variant">Used for every class. You can change one day later.</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls} htmlFor="default-start">Starts</label>
                <input id="default-start" type="time" className={fieldCls} value={defaults.start} onChange={(e) => setDefaults({ ...defaults, start: e.target.value })} />
              </div>
              <div>
                <label className={labelCls} htmlFor="default-end">Ends</label>
                <input id="default-end" type="time" className={fieldCls} value={defaults.end} onChange={(e) => setDefaults({ ...defaults, end: e.target.value })} />
              </div>
            </div>
            <p className="mt-1 text-base text-pz-on-surface-variant">Pakistan time</p>
            <p className="mt-3 text-base text-pz-on-surface-variant">A reminder email goes to students 60 minutes before each class. You can change this in Edit this class.</p>
            <div className="mt-3">
              <label className={labelCls} htmlFor="default-zoom">Zoom link</label>
              <input id="default-zoom" type="url" className={fieldCls} value={defaults.zoom} onChange={(e) => setDefaults({ ...defaults, zoom: e.target.value })} />
            </div>
          </div>
        </div>

        <h3 className="mt-6 font-headline text-lg font-bold text-pz-on-surface">
          Your class days <span className="text-pz-on-surface-variant">({sorted.length})</span>
        </h3>
        {sorted.length === 0 ? (
          <p className="mt-2 text-base text-pz-on-surface-variant">No days yet. Tap a day on the calendar.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {sorted.map((d) => (
              <ClassDayRow key={d.date} day={d} onChange={(p) => patchDay(d.date, p)} onRemove={() => removeRequest(d)} />
            ))}
          </ul>
        )}
      </section>

      <section className={`${cardCls} ${step === 2 ? "" : "max-lg:hidden"}`}>
        <h2 className="font-headline text-xl font-bold text-pz-on-surface">2. Feedback questions</h2>
        <p className="mb-3 mt-1 text-base text-pz-on-surface-variant">Students answer these at the end of every class.</p>
        <QuestionPicker bank={bank} value={questions} onChange={setQuestions} />
      </section>

      <section className={`${cardCls} ${step === 3 ? "" : "max-lg:hidden"}`}>
        <h2 className="font-headline text-xl font-bold text-pz-on-surface">3. Cover image</h2>
        <p className="mb-3 mt-1 text-base text-pz-on-surface-variant">Shown on the feedback page. You can leave it empty.</p>
        <LibraryImageField
          value={cover}
          onChange={setCover}
          courseSlug="classes"
          kind="cover"
          folder="heroes"
          want="wide"
          uploadLabel="Upload new"
          shape="square"
          icon={ImageIcon}
          inputClassName={fieldCls}
        />
      </section>

      <section data-testid="schedule-summary" className={`${cardCls} ${step === 3 ? "" : "max-lg:hidden"}`}>
        <h2 className="font-headline text-xl font-bold text-pz-on-surface">Schedule summary</h2>
        <dl className="mt-2 space-y-1 text-base text-pz-on-surface-variant">
          <div className="flex justify-between gap-3"><dt>Classes</dt><dd className="font-bold text-pz-on-surface">{sorted.length} class {sorted.length === 1 ? "day" : "days"}</dd></div>
          <div className="flex justify-between gap-3"><dt>Feedback</dt><dd className="font-bold text-pz-on-surface">{questions.length} feedback {questions.length === 1 ? "question" : "questions"}</dd></div>
          <div className="flex justify-between gap-3"><dt>Times</dt><dd className="font-bold text-pz-on-surface">Pakistan time</dd></div>
        </dl>
        <p className="mt-3 text-base text-pz-on-surface-variant lg:hidden">Attendance link and feedback link are made for every class automatically.</p>
      </section>

      <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-[60] flex gap-2 border-t border-pz-outline-variant/60 bg-pz-surface-container-lowest p-3 lg:hidden">
        {step > 1 && (
          <button type="button" onClick={() => setStep((step - 1) as 1 | 2)} className={quietBtn}>Back</button>
        )}
        {step === 1 && (
          <button type="button" onClick={goToQuestions} className={`${primaryBtn} flex-1`}>Next: Feedback questions</button>
        )}
        {step === 2 && (
          <button type="button" onClick={goToCover} className={`${primaryBtn} flex-1`}>Next: Cover image</button>
        )}
        {step === 3 && (
          <button type="button" onClick={submit} disabled={saving} className={`${primaryBtn} flex-1`}>Save classes</button>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-[60] border-t border-pz-outline-variant/60 bg-pz-surface-container-lowest p-3 max-lg:hidden lg:sticky lg:bottom-0 lg:rounded-xl lg:border">
        <p className="mb-2 text-center text-base text-pz-on-surface-variant md:text-left">
          Attendance link and feedback link are made for every class automatically.
        </p>
        <div className="flex flex-col items-stretch gap-2 md:flex-row md:items-center md:justify-end">
          <Link href={back} className="inline-flex min-h-12 items-center justify-center px-4 text-base font-headline font-medium text-pz-on-surface-variant hover:text-pz-on-surface md:order-1">
            Cancel
          </Link>
          <button type="button" onClick={submit} disabled={saving} className={`${primaryBtn} w-full md:order-2 md:w-auto`}>
            {exists ? "Save changes" : "Create all classes"}
          </button>
        </div>
      </div>

      {asking && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-4 pb-24 md:items-center lg:pb-4">
          <div role="dialog" aria-modal="true" aria-labelledby="remove-title" onKeyDown={(e) => { if (e.key === "Escape") setAsking(null); }} className="w-full max-w-md rounded-xl bg-pz-surface-container-lowest p-5">
            <h2 id="remove-title" className="font-headline text-lg font-bold text-pz-on-surface">Remove the class on {dateWords(asking.date)}?</h2>
            <p className="mt-2 text-base text-pz-on-surface-variant">
              The attendance marks and quiz results of this class will be deleted. Its feedback link stops working only if nobody has answered it.
              Any feedback answers are kept in Admin &gt; Feedback.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button type="button" onClick={confirmRemoval} className={primaryBtn}>Yes, remove this class</button>
              <button type="button" ref={keepRef} onClick={() => setAsking(null)} className={quietBtn}>Keep it</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
