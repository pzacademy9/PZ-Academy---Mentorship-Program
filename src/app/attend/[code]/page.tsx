import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getSessionByCode, personFirstName } from "@/lib/data/attendance";
import { checkinWindow, formatPkt, type WindowOverride } from "@/lib/attendance/rules";
import { checkinSecret, verifyCheckinToken } from "@/lib/attendance/link-token";
import { CheckinForm } from "@/components/attendance/CheckinForm";
import { checkInPersonal, checkInShared } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Session check-in", robots: { index: false } };

const WINDOW_TEXT = {
  before: "Check-in opens 15 minutes before the class.",
  open: "Check-in is open.",
  closed: "Check-in has closed.",
} as const;

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-pz-offwhite px-4 py-12">
      <div className="mx-auto max-w-xl">
        <p className="text-sm font-semibold text-pz-mid">PZ Academy</p>
        {children}
      </div>
    </main>
  );
}

// Rendering only reads. Attendance is written by the button, never by loading this page,
// because email scanners open links before the student does.
export default async function AttendPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ t?: string | string[] }>;
}) {
  const { code } = await params;
  const { t } = await searchParams;
  const rawToken = Array.isArray(t) ? t[0] : t;

  let session: Awaited<ReturnType<typeof getSessionByCode>>;
  let firstName: string | null = null;
  let linkInvalid = false;
  try {
    session = await getSessionByCode(code);
    if (session && rawToken) {
      const secret = checkinSecret();
      const verified = secret ? verifyCheckinToken(rawToken, session.id, secret) : null;
      firstName = verified ? await personFirstName(verified.personId) : null;
      linkInvalid = firstName === null;
    }
  } catch {
    return (
      <Shell>
        <p className="mt-4 text-pz-mid">We could not load this page. Please try again in a minute.</p>
      </Shell>
    );
  }
  if (!session) notFound();

  const state = checkinWindow(session.starts_at, session.window_override as WindowOverride, new Date());
  const token = firstName !== null ? rawToken : undefined;

  return (
    <Shell>
      <h1 className="mt-1 font-poppins text-2xl font-bold text-pz-deep">Session check-in</h1>
      {session.batchTitle ? <p className="mt-1 text-pz-mid">{session.batchTitle}</p> : null}
      <p className="mt-4 font-semibold text-pz-deep">{session.title}</p>
      <p className="text-sm text-pz-mid">{formatPkt(session.starts_at)}</p>
      <p className="mt-2 text-sm text-pz-mid">{WINDOW_TEXT[state]}</p>
      {firstName ? <p className="mt-4 text-pz-deep">Hello, {firstName}.</p> : null}
      {linkInvalid ? (
        <p className="mt-4 text-red-700">This personal link is not valid. Use your registered email below.</p>
      ) : null}
      {!token ? <p className="mt-4 text-sm text-pz-mid">Type the email you registered with.</p> : null}
      <CheckinForm
        code={code}
        token={token}
        personal={checkInPersonal}
        shared={checkInShared}
        disabled={state === "closed"}
      />
    </Shell>
  );
}
