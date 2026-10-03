"use client";

import { useState, useEffect } from "react";
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
  Trash2,
  Image as ImageIcon,
  Search,
  AlertTriangle,
} from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { cn } from "@/lib/utils";
import { ShareReviewModal } from "./ShareReviewModal";

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

interface MentorOption {
  id: string;
  slug: string;
  name: string;
  title: string;
  photo: string;
  hasLinkedAccount: boolean;
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

const COVER_MAX_BYTES = 5 * 1024 * 1024;
const COVER_TARGET_ASPECT = 16 / 9;
const COVER_ASPECT_TOLERANCE = 0.02;

/**
 * Center-crops an image to 16:9 on an offscreen canvas when its native
 * aspect ratio falls outside a small tolerance. Returns the original file
 * untouched when it's already close enough to 16:9.
 */
function cropToWidescreen(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      const aspect = img.width / img.height;
      if (Math.abs(aspect - COVER_TARGET_ASPECT) <= COVER_ASPECT_TOLERANCE) {
        URL.revokeObjectURL(objectUrl);
        resolve(file);
        return;
      }

      let cropWidth = img.width;
      let cropHeight = img.height;
      if (aspect > COVER_TARGET_ASPECT) {
        cropWidth = Math.round(img.height * COVER_TARGET_ASPECT);
      } else {
        cropHeight = Math.round(img.width / COVER_TARGET_ASPECT);
      }
      const sx = Math.round((img.width - cropWidth) / 2);
      const sy = Math.round((img.height - cropHeight) / 2);

      const canvas = document.createElement("canvas");
      canvas.width = cropWidth;
      canvas.height = cropHeight;
      const ctx = canvas.getContext("2d");
      URL.revokeObjectURL(objectUrl);
      if (!ctx) {
        resolve(file);
        return;
      }
      ctx.drawImage(img, sx, sy, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
      const outType = file.type === "image/png" ? "image/png" : "image/jpeg";
      canvas.toBlob(
        (blob) => resolve(blob ? new File([blob], file.name, { type: blob.type || outType }) : file),
        outType,
        0.92,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not read that image."));
    };
    img.src = objectUrl;
  });
}

