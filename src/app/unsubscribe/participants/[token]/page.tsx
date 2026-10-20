import { unsubscribeParticipantByToken } from "@/lib/data/participant-prefs";

export const metadata = { title: "Unsubscribe — PZ Academy" };

// Never cached: this route mutates, and a cached response would show a stale
// outcome to the next person who opens the same link.
export const dynamic = "force-dynamic";

export default async function ParticipantUnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = token === "preview" ? "preview" : await unsubscribeParticipantByToken(token);

  const message =
    result === "ok"
      ? "You are unsubscribed"
      : result === "already"
        ? "You were already unsubscribed"
        : result === "preview"
          ? "This is a preview. Nothing was changed."
          : result === "error"
            ? "Something went wrong. Please try the link again in a little while."
            : "This link is not valid";

  return (
    <main className="min-h-screen flex items-center justify-center bg-pz-offwhite px-6">
      <div className="max-w-md text-center bg-white rounded-2xl shadow-sm p-8">
        <h1 className="font-montserrat font-extrabold text-2xl text-pz-deep mb-3">PZ Academy</h1>
        <p className="font-poppins text-pz-muted leading-relaxed">{message}</p>
      </div>
    </main>
  );
}
