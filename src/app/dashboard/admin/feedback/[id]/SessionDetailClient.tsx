"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Star,
  Users,
  Video,
  ChevronDown,
  Trash2,
  Download,
  Link2,
  Ban,
  RotateCcw,
  Image as ImageIcon,
  X,
  Inbox,
  Eye,
  EyeOff,
} from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDateTime, initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { coverProxyUrl } from "@/lib/feedback/cover-url";
import type { FeedbackSessionRow } from "@/lib/data/feedback-sessions";
import type { PerQuestionStat, ResponseDetail } from "@/lib/data/feedback-responses";
import { ShareReviewModal } from "../ShareReviewModal";

function personAvg(stars: number[]): number | null {
  if (!stars.length) return null;
  return Math.round((stars.reduce((a, b) => a + b, 0) / stars.length) * 10) / 10;
}

function StarRow({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          style={{ width: size, height: size }}
          className={i < Math.round(value) ? "fill-pz-secondary text-pz-secondary" : "text-pz-outline-variant"}
        />
      ))}
    </span>
  );
}

function PerQuestionBar({ q }: { q: PerQuestionStat }) {
  if (q.type === "video") {
    return (
      <div>
        <div className="flex justify-between items-center mb-1.5">
          <p className="font-body text-sm text-pz-on-surface-variant">{q.question}</p>
          <span className="inline-flex items-center gap-1 font-body text-xs text-pz-on-surface-variant">
            <Video className="w-3.5 h-3.5" />
            {q.count} submitted
          </span>
        </div>
      </div>
    );
  }
  return (
    <div>
      <div className="flex justify-between items-end mb-1.5">
        <p className="font-body text-sm text-pz-on-surface-variant">{q.question}</p>
        <span className="font-headline font-semibold text-sm text-pz-on-surface">
          {q.avg != null ? q.avg.toFixed(1) : "—"}
        </span>
      </div>
      <div className="w-full h-2.5 rounded-full bg-pz-surface-container-highest overflow-hidden">
        <div
          className="h-full rounded-full bg-pz-primary transition-[width] duration-700"
          style={{ width: `${q.avg != null ? (q.avg / 5) * 100 : 0}%` }}
        />
      </div>
    </div>
  );
}

