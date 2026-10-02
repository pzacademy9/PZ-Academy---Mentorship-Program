import { requireMentorPage } from "@/lib/auth/require-mentor";
import { getOwnMentorProfile } from "@/lib/data/mentor-self";
import { MentorSelfProfileForm } from "@/components/mentor/MentorSelfProfileForm";

export const metadata = { title: "Edit Profile — PZ Academy" };

export default async function MentorProfilePage() {
  const { user } = await requireMentorPage();
  const mentor = await getOwnMentorProfile(user.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-montserrat font-bold text-2xl text-pz-forest">Edit Profile</h1>
        <p className="text-pz-muted text-sm mt-1">
          This is what students see when they view your public mentor profile.
        </p>
      </div>

      {mentor ? (
        <MentorSelfProfileForm mentor={mentor} />
      ) : (
        <div className="bg-pz-surface-container-lowest rounded-xl shadow-card p-6">
          <p className="text-pz-muted text-sm">
            No mentor profile is linked to your account yet. Contact an admin to get set up.
          </p>
        </div>
      )}
    </div>
  );
}
