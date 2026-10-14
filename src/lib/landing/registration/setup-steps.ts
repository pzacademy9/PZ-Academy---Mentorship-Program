// src/lib/landing/registration/setup-steps.ts
export const REG_STEPS = [
  { key: "buy", label: "What people can buy" },
  { key: "groups", label: "Group discounts" },
  { key: "prices", label: "Prices by country" },
  { key: "earlybird", label: "Early Bird" },
  { key: "accounts", label: "Payment accounts" },
  { key: "promo", label: "Promo codes" },
  { key: "whatsapp", label: "WhatsApp groups" },
  { key: "details", label: "Form and messages" },
] as const;

export type RegistrationStepKey = (typeof REG_STEPS)[number]["key"];

/** Readiness problems for the registration form use this prefix in `Problem.sectionId`. */
export const REGISTRATION_TARGET = "registration:";

export function registrationTarget(step: RegistrationStepKey): string {
  return `${REGISTRATION_TARGET}${step}`;
}

export function parseRegistrationTarget(id: string): RegistrationStepKey | null {
  if (!id.startsWith(REGISTRATION_TARGET)) return null;
  const s = id.slice(REGISTRATION_TARGET.length);
  return REG_STEPS.some((x) => x.key === s) ? (s as RegistrationStepKey) : null;
}
