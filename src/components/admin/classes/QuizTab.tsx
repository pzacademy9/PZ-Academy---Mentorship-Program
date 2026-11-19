"use client";

import { useState } from "react";
import Link from "next/link";
import { FileUp, ListChecks } from "lucide-react";
import type { ClassSummary } from "@/lib/data/class-overview";
import { podiumImageUrl } from "@/lib/progress/leaderboard";
import { SharePodium } from "@/components/progress/portal/SharePodium";
import { cardCls, primaryBtn, quietBtn } from "./styles";

const NO_PODIUM_YET = "The podium picture is ready once this batch is shown on the Progress page and quiz results are saved.";

/** Quiz status, the upload / results link, and the podium picture with Share podium. */
export function QuizTab({ pageId, cls, slug, batchTitle }: { pageId: string; cls: ClassSummary; slug: string | null; batchTitle: string }) {
  const [broken, setBroken] = useState(false);
  const href = `/dashboard/admin/enrollments/registrations/campaign/${pageId}/sessions/${cls.id}/quiz`;
  const { saved, players } = cls.quiz;
  const canShow = saved && !!slug && !!cls.id && Number.isFinite(cls.number);

  return (
    <div className="space-y-4">
      <section data-testid="quiz-card" className={`${cardCls} space-y-4`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-headline text-xl font-bold text-pz-on-surface">Quiz results</h3>
          <span
            className={`rounded-full px-3 py-1 text-base font-headline font-bold ${
              saved
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                : "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100"
            }`}
          >
            {saved ? "Saved" : "Not uploaded yet"}
          </span>
        </div>
        <p className="text-base text-pz-on-surface-variant">
          {saved
            ? `${players} players`
            : "After the live quiz, download the report from Kahoot and upload it here to score your students."}
        </p>
        <Link href={href} className={`${saved ? quietBtn : primaryBtn} max-md:w-full`}>
          {saved ? <ListChecks className="size-5" aria-hidden /> : <FileUp className="size-5" aria-hidden />}
          {saved ? "Open quiz results" : "Upload Kahoot file"}
        </Link>
      </section>

      <section className={`${cardCls} space-y-4`}>
        <h3 className="font-headline text-xl font-bold text-pz-on-surface">Podium</h3>
        {!saved ? (
          <p className="text-base text-pz-on-surface-variant">The podium appears after you save the quiz results.</p>
        ) : canShow && !broken ? (
          <>
            <div className="mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-xl border border-pz-outline-variant/60 bg-pz-surface-container-low">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={podiumImageUrl(slug as string, "square", cls.id)}
                alt={`Top three students for Class ${cls.number}`}
                loading="lazy"
                onError={() => setBroken(true)}
                className="size-full object-contain"
              />
            </div>
            <div className="flex">
              <SharePodium slug={slug as string} title={batchTitle} pick={cls.id} label={`Class ${cls.number}`} />
            </div>
          </>
        ) : (
          <p className="text-base text-pz-on-surface-variant">{NO_PODIUM_YET}</p>
        )}
      </section>
    </div>
  );
}
