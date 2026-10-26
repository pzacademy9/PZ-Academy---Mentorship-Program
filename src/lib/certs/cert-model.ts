// Pure model for certificates read from the separate certificate app.
// No I/O and no Firestore imports here.

export type CertCategory = "General" | "Official";

export const CATEGORY_SUBCATS: Record<CertCategory, readonly string[]> = {
  General: ["Courses", "Workshops", "Webinars", "MED-Q"],
  Official: ["Central Team", "Sub Team", "Ambassadors", "Affiliates", "Mentors"],
};

export type CertStatus = "pending" | "generated" | "sent" | "revoked";

export type CertRecord = {
  id: string;
  certId: string;
  name: string;
  email: string;
  category: CertCategory | "Other";
  subCategory: string;
  topic: string;
  batchId: string;
  batchName: string;
  issueDate: string;
  status: CertStatus;
  viewUrl: string;
};

export type CertBatch = {
  id: string;
  name: string;
  category: CertCategory | "Other";
  subCategory: string;
  topic: string;
};

const STATUSES: readonly CertStatus[] = ["pending", "generated", "sent", "revoked"];
const VERIFY_BASE = "https://cert.pharmacozyme.com/verify?certId=";

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

// Only https links are trusted; anything else (javascript:, data:, http:, garbage) is dropped.
function httpsUrl(v: unknown): string {
  const s = str(v);
  try {
    return new URL(s).protocol === "https:" ? s : "";
  } catch {
    return "";
  }
}

function toCategory(v: unknown): CertCategory | "Other" {
  const s = str(v);
  return s === "General" || s === "Official" ? s : "Other";
}

export function normEmail(v: string | null | undefined): string {
  return (v ?? "").trim().toLowerCase();
}

export function mapCert(
  id: string,
  raw: Record<string, unknown>,
  batches: Map<string, CertBatch>,
): CertRecord {
  const certId = str(raw.uniqueCertId) || id;
  const batchId = str(raw.databaseId);
  const batch = batches.get(batchId);
  const topic = str(raw.topic);
  const rawStatus = str(raw.status);
  const status = (STATUSES as readonly string[]).includes(rawStatus)
    ? (rawStatus as CertStatus)
    : "pending";
  const issue = raw.issueDate;
  return {
    id,
    certId,
    name: str(raw.recipientName),
    email: str(raw.recipientEmail),
    category: toCategory(raw.category),
    subCategory: str(raw.subCategory),
    topic,
    batchId,
    batchName: batch?.name || topic,
    issueDate: typeof issue === "string" ? issue.trim() : "",
    status,
    viewUrl: httpsUrl(raw.verificationUrl) || VERIFY_BASE + encodeURIComponent(certId),
  };
}

export function isIssuedForStudent(c: CertRecord): boolean {
  return c.status === "generated" || c.status === "sent";
}

function dateMs(s: string): number {
  const t = Date.parse(s);
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
}

// Newest first; unparsable dates sort last.
function byNewest(a: CertRecord, b: CertRecord): number {
  const da = dateMs(a.issueDate);
  const db = dateMs(b.issueDate);
  if (da === db) return 0;
  return da > db ? -1 : 1;
}

export function groupCerts(
  certs: CertRecord[],
): { category: CertCategory | "Other"; groups: { subCategory: string; certs: CertRecord[] }[] }[] {
  const order: (CertCategory | "Other")[] = ["General", "Official", "Other"];
  const out: {
    category: CertCategory | "Other";
    groups: { subCategory: string; certs: CertRecord[] }[];
  }[] = [];
  for (const category of order) {
    const inCat = certs.filter((c) => c.category === category);
    if (inCat.length === 0) continue;
    const known: readonly string[] = category === "Other" ? [] : CATEGORY_SUBCATS[category];
    const subs = [...known];
    for (const c of inCat) if (!subs.includes(c.subCategory)) subs.push(c.subCategory);
    const groups = subs
      .map((subCategory) => ({
        subCategory,
        certs: inCat.filter((c) => c.subCategory === subCategory).sort(byNewest),
      }))
      .filter((g) => g.certs.length > 0);
    out.push({ category, groups });
  }
  return out;
}

export type CertQuery = {
  category?: CertCategory;
  subCategory?: string;
  batchId?: string;
  status?: CertStatus;
  search?: string;
  page?: number;
  pageSize?: number;
};

export function queryCerts(
  all: CertRecord[],
  q: CertQuery,
): {
  rows: CertRecord[];
  total: number;
  page: number;
  pageCount: number;
  counts: {
    byCategory: Record<string, number>;
    bySubCategory: Record<string, number>;
    byStatus: Record<string, number>;
  };
} {
  const needle = (q.search ?? "").trim().toLowerCase();
  const matches = (c: CertRecord, skip?: "category" | "subCategory" | "status"): boolean => {
    if (skip !== "category" && q.category && c.category !== q.category) return false;
    if (skip !== "subCategory" && q.subCategory && c.subCategory !== q.subCategory) return false;
    if (q.batchId && c.batchId !== q.batchId) return false;
    if (skip !== "status" && q.status && c.status !== q.status) return false;
    if (needle) {
      const hay = `${c.name}\n${c.email}\n${c.certId}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  };

  const tally = (key: (c: CertRecord) => string, skip: "category" | "subCategory" | "status") => {
    const out: Record<string, number> = {};
    for (const c of all) {
      if (!matches(c, skip)) continue;
      const k = key(c);
      out[k] = (out[k] ?? 0) + 1;
    }
    return out;
  };

  const byCategory = tally((c) => c.category, "category");
  // Always show both real categories, even at zero.
  for (const k of ["General", "Official"]) byCategory[k] ??= 0;

  const filtered = all.filter((c) => matches(c)).sort(byNewest);
  const total = filtered.length;
  const pageSize = q.pageSize && q.pageSize > 0 ? Math.floor(q.pageSize) : 25;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const wanted = Number.isFinite(q.page) ? Math.floor(q.page as number) : 1;
  const page = Math.min(Math.max(1, wanted), pageCount);

  return {
    rows: filtered.slice((page - 1) * pageSize, page * pageSize),
    total,
    page,
    pageCount,
    counts: {
      byCategory,
      bySubCategory: tally((c) => c.subCategory, "subCategory"),
      byStatus: tally((c) => c.status, "status"),
    },
  };
}

export function batchesFor(
  all: CertRecord[],
  category: CertCategory,
  subCategory?: string,
): { id: string; name: string; topic: string; count: number }[] {
  const map = new Map<string, { id: string; name: string; topic: string; count: number }>();
  for (const c of all) {
    if (c.category !== category) continue;
    if (subCategory && c.subCategory !== subCategory) continue;
    const cur = map.get(c.batchId);
    if (cur) cur.count += 1;
    else map.set(c.batchId, { id: c.batchId, name: c.batchName, topic: c.topic, count: 1 });
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}
