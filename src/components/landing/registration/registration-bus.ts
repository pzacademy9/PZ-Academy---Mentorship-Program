// Every Register button on the page opens the ONE modal mounted by RegistrationHost.
import type { Mode } from "@/lib/landing/registration/config";

export interface OpenOptions { mode?: Mode }
type Listener = (opts: OpenOptions) => void;
const listeners = new Set<Listener>();
let pendingOpen: OpenOptions | null = null;
let opener: HTMLElement | null = null;

/** `from` is the Register button that was pressed; focus goes back to it when the form closes. */
export function openRegistration(from?: HTMLElement | null, opts?: OpenOptions): void {
  opener = from ?? null;
  const o: OpenOptions = opts?.mode ? { mode: opts.mode } : {};
  if (listeners.size === 0) { pendingOpen = o; return; }
  for (const l of Array.from(listeners)) l(o);
}

/** The element that last opened the form, handed out once. */
export function takeOpener(): HTMLElement | null {
  const el = opener;
  opener = null;
  return el;
}

export function onOpenRegistration(listener: Listener): () => void {
  listeners.add(listener);
  if (pendingOpen) { const o = pendingOpen; pendingOpen = null; listener(o); }
  return () => { listeners.delete(listener); };
}

/** Warm the modal's code on hover/focus so the click feels instant. Never loaded before intent. */
export function prefetchRegistration(): void {
  void import("./RegistrationModal").catch(() => undefined);
}
