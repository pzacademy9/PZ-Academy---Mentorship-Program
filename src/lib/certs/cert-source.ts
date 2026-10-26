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
const TTL_MS = 60_000;

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
          privateKey: privateKey.replace(/\n/g, "\n"),
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
  };
}

async function load(): Promise<CertRecord[]> {
  const app = certApp();
  try {
    const db = getFirestore(app);
    const [certSnap, dbSnap] = await Promise.all([
      db.collection("certificates").get(),
      db.collection("databases").get(),
    ]);
    const batches = new Map<string, CertBatch>(
      dbSnap.docs.map((d) => [d.id, toBatch(d.id, d.data() as Record<string, unknown>)] as const),
    );
    return certSnap.docs.map((d) => mapCert(d.id, d.data() as Record<string, unknown>, batches));
  } catch {
    throw new CertSourceError(UNREACHABLE);
  }
}

let cache: { at: number; data: CertRecord[] } | null = null;
let inflight: Promise<CertRecord[]> | null = null;

export async function getAllCerts(): Promise<CertRecord[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  if (!inflight) {
    inflight = load()
      .then((data) => {
        cache = { at: Date.now(), data };
        return data;
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
}
