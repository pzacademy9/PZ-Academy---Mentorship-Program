import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createServerSupabase } from "@/lib/supabase/server";
import { getCourseBySlug, getEnrollment, getCourseProgress } from "@/lib/data/lms";
import { getNotificationSummary } from "@/lib/data/notifications";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NotificationBell } from "@/components/dashboard/NotificationBell";

export default async function PortalLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { slug: string };
}) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?returnUrl=/portal/${params.slug}`);

  const course = await getCourseBySlug(params.slug);
  const enrollment = course ? await getEnrollment(course.id, user.id) : null;
  const showProgress = course && enrollment?.status === "active";
  const progress = showProgress ? await getCourseProgress(course.id, user.id) : null;
  // The portal has its own header, so the bell has to be mounted here too —
  // otherwise a student deep in a lesson never sees an update.
  const { items, unreadCount } = await getNotificationSummary(user.id);

  return (
    <div className="min-h-screen bg-pz-surface">
      <header className="sticky top-0 z-20 bg-pz-surface-container-high border-b border-pz-outline-variant/40 shadow-sm relative">
        <div className="flex items-center gap-4 px-4 sm:px-6 h-16">
          <Link
            href="/dashboard/courses"
            className="flex items-center gap-2 text-pz-on-surface-variant hover:text-pz-on-surface text-sm font-label font-semibold shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">My Courses</span>
          </Link>
          <span className="font-headline font-bold text-pz-secondary text-sm sm:text-base truncate">
            {course?.title ?? "Course"}
          </span>
          <div className="ml-auto flex items-center gap-3 shrink-0">
            {progress && (
              <span className="text-xs font-label font-semibold text-pz-on-surface-variant tabular-nums">
                {progress.pct}% complete
              </span>
            )}
            <NotificationBell items={items} unreadCount={unreadCount} />
            <ThemeToggle />
          </div>
        </div>
        {progress && (
          <div className="absolute bottom-0 left-0 w-full h-1 bg-pz-surface-container-highest">
            <div
              className="h-full bg-pz-tertiary transition-[width] duration-500"
              style={{ width: `${Math.max(0, Math.min(100, progress.pct))}%` }}
            />
          </div>
        )}
      </header>
      {children}
    </div>
  );
}
