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

export function buildMetaRows(contacts: AudienceContact[]): {
  rows: MetaRow[];
  dropped: number;
} {
  const rows: MetaRow[] = [];
  const seen = new Set<string>();
  let dropped = 0;

  for (const c of contacts) {
    if (c.doNotContactAt) {
      dropped++;
      continue;
    }
    const emailReachable = !c.emailUnsubscribedAt && !c.emailSuppressed;
    const email = emailReachable ? hashOrBlank((c.email ?? "").trim()) : "";
    const phone = c.whatsappUnsubscribedAt
      ? ""
      : hashOrBlank((c.phoneE164 ?? "").replace(/\D/g, ""));
    if (!email && !phone) {
      dropped++;
      continue;
    }

    const key = email ? `e:${email}` : `p:${phone}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const name = c.fullName.trim();
    const space = name.indexOf(" ");
    const first = space === -1 ? name : name.slice(0, space);
    const last = space === -1 ? "" : name.slice(space + 1).trim();
    const country = c.country?.trim() ?? "";

    rows.push({
      email,
      phone,
      fn: hashOrBlank(first),
      ln: hashOrBlank(last),
      country: /^[A-Za-z]{2}$/.test(country) ? sha256Lower(country) : "",
    });
  }

  return { rows, dropped };
}

export function toMetaCsv(rows: MetaRow[]): string {
  const lines = rows.map((r) =>
    [r.email, r.phone, r.fn, r.ln, r.country].join(","),
  );
  return [HEADER, ...lines].join("\n") + "\n";
}

export function metaCsvFilename(names: string[], date: Date): string {
  const slug = names
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG)
    .replace(/-+$/g, "");
  const day = date.toISOString().slice(0, 10);
  return `${slug}-meta-audience-${day}.csv`;
}