/** Small star/video segmented toggle used inside each question row. */
export function TypeToggle({
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
          "p-1.5 max-md:min-h-11 max-md:min-w-11 inline-flex items-center justify-center rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
          value === "stars"
            ? "bg-pz-primary-container/40 text-pz-on-primary-container dark:text-pz-primary"
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
          "p-1.5 max-md:min-h-11 max-md:min-w-11 inline-flex items-center justify-center rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
          value === "video"
            ? "bg-pz-primary-container/40 text-pz-on-primary-container dark:text-pz-primary"
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
          className="flex-1 bg-transparent border-none px-3 py-2 font-body text-sm max-md:text-base text-pz-on-surface truncate outline-none"
        />
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1.5 px-3 py-2 max-md:min-h-11 border-l border-pz-outline-variant bg-pz-surface-container-high hover:bg-pz-surface-variant transition-colors font-headline text-xs font-semibold text-pz-on-surface shrink-0"
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

  const [name, setName] = useState("");
  const [speakerName, setSpeakerName] = useState("");
  const [date, setDate] = useState("");

  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);

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

  const [mentors, setMentors] = useState<MentorOption[] | null>(null);
  const [mentorsLoading, setMentorsLoading] = useState(false);
  const [mentorQuery, setMentorQuery] = useState("");
  const [mentorDropdownOpen, setMentorDropdownOpen] = useState(false);
  const [selectedMentorId, setSelectedMentorId] = useState<string | null>(null);

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

  useEffect(() => {
    if (!open || mentors !== null || mentorsLoading) return;
    setMentorsLoading(true);
    fetch("/api/admin/mentors")
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((payload: { mentors: MentorOption[] }) => setMentors(payload.mentors))
      .catch(() => toast.error("Could not load mentors."))
      .finally(() => setMentorsLoading(false));
  }, [open, mentors, mentorsLoading]);

  // Object URL for the cover preview — revoked whenever the file changes or the modal unmounts.
  useEffect(() => {
    if (!coverFile) {
      setCoverPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(coverFile);
    setCoverPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [coverFile]);

  async function handleCoverSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (!file) return;
    if (file.size > COVER_MAX_BYTES) {
      toast.error("File is too large (max 5 MB). Please choose a smaller image.");
      return;
    }
    try {
      const cropped = await cropToWidescreen(file);
      setCoverFile(cropped);
    } catch {
      toast.error("Could not read that image. Please try a different file.");
    }
  }

  function removeCoverSelection() {
    setCoverFile(null);
  }

  const selectedMentor = mentors?.find((m) => m.id === selectedMentorId) ?? null;
  const filteredMentors = (mentors ?? []).filter((m) => m.name.toLowerCase().includes(mentorQuery.trim().toLowerCase()));

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
    setCoverFile(null);
    setSelected({});
    setTypeOverrides({});
    setCustomQuestions([]);
    setStep("form");
    setCreatedSlug(null);
    setCopied(false);
    setIsProgram(false);
    setProgramSessions(makeEmptyProgramSessions());
    setCreatedProgramSessions(null);
    setMentorQuery("");
    setMentorDropdownOpen(false);
    setSelectedMentorId(null);
  }

  /**
   * Posts the selected cover to `url`. Non-fatal: the session/program already
   * exists, so a failed cover upload only earns a warning toast, never
   * blocks the success step.
   */
  async function uploadCoverTo(url: string, warningMessage: string) {
    if (!coverFile) return;
    const form = new FormData();
    form.append("cover", coverFile);
    try {
      const res = await fetch(url, { method: "POST", body: form });
      if (!res.ok) toast.warning(warningMessage);
    } catch {
      toast.warning(warningMessage);
    }
  }

  /** Uploads the selected cover onto a just-created standalone session or (as the first-session convenience copy) a program's member session. */
  async function uploadCoverForSession(sessionId: string) {
    await uploadCoverTo(
      `/api/admin/feedback/sessions/${sessionId}/cover`,
      "Session created, but the cover image could not be uploaded. You can add it from the session page.",
    );
  }

  /**
   * Uploads the selected cover onto a just-created program's own cover_url —
   * distinct from uploadCoverForSession above. This is the cover the share
   * card / OG image for the program's own share link actually reads
   * (flattenShareView / getNativeShareView, program branch), so without this
   * call feedback_programs.cover_url stays permanently null even though a
   * cover was picked in this modal.
   */
  async function uploadCoverForProgram(programId: string) {
    await uploadCoverTo(
      `/api/admin/feedback/programs/${programId}/cover`,
      "Program created, but the cover image could not be uploaded.",
    );
  }

  const { run: submit, pending: isPending } = useAsyncAction(async () => {
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
      await uploadCoverForProgram(payload.id);
      if (payload.sessions[0]) await uploadCoverForSession(payload.sessions[0].id);
      setCreatedProgramSessions(payload.sessions);
      setStep("success");
      router.refresh();
      return;
    }

    const res = await fetch("/api/admin/feedback/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        speakerName: speakerName.trim(),
        sessionDate: date || null,
        questions,
        mentorId: selectedMentorId,
      }),
    });

    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      toast.error(payload?.error ?? "Could not create this session.");
      return;
    }

    const payload = (await res.json()) as { id: string; slug: string };
    await uploadCoverForSession(payload.id);
    setCreatedSlug(payload.slug);
    setStep("success");
    router.refresh();
  });

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
        className="inline-flex items-center gap-2 max-md:min-h-11 rounded-full px-5 py-2.5 font-headline text-sm font-semibold bg-pz-primary text-pz-on-primary hover:bg-pz-on-primary-container transition-colors shadow-sm"
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

              {/* Cover image — ported from Stitch screen A (New Session modal). Optional; uploaded
                  onto the created session right after it exists (see uploadCoverFor). */}
              {coverFile && coverPreviewUrl ? (
                <div className="w-full aspect-video rounded-xl border-2 border-dashed border-pz-outline-variant relative overflow-hidden group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={coverPreviewUrl} alt="Cover preview" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={removeCoverSelection}
                    aria-label="Remove cover image"
                    className="absolute top-2 right-2 max-md:min-h-11 max-md:min-w-11 inline-flex items-center justify-center bg-pz-surface-container-highest/80 backdrop-blur text-pz-on-surface p-1 rounded-full hover:bg-pz-solid-danger hover:text-white transition-colors shadow-lg z-10"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <label
                    htmlFor="cover-input"
                    className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center cursor-pointer"
                  >
                    <ImageIcon className="w-7 h-7 text-white mb-1" />
                    <span className="font-headline text-xs font-semibold text-white">Click to change cover</span>
                  </label>
                  <input id="cover-input" type="file" accept="image/*" onChange={handleCoverSelect} className="hidden" />
                </div>
              ) : (
                <label
                  htmlFor="cover-input"
                  className="w-full aspect-video rounded-xl border-2 border-dashed border-pz-outline-variant flex flex-col items-center justify-center gap-1.5 cursor-pointer hover:border-pz-primary hover:bg-pz-surface-container transition-colors"
                >
                  <ImageIcon className="w-7 h-7 text-pz-on-surface-variant" />
                  <span className="font-headline text-sm font-semibold text-pz-on-surface-variant">Add a cover image</span>
                  <span className="font-body text-xs text-pz-on-surface-variant/70 dark:text-pz-on-surface-variant/80">16:9 recommended · up to 5 MB</span>
                  <input id="cover-input" type="file" accept="image/*" onChange={handleCoverSelect} className="hidden" />
                </label>
              )}

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
                  className="w-full px-3 py-2 rounded-lg border border-pz-outline-variant bg-pz-surface-container-lowest focus:border-pz-primary focus:ring-2 focus:ring-pz-primary/20 outline-none font-body text-sm max-md:text-base max-md:min-h-11"
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
                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 max-md:min-h-11 max-md:bg-clip-content max-md:py-2.5",
                    isProgram ? "bg-pz-primary" : "bg-pz-surface-variant",
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                      isProgram ? "translate-x-6 dark:bg-pz-on-primary" : "translate-x-1",
                    )}
                  />
                </button>
              </div>

              {/* Link to mentor — combobox ported from Stitch screen A (New Session modal).
                  Optional; feeds feedback_sessions.mentor_id so this session's reviews roll
                  up onto that mentor's dashboard. Not offered for programs — a program's
                  sessions each have their own speaker, with no single mentor to link. */}
              {!isProgram && (
                <div className="space-y-1.5">
                  <label className="font-headline text-xs font-semibold uppercase tracking-wide text-pz-on-surface-variant">
                    Link to mentor
                  </label>
                  {selectedMentor ? (
                    <div className="w-full bg-pz-surface-container-lowest p-2 rounded-lg border border-pz-outline-variant flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        {selectedMentor.photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={selectedMentor.photo}
                            alt={selectedMentor.name}
                            className="w-10 h-10 rounded-full object-cover shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-pz-primary-container flex items-center justify-center font-headline text-sm font-semibold text-pz-on-primary-container shrink-0">
                            {selectedMentor.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="flex flex-col min-w-0">
                          <span className="font-body text-sm text-pz-on-surface truncate">{selectedMentor.name}</span>
                          {selectedMentor.title && (
                            <span className="font-body text-xs text-pz-on-surface-variant truncate">{selectedMentor.title}</span>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedMentorId(null)}
                        aria-label="Clear linked mentor"
                        className="p-1 max-md:min-h-11 max-md:min-w-11 inline-flex items-center justify-center rounded-full text-pz-on-surface-variant hover:text-pz-on-surface hover:bg-pz-surface-variant transition-colors shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-pz-on-surface-variant pointer-events-none" />
                      <input
                        type="text"
                        value={mentorQuery}
                        onChange={(e) => {
                          setMentorQuery(e.target.value);
                          setMentorDropdownOpen(true);
                        }}
                        onFocus={() => setMentorDropdownOpen(true)}
                        onBlur={() => setTimeout(() => setMentorDropdownOpen(false), 150)}
                        placeholder={mentorsLoading ? "Loading mentors…" : "Search mentors by name…"}
                        className="w-full pl-9 pr-3 py-2 rounded-lg border border-pz-outline-variant bg-pz-surface-container-lowest focus:border-pz-primary focus:ring-2 focus:ring-pz-primary/20 outline-none font-body text-sm max-md:text-base max-md:min-h-11"
                      />
                      {mentorDropdownOpen && mentorQuery.trim().length > 0 && (
                        <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto bg-pz-surface-container-lowest border border-pz-outline-variant rounded-lg shadow-lg">
                          {mentorsLoading && (
                            <p className="px-3 py-2 font-body text-sm text-pz-on-surface-variant">Loading mentors…</p>
                          )}
                          {!mentorsLoading && filteredMentors.length === 0 && (
                            <p className="px-3 py-2 font-body text-sm text-pz-on-surface-variant">
                              No mentors match &quot;{mentorQuery}&quot;.
                            </p>
                          )}
                          {filteredMentors.map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                setSelectedMentorId(m.id);
                                setMentorQuery("");
                                setMentorDropdownOpen(false);
                              }}
                              className="w-full flex items-center gap-3 px-3 py-2 max-md:min-h-11 hover:bg-pz-surface-container text-left transition-colors"
                            >
                              {m.photo ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={m.photo} alt={m.name} className="w-8 h-8 rounded-full object-cover shrink-0" />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-pz-primary-container flex items-center justify-center font-headline text-xs font-semibold text-pz-on-primary-container shrink-0">
                                  {m.name.charAt(0).toUpperCase()}
                                </div>
                              )}
                              <div className="flex flex-col min-w-0">
                                <span className="font-body text-sm text-pz-on-surface truncate">{m.name}</span>
                                {m.title && (
                                  <span className="font-body text-xs text-pz-on-surface-variant truncate">{m.title}</span>
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <p className="font-body text-xs text-pz-on-surface-variant/70 dark:text-pz-on-surface-variant/80">
                    Optional — links this session&apos;s reviews to a public mentor profile
                  </p>
                  {selectedMentor && !selectedMentor.hasLinkedAccount && (
                    <p className="flex items-start gap-1.5 font-body text-xs text-pz-danger">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      No linked account — mentorship feedback won&apos;t auto-create for this mentor.
                    </p>
                  )}
                </div>
              )}

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
                      className="w-full px-3 py-2 rounded-lg border border-pz-outline-variant bg-pz-surface-container-lowest focus:border-pz-primary focus:ring-2 focus:ring-pz-primary/20 outline-none font-body text-sm max-md:text-base max-md:min-h-11"
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
                      className="w-full px-3 py-2 rounded-lg border border-pz-outline-variant bg-pz-surface-container-lowest focus:border-pz-primary focus:ring-2 focus:ring-pz-primary/20 outline-none font-body text-sm max-md:text-base max-md:min-h-11"
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
                          className="p-1 max-md:min-h-11 max-md:min-w-11 inline-flex items-center justify-center rounded text-pz-on-surface-variant hover:text-pz-danger transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <input
                        type="text"
                        value={s.title}
                        onChange={(e) => updateProgramSession(s.localId, { title: e.target.value })}
                        placeholder="Session title"
                        className="w-full px-3 py-2 rounded-lg border border-pz-outline-variant bg-pz-surface-container-lowest focus:border-pz-primary focus:ring-2 focus:ring-pz-primary/20 outline-none font-body text-sm max-md:text-base max-md:min-h-11"
                      />
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={s.speaker}
                          onChange={(e) => updateProgramSession(s.localId, { speaker: e.target.value })}
                          placeholder="Speaker name"
                          className="w-full px-3 py-2 rounded-lg border border-pz-outline-variant bg-pz-surface-container-lowest focus:border-pz-primary focus:ring-2 focus:ring-pz-primary/20 outline-none font-body text-sm max-md:text-base max-md:min-h-11"
                        />
                        <input
                          type="date"
                          value={s.date}
                          onChange={(e) => updateProgramSession(s.localId, { date: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg border border-pz-outline-variant bg-pz-surface-container-lowest focus:border-pz-primary focus:ring-2 focus:ring-pz-primary/20 outline-none font-body text-sm max-md:text-base max-md:min-h-11"
                        />
                      </div>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={addProgramSession}
                    className="inline-flex items-center gap-1.5 max-md:min-h-11 font-headline text-xs font-semibold text-pz-primary hover:text-pz-on-primary-container dark:hover:text-pz-primary-fixed transition-colors"
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
                        className="mt-1.5 w-4 h-4 max-md:w-5 max-md:h-5 rounded border-pz-outline-variant text-pz-primary focus:ring-pz-primary/30 cursor-pointer disabled:cursor-not-allowed"
                      />
                      <label htmlFor={`bank-${q.id}`} className="flex-1 font-body text-sm text-pz-on-surface py-1 max-md:min-h-11 max-md:flex max-md:items-center cursor-pointer">
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
                    <div key={q.localId} className="flex flex-wrap items-start gap-3">
                      <span className="mt-1.5 w-4 h-4 rounded bg-pz-primary/70 shrink-0" aria-hidden />
                      <input
                        type="text"
                        value={q.text}
                        onChange={(e) => updateCustomQuestion(q.localId, { text: e.target.value })}
                        placeholder="Type a custom question…"
                        className="flex-1 max-md:min-w-[10rem] bg-transparent border-b border-pz-outline-variant/60 focus:border-pz-primary outline-none font-body text-sm text-pz-on-surface py-1 max-md:text-base max-md:min-h-11"
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
                        className="p-1 max-md:min-h-11 max-md:min-w-11 inline-flex items-center justify-center rounded text-pz-on-surface-variant hover:text-pz-danger transition-colors"
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
                  className="mt-2 inline-flex items-center gap-1.5 max-md:min-h-11 font-headline text-xs font-semibold text-pz-primary hover:text-pz-on-primary-container dark:hover:text-pz-primary-fixed transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
                  className="px-4 py-2.5 max-md:min-h-11 rounded-lg font-headline text-sm font-semibold bg-pz-surface-container-high text-pz-on-surface-variant hover:bg-pz-surface-variant transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <Button
                  variant="bare"
                  size="bare"
                  type="button"
                  loading={isPending}
                  onClick={() => submit()}
                  className="px-4 py-2.5 max-md:min-h-11 rounded-lg font-headline text-sm font-semibold bg-pz-primary text-pz-on-primary hover:bg-pz-on-primary-container transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isPending ? "Creating…" : isProgram ? "Create Program" : "Create Session"}
                </Button>
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
                      className="flex-1 bg-transparent border-none px-3 py-2.5 font-body text-sm max-md:text-base text-pz-on-surface truncate outline-none"
                    />
                    <button
                      type="button"
                      onClick={copyLink}
                      className="flex items-center gap-1.5 px-4 py-2.5 max-md:min-h-11 border-l border-pz-outline-variant bg-pz-surface-container-high hover:bg-pz-surface-variant transition-colors font-headline text-xs font-semibold text-pz-on-surface shrink-0"
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
                  className="px-4 py-2.5 max-md:min-h-11 rounded-lg font-headline text-sm font-semibold bg-pz-primary text-pz-on-primary hover:bg-pz-on-primary-container transition-colors"
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
  const [deleteOpen, setDeleteOpen] = useState(false);

  // One lock across status / share / delete: only one row action runs at a time.
  const { run: toggleStatus, pending: togglePending } = useAsyncAction(async () => {
    const target = status === "active" ? "closed" : "active";
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

  const { run: shareLink, pending: sharePending } = useAsyncAction(async () => {
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

  function exportCsv() {
    window.open(`/api/admin/feedback/sessions/${id}/export`, "_blank");
  }

  const { run: submitDelete, pending: deletePending } = useAsyncAction(async () => {
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
  const isPending = togglePending || sharePending || deletePending;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Session actions"
          disabled={isPending}
          className="p-1.5 max-md:min-h-11 max-md:min-w-11 inline-flex items-center justify-center rounded-full text-pz-on-surface-variant hover:bg-pz-surface-container transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-pz-primary/30"
        >
          <MoreVertical className="w-5 h-5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
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
              className="px-4 py-2.5 max-md:min-h-11 rounded-lg font-headline text-sm font-semibold bg-pz-surface-container-high text-pz-on-surface-variant hover:bg-pz-surface-variant transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <Button
              variant="bare"
              size="bare"
              type="button"
              loading={isPending}
              disabled={isPending}
              onClick={() => submitDelete()}
              className="px-4 py-2.5 max-md:min-h-11 rounded-lg font-headline text-sm font-semibold bg-pz-solid-danger text-white hover:bg-pz-solid-danger/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? "Working…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Row-level actions for the Programs table — Share link and delete (sessions survive delete as standalone, program_id set to null). */
export function ProgramRowActions({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const { run: submitDelete, pending: isPending } = useAsyncAction(async () => {
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

  return (
    <>
      <div className="flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={() => setShareOpen(true)}
          aria-label={`Share ${name}`}
          className="p-1.5 max-md:min-h-11 max-md:min-w-11 inline-flex items-center justify-center rounded-full text-pz-on-surface-variant hover:text-pz-primary hover:bg-pz-primary/10 transition-colors"
        >
          <Link2 className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => setDeleteOpen(true)}
          aria-label={`Delete ${name}`}
          className="p-1.5 max-md:min-h-11 max-md:min-w-11 inline-flex items-center justify-center rounded-full text-pz-on-surface-variant hover:text-pz-danger hover:bg-pz-solid-danger/10 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Program-level share token isn't fetched into the row list — the modal
          always finds/generates it itself on open (idempotent) via the
          programs/[id]/share-token route, same as a never-shared session would. */}
      <ShareReviewModal
        open={shareOpen}
        onOpenChange={setShareOpen}
        targetType="program"
        targetId={id}
        targetName={name}
        shareToken={null}
      />

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
              className="px-4 py-2.5 max-md:min-h-11 rounded-lg font-headline text-sm font-semibold bg-pz-surface-container-high text-pz-on-surface-variant hover:bg-pz-surface-variant transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <Button
              variant="bare"
              size="bare"
              type="button"
              loading={isPending}
              disabled={isPending}
              onClick={() => submitDelete()}
              className="px-4 py-2.5 max-md:min-h-11 rounded-lg font-headline text-sm font-semibold bg-pz-solid-danger text-white hover:bg-pz-solid-danger/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? "Working…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
