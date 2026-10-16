import type { RegisterPayload } from "@/lib/landing/registration/submit-schema";
import { variantQuery } from "./variant";
import type { RegisterErrorBody, RegisterSuccess } from "./types";

export type SubmitOutcome = { ok: true; data: RegisterSuccess } | { ok: false; status: number; error: string; field?: string };

export const NETWORK_MESSAGE = "We couldn't reach our server. Check your connection. Your details are still here, so you can try again.";

export function messageForStatus(status: number): string {
  if (status === 400 || status === 422) return "Some details need fixing. Please check the highlighted fields.";
  if (status === 404) return "This registration form isn't available any more.";
  if (status === 403) return "This action isn't allowed for your account.";
  if (status === 410) return "Registration for this event is closed.";
  if (status === 409) return "We couldn't complete this registration. Please read the message and try again.";
  if (status === 413) return "This file is too big. Upload a file under 4 MB.";
  if (status === 415) return "Upload a JPG, PNG, WebP or PDF file.";
  if (status === 429) return "Too many attempts. Please wait a few minutes and try again.";
  if (status === 502) return "We couldn't upload your receipt. Your details are still here, please try again in a moment.";
  return "Something went wrong on our side. Your details are still here, please try again in a moment.";
}

/** POSTs multipart `payload` (JSON) + optional `voucher` file. Never throws. The server recomputes every price. */
export async function submitRegistration(
  slug: string,
  payload: RegisterPayload,
  voucher: File | null,
  { timeoutMs = 60_000, variant }: { timeoutMs?: number; variant?: string } = {},
): Promise<SubmitOutcome> {
  const fd = new FormData();
  fd.append("payload", JSON.stringify(payload));
  if (voucher) fd.append("voucher", voucher, voucher.name);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`/api/landing/${encodeURIComponent(slug)}/register${variantQuery(variant)}`, { method: "POST", body: fd, signal: ctrl.signal });
    const body = (await res.json().catch(() => null)) as (Partial<RegisterSuccess> & Partial<RegisterErrorBody>) | null;
    if (res.ok && body && typeof body.refId === "string") return { ok: true, data: body as RegisterSuccess };
    if (res.ok) return { ok: false, status: 500, error: messageForStatus(500) };
    // 429 always gets our wording; otherwise the server's own message (it is written for people) wins.
    const field = typeof body?.field === "string" ? body.field : undefined;
    // A 400 with no field is a raw validation/honeypot message ("Invalid input"), not written for people.
    const usable = res.status !== 429 && !(res.status === 400 && !field);
    const error = usable && typeof body?.error === "string" && body.error.trim() ? body.error : messageForStatus(res.status);
    return { ok: false, status: res.status, error, field };
  } catch {
    return { ok: false, status: 0, error: NETWORK_MESSAGE };
  } finally {
    clearTimeout(timer);
  }
}
