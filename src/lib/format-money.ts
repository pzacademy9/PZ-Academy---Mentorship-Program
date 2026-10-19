/** "PKR 5,000"; a missing amount shows as a dash. */
export function formatMoney(amount: number | null, currency: string): string {
  if (amount === null || !Number.isFinite(amount)) return "—";
  return `${currency} ${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}
