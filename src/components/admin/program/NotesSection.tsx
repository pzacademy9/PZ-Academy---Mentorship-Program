"use client";

import { useRef } from "react";
import { CloudUpload, FileType2, Link2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import type { LessonResourceLink, LessonDocument } from "@/lib/data/admin-lms";

const viewLink =
  "text-xs font-bold text-pz-primary hover:underline shrink-0 max-md:inline-flex max-md:min-h-11 max-md:min-w-11 max-md:items-center max-md:justify-center";
const removeBtn =
  "text-pz-on-surface-variant/40 hover:text-pz-danger shrink-0 max-md:inline-flex max-md:min-h-11 max-md:min-w-11 max-md:items-center max-md:justify-center";
const rowCls = "flex items-center gap-3 bg-pz-surface p-3 rounded-lg border border-pz-outline-variant";

/**
 * Links (Drive or any web address) plus PDF files for a lesson or module.
 * Free of lesson-specific code: the parent supplies upload and view-link logic.
 * `extraDocuments` are read-only rows (e.g. a lesson's older single PDF).
 */
export function NotesSection({
  links,
  documents,
  onLinksChange,
  onDocumentsChange,
  onUploadFile,
  documentHref,
  extraDocuments = [],
  maxItems = 20,
}: {
  links: LessonResourceLink[];
  documents: LessonDocument[];
  onLinksChange: (next: LessonResourceLink[]) => void;
  onDocumentsChange: (next: LessonDocument[]) => void;
  onUploadFile: (file: File) => Promise<{ fileId: string; name: string } | null>;
  documentHref: (fileId: string) => string;
  extraDocuments?: { name: string; href: string }[];
  maxItems?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const full = documents.length >= maxItems;

  const { run: upload, pending: uploading } = useAsyncAction(async (file: File) => {
    if (full) return;
    const result = await onUploadFile(file);
    if (result) onDocumentsChange([...documents, result]);
  });

  function updateLink(i: number, patch: Partial<LessonResourceLink>) {
    onLinksChange(links.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  return (
    <div className="space-y-4">
      {(documents.length > 0 || extraDocuments.length > 0) && (
        <ul className="space-y-2">
          {extraDocuments.map((doc) => (
            <li key={doc.href} className={rowCls}>
              <FileType2 className="w-4 h-4 text-pz-secondary shrink-0" />
              <span className="flex-1 min-w-0 truncate text-sm font-medium">{doc.name}</span>
              <a href={doc.href} target="_blank" rel="noopener noreferrer" className={viewLink}>
                View
              </a>
            </li>
          ))}
          {documents.map((doc, i) => (
            <li key={doc.fileId} className={rowCls}>
              <FileType2 className="w-4 h-4 text-pz-secondary shrink-0" />
              <span className="flex-1 min-w-0 truncate text-sm font-medium">{doc.name}</span>
              <a href={documentHref(doc.fileId)} target="_blank" rel="noopener noreferrer" className={viewLink}>
                View
              </a>
              <button
                type="button"
                onClick={() => onDocumentsChange(documents.filter((_, idx) => idx !== i))}
                aria-label="Remove"
                className={removeBtn}
              >
                <X className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
          e.target.value = "";
        }}
      />
      <div
        onClick={() => !uploading && !full && inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files?.[0];
          if (file) void upload(file);
        }}
        className={cn(
          "border-2 border-dashed border-pz-outline-variant rounded-xl p-6 flex flex-col items-center justify-center bg-pz-surface-container-lowest hover:bg-pz-primary-container/5 hover:border-pz-primary transition-all cursor-pointer text-center max-md:min-h-11",
          (uploading || full) && "opacity-60 pointer-events-none",
        )}
      >
        <CloudUpload className="w-7 h-7 text-pz-on-surface-variant mb-2" />
        <p className="font-headline font-bold text-sm text-pz-on-surface">
          {uploading ? "Uploading…" : "Click or drag PDF files to upload"}
        </p>
        <p className="text-xs text-pz-on-surface-variant mt-1">Maximum file size 25MB per document</p>
      </div>

      <ul className="space-y-2">
        {links.map((resource, i) => (
          <li key={i} className={cn(rowCls, "flex-wrap")}>
            <Link2 className="w-4 h-4 text-pz-secondary shrink-0" />
            <input
              type="text"
              value={resource.label}
              onChange={(e) => updateLink(i, { label: e.target.value })}
              placeholder="Label"
              className="flex-1 min-w-0 bg-transparent outline-none text-sm max-md:text-base max-md:min-h-11 font-medium"
            />
            <input
              type="text"
              value={resource.url}
              onChange={(e) => updateLink(i, { url: e.target.value })}
              placeholder="https://..."
              className="flex-1 min-w-0 bg-transparent outline-none text-sm max-md:text-base max-md:min-h-11 text-pz-on-surface-variant"
            />
            <button
              type="button"
              onClick={() => onLinksChange(links.filter((_, idx) => idx !== i))}
              aria-label="Remove"
              className={removeBtn}
            >
              <X className="w-4 h-4" />
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => links.length < maxItems && onLinksChange([...links, { label: "New link", url: "https://" }])}
        className="w-full py-2 max-md:min-h-11 bg-pz-surface border-2 border-dashed border-pz-outline-variant/50 rounded-lg text-xs font-bold text-pz-on-surface-variant hover:border-pz-secondary hover:text-pz-secondary transition-all"
      >
        + Add a Drive or web link
      </button>
    </div>
  );
}
