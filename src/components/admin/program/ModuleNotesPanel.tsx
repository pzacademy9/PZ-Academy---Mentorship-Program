"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { DetailSkeleton } from "@/components/ui/skeletons";
import type { LessonResourceLink, LessonDocument } from "@/lib/data/admin-lms";
import { NotesSection } from "./NotesSection";

interface Notes {
  resources: LessonResourceLink[];
  documents: LessonDocument[];
}

/**
 * Notes shared by every session in a module. Fetched lazily by module id and
 * saved as soon as anything changes (same pattern as the lesson editor).
 * Results for a module the admin has already left are discarded.
 */
export function ModuleNotesPanel({
  moduleId,
  moduleTitle,
  courseSlug,
  onNotesCountChange,
}: {
  moduleId: string;
  moduleTitle: string;
  courseSlug: string;
  onNotesCountChange: (moduleId: string, count: number) => void;
}) {
  const [notes, setNotes] = useState<Notes | null>(null);
  const [loading, setLoading] = useState(true);
  const currentId = useRef(moduleId);

  useEffect(() => {
    currentId.current = moduleId;
    setNotes(null);
    setLoading(true);
    let cancelled = false;
    fetch(`/api/admin/modules/${moduleId}/notes`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Notes | null) => {
        if (cancelled || !data) return;
        setNotes({ resources: data.resources ?? [], documents: data.documents ?? [] });
      })
      .catch(() => {
        if (!cancelled) toast.error("Could not load the module notes.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [moduleId]);

  async function save(patch: Partial<Notes>) {
    if (!notes) return;
    const id = moduleId;
    const next = { ...notes, ...patch };
    if (currentId.current === id) setNotes(next);
    try {
      const res = await fetch(`/api/admin/modules/${id}/notes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        toast.error("Could not save.");
        return;
      }
      const payload = (await res.json().catch(() => null)) as { warning?: string | null } | null;
      if (payload?.warning) toast.warning(payload.warning);
      onNotesCountChange(id, next.resources.length + next.documents.length);
    } catch {
      toast.error("Could not save.");
    }
  }

  /** Same private-Drive relay the lesson editor uses. */
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

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div className="space-y-1">
        <p className="text-[10px] uppercase font-bold text-pz-primary tracking-widest">Module notes</p>
        <h3 className="text-2xl font-headline font-bold text-pz-on-surface">{moduleTitle}</h3>
        <p className="text-sm font-body text-pz-on-surface-variant">
          Notes here are shown to students on every session in this module.
        </p>
      </div>

      {loading && <DetailSkeleton sections={1} />}

      {!loading && notes && (
        <div className="bg-pz-surface-container-low rounded-xl p-4 md:p-6 border border-pz-outline-variant/40">
          <NotesSection
            links={notes.resources}
            documents={notes.documents}
            onLinksChange={(resources) => void save({ resources })}
            onDocumentsChange={(documents) => void save({ documents })}
            onUploadFile={uploadPrivateDocument}
            documentHref={(fileId) => `/api/modules/${moduleId}/documents/${fileId}`}
          />
        </div>
      )}
    </div>
  );
}
