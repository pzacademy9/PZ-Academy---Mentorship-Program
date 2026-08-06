import { redirect } from "next/navigation";
import { UserCheck } from "lucide-react";
import { createServerSupabase } from "@/lib/supabase/server";
import { getMyApplication } from "@/lib/data/mentorship-applications";
import { MentorshipStatusBadge } from "@/components/admin/mentorship/MentorshipStatusBadge";
import { formatDate } from "@/lib/format";

export const metadata = { title: "My Application — PZ Academy" };

export default async function MyMentorApplicationPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const application = await getMyApplication(user.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline font-bold text-2xl text-pz-secondary">My Application</h1>
        <p className="font-body text-pz-on-surface-variant text-sm mt-1">
          Track your mentor application status.
        </p>
      </div>

      {!application ? (
        <div className="bg-pz-surface-container rounded-2xl border border-pz-outline-variant/40 p-10 flex flex-col items-center text-center">
          <UserCheck className="w-10 h-10 text-pz-outline-variant mb-3" />
          <p className="font-body text-pz-on-surface-variant text-sm">You haven&apos;t applied to become a mentor yet.</p>
          <a href="/mentorship#apply" className="mt-3 font-label text-pz-primary text-sm font-bold hover:underline">
            Apply now →
          </a>
        </div>
      ) : (
        <div className="p-6 rounded-xl bg-pz-surface-container border border-pz-outline-variant/10 space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-headline font-bold text-pz-on-surface">{application.profession ?? "Mentor application"}</p>
            <MentorshipStatusBadge kind="application" status={application.status} />
          </div>
          <p className="font-body text-sm text-pz-on-surface-variant">Submitted {formatDate(application.createdAt)}</p>
          {application.status === "rejected" && application.rejectionReason && (
            <p className="font-body text-sm text-pz-danger">{application.rejectionReason}</p>
          )}
        </div>
      )}
    </div>
  );
}
