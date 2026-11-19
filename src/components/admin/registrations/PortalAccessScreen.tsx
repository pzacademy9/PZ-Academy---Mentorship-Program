"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowRightLeft, Copy, FolderInput, ListChecks, UsersRound } from "lucide-react";
import { BatchAccessPanel } from "@/components/admin/registrations/BatchAccessPanel";
import { PortalDuplicateDialog } from "@/components/admin/registrations/PortalDuplicateDialog";
import { PortalMoveDialog } from "@/components/admin/registrations/PortalMoveDialog";
import { callPortal } from "@/lib/portal-client";
import type { MovePreview, PortalOverview } from "@/lib/data/portals";

const card = "rounded-xl bg-pz-surface-container-lowest border border-pz-outline-variant/40 p-5 md:p-6 space-y-4";
const cardTitle = "font-label text-xs font-semibold text-pz-primary uppercase tracking-wide";
const field =
  "w-full rounded-lg bg-pz-surface-container-low px-3.5 py-2.5 max-md:min-h-11 font-body text-sm max-md:text-base text-pz-on-surface focus:outline-none focus:ring-2 focus:ring-pz-primary/40 disabled:opacity-60";
const fieldLabel = "block font-label text-xs font-semibold text-pz-on-surface-variant mb-1.5";
const chip = "inline-flex items-center px-2.5 py-1 rounded-md text-xs font-headline font-bold bg-pz-surface-container-high text-pz-on-surface-variant";
const primaryBtn =
  "inline-flex items-center justify-center gap-2 px-4 py-2.5 max-md:min-h-11 rounded-lg font-headline text-sm font-bold bg-pz-primary text-pz-on-primary hover:bg-pz-on-primary-container transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const quietBtn =
  "inline-flex items-center justify-center gap-2 px-4 py-2.5 max-md:min-h-11 rounded-lg font-headline text-sm font-bold bg-pz-surface-container-high text-pz-on-surface hover:bg-pz-surface-variant transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function PortalAccessScreen({
  pageId,
  pageTitle,
  overview,
}: {
  pageId: string;
  pageTitle: string;
  overview: PortalOverview | null;
}) {
  const router = useRouter();
  const duplicateBtn = useRef<HTMLButtonElement>(null);
  const moveBtn = useRef<HTMLButtonElement>(null);
  const portal = overview?.portal ?? null;
  const portalId = portal?.id ?? null;

  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [preview, setPreview] = useState<MovePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [moveResult, setMoveResult] = useState<string | null>(null);

  const [familyId, setFamilyId] = useState(portal?.familyId ?? "");
  const [newFamily, setNewFamily] = useState("");
  const [batchLabel, setBatchLabel] = useState(portal?.batchLabel ?? "");
  const [groupBusy, setGroupBusy] = useState(false);
  const [groupMessage, setGroupMessage] = useState<{ text: string; bad: boolean } | null>(null);
  const [attachBusy, setAttachBusy] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);

  const loadPreview = useCallback(async () => {
    if (!portalId) return;
    setPreviewError(null);
    const r = await callPortal<MovePreview>(
      `/api/admin/landing/portal/move?pageId=${encodeURIComponent(pageId)}&toCourseId=${encodeURIComponent(portalId)}`,
    );
    if (r.ok) setPreview(r.data);
    else setPreviewError(r.message);
  }, [pageId, portalId]);

  useEffect(() => {
    setPreview(null);
    setMoveResult(null);
    setFamilyId(portal?.familyId ?? "");
    setBatchLabel(portal?.batchLabel ?? "");
    setNewFamily("");
    void loadPreview();
    // portal fields are re-read when the portal id changes or the server hands over a refreshed overview
  }, [loadPreview, portal?.familyId, portal?.batchLabel]);

  async function attach(courseId: string) {
    if (!courseId || courseId === portalId) return;
    setAttachBusy(true);
    setAttachError(null);
    const r = await callPortal<{ ok: boolean }>("/api/admin/landing/portal/attach", { pageId, courseId });
    setAttachBusy(false);
    if (!r.ok) {
      setAttachError(r.message);
      return;
    }
    router.refresh();
  }

  async function saveGroup() {
    if (!portalId) return;
    setGroupBusy(true);
    setGroupMessage(null);
    const r = await callPortal<{ ok: boolean }>("/api/admin/landing/portal/group", {
      courseId: portalId,
      familyId: familyId || null,
      newFamilyName: newFamily.trim() || null,
      batchLabel: batchLabel.trim() || null,
    });
    setGroupBusy(false);
    if (!r.ok) {
      setGroupMessage({ text: r.message, bad: true });
      return;
    }
    setNewFamily("");
    setGroupMessage({ text: "Saved.", bad: false });
    router.refresh();
  }

  const groupName = portal?.familyName ?? null;
  const choices = portal ? [portal, ...(overview?.siblings ?? [])] : (overview?.sources ?? []);

  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-xs font-headline font-semibold">
        <Link
          href="/dashboard/admin/enrollments/registrations"
          className="text-pz-on-surface-variant hover:text-pz-primary transition-colors"
        >
          Registrations
        </Link>
        <span className="text-pz-outline-variant" aria-hidden="true">/</span>
        <Link
          href={`/dashboard/admin/enrollments/registrations/campaign/${pageId}`}
          className="text-pz-on-surface-variant hover:text-pz-primary transition-colors"
        >
          {pageTitle}
        </Link>
        <span className="text-pz-outline-variant" aria-hidden="true">/</span>
        <span className="text-pz-primary bg-pz-primary-fixed/40 px-2.5 py-0.5 rounded-full">Portal access</span>
      </nav>

      <div>
        <h1 className="font-headline font-bold text-2xl text-pz-secondary">Portal access</h1>
        <p className="font-body text-pz-on-surface-variant text-sm mt-1 max-w-2xl">
          The course students open after paying for this batch.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <section className={card} aria-labelledby="portal-card-title">
          <h2 id="portal-card-title" className={cardTitle}>This batch&apos;s portal</h2>
          {portal ? (
            <>
              <h3 className="font-headline font-black text-xl text-pz-on-surface">{portal.title}</h3>
              <div className="flex flex-wrap gap-2">
                {portal.familyName && (
                  <span data-testid="chip-group" className={chip}>{portal.familyName}</span>
                )}
                {portal.batchLabel && (
                  <span data-testid="chip-batch" className={chip}>{portal.batchLabel}</span>
                )}
                <span
                  data-testid="chip-published"
                  className={`${chip} ${portal.published ? "bg-pz-primary-fixed text-pz-on-primary-fixed" : "bg-pz-secondary-fixed text-pz-on-secondary-fixed"}`}
                >
                  {portal.published ? "Published" : "Not published"}
                </span>
              </div>
              <Link
                href={`/dashboard/admin/courses/${portal.id}`}
                className="inline-flex items-center gap-1.5 max-md:min-h-11 font-headline text-sm font-bold text-pz-primary hover:text-pz-on-primary-container dark:hover:text-pz-primary-fixed transition-colors"
              >
                Open in Course Builder
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Link>

              <div className="border-t border-pz-outline-variant/40 pt-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="portal-group" className={fieldLabel}>Group</label>
                    <select id="portal-group" value={familyId} onChange={(e) => setFamilyId(e.target.value)} className={field}>
                      <option value="">No group</option>
                      {(overview?.families ?? []).map((f) => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="portal-batch" className={fieldLabel}>Batch label</label>
                    <input
                      id="portal-batch"
                      value={batchLabel}
                      maxLength={60}
                      onChange={(e) => setBatchLabel(e.target.value)}
                      className={field}
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="portal-newgroup" className={fieldLabel}>Or a new group name</label>
                  <input
                    id="portal-newgroup"
                    value={newFamily}
                    maxLength={60}
                    onChange={(e) => setNewFamily(e.target.value)}
                    className={field}
                  />
                </div>
                <button type="button" disabled={groupBusy} onClick={() => void saveGroup()} className={quietBtn}>
                  {groupBusy ? "Saving…" : "Save group and batch"}
                </button>
                {groupMessage && (
                  <p role={groupMessage.bad ? "alert" : "status"} className={`font-body text-sm ${groupMessage.bad ? "text-pz-danger" : "text-pz-on-surface-variant"}`}>
                    {groupMessage.text}
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className="space-y-1">
              <h3 className="font-headline font-black text-xl text-pz-on-surface">No portal yet</h3>
              <p className="font-body text-sm text-pz-on-surface-variant">
                Pick an existing portal or duplicate one to give this batch its course.
              </p>
            </div>
          )}
        </section>

        <div className="space-y-6">
          <section className={card} aria-labelledby="change-card-title">
            <div className="flex items-center justify-between gap-3">
              <h2 id="change-card-title" className={cardTitle}>Change or copy portal</h2>
              <ArrowRightLeft className="w-5 h-5 text-pz-on-surface-variant" aria-hidden="true" />
            </div>
            <div>
              <label htmlFor="portal-pick" className={fieldLabel}>
                {portal ? (groupName ? `Portals in the ${groupName} group` : "Portals in this group") : "Pick a portal"}
              </label>
              <select
                id="portal-pick"
                value={portalId ?? ""}
                disabled={attachBusy}
                onChange={(e) => void attach(e.target.value)}
                className={field}
              >
                {!portal && <option value="">Choose a portal</option>}
                {choices.map((c) => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
              {attachError && (
                <p role="alert" className="font-body text-sm text-pz-danger mt-2">{attachError}</p>
              )}
            </div>
            <button
              ref={duplicateBtn}
              type="button"
              onClick={() => setDuplicateOpen(true)}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 max-md:min-h-11 rounded-lg font-headline text-sm font-bold bg-pz-secondary-container text-pz-on-secondary-container hover:bg-pz-secondary-fixed transition-colors"
            >
              <Copy className="w-4 h-4" aria-hidden="true" />
              Duplicate a portal
            </button>
          </section>

          {portal && (
            <section className={card} aria-labelledby="move-card-title">
              <div className="flex items-center justify-between gap-3">
                <h2 id="move-card-title" className={cardTitle}>Move students</h2>
                <UsersRound className="w-5 h-5 text-pz-on-surface-variant" aria-hidden="true" />
              </div>
              {previewError && (
                <p role="alert" className="font-body text-sm text-pz-danger">{previewError}</p>
              )}
              {preview && (
                <div className="space-y-2">
                  <p className="font-headline font-black text-2xl text-pz-on-surface">
                    {plural(preview.toMove, "student will move", "students will move")}
                  </p>
                  <ul className="space-y-1 font-body text-sm text-pz-on-surface-variant">
                    <li>{preview.alreadyThere} already in this portal</li>
                    {preview.unmatchedModules > 0 && (
                      <li>{plural(preview.unmatchedModules, "module", "modules")} could not be matched</li>
                    )}
                  </ul>
                </div>
              )}
              <p className="rounded-lg bg-pz-surface-container-low p-3.5 font-body text-sm text-pz-on-surface-variant">
                Their progress in the old portal does not carry over. No emails are sent.
              </p>
              <button
                ref={moveBtn}
                type="button"
                disabled={!preview || preview.toMove === 0}
                onClick={() => setMoveOpen(true)}
                className={`w-full ${primaryBtn}`}
              >
                <FolderInput className="w-4 h-4" aria-hidden="true" />
                Move students
              </button>
              {moveResult && (
                <p role="status" className="font-body text-sm text-pz-on-surface">{moveResult}</p>
              )}
            </section>
          )}
        </div>
      </div>

      <section className="space-y-4" aria-labelledby="modules-title">
        <div className="flex items-center gap-2 px-1">
          <ListChecks className="w-5 h-5 text-pz-primary" aria-hidden="true" />
          <h2 id="modules-title" className="font-headline font-bold text-lg text-pz-on-surface">Open modules and emails</h2>
        </div>
        <BatchAccessPanel pageId={pageId} />
      </section>

      <PortalDuplicateDialog
        open={duplicateOpen}
        onOpenChange={setDuplicateOpen}
        pageId={pageId}
        sources={overview?.sources ?? []}
        families={overview?.families ?? []}
        onDone={() => router.refresh()}
        returnFocusRef={duplicateBtn}
      />
      {portal && preview && (
        <PortalMoveDialog
          open={moveOpen}
          onOpenChange={setMoveOpen}
          pageId={pageId}
          toCourseId={portal.id}
          preview={preview}
          returnFocusRef={moveBtn}
          onDone={(moved) => {
            setMoveResult(`Moved ${plural(moved, "student", "students")}.`);
            void loadPreview();
          }}
        />
      )}
    </div>
  );
}
