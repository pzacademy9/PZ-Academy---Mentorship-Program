"use client";

import { useState, useTransition } from "react";
import type { CheckinResult } from "@/app/attend/[code]/actions";

interface Props {
  code: string;
  /** Present for a personal link; the person is already known. */
  token?: string;
  personal: (code: string, token: string) => Promise<CheckinResult>;
  shared: (code: string, email: string) => Promise<CheckinResult>;
  disabled?: boolean;
}

const MESSAGES: Record<string, string> = {
  before: "Check-in is not open yet. It opens 15 minutes before the class.",
  closed: "Check-in for this session has closed. Please ask the team.",
  not_live: "Attendance is only for live students. Your enrolment is recorded-only.",
  not_found: "We could not find a live enrolment for that email. Check the spelling, or ask the team.",
  bad_link: "This link is not valid. Use the email field instead, or ask the team.",
  rate_limited: "Too many tries. Please wait a minute and try again.",
  error: "Something went wrong. Please try again in a minute.",
};

export function CheckinForm({ code, token, personal, shared, disabled }: Props) {
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<CheckinResult | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token && email.trim().length === 0) {
      setResult({ status: "not_found" });
      return;
    }
    startTransition(async () => {
      try {
        setResult(token ? await personal(code, token) : await shared(code, email));
      } catch {
        setResult({ status: "error" });
      }
    });
  }

  if (result?.status === "marked") {
    return (
      <div aria-live="polite" className="mt-6 rounded-2xl border-[1.5px] border-pz-border bg-white p-5">
        <p className="font-poppins text-xl font-bold text-pz-forest">
          {result.already ? `Already marked, ${result.firstName}` : `You are marked present, ${result.firstName}`}
        </p>
        <p className="mt-1 text-sm text-pz-mid">You can close this page.</p>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row">
        {!token && (
          <div className="flex-1">
            <label htmlFor="checkin-email" className="sr-only">Your registered email</label>
            <input
              id="checkin-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Your registered email"
              autoComplete="email"
              className="w-full rounded-xl border-[1.5px] border-pz-border bg-white px-4 py-3 text-pz-deep outline-none focus:border-pz-bright"
            />
          </div>
        )}
        <button
          type="submit"
          disabled={pending || disabled}
          className="rounded-xl bg-pz-bright px-6 py-3 font-semibold text-pz-forest disabled:opacity-60"
        >
          Mark me present
        </button>
      </form>
      <div aria-live="polite" className="mt-4">
        {result && <p className={result.status === "error" ? "text-red-700" : "text-pz-mid"}>{MESSAGES[result.status]}</p>}
      </div>
    </div>
  );
}
