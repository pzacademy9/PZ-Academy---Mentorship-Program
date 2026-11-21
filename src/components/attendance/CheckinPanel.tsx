"use client";

import { useEffect, useState } from "react";
import type { CheckinResult } from "@/app/attend/[code]/actions";
import { checkinCountdown, windowText, type WindowOverride } from "@/lib/attendance/rules";
import { CheckinForm } from "./CheckinForm";
import { CheckinTimer } from "./CheckinTimer";

interface Props {
  code: string;
  token?: string;
  personal: (code: string, token: string) => Promise<CheckinResult>;
  shared: (code: string, email: string) => Promise<CheckinResult>;
  startsAtIso: string;
  override: WindowOverride;
  open: number;
  close: number;
  /** Server time when the page was rendered; the timer follows this, not the phone clock. */
  serverNowIso: string;
}

export function CheckinPanel({ code, token, personal, shared, startsAtIso, override, open, close, serverNowIso }: Props) {
  // Offset between the server clock and this device, taken once.
  const [offset] = useState(() => Date.parse(serverNowIso) - Date.now());
  // Seeded from the server time so the first client render matches the server render.
  const [nowMs, setNowMs] = useState(() => Date.parse(serverNowIso));

  useEffect(() => {
    // Always read the clock, never count ticks, so a throttled hidden tab catches up.
    const sync = () => setNowMs(Date.now() + offset);
    sync();
    const id = setInterval(sync, 1000);
    document.addEventListener("visibilitychange", sync);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [offset]);

  const countdown = checkinCountdown(startsAtIso, override, new Date(nowMs), { open, close });
  const text = windowText(countdown.state, open);

  return (
    <>
      {override === "auto" ? (
        <CheckinTimer countdown={countdown} fallbackText={text} />
      ) : (
        <p className="mt-2 text-sm text-pz-mid">{text}</p>
      )}
      {/* Same position and no key change, so the typed email survives a state change. */}
      <CheckinForm
        code={code}
        token={token}
        personal={personal}
        shared={shared}
        disabled={countdown.state !== "open"}
        openMinutes={open}
      />
    </>
  );
}
