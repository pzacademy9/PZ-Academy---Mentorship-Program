// src/lib/landing/demo-watch.ts
// Pure logic for the demo video: how long to let a visitor watch before the Register popup.

export type PauseSeconds = 15 | 20 | 30;

/** The owner's "pause every" choice; anything unknown means 20 seconds. */
export function pauseSeconds(value: unknown): PauseSeconds {
  return value === "15" ? 15 : value === "30" ? 30 : 20;
}

export type WatchClock = { watched: number; interval: number };

export function newClock(interval: number): WatchClock {
  return { watched: 0, interval };
}

/**
 * Adds `seconds` of watching, but only while the video is really playing, so dragging the bar forward
 * or leaving the video paused never moves the clock. Reaching the interval asks for ONE pause and
 * starts the count again from zero.
 */
export function tick(clock: WatchClock, seconds: number, playing: boolean): { clock: WatchClock; pause: boolean } {
  if (!playing) return { clock, pause: false };
  const watched = clock.watched + seconds;
  if (watched >= clock.interval) return { clock: { ...clock, watched: 0 }, pause: true };
  return { clock: { ...clock, watched }, pause: false };
}
