export type PixelEvent = "PageView" | "ViewContent" | "Lead" | "InitiateCheckout" | "CompleteRegistration";

type Fbq = ((...args: unknown[]) => void) & { callMethod?: (...a: unknown[]) => void; queue: unknown[][]; loaded: boolean; version: string; push: Fbq };
declare global { interface Window { fbq?: Fbq; _fbq?: Fbq } }

const PIXEL_ID_RE = /^\d{6,20}$/;
const MAX_PENDING = 20;
let installedId: string | null = null;
let pending: unknown[][] = [];

export function newEventId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Meta's base code, typed. Returns true only the first time a valid id is installed. */
export function installPixel(pixelId: string): boolean {
  if (typeof window === "undefined" || installedId || !PIXEL_ID_RE.test(pixelId)) return false;
  if (!window.fbq) {
    const n = function (...args: unknown[]) {
      if (n.callMethod) n.callMethod(...args);
      else n.queue.push(args);
    } as Fbq;
    n.push = n;
    n.loaded = true;
    n.version = "2.0";
    n.queue = [];
    window.fbq = n;
    window._fbq = n;
    const s = document.createElement("script");
    s.async = true;
    s.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.appendChild(s);
  }
  window.fbq("init", pixelId);
  installedId = pixelId;
  const queued = pending;
  pending = [];
  for (const args of queued) window.fbq(...args);
  return true;
}

/** Sends a browser event with an event id (for de-duplication with the server later). Queues until installed. */
export function track(name: PixelEvent, data: Record<string, unknown> = {}, eventId: string = newEventId()): string {
  const args: unknown[] = ["track", name, data, { eventID: eventId }];
  if (typeof window !== "undefined" && installedId && window.fbq) window.fbq(...args);
  else if (pending.length < MAX_PENDING) pending.push(args);
  return eventId;
}

export function __resetPixelForTests(): void {
  installedId = null;
  pending = [];
}
