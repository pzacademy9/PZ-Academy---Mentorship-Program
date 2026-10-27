/** Shape of a PZ ID: letters, a dash, then at least four digits (e.g. Hamid-4821). */
export const PZ_ID_SHAPE = /^[A-Za-z]+-\d{4,}$/;

/** Trims, lowercases and removes all whitespace so "HAMID - 4821" matches "hamid-4821". */
export function normalizePzId(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, "");
}

/**
 * Masks an email for display: keeps up to 2 characters of the local part,
 * then *** and the domain. "" stays "", and input without "@" becomes "***".
 */
export function maskEmail(raw: string): string {
  const email = raw.trim();
  if (email === "") return "";
  const at = email.indexOf("@");
  if (at < 0) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at);
  return `${local.slice(0, 2)}***${domain}`;
}
