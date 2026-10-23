"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { NotebookPen, CheckCheck, ExternalLink, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DetailSkeleton } from "@/components/ui/skeletons";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import type { BuilderLesson, QuizQuestionRow, LessonResourceLink, LessonDocument } from "@/lib/data/admin-lms";
import { RichTextEditor } from "./RichTextEditor";
import { QuizEditor } from "./QuizEditor";
import { VideoField } from "./VideoField";
import { NotesSection } from "./NotesSection";

interface Detail {
  videoUrl: string;
  videoUrl2: string;
  textContent: string;
  pdfFileId: string | null;
  resources: LessonResourceLink[];
  documents: LessonDocument[];
  quizQuestions: QuizQuestionRow[];
}

/**
 * The Lesson Editor: one page per session with its parts together (video,
 * notes, quiz, optional written text). Written text autosaves on a debounce;
 * every other field saves as soon as it changes.
 *
 * Detail (body/quiz) is fetched lazily per lesson: getBuilderState's initial
 * payload deliberately excludes text_content, which can be large.
 */
export function LessonEditorPanel({
  lesson,
  courseSlug,
  onLessonPatched,
  onAdvance,
}: {
  lesson: BuilderLesson | null;
  courseSlug: string;
  onLessonPatched: (lessonId: string, patch: Partial<BuilderLesson>) => void;
  onAdvance: () => void;
}) {
  const [title, setTitle] = useState(lesson?.title ?? "");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [showSecondVideo, setShowSecondVideo] = useState(false);
  const [readingOpen, setReadingOpen] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setTitle(lesson?.title ?? "");
    setDetail(null);
    setLastSaved(null);
    setShowSecondVideo(false);
    setReadingOpen(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (!lesson) return;

    let cancelled = false;
    setLoading(true);
    fetch(`/api/admin/lessons/${lesson.id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setShowSecondVideo(!!data.videoUrl2);
        setReadingOpen(!!data.textContent?.trim());
        setDetail({
          videoUrl: data.videoUrl,
          videoUrl2: data.videoUrl2 ?? "",
          textContent: data.textContent,
          pdfFileId: data.pdfFileId,
          resources: data.resources,
          documents: data.documents,
          quizQuestions: data.quizQuestions,
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // Deliberately keyed on lesson?.id alone — the parent hands this
    // component a fresh `lesson` object reference on every optimistic patch
    // (title, content type), and re-running this fetch on those would clobber
    // in-progress edits (rich text, quiz changes) with a stale server round-trip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson?.id]);

  async function patchLesson(patch: Record<string, unknown>): Promise<boolean> {
    if (!lesson) return false;
    const res = await fetch(`/api/admin/lessons/${lesson.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      toast.error("Could not save.");
      return false;
    }
    const payload = (await res.json().catch(() => null)) as { warning?: string | null } | null;
    if (payload?.warning) toast.warning(payload.warning);
    setLastSaved(new Date());
    return true;
  }

  async function saveTitle() {
    if (!lesson || !title.trim() || title.trim() === lesson.title) return;
    const ok = await patchLesson({ title: title.trim() });
    if (ok) onLessonPatched(lesson.id, { title: title.trim() });
  }

  const pendingText = useRef<string | null>(null);

  function scheduleTextSave(html: string) {
    setDetail((prev) => (prev ? { ...prev, textContent: html } : prev));
    pendingText.current = html;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void patchLesson({ textContent: html });
      pendingText.current = null;
    }, 1200);
  }

  async function saveVideo(which: "videoUrl" | "videoUrl2", url: string) {
    if (!lesson || !detail) return;
    const next = { ...detail, [which]: url };
    setDetail(next);
    const ok = await patchLesson({ [which]: url });
    if (ok) onLessonPatched(lesson.id, { hasVideo: !!(next.videoUrl.trim() || next.videoUrl2.trim()) });
  }

  function updateResources(next: LessonResourceLink[]) {
    setDetail((prev) => (prev ? { ...prev, resources: next } : prev));
    void patchLesson({ resources: next });
  }

  /** Shared relay to /api/admin/uploads/document (Part F) — a PRIVATE Drive file, never a public URL. */
  async function uploadPrivateDocument(file: File): Promise<{ fileId: string; name: string } | null> {
    if (file.type !== "application/pdf") {
      toast.error("Only PDF files are allowed.");
      return null;
    }
    if (file.size > 25 * 1024 * 1024) {
      toast.error("Document must be 25MB or smaller.");
      return null;
    }
    const form = new FormData();
    form.append("file", file);
    form.append("courseSlug", courseSlug);
    const res = await fetch("/api/admin/uploads/document", { method: "POST", body: form });
    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      toast.error(payload?.error ?? "Upload failed.");
      return null;
    }
    return res.json();
  }

  function updateDocuments(next: LessonDocument[]) {
    setDetail((prev) => (prev ? { ...prev, documents: next } : prev));
    void patchLesson({ documents: next });
  }

  /** "Save & Continue" — flush any pending debounced rich-text save before moving on, so nothing is silently lost. */
  const { run: saveAndContinue, pending: savingAndContinuing } = useAsyncAction(async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    try {
      if (pendingText.current !== null) {
        await patchLesson({ textContent: pendingText.current });
        pendingText.current = null;
      }
    } catch {
      toast.error("Could not save.");
      return;
    }
    onAdvance();
  });

  if (!lesson) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-8">
        <NotebookPen className="w-10 h-10 text-pz-outline-variant mb-3" />
        <p className="font-body text-sm text-pz-on-surface-variant">
          Select a lesson from the curriculum map to edit it — or add the first one.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-8">
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h3 className="text-2xl font-headline font-bold text-pz-on-surface">Lesson Editor</h3>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold text-pz-on-surface-variant tracking-wider ml-1">
            Lesson Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
            className="w-full bg-pz-surface border border-pz-outline-variant rounded-lg px-4 py-3 focus:ring-2 focus:ring-pz-primary focus:outline-none font-medium text-lg max-md:text-base"
          />
        </div>
      </div>

      {loading && <DetailSkeleton sections={2} />}

      {!loading && detail && (
        <>
          <Section title="Video">
            <VideoField label="Video link" value={detail.videoUrl} onSave={(url) => saveVideo("videoUrl", url)} />
            {(showSecondVideo || detail.videoUrl2) && (
              <VideoField
                label="Second video link"
                value={detail.videoUrl2}
                onSave={(url) => saveVideo("videoUrl2", url)}
              />
            )}
            {!showSecondVideo && !detail.videoUrl2 && (
              <button
                type="button"
                onClick={() => setShowSecondVideo(true)}
                className="text-xs font-bold text-pz-primary hover:underline max-md:min-h-11"
              >
                + Add a second video
              </button>
            )}
          </Section>

          <Section title="Notes for this session">
            <NotesSection
              links={detail.resources}
              documents={detail.documents}
              onLinksChange={updateResources}
              onDocumentsChange={updateDocuments}
              onUploadFile={uploadPrivateDocument}
              documentHref={(fileId) => `/api/lessons/${lesson.id}/documents/${fileId}`}
              extraDocuments={detail.pdfFileId ? [{ name: "Lesson PDF", href: `/api/lessons/${lesson.id}/pdf` }] : []}
            />
          </Section>

          <QuizEditor
            lessonId={lesson.id}
            questions={detail.quizQuestions}
            onQuestionsChange={(qs) => setDetail((prev) => (prev ? { ...prev, quizQuestions: qs } : prev))}
            onCountChange={(n) => onLessonPatched(lesson.id, { quizCount: n })}
          />

          <div className="bg-pz-surface-container-low rounded-xl border border-pz-outline-variant/40">
            <button
              type="button"
              onClick={() => setReadingOpen((o) => !o)}
              aria-expanded={readingOpen}
              className="w-full flex items-center justify-between gap-3 p-4 md:p-6 max-md:min-h-11 text-left"
            >
              <span className="font-headline font-bold text-pz-on-surface text-sm uppercase tracking-wider">
                Extra reading (optional)
              </span>
              <ChevronDown className={`w-4 h-4 transition-transform ${readingOpen ? "rotate-180" : ""}`} />
            </button>
            {readingOpen && (
              <div className="px-4 pb-4 md:px-6 md:pb-6">
                <RichTextEditor value={detail.textContent} onChange={scheduleTextSave} />
              </div>
            )}
          </div>
        </>
      )}

      <div className="sticky bottom-0 max-lg:bottom-[calc(4.5rem+env(safe-area-inset-bottom))] max-lg:z-40 bg-pz-surface max-lg:bg-background/95 max-lg:backdrop-blur border-t border-pz-outline-variant px-4 md:px-8 py-3 md:py-4 -mx-4 md:-mx-8 flex flex-wrap justify-between items-center gap-3 mt-12">
        <div className="flex items-center gap-1 text-xs font-bold text-pz-on-surface-variant">
          <CheckCheck className="w-4 h-4 text-pz-primary" />
          {lastSaved ? `Last saved ${lastSaved.toLocaleTimeString()}` : "No changes saved yet"}
        </div>
        <div className="flex gap-3">
          <a
            href={`/portal/${courseSlug}/lessons/${lesson.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-2 max-md:min-h-11 border border-pz-outline-variant rounded-lg font-bold text-sm hover:bg-pz-surface-container transition-colors flex items-center justify-center gap-1.5"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Preview Lesson
          </a>
          <Button
            type="button"
            variant="bare"
            size="bare"
            loading={savingAndContinuing}
            onClick={() => saveAndContinue()}
            className="px-6 py-2 max-md:min-h-11 bg-pz-primary text-pz-on-primary rounded-lg font-bold text-sm shadow-lg hover:brightness-110 transition-all"
          >
            Save &amp; Continue
          </Button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-pz-surface-container-low rounded-xl p-4 md:p-6 space-y-4 border border-pz-outline-variant/40">
      <h4 className="font-headline font-bold text-pz-on-surface text-sm uppercase tracking-wider">{title}</h4>
      {children}
    </div>
  );
}
