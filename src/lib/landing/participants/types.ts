import type { RegistrationStatus } from "@/lib/landing/registration/config";

export type Channel = "email" | "whatsapp";

/** Member candidates carry the lead's refId and status. */
export type Candidate = {
  registrationId: string;
  leadId: string;
  isMember: boolean;
  name: string;
  email: string;
  phone: string;
  refId: string;
  status: RegistrationStatus;
};

export type SkipReason = "no_email" | "no_phone" | "unsubscribed" | "merged";

export type Summary = {
  total: number;
  byStatus: Record<RegistrationStatus, number>;
  notPaid: number;
  skipped: Record<SkipReason, number>;
  members: number;
};
