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
  batchCreatedAt: string;
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
  createdAt: string;
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
  const s = str(v).toLowerCase();
  if (s === "general") return "General";
  if (s === "official") return "Official";
  return "Other";
}

// Match a stored sub-category to its canonical spelling, ignoring case; unknown text is kept as is.
function toSubCategory(category: CertCategory | "Other", v: unknown): string {
  const s = str(v);
  if (category === "Other") return s;
  const hit = CATEGORY_SUBCATS[category].find((k) => k.toLowerCase() === s.toLowerCase());
  return hit ?? s;
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
  const topic = str(batch?.topic) || str(raw.topic);
  const rawStatus = str(raw.status).toLowerCase();
  const status = (STATUSES as readonly string[]).includes(rawStatus)
    ? (rawStatus as CertStatus)
    : "pending";
  // The database is what the certificate app organises by, so its category wins when it has one.
  const category =
    batch && batch.category !== "Other" ? batch.category : toCategory(raw.category);
  const subCategory = toSubCategory(
    category,
    batch && batch.category !== "Other" && batch.subCategory ? batch.subCategory : raw.subCategory,
  );
  const issue = raw.issueDate;
  return {
    id,
    certId,
    name: str(raw.recipientName),
    email: str(raw.recipientEmail),
    category,
    subCategory,
    topic,
    batchId,
    batchName: batch?.name || topic,
    batchCreatedAt: batch?.createdAt ?? "",
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
  if (da !== db) return da > db ? -1 : 1;
  return a.certId.localeCompare(b.certId);
}

export type CertQuery = {
  category?: CertCategory;
  subCategory?: string;
  batchId?: string;
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
  };
} {
  const needle = (q.search ?? "").trim().toLowerCase();
  const matches = (c: CertRecord): boolean => {
    if (q.category && c.category !== q.category) return false;
    if (q.subCategory && c.subCategory !== q.subCategory) return false;
    if (q.batchId && c.batchId !== q.batchId) return false;
    if (needle) {
      const hay = `${c.name}
${c.email}
${c.certId}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  };

  // Counts describe what each tab and chip holds, so they ignore the open batch, the search and the sub-category.
  const byCategory: Record<string, number> = { General: 0, Official: 0 };
  const bySubCategory: Record<string, number> = {};
  for (const c of all) {
    byCategory[c.category] = (byCategory[c.category] ?? 0) + 1;
    if (!q.category || c.category === q.category) {
      bySubCategory[c.subCategory] = (bySubCategory[c.subCategory] ?? 0) + 1;
    }
  }

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
      bySubCategory,
    },
  };
}

export function batchesFor(
  all: CertRecord[],
  category: CertCategory,
  subCategory?: string,
): CertBatchCard[] {
  const map = new Map<string, CertBatchCard>();
  for (const c of all) {
    if (c.category !== category) continue;
    if (subCategory && c.subCategory !== subCategory) continue;
    const cur = map.get(c.batchId);
    if (cur) cur.count += 1;
    else
      map.set(c.batchId, {
        id: c.batchId,
        name: c.batchName,
        topic: c.topic,
        subCategory: c.subCategory,
        createdAt: c.batchCreatedAt,
        count: 1,
      });
  }
  // Newest database first; undated ones last, then by name.
  return Array.from(map.values()).sort((a, b) => {
    const da = dateMs(a.createdAt);
    const db = dateMs(b.createdAt);
    if (da !== db) return da > db ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export type CertBatchCard = {
  id: string;
  name: string;
  topic: string;
  subCategory: string;
  createdAt: string;
  count: number;
};
