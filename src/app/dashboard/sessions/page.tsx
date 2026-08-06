import { redirect } from "next/navigation";
import { Calendar } from "lucide-react";
import { createServerSupabase } from "@/lib/supabase/server";
import { listMyBookings } from "@/lib/data/mentorship-bookings";
import { MentorshipStatusBadge } from "@/components/admin/mentorship/MentorshipStatusBadge";
import { formatDate } from "@/lib/format";

export const metadata = { title: "My Sessions — PZ Academy" };

export default async function MySessionsPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const bookings = await listMyBookings(user.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline font-bold text-2xl text-pz-secondary">My Sessions</h1>
        <p className="font-body text-pz-on-surface-variant text-sm mt-1">
          Track your mentorship session bookings.
        </p>
      </div>

      {bookings.length === 0 ? (
        <div className="bg-pz-surface-container rounded-2xl border border-pz-outline-variant/40 p-10 flex flex-col items-center text-center">
          <Calendar className="w-10 h-10 text-pz-outline-variant mb-3" />
          <p className="font-body text-pz-on-surface-variant text-sm">No sessions booked yet.</p>
          <a href="/mentorship" className="mt-3 font-label text-pz-primary text-sm font-bold hover:underline">
            Browse mentors →
          </a>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {bookings.map((b) => (
            <div
              key={b.id}
              className="p-5 rounded-xl bg-pz-surface-container border border-pz-outline-variant/10 flex items-center justify-between gap-4"
            >
              <div className="min-w-0">
                <p className="font-headline font-bold text-pz-on-surface">{b.mentorName}</p>
                <p className="font-body text-sm text-pz-on-surface-variant">{b.packageName}</p>
                <p className="font-body text-xs text-pz-on-surface-variant mt-1">Booked {formatDate(b.createdAt)}</p>
                {b.status === "cancelled" && b.cancellationReason && (
                  <p className="font-body text-xs text-pz-danger mt-1">{b.cancellationReason}</p>
                )}
              </div>
              <MentorshipStatusBadge kind="booking" status={b.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
