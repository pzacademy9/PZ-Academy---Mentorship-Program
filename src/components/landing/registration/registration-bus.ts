// Every Register button on the page opens the ONE modal mounted by RegistrationHost.
type Listener = () => void;
const listeners = new Set<Listener>();
let pendingOpen = false;

export function openRegistration(): void {
  if (listeners.size === 0) { pendingOpen = true; return; }
  for (const l of Array.from(listeners)) l();
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
