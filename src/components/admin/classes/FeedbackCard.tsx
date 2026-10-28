"use client";

import { useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { MessageSquareText, Star } from "lucide-react";
import type { ClassSummary } from "@/lib/data/class-overview";
import { createMissingFeedbackAction } from "@/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/sessions/setup-actions";
import { CopyLinkButton, LinkBox } from "./CopyLinkButton";
import { cardCls, primaryBtn, quietBtn } from "./styles";

export function FeedbackCard({ pageId, cls }: { pageId: string; cls: ClassSummary }) {
  const [busy, startTransition] = useTransition();

  function create() {
    startTransition(async () => {
      const res = await createMissingFeedbackAction(pageId);
      if (res.ok) toast.success(res.message ?? "Done");
      else toast.error(res.message ?? "Something went wrong. Please try again.");
    });
  }

  return (
    <section data-testid="feedback-card" className={`${cardCls} space-y-4`}>
      <h3 className="font-headline text-xl font-bold text-pz-on-surface">Feedback</h3>
      {cls.feedbackLink && cls.feedbackSessionId ? (
        <>
          <p className="text-base text-pz-on-surface-variant">Share this link at the end of class so students can rate it.</p>
          <LinkBox url={cls.feedbackLink} />
          <div className="flex flex-col gap-2 md:flex-row">
            <CopyLinkButton url={cls.feedbackLink} />
          </div>
          <div className="rounded-lg bg-pz-surface-container-low p-4">
            <p className="font-headline text-2xl font-bold text-pz-on-surface">
              {cls.feedbackCount} {cls.feedbackCount === 1 ? "response" : "responses"}
            </p>
            {cls.feedbackAvg !== null && (
              <p className="mt-1 flex items-center gap-1.5 text-base text-pz-on-surface-variant">
                <Star className="size-5 fill-amber-400 text-amber-500" aria-hidden />
                {cls.feedbackAvg.toFixed(1)} out of 5 on average
              </p>
            )}
          </div>
          <Link href={`/dashboard/admin/feedback/${cls.feedbackSessionId}`} className={`${quietBtn} max-md:w-full`}>
            <MessageSquareText className="size-5" aria-hidden />
            See responses
          </Link>
        </>
      ) : (
        <>
          <p className="text-base text-pz-on-surface-variant">This class has no feedback link yet.</p>
          <button type="button" className={`${primaryBtn} max-md:w-full`} disabled={busy} onClick={create}>
            Create missing feedback links
          </button>
        </>
      )}
    </section>
  );
}
