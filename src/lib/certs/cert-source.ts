import "server-only";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import {
  mapCert,
  normEmail,
  type CertBatch,
  type CertCategory,
  type CertRecord,
} from "./cert-model";

// Read-only access to the separate certificate app's Firestore.
// Only .get() reads are used here, on purpose.

const APP_NAME = "cert-readonly";
// Long on purpose: the free plan has a daily read limit that the certificate
// app also needs for making certificates.
const TTL_MS = 6 * 60 * 60_000;
const BACKOFF_MS = 30 * 60_000;
const IN_LIMIT = 30;
let blockedUntil = 0;

export class CertSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CertSourceError";
  }
}

const NOT_CONNECTED = "Certificates app is not connected yet.";
const UNREACHABLE = "Could not reach the Certificates app.";

function certApp(): App {
  const existing = getApps().find((a) => a.name === APP_NAME);
  if (existing) return existing;
  const raw = process.env.CERT_FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new CertSourceError(NOT_CONNECTED);
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64").toString("utf-8")) as Record<
      string,
      unknown
    >;
    const projectId = parsed.project_id;
    const clientEmail = parsed.client_email;
    const privateKey = parsed.private_key;
    if (
      typeof projectId !== "string" ||
      typeof clientEmail !== "string" ||
      typeof privateKey !== "string"
    ) {
      throw new Error("incomplete");
    }
    return initializeApp(
      {
        credential: cert({
          projectId,
          clientEmail,
          privateKey: privateKey.replace(/\\n/g, "\n"),
        }),
        projectId,
      },
      APP_NAME,
    );
  } catch {
    throw new CertSourceError(NOT_CONNECTED);
  }
}

function toBatch(id: string, d: Record<string, unknown>): CertBatch {
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const cat = s(d.category);
  return {
    id,
    name: s(d.name),
    category: cat === "General" || cat === "Official" ? (cat as CertCategory) : "Other",
    subCategory: s(d.subCategory),
    topic: s(d.topic),
    createdAt: toIso(d.createdAt),
  };
}

// createdAt may be a string or a Firestore Timestamp; keep it as an ISO/plain string.
function toIso(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (v && typeof v === "object") {
    const o = v as { toDate?: () => Date; seconds?: number; _seconds?: number };
    try {
      if (typeof o.toDate === "function") return o.toDate().toISOString();
    } catch {
      return "";
    }
    const secs = typeof o.seconds === "number" ? o.seconds : o._seconds;
    if (typeof secs === "number") return new Date(secs * 1000).toISOString();
  }
  return "";
}

async function load(): Promise<CertRecord[]> {
  const app = certApp();
  try {
    const db = getFirestore(app);
    // Free plan: every document read counts. Read the few databases first, then
    // only the certificates inside live ones (never the whole collection).
    const dbSnap = await db.collection("databases").get();
    // Only live databases count, like the certificate app's own public pages.
    const batches = new Map<string, CertBatch>(
      dbSnap.docs
        .filter((d) => (d.data() as Record<string, unknown>).isLive === true)
        .map((d) => [d.id, toBatch(d.id, d.data() as Record<string, unknown>)] as const),
    );
    const ids = Array.from(batches.keys());
    const certDocs: { id: string; data: () => unknown }[] = [];
    for (let i = 0; i < ids.length; i += IN_LIMIT) {
      const snap = await db
        .collection("certificates")
        .where("databaseId", "in", ids.slice(i, i + IN_LIMIT))
        .get();
      certDocs.push(...snap.docs);
    }
    return certDocs
      .filter((d) => {
        const id = (d.data() as Record<string, unknown>).databaseId;
        return typeof id === "string" && batches.has(id.trim());
      })
      .map((d) => mapCert(d.id, d.data() as Record<string, unknown>, batches));
  } catch (err) {
    // Log only the error code and message, never the credentials.
    const e = err as { code?: unknown; message?: unknown };
    if (e.code === 8) blockedUntil = Date.now() + BACKOFF_MS;
    console.error("[cert-source] load failed", String(e.code ?? ""), String(e.message ?? "").slice(0, 300));
    throw new CertSourceError(UNREACHABLE);
  }
}

let cache: { at: number; data: CertRecord[] } | null = null;
let inflight: Promise<CertRecord[]> | null = null;

export async function getAllCerts(): Promise<CertRecord[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  // After a quota error, stop asking for a while (old data is better than none).
  if (Date.now() < blockedUntil) {
    if (cache) return cache.data;
    throw new CertSourceError(UNREACHABLE);
  }
  if (!inflight) {
    inflight = load()
      .then((data) => {
        cache = { at: Date.now(), data };
        return data;
      })
      .catch((err) => {
        if (cache) return cache.data;
        throw err;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export async function getCertsByEmail(email: string): Promise<CertRecord[]> {
  const want = normEmail(email);
  if (!want) return [];
  return (await getAllCerts()).filter((c) => normEmail(c.email) === want);
}

export function resetCertCacheForTests(): void {
  cache = null;
  inflight = null;
  blockedUntil = 0;
}
