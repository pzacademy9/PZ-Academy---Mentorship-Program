import {
  CheckCircle2,
  XCircle,
  CircleSlash,
  Armchair,
  Unlock,
  Megaphone,
  Info,
  type LucideIcon,
} from "lucide-react";

/**
 * Visual treatment per notification type, following the Stitch "Notifications
 * & Toasts Showcase" screen (`6cc711b161b14fcda6c364ba9af52bff`): a tinted
 * circle carrying the icon, in success / warning / info tones.
 *
 * Shared by the bell dropdown and the history page so the two never drift.
 *
 * notifications.type is a free-text column, not an enum, so an unrecognised
 * value must still render — resolveNotificationStyle falls back to a neutral
 * info treatment rather than an empty circle.
 */
const TYPE_STYLES: Record<string, { icon: LucideIcon; circle: string }> = {
  enrollment_approved: { icon: CheckCircle2, circle: "bg-pz-primary/15 text-pz-primary" },
  enrollment_reserved: { icon: Armchair, circle: "bg-pz-gold/15 text-pz-gold" },
  enrollment_rejected: {
    icon: XCircle,
    circle: "bg-pz-error-container text-pz-on-error-container",
  },
  enrollment_expired: {
    icon: CircleSlash,
    circle: "bg-pz-surface-container-high text-pz-on-surface-variant",
  },
  lesson_unlocked: { icon: Unlock, circle: "bg-pz-primary/15 text-pz-primary" },
  admin_message: { icon: Megaphone, circle: "bg-pz-secondary-container/40 text-pz-secondary" },
};

const FALLBACK: { icon: LucideIcon; circle: string } = {
  icon: Info,
  circle: "bg-pz-outline-variant/30 text-pz-on-surface-variant",
};

export function resolveNotificationStyle(type: string): { icon: LucideIcon; circle: string } {
  return TYPE_STYLES[type] ?? FALLBACK;
}
