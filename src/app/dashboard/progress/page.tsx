import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { createServerSupabase } from "@/lib/supabase/server";
import { getProgressForUser } from "@/lib/data/portal";
import type { Progress } from "@/lib/progress/build";
import { ProgressSection } from "@/components/progress/ProgressSection";
import { CopyPzId } from "@/components/progress/CopyPzId";

export const metadata: Metadata = { title: "My Progress | PZ Academy" };
export const dynamic = "force-dynamic";

const card = "rounded-xl bg-pz-surface-container-lowest p-4 shadow-sm ring-1 ring-pz-outline-variant/40 sm:p-6";

function PortalCard() {
  return (
    <Link
      href="/progress"
      className="flex min-h-11 min-w-0 items-center justify-between gap-3 rounded-xl bg-pz-surface-container p-4 font-headline text-base font-bold text-pz-on-surface hover:bg-pz-surface-container-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pz-primary sm:p-6"
    >
      <span className="min-w-0">
        Looking for other batches? See the full batch lists
        <span className="mt-1 block font-body text-sm font-normal text-pz-on-surface-variant">
          Opens the public Progress Portal where every batch is listed.
        </span>
      </span>
      <ArrowRight aria-hidden className="h-5 w-5 shrink-0" />
    </Link>
  );
}

export default async function MyProgressPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) redirect("/login");

  let progress: Progress | null = null;
  let failed = false;
  let unconfirmed = false;
  try {
    const out = await getProgressForUser(user);
    if (out.status === "unconfirmed") unconfirmed = true;
    else progress = out.progress;
  } catch {
    failed = true;
  }

  if (unconfirmed || failed || !progress) {
    return (
      <div className="mx-auto flex min-w-0 max-w-3xl flex-col gap-4">
        <h1 className="font-headline text-2xl font-black text-pz-on-surface">My Progress</h1>
        <p className={`${card} text-base text-pz-on-surface-variant`}>
          {unconfirmed
            ? "Please confirm your email address to see your progress."
            : failed
            ? "We could not load your progress right now. Please try again in a minute."
            : "We cannot find your enrolment yet. It appears here once your registration is confirmed."}
        </p>
        <PortalCard />
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-w-0 max-w-3xl flex-col gap-4">
      <div className={`flex min-w-0 flex-col gap-2 ${card}`}>
        <h1 className="break-words font-headline text-2xl font-black text-pz-on-surface sm:text-3xl">
          Hello, {progress.firstName}
        </h1>
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-pz-on-surface-variant">
          <span>PZ ID</span>
          <span className="break-all font-headline text-base font-bold text-pz-primary">{progress.pzId}</span>
          <CopyPzId pzId={progress.pzId} />
        </div>
        <p className="text-sm text-pz-on-surface-variant">Your attendance and quiz results across your batches.</p>
      </div>
      <ProgressSection progress={progress} />
      <PortalCard />
    </div>
  );
}
