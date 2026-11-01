import Link from "next/link";
import { FileUp, ListChecks } from "lucide-react";
import type { ClassSummary } from "@/lib/data/class-overview";
import { cardCls, primaryBtn, quietBtn } from "./styles";

export function QuizCard({ pageId, cls }: { pageId: string; cls: ClassSummary }) {
  const href = `/dashboard/admin/enrollments/registrations/campaign/${pageId}/sessions/${cls.id}/quiz`;
  const { saved, players } = cls.quiz;
  return (
    <section data-testid="quiz-card" className={`${cardCls} space-y-4`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-headline text-xl font-bold text-pz-on-surface max-lg:hidden">Quiz results</h3>
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
  );
}
