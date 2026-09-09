import { unsubscribeByToken } from "@/lib/data/crm-unsubscribe";

export const metadata = { title: "Unsubscribe — PZ Academy" };

// Never cached: this route mutates, and a cached response would show a stale
// outcome to the next person who opens the same link.
export const dynamic = "force-dynamic";

export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = token === "preview" ? "preview" : await unsubscribeByToken(token);

  const message =
    result === "ok"
      ? "You have been unsubscribed. You will not receive any more marketing emails from PZ Academy."
      : result === "already"
        ? "You were already unsubscribed. No further marketing emails will be sent to you."
        : result === "preview"
          ? "This is a preview link from a test email. No changes were made."
          : "This unsubscribe link is not valid. It may have already been used or the address may have been removed.";

  return (
    <main className="min-h-screen flex items-center justify-center bg-pz-offwhite px-6">
      <div className="max-w-md text-center bg-white rounded-2xl shadow-sm p-8">
        <h1 className="font-montserrat font-extrabold text-2xl text-pz-deep mb-3">PZ Academy</h1>
        <p className="font-poppins text-pz-muted leading-relaxed">{message}</p>
      </div>
    </main>
  );
}
