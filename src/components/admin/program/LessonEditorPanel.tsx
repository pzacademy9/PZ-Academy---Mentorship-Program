"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  NotebookPen,
  Video,
  FileText,
  FileType2,
  CloudUpload,
  Link2,
  X,
  CheckCheck,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DetailSkeleton } from "@/components/ui/skeletons";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import type { BuilderLesson, QuizQuestionRow, LessonResourceLink, LessonDocument } from "@/lib/data/admin-lms";
import type { LessonContentType } from "@/lib/validations/admin-lms";
import { RichTextEditor } from "./RichTextEditor";
import { QuizEditor } from "./QuizEditor";

const CONTENT_TYPES: { value: LessonContentType; label: string; icon: typeof FileText }[] = [
  { value: "text", label: "Text", icon: FileText },
  { value: "video", label: "Video", icon: Video },
  { value: "pdf", label: "PDF", icon: FileType2 },
];

interface Detail {
  contentType: LessonContentType;
  videoUrl: string;
  textContent: string;
  pdfFileId: string | null;
  resources: LessonResourceLink[];
  documents: LessonDocument[];
  quizQuestions: QuizQuestionRow[];
}

/**
 * The real Lesson Editor (Part D): content-type toggle, Tiptap rich text for
 * text lessons (autosaved on a debounce), a plain URL field for video, an
 * honest stub for PDF (that upload path is Part F — private Drive files, not
 * a public link), and quiz question CRUD + reorder.
 *
 * Detail (body/quiz) is fetched lazily per lesson — getBuilderState's initial
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
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setTitle(lesson?.title ?? "");
    setDetail(null);
    setLastSaved(null);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (!lesson) return;

    let cancelled = false;
    setLoading(true);
    fetch(`/api/admin/lessons/${lesson.id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setDetail({
          contentType: data.contentType,
          videoUrl: data.videoUrl,
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

  async function switchContentType(next: LessonContentType) {
    if (!lesson || !detail || detail.contentType === next) return;
    setDetail({ ...detail, contentType: next });
    const ok = await patchLesson({ contentType: next });
    if (ok) onLessonPatched(lesson.id, { contentType: next });
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

  async function saveVideoUrl(url: string) {
    setDetail((prev) => (prev ? { ...prev, videoUrl: url } : prev));
    await patchLesson({ videoUrl: url });
  }

  function updateResources(next: LessonResourceLink[]) {
    setDetail((prev) => (prev ? { ...prev, resources: next } : prev));
    void patchLesson({ resources: next });
  }

  function addResource() {
    if (!detail || detail.resources.length >= 20) return;
    updateResources([...detail.resources, { label: "New resource", url: "https://" }]);
  }

  function updateResource(index: number, patch: Partial<LessonResourceLink>) {
    if (!detail) return;
    updateResources(detail.resources.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function removeResource(index: number) {
    if (!detail) return;
    updateResources(detail.resources.filter((_, i) => i !== index));
  }

  const pdfInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

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

  const { run: uploadPdf, pending: uploadingPdf } = useAsyncAction(async (file: File) => {
    try {
      const result = await uploadPrivateDocument(file);
      if (!result) return;
      setDetail((prev) => (prev ? { ...prev, pdfFileId: result.fileId } : prev));
      const ok = await patchLesson({ pdfFileId: result.fileId });
      if (ok) toast.success("PDF uploaded.");
    } catch {
      toast.error("Upload failed.");
    }
  });

  function updateDocuments(next: LessonDocument[]) {
    setDetail((prev) => (prev ? { ...prev, documents: next } : prev));
    void patchLesson({ documents: next });
  }

  const { run: uploadSupportingDocument, pending: uploadingDoc } = useAsyncAction(async (file: File) => {
    if (!detail || detail.documents.length >= 20) return;
    try {
      const result = await uploadPrivateDocument(file);
      if (!result) return;
      updateDocuments([...detail.documents, result]);
    } catch {
      toast.error("Upload failed.");
    }
  });

  function removeDocument(index: number) {
    if (!detail) return;
    updateDocuments(detail.documents.filter((_, i) => i !== index));
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
          <div className="flex bg-pz-surface-container rounded-lg p-1">
            {CONTENT_TYPES.map((ct) => (
              <button
                key={ct.value}
                type="button"
                onClick={() => switchContentType(ct.value)}
                className={cn(
                  "px-4 py-1.5 max-md:min-h-11 rounded-md text-xs font-bold transition-all flex items-center gap-1",
                  detail?.contentType === ct.value
                    ? "bg-pz-primary text-pz-on-primary shadow-sm"
                    : "text-pz-on-surface-variant hover:bg-pz-surface",
                )}
              >
                <ct.icon className="w-3.5 h-3.5" />
                {ct.label}
              </button>
            ))}
          </div>
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
          {detail.contentType === "text" && <RichTextEditor value={detail.textContent} onChange={scheduleTextSave} />}

          {detail.contentType === "video" && (
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-pz-on-surface-variant tracking-wider ml-1">
                Video URL
              </label>
              <input
                type="text"
                defaultValue={detail.videoUrl}
                onBlur={(e) => saveVideoUrl(e.target.value)}
                placeholder="https://youtube.com/watch?v=..."
                className="w-full bg-pz-surface border border-pz-outline-variant rounded-lg px-4 py-3 focus:ring-2 focus:ring-pz-primary focus:outline-none font-medium max-md:text-base"
              />
            </div>
          )}

          {detail.contentType === "pdf" && (
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-pz-on-surface-variant tracking-wider ml-1">
                Lesson PDF
              </label>
              <input
                ref={pdfInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadPdf(file);
                  e.target.value = "";
                }}
              />
              {detail.pdfFileId ? (
                <div className="flex flex-wrap items-center gap-3 bg-pz-surface p-4 rounded-xl border border-pz-outline-variant">
                  <FileType2 className="w-6 h-6 text-pz-primary shrink-0" />
                  <p className="flex-1 font-medium text-sm text-pz-on-surface">This lesson&apos;s PDF is uploaded.</p>
                  <a
                    href={`/api/lessons/${lesson.id}/pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-bold text-pz-primary hover:underline shrink-0 max-md:inline-flex max-md:min-h-11 max-md:min-w-11 max-md:items-center max-md:justify-center"
                  >
                    View
                  </a>
                  <button
                    type="button"
                    onClick={() => pdfInputRef.current?.click()}
                    disabled={uploadingPdf}
                    className="text-sm font-bold text-pz-on-surface-variant hover:text-pz-primary flex items-center gap-1 shrink-0 disabled:opacity-50 max-md:min-h-11 max-md:justify-center"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    {uploadingPdf ? "Uploading…" : "Replace"}
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => !uploadingPdf && pdfInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const file = e.dataTransfer.files?.[0];
                    if (file) void uploadPdf(file);
                  }}
                  className={cn(
                    "border-2 border-dashed border-pz-outline-variant rounded-xl p-8 flex flex-col items-center justify-center bg-pz-surface-container-lowest hover:bg-pz-primary-container/5 hover:border-pz-primary transition-all cursor-pointer group",
                    uploadingPdf && "opacity-60 pointer-events-none",
                  )}
                >
                  <div className="w-16 h-16 bg-pz-surface-container rounded-full flex items-center justify-center text-pz-on-surface-variant group-hover:text-pz-primary group-hover:bg-pz-primary-container/20 transition-all mb-4">
                    <CloudUpload className="w-8 h-8" />
                  </div>
                  <p className="font-headline font-bold text-pz-on-surface">
                    {uploadingPdf ? "Uploading…" : "Click or drag a PDF file to upload"}
                  </p>
                  <p className="text-xs text-pz-on-surface-variant mt-1">Maximum file size 25MB</p>
                </div>
              )}
            </div>
          )}

          <div className="space-y-3">
            <label className="text-[10px] uppercase font-bold text-pz-on-surface-variant tracking-wider ml-1">
              Supporting Documents
            </label>
            <input
              ref={docInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadSupportingDocument(file);
                e.target.value = "";
              }}
            />
            <div
              onClick={() => !uploadingDoc && detail.documents.length < 20 && docInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file) void uploadSupportingDocument(file);
              }}
              className={cn(
                "border-2 border-dashed border-pz-outline-variant rounded-xl p-8 flex flex-col items-center justify-center bg-pz-surface-container-lowest hover:bg-pz-primary-container/5 hover:border-pz-primary transition-all cursor-pointer group",
                (uploadingDoc || detail.documents.length >= 20) && "opacity-60 pointer-events-none",
              )}
            >
              <div className="w-16 h-16 bg-pz-surface-container rounded-full flex items-center justify-center text-pz-on-surface-variant group-hover:text-pz-primary group-hover:bg-pz-primary-container/20 transition-all mb-4">
                <CloudUpload className="w-8 h-8" />
              </div>
              <p className="font-headline font-bold text-pz-on-surface">
                {uploadingDoc ? "Uploading…" : "Click or drag PDF files to upload"}
              </p>
              <p className="text-xs text-pz-on-surface-variant mt-1">Maximum file size 25MB per document</p>
            </div>
            {detail.documents.length > 0 && (
              <ul className="space-y-2">
                {detail.documents.map((doc, i) => (
                  <li
                    key={doc.fileId}
                    className="flex items-center gap-3 bg-pz-surface p-3 rounded-lg border border-pz-outline-variant"
                  >
                    <FileType2 className="w-4 h-4 text-pz-secondary shrink-0" />
                    <span className="flex-1 min-w-0 truncate text-sm font-medium">{doc.name}</span>
                    <a
                      href={`/api/lessons/${lesson.id}/documents/${doc.fileId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-bold text-pz-primary hover:underline shrink-0 max-md:inline-flex max-md:min-h-11 max-md:min-w-11 max-md:items-center max-md:justify-center"
                    >
                      View
                    </a>
                    <button
                      type="button"
                      onClick={() => removeDocument(i)}
                      aria-label="Remove"
                      className="text-pz-on-surface-variant/40 hover:text-pz-danger shrink-0 max-md:inline-flex max-md:min-h-11 max-md:min-w-11 max-md:items-center max-md:justify-center"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <QuizEditor
            lessonId={lesson.id}
            questions={detail.quizQuestions}
            onQuestionsChange={(qs) => setDetail((prev) => (prev ? { ...prev, quizQuestions: qs } : prev))}
          />

          <div className="bg-pz-surface-container-low rounded-xl p-4 md:p-6 space-y-4 border border-pz-outline-variant/40">
            <h4 className="font-headline font-bold text-pz-on-surface text-sm uppercase tracking-wider">
              External Resources
            </h4>
            <ul className="space-y-2">
              {detail.resources.map((resource, i) => (
                <li
                  key={i}
                  className="flex flex-wrap items-center gap-3 bg-pz-surface p-3 rounded-lg border border-pz-outline-variant"
                >
                  <Link2 className="w-4 h-4 text-pz-secondary shrink-0" />
                  <input
                    type="text"
                    value={resource.label}
                    onChange={(e) => updateResource(i, { label: e.target.value })}
                    placeholder="Label"
                    className="flex-1 min-w-0 bg-transparent outline-none text-sm max-md:text-base max-md:min-h-11 font-medium"
                  />
                  <input
                    type="text"
                    value={resource.url}
                    onChange={(e) => updateResource(i, { url: e.target.value })}
                    placeholder="https://..."
                    className="flex-1 min-w-0 bg-transparent outline-none text-sm max-md:text-base max-md:min-h-11 text-pz-on-surface-variant"
                  />
                  <button
                    type="button"
                    onClick={() => removeResource(i)}
                    aria-label="Remove"
                      className="text-pz-on-surface-variant/40 hover:text-pz-danger shrink-0 max-md:inline-flex max-md:min-h-11 max-md:min-w-11 max-md:items-center max-md:justify-center"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={addResource}
              className="w-full py-2 max-md:min-h-11 bg-pz-surface border-2 border-dashed border-pz-outline-variant/50 rounded-lg text-xs font-bold text-pz-on-surface-variant hover:border-pz-secondary hover:text-pz-secondary transition-all"
            >
              + Add Resource Link
            </button>
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
