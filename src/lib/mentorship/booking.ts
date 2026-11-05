/**
 * Shared, non-client helpers for the mentor profile, booking and thank-you
 * pages. Kept out of "use client" files so server pages can import them too
 * (see tests/client-boundary-values.test.ts).
 */

/** Where the booking page leaves a short summary for the thank-you page (this tab only). */
export const BOOKING_SUMMARY_KEY = "pz-mentor-booking";

export type BookingSummary = {
  ref: string | null;
  mentorName: string;
  mentorTitle: string;
  mentorPhoto: string;
  packageName: string;
  price: number | null;
  fullName: string;
};

/** The real accounts students pay into. Same details as the old booking page. */
export const PAYMENT_ACCOUNTS: {
  kind: "paypal" | "bank" | "wallet";
  label: string;
  holder: string;
  value: string;
  copy: string;
  link?: string;
}[] = [
  { kind: "bank", label: "Faysal Bank", holder: "PHARMACOZYME (PRIVATE) LIMITED", value: "3573499000006913", copy: "3573499000006913" },
  { kind: "wallet", label: "EasyPaisa", holder: "Aftab Alam", value: "0340 1940 624", copy: "03401940624" },
  {
    kind: "paypal",
    label: "PayPal",
    holder: "Mehwish Kanwal",
    value: "@PharmacozymeOfficial",
    copy: "@PharmacozymeOfficial",
    link: "https://paypal.me/PharmacozymeOfficial",
  },
];

/** Short code a student can quote, made from the booking's id. Shown on the thank-you page and in the admin list. */
export function bookingRef(id: string | null | undefined): string | null {
  const hex = (id ?? "").replace(/[^0-9a-fA-F]/g, "");
  return hex.length >= 6 ? `PZM-${hex.slice(0, 6).toUpperCase()}` : null;
}

/** Reads a reference from the address bar. Anything not shaped like PZM-XXXXXX is ignored. */
export function parseBookingRef(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toUpperCase();
  return /^PZM-[0-9A-F]{6}$/.test(v) ? v : null;
}

export const SCREENSHOT_TYPES = ["image/jpeg", "image/png", "application/pdf"] as const;
export const SCREENSHOT_MAX_BYTES = 5 * 1024 * 1024;

/** Same rule as before: JPG, PNG or PDF, up to 5 MB. Returns a plain message, or null when the file is fine. */
export function screenshotProblem(file: { type: string; size: number }): string | null {
  if (!(SCREENSHOT_TYPES as readonly string[]).includes(file.type)) return "Please choose a JPG, PNG or PDF file.";
  if (file.size > SCREENSHOT_MAX_BYTES) return "This file is too big. Please keep it under 5 MB.";
  return null;
}

/** Returns the package name only when the mentor really offers it. */
export function pickPackage(packages: { name: string }[], requested: string | string[] | undefined | null): string {
  if (typeof requested !== "string") return "";
  return packages.some((p) => p.name === requested) ? requested : "";
}

/** 1 = choose package, 2 = pay, 3 = upload proof and send. */
export function bookingStep(packageName: string, hasScreenshot: boolean): 1 | 2 | 3 {
  if (!packageName) return 1;
  return hasScreenshot ? 3 : 2;
}
