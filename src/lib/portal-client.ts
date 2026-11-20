export const PORTAL_ERROR_TEXT = "Something went wrong. Please try again.";

export type PortalCallResult<T> = { ok: true; data: T } | { ok: false; message: string };

/** Calls a portal route. Calm server messages (409/404) are shown as they are; anything else gets one plain line. */
export async function callPortal<T>(url: string, body?: unknown): Promise<PortalCallResult<T>> {
  try {
    const res = await fetch(url, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    });
    const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
    if (res.ok && data) return { ok: true, data };
    const calm = (res.status === 409 || res.status === 404) && typeof data?.error === "string" ? data.error : PORTAL_ERROR_TEXT;
    return { ok: false, message: calm };
  } catch {
    return { ok: false, message: PORTAL_ERROR_TEXT };
  }
}
