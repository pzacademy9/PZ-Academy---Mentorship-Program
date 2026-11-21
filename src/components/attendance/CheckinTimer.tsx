import { formatCountdown, minutesLabel, type Countdown } from "@/lib/attendance/rules";

interface Props {
  countdown: Countdown;
  /** Plain sentence shown when there is nothing to count (closed). */
  fallbackText: string;
}

const HOUR_MS = 3600000;
const DAY_MS = 86400000;

function span(msLeft: number): string {
  if (msLeft > HOUR_MS) {
    const hours = Math.ceil(msLeft / HOUR_MS);
    if (hours >= 24) {
      const days = Math.floor(hours / 24);
      return `${days} ${days === 1 ? "day" : "days"}`;
    }
    return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  }
  return minutesLabel(Math.max(1, Math.ceil(msLeft / 60000)));
}

/** The sentence a screen reader hears. Changes about once a minute (or hour), and on a state change. */
export function liveSentence({ state, target, msLeft }: Countdown, fallbackText: string): string {
  if (state === "before" && target === "opens") return `Check-in opens in ${span(msLeft)}.`;
  if (state === "open" && target === "closes") return `Check-in is open. It closes in ${span(msLeft)}.`;
  return fallbackText;
}

export function CheckinTimer({ countdown, fallbackText }: Props) {
  const { state, target, msLeft, msTotal } = countdown;
  // One live node in the same place in both branches, so React keeps it and only the text changes.
  const live = (
    <p aria-live="polite" data-testid="checkin-timer-live" className="sr-only">
      {liveSentence(countdown, fallbackText)}
    </p>
  );

  if (state === "closed" || target === null) {
    return (
      <div
        role="timer"
        data-testid="checkin-timer"
        className="mt-5 rounded-2xl border-[1.5px] border-pz-outline-variant bg-pz-surface-container-low p-5 text-center"
      >
        {live}
        <p aria-hidden="true" className="font-semibold text-pz-on-surface-variant">{fallbackText}</p>
      </div>
    );
  }

  const isOpen = state === "open";
  const urgent = isOpen && msLeft <= 60000;
  // Before: the bar fills toward opening. Open: it drains toward closing.
  const ratio = msTotal > 0 ? Math.min(1, Math.max(0, msLeft / msTotal)) : 0;
  const pct = Math.round((isOpen ? ratio : 1 - ratio) * 1000) / 10;
  const showBar = !(state === "before" && msLeft > msTotal);
  const digitSize = msLeft >= DAY_MS ? "text-3xl" : "text-5xl sm:text-6xl";

  return (
    <div
      role="timer"
      data-testid="checkin-timer"
      className={`mt-5 rounded-2xl border-[1.5px] bg-white p-5 text-center ${isOpen ? "border-pz-bright" : "border-pz-border"}`}
    >
      {live}
      <p className="text-sm font-medium text-pz-mid">{target === "opens" ? "Check-in opens in" : "Check-in closes in"}</p>
      <p
        aria-hidden="true"
        data-testid="checkin-timer-digits"
        className={`mt-2 font-poppins ${digitSize} font-bold tabular-nums ${urgent ? "text-red-700" : "text-pz-deep"}`}
      >
        {formatCountdown(msLeft)}
      </p>
      {showBar ? (
        <div data-testid="checkin-timer-bar" className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-pz-surface-container-high" aria-hidden="true">
          <div
            className={`h-full rounded-full ${isOpen ? "bg-pz-bright" : "bg-pz-mid"} motion-safe:transition-[width] motion-safe:duration-1000 motion-safe:ease-linear`}
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}
