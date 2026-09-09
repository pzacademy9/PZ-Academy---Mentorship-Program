/**
 * Merge tag rendering for campaign bodies. Pure — no I/O.
 *
 * Unknown tags are left verbatim rather than blanked, so a typo is visible
 * in the test send instead of silently producing a gap in three thousand
 * emails.
 */

type MergeContext = { fullName: string; email: string | null };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderMergeTags(template: string, contact: MergeContext): string {
  const firstName = contact.fullName.trim().split(/\s+/)[0] ?? "";

  const values: Record<string, string> = {
    // "there" keeps a greeting grammatical when the sheet had no name.
    first_name: firstName === "" ? "there" : firstName,
    full_name: contact.fullName.trim() === "" ? "there" : contact.fullName.trim(),
    email: contact.email ?? "",
  };

  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => {
    const value = values[key];
    return value === undefined ? match : escapeHtml(value);
  });
}
