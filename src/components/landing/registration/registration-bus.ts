// Every Register button on the page opens the ONE modal mounted by RegistrationHost.
type Listener = () => void;
const listeners = new Set<Listener>();
let pendingOpen = false;
let opener: HTMLElement | null = null;

/** `from` is the Register button that was pressed; focus goes back to it when the form closes. */
export function openRegistration(from?: HTMLElement | null): void {
  opener = from ?? null;
  if (listeners.size === 0) { pendingOpen = true; return; }
  for (const l of Array.from(listeners)) l();
}

/** The element that last opened the form, handed out once. */
export function takeOpener(): HTMLElement | null {
  const el = opener;
  opener = null;
  return el;
}

export function onOpenRegistration(listener: Listener): () => void {
  listeners.add(listener);
  if (pendingOpen) { pendingOpen = false; listener(); }
  return () => { listeners.delete(listener); };
}

/** Warm the modal's code on hover/focus so the click feels instant. Never loaded before intent. */
export function prefetchRegistration(): void {
  void import("./RegistrationModal").catch(() => undefined);
}
