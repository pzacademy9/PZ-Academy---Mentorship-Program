/** Pure helpers for messaging and searching affiliates. Safe to import in client code. */

export function renderTemplate(text: string, v: { name: string; code: string | null }): string {
  return text.replace(/\{name\}/g, () => v.name).replace(/\{code\}/g, () => v.code || "your code");
}

/** Digits only. Leading 00 dropped; a single leading 0 becomes 92. Under 8 digits is not a number. */
export function whatsappDigits(raw: string): string | null {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0")) d = "92" + d.slice(1);
  return d.length < 8 ? null : d;
}

export function whatsappHref(raw: string, text: string): string | null {
  const d = whatsappDigits(raw);
  return d ? `https://wa.me/${d}?text=${encodeURIComponent(text)}` : null;
}

export function mailtoHref(email: string, subject: string, body: string): string {
  const enc = (s: string) => encodeURIComponent(s.replace(/\r\n|\r|\n/g, "\n")).replace(/%0A/g, "%0D%0A");
  return `mailto:${email}?subject=${enc(subject)}&body=${enc(body)}`;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export function searchAffiliates<T extends { name: string; email: string; code: string | null }>(rows: T[], q: string): T[] {
  const n = norm(q);
  if (!n) return rows;
  return rows.filter((r) => norm(r.name).includes(n) || norm(r.email).includes(n) || norm(r.code ?? "").includes(n));
}