function ResponseRow({
  r,
  starQuestions,
  videoQuestions,
  isPending,
  onRequestDelete,
  onToggleVisibility,
}: {
  r: ResponseDetail;
  starQuestions: PerQuestionStat[];
  videoQuestions: PerQuestionStat[];
  isPending: boolean;
  onRequestDelete: (r: ResponseDetail) => void;
  onToggleVisibility: (r: ResponseDetail) => void;
}) {
  const [open, setOpen] = useState(false);
  const stars = Object.values(r.answers)
    .map((a) => a.starValue)
    .filter((v): v is number => v != null);
  const avg = personAvg(stars);

  return (
    <div className={cn("border-b border-pz-outline-variant/30 last:border-b-0", !r.isPublic && "opacity-60 hover:opacity-100 transition-opacity")}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setOpen((o) => !o)}
        className="flex items-center gap-4 py-4 px-6 cursor-pointer hover:bg-pz-surface-container/40 transition-colors"
      >
        <span className="w-9 h-9 shrink-0 rounded-full bg-pz-primary-container text-pz-on-primary-container grid place-items-center font-headline font-bold text-xs">
          {initials(r.name)}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-headline font-semibold text-sm text-pz-on-surface">{r.name}</span>
            {avg != null && (
              <span className="inline-flex items-center gap-1 font-body text-xs text-pz-on-surface-variant">
                <Star className="w-3 h-3 fill-pz-secondary text-pz-secondary" />
                {avg.toFixed(1)}
              </span>
            )}
            {!r.isPublic && (
              <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] bg-pz-surface-container-highest text-pz-on-surface-variant border border-pz-outline-variant/50 uppercase tracking-wide font-headline font-bold">
                Hidden
              </span>
            )}
          </div>
          {r.comments ? (
            <p className={cn("font-body text-xs text-pz-on-surface-variant mt-0.5", !open && "truncate")}>
              &ldquo;{r.comments}&rdquo;
            </p>
          ) : (
            <p className="font-body text-xs text-pz-on-surface-variant/60 mt-0.5 italic">No comments</p>
          )}
        </div>
        <span className="font-body text-xs text-pz-on-surface-variant whitespace-nowrap hidden sm:inline">
          {formatDateTime(r.submittedAt)}
        </span>
        <button
          type="button"
          aria-label={r.isPublic ? "Hide response from mentor profile" : "Show response on mentor profile"}
          onClick={(e) => {
            e.stopPropagation();
            onToggleVisibility(r);
          }}
          disabled={isPending}
          className="p-1.5 rounded-full text-pz-on-surface-variant hover:text-pz-primary hover:bg-pz-primary/10 transition-colors shrink-0 disabled:opacity-50"
        >
          {r.isPublic ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
        </button>
        <button
          type="button"
          aria-label="Delete response"
          onClick={(e) => {
            e.stopPropagation();
            onRequestDelete(r);
          }}
          className="p-1.5 rounded-full text-pz-on-surface-variant hover:text-pz-danger hover:bg-pz-danger/10 transition-colors shrink-0"
        >
          <Trash2 className="w-4 h-4" />
        </button>
        <ChevronDown
          className={cn("w-4 h-4 text-pz-on-surface-variant shrink-0 transition-transform", open && "rotate-180")}
        />
      </div>

      {open && (
        <div className="px-6 pb-5 pl-[4.25rem] space-y-4">
          {r.email && <p className="font-body text-xs text-pz-on-surface-variant">{r.email}</p>}

          {starQuestions.length > 0 && (
            <div className="space-y-2">
              {starQuestions.map((q) => {
                const a = r.answers[q.id];
                if (a?.starValue == null) return null;
                return (
                  <div key={q.id} className="flex items-center justify-between gap-3">
                    <span className="font-body text-xs text-pz-on-surface-variant flex-1">{q.question}</span>
                    <StarRow value={a.starValue} />
                  </div>
                );
              })}
            </div>
          )}

          {videoQuestions.length > 0 && (
            <div className="space-y-3">
              {videoQuestions.map((q) => {
                const a = r.answers[q.id];
                if (!a?.videoUrl) return null;
                return (
                  <div
                    key={q.id}
                    className="rounded-lg overflow-hidden border border-pz-outline-variant/40 bg-black relative"
                    style={{ paddingBottom: "56.25%" }}
                  >
                    <iframe
                      src={a.videoUrl}
                      title={`Video feedback — ${q.question}`}
                      sandbox="allow-scripts allow-same-origin"
                      allow=""
                      loading="lazy"
                      className="absolute inset-0 w-full h-full border-0"
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function SessionDetailClient({
  session,
  perQuestion,
  responses,
}: {
  session: FeedbackSessionRow;
  perQuestion: PerQuestionStat[];
  responses: ResponseDetail[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ResponseDetail | null>(null);

  const starQuestions = perQuestion.filter((q) => q.type === "stars");
  const videoQuestions = perQuestion.filter((q) => q.type === "video");
  const videoResponseCount = videoQuestions.reduce((sum, q) => sum + q.count, 0);
  const exportUrl = `/api/admin/feedback/sessions/${session.id}/export`;

  function toggleStatus() {
    const target = session.status === "active" ? "closed" : "active";
    startTransition(async () => {
      const res = await fetch(`/api/admin/feedback/sessions/${session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: target }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(payload?.error ?? "Could not update this session.");
        return;
      }
      toast.success(`Session marked ${target}.`);
      router.refresh();
    });
  }

  function handleCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (!file) return;
    startTransition(async () => {
      const form = new FormData();
      form.append("cover", file);
      const res = await fetch(`/api/admin/feedback/sessions/${session.id}/cover`, { method: "POST", body: form });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(payload?.error ?? "Could not upload the cover image.");
        return;
      }
      toast.success("Cover image updated.");
      router.refresh();
    });
  }

  function removeCover() {
    startTransition(async () => {
      const res = await fetch(`/api/admin/feedback/sessions/${session.id}/cover`, { method: "DELETE" });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(payload?.error ?? "Could not remove the cover image.");
        return;
      }
      toast.success("Cover image removed.");
      router.refresh();
    });
  }

  function toggleVisibility(r: ResponseDetail) {
    const nextIsPublic = !r.isPublic;
    startTransition(async () => {
      const res = await fetch(`/api/admin/feedback/sessions/${session.id}/responses/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublic: nextIsPublic }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(payload?.error ?? "Could not update this response.");
        return;
      }
      toast.success(nextIsPublic ? "Response shown on the mentor profile." : "Response hidden from the mentor profile.");
      router.refresh();
    });
  }

  function confirmDeleteResponse() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    startTransition(async () => {
      const res = await fetch(`/api/admin/feedback/sessions/${session.id}/responses/${target.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(payload?.error ?? "Could not delete this response.");
        return;
      }
      setDeleteTarget(null);
      toast.success("Response deleted.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/admin/feedback"
          className="inline-flex items-center gap-2 font-body text-sm text-pz-on-surface-variant hover:text-pz-primary transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to sessions
        </Link>

        {/* Cover hero — 16:9, upload/remove on hover, ported from Stitch screen B-session-detail
            (fixed to a semantic-token scrim and a constant aspect-video, per Task 2 brief). */}
        <div className="relative w-full aspect-video rounded-xl overflow-hidden mt-3 border border-pz-outline-variant/30 bg-pz-surface-container group">
          {session.coverUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={coverProxyUrl(session.coverUrl)}
                alt=""
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-pz-surface-dim via-pz-surface/80 to-transparent" />
              <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isPending}
                  className="inline-flex items-center gap-2 bg-pz-surface/70 hover:bg-pz-surface backdrop-blur-md border border-pz-outline-variant/40 text-pz-on-surface px-3 py-1.5 rounded-lg font-headline text-xs font-semibold transition-colors disabled:cursor-not-allowed shadow-sm"
                >
                  <ImageIcon className="w-4 h-4" />
                  Change cover
                </button>
                <button
                  type="button"
                  onClick={removeCover}
                  disabled={isPending}
                  aria-label="Remove cover image"
                  className="bg-pz-surface/70 hover:bg-pz-danger backdrop-blur-md border border-pz-outline-variant/40 text-pz-on-surface hover:text-white px-2 py-1.5 rounded-lg flex items-center justify-center transition-colors disabled:cursor-not-allowed shadow-sm"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isPending}
              aria-label="Upload cover image"
              className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-pz-on-surface-variant hover:text-pz-primary transition-colors disabled:cursor-not-allowed"
            >
              <ImageIcon className="w-8 h-8" />
              <span className="font-headline text-xs font-semibold">Add cover image</span>
            </button>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleCoverChange} className="hidden" />

          <div className="absolute bottom-0 left-0 w-full p-5 sm:p-6 flex flex-col justify-end">
            <span
              className={cn(
                "self-start inline-block px-3 py-1 mb-2 rounded-full text-xs font-bold uppercase tracking-wider whitespace-nowrap font-headline",
                session.status === "active"
                  ? "bg-pz-primary-container/30 text-pz-on-primary-container"
                  : "bg-pz-surface-variant text-pz-on-surface-variant",
              )}
            >
              {session.status === "active" ? "Active" : "Closed"}
            </span>
            <h1 className="font-headline font-bold text-2xl sm:text-3xl text-pz-on-surface leading-tight truncate">
              {session.name}
            </h1>
            <p className="font-body text-pz-on-surface-variant text-sm mt-1.5">
              {session.speakerName}
              {session.sessionDate ? ` · ${new Date(session.sessionDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 flex-wrap mt-4">
          <button
            type="button"
            onClick={toggleStatus}
            disabled={isPending}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full font-headline text-sm font-semibold border border-pz-outline-variant text-pz-on-surface-variant hover:bg-pz-surface-container transition-colors disabled:opacity-50"
          >
            {session.status === "active" ? <Ban className="w-4 h-4" /> : <RotateCcw className="w-4 h-4" />}
            {session.status === "active" ? "Close Session" : "Reopen Session"}
          </button>
          <a
            href={exportUrl}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full font-headline text-sm font-semibold bg-pz-surface-container-high text-pz-on-surface hover:bg-pz-surface-variant transition-colors"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </a>
          <button
            type="button"
            onClick={() => setShareModalOpen(true)}
            disabled={isPending}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full font-headline text-sm font-semibold bg-pz-primary text-pz-on-primary hover:bg-pz-on-primary-container transition-colors disabled:opacity-50"
          >
            <Link2 className="w-4 h-4" />
            {session.shareToken ? "Share Link" : "Generate Share Link"}
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-pz-surface-container-lowest rounded-2xl border border-pz-outline-variant/40 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="font-body text-xs uppercase tracking-wide text-pz-on-surface-variant">Total Responses</span>
            <span className="w-8 h-8 rounded-full bg-pz-surface-container grid place-items-center">
              <Users className="w-4 h-4 text-pz-primary" />
            </span>
          </div>
          <p className="font-headline font-bold text-3xl text-pz-on-surface">{session.responseCount}</p>
        </div>
        <div className="bg-pz-surface-container-lowest rounded-2xl border border-pz-outline-variant/40 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="font-body text-xs uppercase tracking-wide text-pz-on-surface-variant">Avg Rating</span>
            <span className="w-8 h-8 rounded-full bg-pz-surface-container grid place-items-center">
              <Star className="w-4 h-4 text-pz-primary" />
            </span>
          </div>
          <p className="font-headline font-bold text-3xl text-pz-on-surface">
            {session.avgRating != null ? session.avgRating.toFixed(1) : "—"}
            <span className="font-body text-sm text-pz-on-surface-variant font-normal"> / 5.0</span>
          </p>
        </div>
        <div className="bg-pz-surface-container-lowest rounded-2xl border border-pz-outline-variant/40 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="font-body text-xs uppercase tracking-wide text-pz-on-surface-variant">Video Responses</span>
            <span className="w-8 h-8 rounded-full bg-pz-surface-container grid place-items-center">
              <Video className="w-4 h-4 text-pz-primary" />
            </span>
          </div>
          <p className="font-headline font-bold text-3xl text-pz-on-surface">{videoResponseCount}</p>
        </div>
      </div>

      {/* Per-question averages */}
      {perQuestion.length > 0 && (
        <div className="bg-pz-surface-container-lowest rounded-2xl border border-pz-outline-variant/40 p-6">
          <h2 className="font-headline font-bold text-pz-on-surface text-base mb-5">Avg Rating per Question</h2>
          <div className="space-y-5">
            {perQuestion.map((q, i) => (
              <PerQuestionBar key={i} q={q} />
            ))}
          </div>
        </div>
      )}

      {/* Responses */}
      <div className="bg-pz-surface-container-lowest rounded-2xl border border-pz-outline-variant/40 overflow-hidden">
        <div className="p-6 border-b border-pz-outline-variant/40">
          <h2 className="font-headline font-bold text-pz-on-surface text-base">Responses</h2>
        </div>

        {responses.length === 0 ? (
          <div className="p-10 flex flex-col items-center text-center">
            <Inbox className="w-9 h-9 text-pz-outline-variant mb-3" />
            <p className="font-body text-sm text-pz-on-surface-variant">No responses yet for this session.</p>
          </div>
        ) : (
          <div>
            {responses.map((r) => (
              <ResponseRow
                key={r.id}
                r={r}
                starQuestions={starQuestions}
                videoQuestions={videoQuestions}
                isPending={isPending}
                onRequestDelete={setDeleteTarget}
                onToggleVisibility={toggleVisibility}
              />
            ))}
          </div>
        )}
      </div>

      <ShareReviewModal
        open={shareModalOpen}
        onOpenChange={setShareModalOpen}
        targetType="session"
        targetId={session.id}
        targetName={session.name}
        shareToken={session.shareToken}
      />

      <Dialog open={deleteTarget != null} onOpenChange={(next) => !next && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-headline text-pz-on-surface">Delete this response?</DialogTitle>
          </DialogHeader>
          <p className="font-body text-sm text-pz-on-surface-variant">
            {deleteTarget?.name} — this permanently removes their feedback. This cannot be undone.
          </p>
          <DialogFooter className="gap-2 sm:gap-2">
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              disabled={isPending}
              className="px-4 py-2.5 rounded-lg font-headline text-sm font-semibold bg-pz-surface-container-high text-pz-on-surface-variant hover:bg-pz-surface-variant transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmDeleteResponse}
              disabled={isPending}
              className="px-4 py-2.5 rounded-lg font-headline text-sm font-semibold bg-pz-danger text-white hover:bg-pz-danger/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? "Working…" : "Delete"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
