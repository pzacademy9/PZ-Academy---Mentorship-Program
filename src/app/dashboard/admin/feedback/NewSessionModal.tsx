"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Plus,
  X,
  Star,
  Video,
  Copy,
  Check,
  CheckCircle2,
  Info,
  MoreVertical,
  Ban,
  RotateCcw,
  Link2,
  Download,
  Pencil,
  Trash2,
} from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type QuestionType = "stars" | "video";

interface BankEntry {
  id: string;
  text: string;
  type: QuestionType;
  order: number;
  isMentorshipDefault: boolean;
}

interface CustomQuestion {
  localId: string;
  text: string;
  type: QuestionType;
}

interface ProgramSessionRow {
  localId: string;
  title: string;
  speaker: string;
  date: string;
}

const MIN_QUESTIONS = 3;
const MAX_QUESTIONS = 5;
const MIN_PROGRAM_SESSIONS = 2;

function makeEmptyProgramSessions(): ProgramSessionRow[] {
  return [
    { localId: crypto.randomUUID(), title: "", speaker: "", date: "" },
    { localId: crypto.randomUUID(), title: "", speaker: "", date: "" },
  ];
}

/** Small star/video segmented toggle used inside each question row. */
function TypeToggle({
  value,
  onChange,
  disabled,
}: {
  value: QuestionType;
  onChange: (type: QuestionType) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <button
        type="button"
        title="Star rating"
        aria-label="Star rating"
        disabled={disabled}
        onClick={() => onChange("stars")}
        className={cn(
          "p-1.5 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
          value === "stars"
            ? "bg-pz-primary-container/40 text-pz-on-primary-container"
            : "text-pz-on-surface-variant hover:bg-pz-surface-container-high",
        )}
      >
        <Star className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        title="Video response"
        aria-label="Video response"
        disabled={disabled}
        onClick={() => onChange("video")}
        className={cn(
          "p-1.5 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
          value === "video"
            ? "bg-pz-primary-container/40 text-pz-on-primary-container"
            : "text-pz-on-surface-variant hover:bg-pz-surface-container-high",
        )}
      >
        <Video className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

/** One copyable session link row shown on the program-creation success screen. */
function ProgramSessionLinkRow({ index, slug }: { index: number; slug: string }) {
  const [copied, setCopied] = useState(false);
  const link = typeof window !== "undefined" ? `${window.location.origin}/feedback/${slug}` : `/feedback/${slug}`;

  function copy() {
    navigator.clipboard
      .writeText(link)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => toast.error("Could not copy the link."));
  }

  return (
    <div className="space-y-1">
      <p className="font-body text-xs text-pz-on-surface-variant">Session {index + 1}</p>
      <div className="flex items-center bg-pz-surface-container rounded-lg border border-pz-outline-variant overflow-hidden">
        <input
          type="text"
          readOnly
          value={link}
          className="flex-1 bg-transparent border-none px-3 py-2 font-body text-sm text-pz-on-surface truncate outline-none"
        />
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1.5 px-3 py-2 border-l border-pz-outline-variant bg-pz-surface-container-high hover:bg-pz-surface-variant transition-colors font-headline text-xs font-semibold text-pz-on-surface shrink-0"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-pz-primary" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

export function NewSessionModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"form" | "success">("form");
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [speakerName, setSpeakerName] = useState("");
  const [date, setDate] = useState("");

  const [bank, setBank] = useState<BankEntry[] | null>(null);
  const [bankLoading, setBankLoading] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [typeOverrides, setTypeOverrides] = useState<Record<string, QuestionType>>({});
  const [customQuestions, setCustomQuestions] = useState<CustomQuestion[]>([]);

  const [createdSlug, setCreatedSlug] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [isProgram, setIsProgram] = useState(false);
  const [programSessions, setProgramSessions] = useState<ProgramSessionRow[]>(() => makeEmptyProgramSessions());
  const [createdProgramSessions, setCreatedProgramSessions] = useState<{ id: string; slug: string }[] | null>(null);

  useEffect(() => {
    if (!open || bank !== null || bankLoading) return;
    setBankLoading(true);
    fetch("/api/admin/feedback/question-bank")
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((payload: { questions: BankEntry[] }) => {
        setBank(payload.questions);
        const initialSelected: Record<string, boolean> = {};
        payload.questions.slice(0, MAX_QUESTIONS).forEach((q) => {
          initialSelected[q.id] = true;
        });
        setSelected(initialSelected);
      })
      .catch(() => toast.error("Could not load the question bank."))
      .finally(() => setBankLoading(false));
  }, [open, bank, bankLoading]);

  const selectedBankCount = Object.values(selected).filter(Boolean).length;
  const totalSelected = selectedBankCount + customQuestions.length;
  const atMax = totalSelected >= MAX_QUESTIONS;

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = !prev[id];
      if (next && totalSelected >= MAX_QUESTIONS) {
        toast.error(`You can select up to ${MAX_QUESTIONS} questions.`);
        return prev;
      }
      return { ...prev, [id]: next };
    });
  }

  function setBankType(id: string, type: QuestionType) {
    setTypeOverrides((prev) => ({ ...prev, [id]: type }));
  }

  function addCustomQuestion() {
    if (totalSelected >= MAX_QUESTIONS) {
      toast.error(`You can select up to ${MAX_QUESTIONS} questions.`);
      return;
    }
    setCustomQuestions((prev) => [...prev, { localId: crypto.randomUUID(), text: "", type: "stars" }]);
  }

  function updateCustomQuestion(localId: string, patch: Partial<CustomQuestion>) {
    setCustomQuestions((prev) => prev.map((q) => (q.localId === localId ? { ...q, ...patch } : q)));
  }

  function removeCustomQuestion(localId: string) {
    setCustomQuestions((prev) => prev.filter((q) => q.localId !== localId));
  }

  function addProgramSession() {
    setProgramSessions((prev) => [...prev, { localId: crypto.randomUUID(), title: "", speaker: "", date: "" }]);
  }

  function removeProgramSession(localId: string) {
    setProgramSessions((prev) => (prev.length <= MIN_PROGRAM_SESSIONS ? prev : prev.filter((s) => s.localId !== localId)));
  }

  function updateProgramSession(localId: string, patch: Partial<ProgramSessionRow>) {
    setProgramSessions((prev) => prev.map((s) => (s.localId === localId ? { ...s, ...patch } : s)));
  }

  function resetForm() {
    setName("");
    setSpeakerName("");
    setDate("");
    setSelected({});
    setTypeOverrides({});
    setCustomQuestions([]);
    setStep("form");
    setCreatedSlug(null);
    setCopied(false);
    setIsProgram(false);
    setProgramSessions(makeEmptyProgramSessions());
    setCreatedProgramSessions(null);
  }

  function submit() {
    if (!name.trim()) {
      toast.error(isProgram ? "Program name is required." : "Session name and speaker are required.");
      return;
    }
    if (!isProgram && !speakerName.trim()) {
      toast.error("Session name and speaker are required.");
      return;
    }

    const bankQuestions = (bank ?? [])
      .filter((q) => selected[q.id])
      .map((q) => ({ text: q.text, type: typeOverrides[q.id] ?? q.type }));
    const customPayload = customQuestions
      .filter((q) => q.text.trim().length > 0)
      .map((q) => ({ text: q.text.trim(), type: q.type }));
    const questions = [...bankQuestions, ...customPayload];

    if (questions.length < MIN_QUESTIONS) {
      toast.error(`Pick at least ${MIN_QUESTIONS} questions.`);
      return;
    }
    if (questions.length > MAX_QUESTIONS) {
      toast.error(`Pick at most ${MAX_QUESTIONS} questions.`);
      return;
    }

    if (isProgram) {
      const sessions = programSessions
        .map((s) => ({ title: s.title.trim(), speaker: s.speaker.trim(), date: s.date || null }))
        .filter((s) => s.title.length > 0 && s.speaker.length > 0);

      if (sessions.length < MIN_PROGRAM_SESSIONS) {
        toast.error(`A program needs at least ${MIN_PROGRAM_SESSIONS} sessions, each with a title and speaker.`);
        return;
      }

      startTransition(async () => {
        const res = await fetch("/api/admin/feedback/programs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), questions, sessions }),
        });

        if (!res.ok) {
          const payload = (await res.json().catch(() => null)) as { error?: string } | null;
          toast.error(payload?.error ?? "Could not create this program.");
          return;
        }

        const payload = (await res.json()) as { id: string; sessions: { id: string; slug: string }[] };
        setCreatedProgramSessions(payload.sessions);
        setStep("success");
        router.refresh();
      });
      return;
    }

    startTransition(async () => {
      const res = await fetch("/api/admin/feedback/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          speakerName: speakerName.trim(),
          sessionDate: date || null,
          questions,
        }),
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(payload?.error ?? "Could not create this session.");
        return;
      }

      const payload = (await res.json()) as { id: string; slug: string };
      setCreatedSlug(payload.slug);
      setStep("success");
      router.refresh();
    });
  }

  const link =
    createdSlug != null
      ? typeof window !== "undefined"
        ? `${window.location.origin}/feedback/${createdSlug}`
        : `/feedback/${createdSlug}`
      : "";

  function copyLink() {
    navigator.clipboard
      .writeText(link)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => toast.error("Could not copy the link."));
  }

  function closeAndReset() {
    setOpen(false);
    resetForm();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 font-headline text-sm font-semibold bg-pz-primary text-pz-on-primary hover:bg-pz-on-primary-container transition-colors shadow-sm"
      >
        <Plus className="w-4 h-4" />
        New Session
      </button>

      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : closeAndReset())}>
        <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
          {step === "form" ? (
            <>
              <DialogHeader>
                <DialogTitle className="font-headline text-pz-on-surface">New Session</DialogTitle>
              </DialogHeader>

              <div className="space-y-1.5">
                <label htmlFor="session-name" className="font-headline text-xs font-semibold uppercase tracking-wide text-pz-on-surface-variant">
                  {isProgram ? "Program Name" : "Session Name"}
                </label>
                <input
                  id="session-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={isProgram ? "e.g. Advanced Cardiology Series" : "e.g. Advanced Cardiology Trends"}
                  className="w-full px-3 py-2 rounded-lg border border-pz-outline-variant bg-white focus:border-pz-primary focus:ring-2 focus:ring-pz-primary/20 outline-none font-body text-sm"
                />
              </div>

              <div className="flex items-center justify-between gap-4 bg-pz-surface-container p-3 rounded-lg border border-pz-outline-variant/40">
                <div>
                  <p className="font-headline text-sm font-semibold text-pz-on-surface">Make this a program</p>
                  <p className="font-body text-xs text-pz-on-surface-variant mt-0.5">
                    Bundle {MIN_PROGRAM_SESSIONS}+ linked sessions under one name, sharing the same questions.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isProgram}
                  aria-label="Make this a program"
                  onClick={() => setIsProgram((v) => !v)}
                  className={cn(
                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0",
                    isProgram ? "bg-pz-primary" : "bg-pz-surface-variant",
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                      isProgram ? "translate-x-6" : "translate-x-1",
                    )}
                  />
                </button>
              </div>

              {!isProgram ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label htmlFor="speaker-name" className="font-headline text-xs font-semibold uppercase tracking-wide text-pz-on-surface-variant">
                      Speaker Name
                    </label>
                    <input
                      id="speaker-name"
                      type="text"
                      value={speakerName}
                      onChange={(e) => setSpeakerName(e.target.value)}
                      placeholder="Dr. Jane Doe"
                      className="w-full px-3 py-2 rounded-lg border border-pz-outline-variant bg-white focus:border-pz-primary focus:ring-2 focus:ring-pz-primary/20 outline-none font-body text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="session-date" className="font-headline text-xs font-semibold uppercase tracking-wide text-pz-on-surface-variant">
                      Date
                    </label>
                    <input
                      id="session-date"
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-pz-outline-variant bg-white focus:border-pz-primary focus:ring-2 focus:ring-pz-primary/20 outline-none font-body text-sm"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-headline font-semibold text-sm text-pz-on-surface">Sessions</h3>
                    <span className="font-body text-xs text-pz-on-surface-variant">
                      {programSessions.length} sessions · min {MIN_PROGRAM_SESSIONS}
                    </span>
                  </div>

                  {programSessions.map((s, i) => (
                    <div
                      key={s.localId}
                      className="bg-pz-surface-container p-3 rounded-xl border border-pz-outline-variant/40 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-headline text-xs font-semibold text-pz-on-surface-variant">
                          Session {i + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeProgramSession(s.localId)}
                          disabled={programSessions.length <= MIN_PROGRAM_SESSIONS}
                          aria-label={`Remove session ${i + 1}`}
                          className="p-1 rounded text-pz-on-surface-variant hover:text-pz-danger transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <input
                        type="text"
                        value={s.title}
                        onChange={(e) => updateProgramSession(s.localId, { title: e.target.value })}
                        placeholder="Session title"
                        className="w-full px-3 py-2 rounded-lg border border-pz-outline-variant bg-white focus:border-pz-primary focus:ring-2 focus:ring-pz-primary/20 outline-none font-body text-sm"
                      />
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={s.speaker}
                          onChange={(e) => updateProgramSession(s.localId, { speaker: e.target.value })}
                          placeholder="Speaker name"
                          className="w-full px-3 py-2 rounded-lg border border-pz-outline-variant bg-white focus:border-pz-primary focus:ring-2 focus:ring-pz-primary/20 outline-none font-body text-sm"
                        />
                        <input
                          type="date"
                          value={s.date}
                          onChange={(e) => updateProgramSession(s.localId, { date: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg border border-pz-outline-variant bg-white focus:border-pz-primary focus:ring-2 focus:ring-pz-primary/20 outline-none font-body text-sm"
                        />
                      </div>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={addProgramSession}
                    className="inline-flex items-center gap-1.5 font-headline text-xs font-semibold text-pz-primary hover:text-pz-on-primary-container transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Session
                  </button>
                </div>
              )}

              <div className="border-t border-pz-outline-variant pt-4">
                <div className="flex items-end justify-between mb-2">
                  <h3 className="font-headline font-semibold text-sm text-pz-on-surface">Questions</h3>
                  <span className="font-body text-xs text-pz-on-surface-variant">
                    {totalSelected}/{MAX_QUESTIONS} selected · min {MIN_QUESTIONS}
                  </span>
                </div>

                <div className="space-y-2 bg-pz-surface-container p-3 rounded-xl border border-pz-outline-variant/40">
                  {bankLoading && <p className="font-body text-sm text-pz-on-surface-variant px-2 py-1">Loading questions…</p>}

                  {(bank ?? []).map((q) => (
                    <div key={q.id} className="flex items-start gap-3">
                      <input
                        id={`bank-${q.id}`}
                        type="checkbox"
                        checked={!!selected[q.id]}
                        onChange={() => toggleSelected(q.id)}
                        disabled={!selected[q.id] && atMax}
                        className="mt-1.5 w-4 h-4 rounded border-pz-outline-variant text-pz-primary focus:ring-pz-primary/30 cursor-pointer disabled:cursor-not-allowed"
                      />
                      <label htmlFor={`bank-${q.id}`} className="flex-1 font-body text-sm text-pz-on-surface py-1 cursor-pointer">
                        {q.text}
                      </label>
                      <TypeToggle
                        value={typeOverrides[q.id] ?? q.type}
                        onChange={(type) => setBankType(q.id, type)}
                        disabled={!selected[q.id]}
                      />
                    </div>
                  ))}

                  {customQuestions.map((q) => (
                    <div key={q.localId} className="flex items-start gap-3">
                      <span className="mt-1.5 w-4 h-4 rounded bg-pz-primary/70 shrink-0" aria-hidden />
                      <input
                        type="text"
                        value={q.text}
                        onChange={(e) => updateCustomQuestion(q.localId, { text: e.target.value })}
                        placeholder="Type a custom question…"
                        className="flex-1 bg-transparent border-b border-pz-outline-variant/60 focus:border-pz-primary outline-none font-body text-sm text-pz-on-surface py-1"
                      />
                      <TypeToggle
                        value={q.type}
                        onChange={(type) => updateCustomQuestion(q.localId, { type })}
                        disabled={false}
                      />
                      <button
                        type="button"
                        onClick={() => removeCustomQuestion(q.localId)}
                        aria-label="Remove custom question"
                        className="p-1 rounded text-pz-on-surface-variant hover:text-pz-danger transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={addCustomQuestion}
                  disabled={atMax}
                  className="mt-2 inline-flex items-center gap-1.5 font-headline text-xs font-semibold text-pz-primary hover:text-pz-on-primary-container transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add custom question
                </button>
              </div>

              <DialogFooter className="gap-2 sm:gap-2">
                <button
                  type="button"
                  onClick={closeAndReset}
                  disabled={isPending}
                  className="px-4 py-2.5 rounded-lg font-headline text-sm font-semibold bg-pz-surface-container-high text-pz-on-surface-variant hover:bg-pz-surface-variant transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={isPending}
                  className="px-4 py-2.5 rounded-lg font-headline text-sm font-semibold bg-pz-primary text-pz-on-primary hover:bg-pz-on-primary-container transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isPending ? "Creating…" : isProgram ? "Create Program" : "Create Session"}
                </button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <div className="flex items-start gap-3">
                  <div className="bg-pz-primary-container/30 p-2 rounded-full shrink-0">
                    <CheckCircle2 className="w-6 h-6 text-pz-primary" />
                  </div>
                  <div>
                    <DialogTitle className="font-headline text-pz-on-surface">
                      {createdProgramSessions
                        ? `Success! Your program is live with ${createdProgramSessions.length} sessions.`
                        : "Success! Your feedback session is live."}
                    </DialogTitle>
                    <p className="font-body text-sm text-pz-on-surface-variant mt-1">
                      Share the link{createdProgramSessions ? "s" : ""} below for attendees to begin.
                    </p>
                  </div>
                </div>
              </DialogHeader>

              {createdProgramSessions ? (
                <div className="space-y-3">
                  {createdProgramSessions.map((s, i) => (
                    <ProgramSessionLinkRow key={s.id} index={i} slug={s.slug} />
                  ))}
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label htmlFor="session-link" className="font-headline text-xs font-semibold uppercase tracking-wide text-pz-on-surface-variant">
                    Direct Session Link
                  </label>
                  <div className="flex items-center bg-pz-surface-container rounded-lg border border-pz-outline-variant overflow-hidden">
                    <input
                      id="session-link"
                      type="text"
                      readOnly
                      value={link}
                      className="flex-1 bg-transparent border-none px-3 py-2.5 font-body text-sm text-pz-on-surface truncate outline-none"
                    />
                    <button
                      type="button"
                      onClick={copyLink}
                      className="flex items-center gap-1.5 px-4 py-2.5 border-l border-pz-outline-variant bg-pz-surface-container-high hover:bg-pz-surface-variant transition-colors font-headline text-xs font-semibold text-pz-on-surface shrink-0"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-pz-primary" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>
              )}

              <div className="flex gap-2 items-start bg-pz-surface-container p-3 rounded-lg">
                <Info className="w-4 h-4 text-pz-tertiary shrink-0 mt-0.5" />
                <p className="font-body text-xs text-pz-tertiary leading-relaxed">
                  Responses sync automatically — check the session list for response counts and ratings.
                </p>
              </div>

              <DialogFooter className="gap-2 sm:gap-2">
                <button
                  type="button"
                  onClick={closeAndReset}
                  className="px-4 py-2.5 rounded-lg font-headline text-sm font-semibold bg-pz-primary text-pz-on-primary hover:bg-pz-on-primary-container transition-colors"
                >
                  Done
                </button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Row-level actions for the session table — Close/Reopen, Share link, Export CSV, Delete. */
export function SessionRowActions({
  id,
  name,
  slug,
  status,
}: {
  id: string;
  name: string;
  slug: string;
  status: "active" | "closed";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);

  function toggleStatus() {
    const target = status === "active" ? "closed" : "active";
    startTransition(async () => {
      const res = await fetch(`/api/admin/feedback/sessions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: target }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(payload?.error ?? "Could not update this session.");
        return;
      }
      toast.success(`${name} — marked ${target}.`);
      router.refresh();
    });
  }

  function shareLink() {
    startTransition(async () => {
      const res = await fetch(`/api/admin/feedback/sessions/${id}/share-token`, { method: "POST" });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(payload?.error ?? "Could not generate a share link.");
        return;
      }
      const payload = (await res.json()) as { shareUrl: string };
      const absolute = typeof window !== "undefined" ? `${window.location.origin}${payload.shareUrl}` : payload.shareUrl;
      try {
        await navigator.clipboard.writeText(absolute);
        toast.success("Share link copied to clipboard.");
      } catch {
        toast.success(`Share link: ${absolute}`);
      }
    });
  }

  function exportCsv() {
    window.open(`/api/admin/feedback/sessions/${id}/export`, "_blank");
  }

  function submitDelete() {
    startTransition(async () => {
      const res = await fetch(`/api/admin/feedback/sessions/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(payload?.error ?? "Could not delete this session.");
        return;
      }
      setDeleteOpen(false);
      toast.success(`${name} deleted.`);
      router.refresh();
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Session actions"
          disabled={isPending}
          className="p-1.5 rounded-full text-pz-on-surface-variant hover:bg-pz-surface-container transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-pz-primary/30"
        >
          <MoreVertical className="w-5 h-5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          <DropdownMenuItem disabled className="gap-2 font-body opacity-50 cursor-not-allowed">
            <Pencil className="w-4 h-4" />
            Edit (coming soon)
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={toggleStatus} className="gap-2 font-body cursor-pointer">
            {status === "active" ? <Ban className="w-4 h-4" /> : <RotateCcw className="w-4 h-4" />}
            {status === "active" ? "Close session" : "Reopen session"}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={shareLink} className="gap-2 font-body cursor-pointer">
            <Link2 className="w-4 h-4" />
            Copy share link
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={exportCsv} className="gap-2 font-body cursor-pointer">
            <Download className="w-4 h-4" />
            Export CSV
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => setDeleteOpen(true)}
            className="gap-2 font-body cursor-pointer text-pz-danger focus:text-pz-danger"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-headline text-pz-on-surface">Delete this session?</DialogTitle>
          </DialogHeader>
          <p className="font-body text-sm text-pz-on-surface-variant">
            {name} — this permanently removes the session and all its responses. This cannot be undone.
          </p>
          <DialogFooter className="gap-2 sm:gap-2">
            <button
              type="button"
              onClick={() => setDeleteOpen(false)}
              disabled={isPending}
              className="px-4 py-2.5 rounded-lg font-headline text-sm font-semibold bg-pz-surface-container-high text-pz-on-surface-variant hover:bg-pz-surface-variant transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitDelete}
              disabled={isPending}
              className="px-4 py-2.5 rounded-lg font-headline text-sm font-semibold bg-pz-danger text-white hover:bg-pz-danger/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? "Working…" : "Delete"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Row-level delete action for the Programs table — sessions survive as standalone (program_id set to null). */
export function ProgramRowActions({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);

  function submitDelete() {
    startTransition(async () => {
      const res = await fetch(`/api/admin/feedback/programs/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(payload?.error ?? "Could not delete this program.");
        return;
      }
      setDeleteOpen(false);
      toast.success(`${name} deleted — its sessions remain, no longer grouped.`);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setDeleteOpen(true)}
        aria-label={`Delete ${name}`}
        className="p-1.5 rounded-full text-pz-on-surface-variant hover:text-pz-danger hover:bg-pz-danger/10 transition-colors"
      >
        <Trash2 className="w-4 h-4" />
      </button>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-headline text-pz-on-surface">Delete this program?</DialogTitle>
          </DialogHeader>
          <p className="font-body text-sm text-pz-on-surface-variant">
            {name} — this removes the program grouping only. Its sessions and their responses are not deleted; they
            remain in the session list as standalone sessions.
          </p>
          <DialogFooter className="gap-2 sm:gap-2">
            <button
              type="button"
              onClick={() => setDeleteOpen(false)}
              disabled={isPending}
              className="px-4 py-2.5 rounded-lg font-headline text-sm font-semibold bg-pz-surface-container-high text-pz-on-surface-variant hover:bg-pz-surface-variant transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitDelete}
              disabled={isPending}
              className="px-4 py-2.5 rounded-lg font-headline text-sm font-semibold bg-pz-danger text-white hover:bg-pz-danger/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? "Working…" : "Delete"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
