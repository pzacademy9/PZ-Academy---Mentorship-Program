// Words shown after a registration and on the status page, kept pure so every case is unit-tested.
import type { Mode } from "./config";
import type { RegistrationStatus } from "@/lib/landing/registration/config";

export function successCopy(p: { mode: Mode; isFree: boolean; email: string; eventLabel: string; hasGroups: boolean }): {
  title: string; subtitle: string; steps: string[];
} {
  if (p.isFree) {
    return {
      title: "You're registered!",
      subtitle: `You're in for ${p.eventLabel || "this event"}. Your joining details are on their way to ${p.email}.`,
      steps: [
        "Check your email for the joining details. If you can't find it, look in Promotions or Spam.",
        p.hasGroups
          ? "Join the WhatsApp group below. The live link is shared there before the session."
          : "Keep your reference number in case you need to contact us.",
      ],
    };
  }
  if (p.mode === "recorded") {
    return {
      title: "Receipt submitted!",
      subtitle: "Your payment is under review. Once it is verified, you'll get your learning portal link by email within 24 hours.",
      steps: [
        "We check your payment receipt (within 24 hours).",
        "You get your learning portal link by email. Watch anytime.",
        "Watch the recorded lectures, complete the quizzes and claim your certificate.",
      ],
    };
  }
  return {
    title: "Registration submitted!",
    subtitle: "Your payment receipt is under review. We'll confirm by email within 24 hours.",
    steps: [
      "We check your payment receipt (within 24 hours).",
      "You get a confirmation email.",
      p.hasGroups
        ? "Join the WhatsApp group: all session updates are shared there."
        : "Session details are sent by email before the first class.",
    ],
  };
}

export type StatusTone = "pending" | "ok" | "attention";
export interface StatusView { tone: StatusTone; pill: string; title: string; body: string; showWhatsApp: boolean }

export function statusView(status: RegistrationStatus): StatusView {
  switch (status) {
    case "paid":
      return { tone: "ok", pill: "Paid", title: "Your registration is confirmed", body: "Your payment is confirmed. Check your email for the joining details.", showWhatsApp: false };
    case "free":
      return { tone: "ok", pill: "Registered", title: "You're registered", body: "Check your email for the joining details.", showWhatsApp: false };
    case "underpaid":
      return { tone: "attention", pill: "Needs attention", title: "The amount doesn't match", body: "The amount we received is less than the amount due. Please message us on WhatsApp so we can sort it out.", showWhatsApp: true };
    case "reserved":
      return { tone: "attention", pill: "Needs attention", title: "Your seat is reserved", body: "Your seat is held for you. Our team will contact you about the remaining payment, or message us on WhatsApp.", showWhatsApp: true };
    case "pending":
    default:
      return { tone: "pending", pill: "Pending", title: "We're checking your payment", body: "We have your registration and are checking your payment. This usually takes up to 24 hours.", showWhatsApp: false };
  }
}

/** Message for a failed status lookup. 0 means the request never reached the server. */
export function lookupMessage(httpStatus: number): string {
  if (httpStatus === 404) return "We couldn't find a registration with that reference number and email. Check both and try again.";
  if (httpStatus === 400) return "Check the reference number and email, then try again.";
  if (httpStatus === 429) return "Too many tries. Please wait a few minutes and try again.";
  if (httpStatus === 0) return "We couldn't reach our server. Check your connection and try again.";
  return "Something went wrong on our side. Please try again in a moment.";
}
