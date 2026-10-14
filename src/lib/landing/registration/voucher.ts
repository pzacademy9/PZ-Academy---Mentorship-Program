// src/lib/landing/registration/voucher.ts
// Server-side rules for the payment voucher (screenshot or PDF) sent with a registration.

/**
 * 4 MB. Vercel rejects a function request body over 4.5 MB before our code runs, and the
 * multipart envelope plus the JSON payload need room. The widget compresses images first.
 */
export const MAX_VOUCHER_UPLOAD_BYTES = 4 * 1024 * 1024;

export const VOUCHER_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export type VoucherCheck = { ok: true; ext: string } | { ok: false; status: 400 | 413 | 415; error: string };

export function checkVoucher(f: { size: number; type: string }): VoucherCheck {
  if (f.size <= 0) return { ok: false, status: 400, error: "Upload a screenshot or PDF of your payment." };
  if (f.size > MAX_VOUCHER_UPLOAD_BYTES) {
    return { ok: false, status: 413, error: "This file is bigger than 4 MB. Upload a screenshot of the payment instead." };
  }
  const ext = VOUCHER_EXTENSIONS[f.type];
  if (!ext) return { ok: false, status: 415, error: "Upload a JPG, PNG, WebP or PDF file." };
  return { ok: true, ext };
}
