/** Pure (no server-only imports): also used by client components. */
export type ManualEmailKind = "received" | "paid" | "underpaid" | "reserved";

/** Which status emails an admin may send again to a row. Members only ever get Received and Paid. */
export function manualKindsFor(rowType: "individual" | "lead" | "member"): ManualEmailKind[] {
  return rowType === "member" ? ["received", "paid"] : ["received", "paid", "underpaid", "reserved"];
}

/** email_status value once the "received" email reached this person (makes retries idempotent). */
export const RECEIVED_SENT = "received_sent";
