import { requireMentorPage } from "@/lib/auth/require-mentor";
import { getOwnMentorAvailability } from "@/lib/data/mentor-availability";
import { AvailabilityForm } from "@/components/mentor/AvailabilityForm";

export const metadata = { title: "Manage Availability — PZ Academy" };

export default async function MentorAvailabilityPage() {
  const { user } = await requireMentorPage();
  const availability = await getOwnMentorAvailability(user.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-montserrat font-bold text-2xl text-pz-forest">Manage Availability</h1>
        <p className="text-pz-muted text-sm mt-1">
          Set your recurring weekly schedule. Bookable slots are generated automatically in your local timezone.
        </p>
      </div>

      {availability ? (
        <AvailabilityForm availability={availability} />
      ) : (
        <div className="bg-pz-surface-container-lowest rounded-xl shadow-card p-6">
          <p className="text-pz-muted text-sm">No mentor profile is linked to your account yet. Contact an admin to get set up.</p>
        </div>
      )}
    </div>
  );
}
