/** One JSON call to an admin payment route. Never throws: a network failure comes back as an error message. */
export type SendResult<T> = { ok: true; data: T } | { ok: false; error: string; field?: string };

export async function send<T = Record<string, unknown>>(url: string, method: "POST" | "PATCH" | "PUT", body: unknown): Promise<SendResult<T>> {
  try {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = (await res.json().catch(() => null)) as (T & { error?: string; field?: string }) | null;
    if (!res.ok) return { ok: false, error: data?.error ?? "Could not save. Please try again.", field: data?.field };
    return { ok: true, data: (data ?? {}) as T };
  } catch {
    return { ok: false, error: "Could not reach the server. Please try again." };
  }
}
