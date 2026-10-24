import { sha256Lower } from "@/lib/meta/capi-payload";

export type AudienceContact = {
  id: string;
  email: string | null;
  phoneE164: string | null;
  fullName: string;
  country: string | null;
  emailUnsubscribedAt: string | null;
  whatsappUnsubscribedAt: string | null;
  doNotContactAt: string | null;
  emailSuppressed: boolean;
};

export type MetaRow = {
  email: string;
  phone: string;
  fn: string;
  ln: string;
  country: string;
};

const HEADER = "email,phone,fn,ln,country";
const MAX_SLUG = 80;

function hashOrBlank(value: string): string {
  return value ? sha256Lower(value) : "";
}

export type PlainRow = MetaRow;

type AudienceItem = {
  email: string;
  phoneDigits: string;
  first: string;
  last: string;
  country: string;
};

// Shared privacy rules and dedupe for the hashed and plain exports.
function collectAudience(contacts: AudienceContact[]): {
  items: AudienceItem[];
  dropped: number;
} {
  const items: AudienceItem[] = [];
  const seen = new Set<string>();
  let dropped = 0;

  for (const c of contacts) {
    if (c.doNotContactAt) {
      dropped++;
      continue;
    }
    const emailReachable = !c.emailUnsubscribedAt && !c.emailSuppressed;
    const email = emailReachable ? (c.email ?? "").trim().toLowerCase() : "";
    const phoneDigits = c.whatsappUnsubscribedAt
      ? ""
      : (c.phoneE164 ?? "").replace(/\D/g, "");
    if (!email && !phoneDigits) {
      dropped++;
      continue;
    }

    const key = email ? `e:${email}` : `p:${phoneDigits}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const name = c.fullName.trim();
    const space = name.indexOf(" ");
    const first = space === -1 ? name : name.slice(0, space);
    const last = space === -1 ? "" : name.slice(space + 1).trim();
    const country = c.country?.trim() ?? "";

    items.push({
      email,
      phoneDigits,
      first,
      last,
      country: /^[A-Za-z]{2}$/.test(country) ? country : "",
    });
  }

  return { items, dropped };
}

export function buildMetaRows(contacts: AudienceContact[]): {
  rows: MetaRow[];
  dropped: number;
} {
  const { items, dropped } = collectAudience(contacts);
  const rows = items.map((i) => ({
    email: hashOrBlank(i.email),
    phone: hashOrBlank(i.phoneDigits),
    fn: hashOrBlank(i.first),
    ln: hashOrBlank(i.last),
    country: hashOrBlank(i.country),
  }));
  return { rows, dropped };
}

export function buildPlainRows(contacts: AudienceContact[]): {
  rows: PlainRow[];
  dropped: number;
} {
  const { items, dropped } = collectAudience(contacts);
  const rows = items.map((i) => ({
    email: i.email,
    phone: i.phoneDigits ? `+${i.phoneDigits}` : "",
    fn: i.first.replace(/\s+/g, " "),
    ln: i.last.replace(/\s+/g, " "),
    country: i.country.toUpperCase(),
  }));
  return { rows, dropped };
}

export function toMetaCsv(rows: MetaRow[]): string {
  const lines = rows.map((r) =>
    [r.email, r.phone, r.fn, r.ln, r.country].join(","),
  );
  return [HEADER, ...lines].join("\n") + "\n";
}

// Names come from sheets and can start with spreadsheet-formula characters.
function safeName(value: string): string {
  return value.replace(/^[=@+\-\t\r]+/, "");
}

function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toPlainCsv(rows: PlainRow[]): string {
  const lines = rows.map((r) =>
    [
      // A changed address would never match in Meta, so blank it instead of stripping.
      csvField(/^[=@+\-\t\r]/.test(r.email) ? "" : r.email),
      csvField(r.phone),
      csvField(safeName(r.fn)),
      csvField(safeName(r.ln)),
      csvField(r.country),
    ].join(","),
  );
  return [HEADER, ...lines].join("\n") + "\n";
}

export function metaCsvFilename(
  names: string[],
  date: Date,
  variant: "hashed" | "plain" = "hashed",
): string {
  const slug = names
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG)
    .replace(/-+$/g, "");
  const day = date.toISOString().slice(0, 10);
  return `${slug}${variant === "plain" ? "-plain" : ""}-meta-audience-${day}.csv`;
}
