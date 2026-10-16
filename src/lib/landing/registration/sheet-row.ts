// src/lib/landing/registration/sheet-row.ts
// One registration row -> one Sheet row, in the legacy column order (A-T) plus U-W and X (Link: the variant path, "" for the main page).
import type { RegistrationStatus } from "./config";

export const SHEET_HEADERS: string[] = [
  "Name", "Email", "WhatsApp", "Profession", "Discovery", "Registration Option", "Consent", "Row Type", "Promo Code",
  "Voucher URL", "Submitted At", "Expected Amount", "Group Lead Email", "Payment Method", "Amount", "Payment Confirmation",
  "Email Confirmation", "Source", "Ref ID", "Region", "Agent", "Promo Code Used", "UTM Campaign", "Link",
];

export type SheetRowType = "individual" | "lead" | "member";

export interface SheetRegistration {
  rowType: SheetRowType;
  name: string;
  email: string;
  whatsapp: string;
  profession: string;
  discovery: string;
  optionLabel: string;
  promoCodeText: string;       // what the person typed
  promoCodeUsed: string;       // the validated code, "" when none applied
  voucherUrl: string;
  submittedAt: string;         // ISO-8601
  expectedAmount: number;      // whole-registration total; not shown on member rows
  currency: string;
  groupLeadEmail: string;      // lead's email on lead + member rows, own email on individual rows
  paymentMethodLabel: string;  // e.g. "Faysal Bank"; "" for free
  amountReceived: number | null;
  status: RegistrationStatus;
  emailStatus: string;
  source: string;
  refId: string;               // members carry the LEAD's ref
  regionKey: string;
  agentName: string;
  utmCampaign: string;
  variantKey: string;          // "" for the main page, e.g. "uae/module-2" for a variant
}

export const ROW_TYPE_LABELS: Record<SheetRowType, string> = { individual: "Individual", lead: "Group Lead", member: "Group Member" };
export const STATUS_LABELS: Record<RegistrationStatus, string> = { pending: "Pending", paid: "Paid", underpaid: "Underpaid", reserved: "Reserved", free: "Free" };

/** Sheets turns a value starting with = + - @ (or a tab/CR) into a formula; a leading ' keeps it as text. */
export function sheetSafe(v: string): string {
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

const PKT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Karachi", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

export function formatSubmittedAt(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const parts = Object.fromEntries(PKT.formatToParts(new Date(t)).map((p) => [p.type, p.value]));
  return `${parts.day} ${parts.month} ${parts.year}, ${parts.hour}:${parts.minute} PKT`;
}

export function toSheetRow(r: SheetRegistration): string[] {
  const member = r.rowType === "member";
  const cells = [
    r.name,                                                          // A Name
    r.email,                                                         // B Email
    r.whatsapp,                                                      // C WhatsApp
    r.profession,                                                    // D Profession
    r.discovery,                                                     // E Discovery
    r.optionLabel,                                                   // F Registration Option
    member ? "Covered by Group Lead consent" : "Yes — accepted T&C", // G Consent
    ROW_TYPE_LABELS[r.rowType],                                      // H Row Type
    r.promoCodeText,                                                 // I Promo Code
    r.voucherUrl,                                                    // J Voucher URL
    formatSubmittedAt(r.submittedAt),                                // K Submitted At
    member ? "" : `${r.currency} ${r.expectedAmount}`,               // L Expected Amount
    r.groupLeadEmail,                                                // M Group Lead Email
    r.paymentMethodLabel,                                            // N Payment Method
    r.amountReceived === null ? "" : String(r.amountReceived),       // O Amount
    STATUS_LABELS[r.status],                                         // P Payment Confirmation
    r.emailStatus,                                                   // Q Email Confirmation
    r.source,                                                        // R Source
    r.refId,                                                         // S Ref ID
    r.regionKey,                                                     // T Region
    r.agentName,                                                     // U Agent
    r.promoCodeUsed,                                                 // V Promo Code Used
    r.utmCampaign,                                                   // W UTM Campaign
    r.variantKey,                                                    // X Link
  ];
  return cells.map((c) => sheetSafe(c));
}
