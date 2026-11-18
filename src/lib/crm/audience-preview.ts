import {
  buildPlainRows,
  metaCsvFilename,
  type AudienceContact,
} from "@/lib/crm/meta-audience";
import {
  describeAudienceFilter,
  type AudienceFilter,
} from "@/lib/crm/audience-filter";

const PREVIEW_LIMIT = 10;

export type PreviewPerson = { name: string; email: string; country: string };

export type AudiencePreview = {
  people: PreviewPerson[];
  inFile: number;
  leftOut: { noContact: number; doNotContact: number };
  columns: string[];
  fileName: string;
};

/** Hides most of an email so a preview never shows a full address. */
export function maskEmail(email: string | null): string {
  if (!email) return "";
  const at = email.indexOf("@");
  if (at === -1) return `${email.charAt(0)}***`;
  return `${email.charAt(0)}***${email.slice(at)}`;
}

export function buildAudiencePreview(
  contacts: AudienceContact[],
  filter: AudienceFilter,
  now: Date,
): AudiencePreview {
  const { rows, leftOut } = buildPlainRows(contacts);
  const people = rows.slice(0, PREVIEW_LIMIT).map((r) => ({
    name: `${r.fn} ${r.ln}`.trim(),
    email: maskEmail(r.email),
    country: r.country,
  }));
  return {
    people,
    inFile: rows.length,
    leftOut: { noContact: leftOut.noContact, doNotContact: leftOut.doNotContact },
    columns: ["Email", "Phone", "First name", "Last name", "Country"],
    fileName: metaCsvFilename(describeAudienceFilter(filter), now, "hashed"),
  };
}
