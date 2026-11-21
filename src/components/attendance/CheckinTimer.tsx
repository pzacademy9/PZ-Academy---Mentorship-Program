import { formatCountdown, minutesLabel, type Countdown } from "@/lib/attendance/rules";

interface Props {
  countdown: Countdown;
  /** Plain sentence shown when there is nothing to count (closed). */
  fallbackText: string;
}

/** The sentence a screen reader hears. Changes about once a minute, and on a state change. */
export function liveSentence({ state, target, msLeft }: Countdown, fallbackText: string): string {
  const mins = minutesLabel(Math.max(1, Math.ceil(msLeft / 60000)));
  if (state === "before" && target === "opens") return `Check-in opens in ${mins}`;
  if (state === "open" && target === "closes") return `Check-in is open. It closes in ${mins}.`;
  return fallbackText;
}

export function CheckinTimer({ countdown, fallbackText }: Props) {
  const { state, target, msLeft, msTotal } = countdown;

  if (state === "closed" || target === null) {
    return (
      <div
        role="timer"
        data-testid="checkin-timer"
        className="mt-5 rounded-2xl border-[1.5px] border-pz-border bg-pz-offwhite p-5 text-center"
      >
        <p className="font-semibold text-pz-mid">{fallbackText}</p>
        <p aria-live="polite" data-testid="checkin-timer-live" className="sr-only">{fallbackText}</p>
      </div>
    );
  }

  const isOpen = state === "open";
  const urgent = isOpen && msLeft <= 60000;
  // Before: the bar fills toward opening. Open: it drains toward closing.
  const ratio = msTotal > 0 ? Math.min(1, Math.max(0, msLeft / msTotal)) : 0;
  const pct = Math.round((isOpen ? ratio : 1 - ratio) * 1000) / 10;

  return (
    <div
      role="timer"
      data-testid="checkin-timer"
      className={
        isOpen
          ? "mt-5 rounded-2xl border-[1.5px] border-pz-bright bg-green-50 p-5 text-center"
          : "mt-5 rounded-2xl border-[1.5px] border-pz-border bg-white p-5 text-center"
      }
    >
      <p className="text-sm font-medium text-pz-mid">{target === "opens" ? "Check-in opens in" : "Check-in closes in"}</p>
      <p
        aria-hidden="true"
        data-testid="checkin-timer-digits"
        className={`mt-2 font-poppins text-5xl font-bold tabular-nums sm:text-6xl ${urgent ? "text-red-700" : "text-pz-deep"}`}
      >
        {formatCountdown(msLeft)}
      </p>
      <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-pz-border" aria-hidden="true">
        <div
          className="h-full rounded-full bg-pz-bright motion-safe:transition-[width] motion-safe:duration-1000 motion-safe:ease-linear"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p aria-live="polite" data-testid="checkin-timer-live" className="sr-only">{liveSentence(countdown, fallbackText)}</p>
    </div>
  );
}
