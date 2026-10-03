"use client";

import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { FileText, ExternalLink, FileDown, FileType2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { saveNote } from "@/app/portal/actions";
import { NoteEditorToolbar } from "./NoteEditorToolbar";
import { exportNotePdf, exportNoteDoc } from "@/lib/notes-export";
import type { LessonResource, LessonDocument } from "@/lib/data/lms";

interface LessonSidePanelProps {
  lessonId: string;
  courseId: string;
  lessonTitle: string;
  resources: LessonResource[];
  documents: LessonDocument[];
  initialNoteHtml: string;
}

/** Builds a filename-safe slug, e.g. "Intro to React!" -> "intro-to-react". */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function LessonSidePanel({
  lessonId,
  courseId,
  lessonTitle,
  resources,
  documents,
  initialNoteHtml,
}: LessonSidePanelProps) {
  const [tab, setTab] = useState<"resources" | "notes">("resources");
  const [saved, setSaved] = useState(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const contentRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    extensions: [StarterKit],
    content: initialNoteHtml,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "lesson-note-content min-h-[200px] p-3 text-sm font-body text-pz-on-surface outline-none",
      },
    },
    onUpdate: ({ editor }) => {
      setSaved(false);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void saveNote(lessonId, courseId, editor.getHTML(), editor.getText()).then((result) => {
          if (result.ok) setSaved(true);
        });
      }, 500);
    },
  });

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  return (
    <aside
      className={cn(
        "flex flex-col bg-pz-surface-container rounded-2xl shadow-sm border border-pz-outline-variant/40 mx-4 sm:mx-8 mb-6",
        "lg:rounded-none lg:shadow-none lg:border-0 lg:border-l lg:mx-0 lg:mb-0",
        "lg:w-80 lg:shrink-0 lg:sticky lg:top-16 lg:self-start lg:max-h-[calc(100vh-4rem)]",
      )}
    >
      <div className="flex border-b border-pz-outline-variant/40">
        <button
          onClick={() => setTab("resources")}
          className={cn(
            "flex-1 py-4 font-label text-sm font-semibold transition-colors",
            tab === "resources"
              ? "text-pz-secondary border-b-2 border-pz-secondary bg-pz-surface-container-high"
              : "text-pz-on-surface-variant hover:text-pz-on-surface",
          )}
        >
          Resources
        </button>
        <button
          onClick={() => setTab("notes")}
          className={cn(
            "flex-1 py-4 font-label text-sm font-semibold transition-colors",
            tab === "notes"
              ? "text-pz-secondary border-b-2 border-pz-secondary bg-pz-surface-container-high"
              : "text-pz-on-surface-variant hover:text-pz-on-surface",
          )}
        >
          Quick Notes
        </button>
      </div>

      {tab === "resources" ? (
        <div className="p-4 flex-1 overflow-y-auto space-y-3">
          {resources.length === 0 && documents.length === 0 ? (
            <p className="text-sm font-body text-pz-on-surface-variant text-center py-8">
              No resources for this lesson yet.
            </p>
          ) : (
            <>
              {resources.map((r, i) => (
                <a
                  key={`link-${i}`}
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-4 bg-pz-surface-container-low rounded-xl border border-pz-outline-variant/60 hover:border-pz-primary transition-all group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="w-5 h-5 text-pz-primary shrink-0 group-hover:scale-110 transition-transform" />
                    <span className="font-body text-sm text-pz-on-surface truncate">{r.label}</span>
                  </div>
                  <ExternalLink className="w-4 h-4 text-pz-outline shrink-0" />
                </a>
              ))}
              {documents.map((doc) => (
                <a
                  key={doc.fileId}
                  href={`/api/lessons/${lessonId}/documents/${doc.fileId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-4 bg-pz-surface-container-low rounded-xl border border-pz-outline-variant/60 hover:border-pz-primary transition-all group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <FileType2 className="w-5 h-5 text-pz-primary shrink-0 group-hover:scale-110 transition-transform" />
                    <span className="font-body text-sm text-pz-on-surface truncate">{doc.name}</span>
                  </div>
                  <ExternalLink className="w-4 h-4 text-pz-outline shrink-0" />
                </a>
              ))}
            </>
          )}
        </div>
      ) : (
        <div className="flex-1 flex flex-col">
          <NoteEditorToolbar editor={editor} />
          <div ref={contentRef} className="flex-1 overflow-y-auto">
            <EditorContent editor={editor} />
          </div>
          <div className="p-3 border-t border-pz-outline-variant/40 flex items-center justify-between gap-2">
            <p className="text-[11px] font-label text-pz-on-surface-variant/60 dark:text-pz-on-surface-variant/80">
              {saved ? "Saved" : "Saving…"}
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                title="Export as PDF"
                onClick={() =>
                  contentRef.current &&
                  exportNotePdf(contentRef.current, `${slugify(lessonTitle)}-notes`)
                }
                className="p-1.5 rounded-md text-pz-on-surface-variant hover:bg-pz-surface-container-high hover:text-pz-on-surface transition-colors"
              >
                <FileDown className="w-4 h-4" />
              </button>
              <button
                type="button"
                title="Export as Word document"
                onClick={() =>
                  editor && exportNoteDoc(editor.getHTML(), `${slugify(lessonTitle)}-notes`)
                }
                className="p-1.5 rounded-md text-pz-on-surface-variant hover:bg-pz-surface-container-high hover:text-pz-on-surface transition-colors"
              >
                <FileType2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
