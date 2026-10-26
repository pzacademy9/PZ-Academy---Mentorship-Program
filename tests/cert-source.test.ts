import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const gets = vi.hoisted(() => ({
  certificates: vi.fn(),
  databases: vi.fn(),
}));
const initializeApp = vi.hoisted(() =>
  vi.fn((_opts: unknown, _name: string) => ({ name: "cert-readonly" })),
);
const getApps = vi.hoisted(() => vi.fn(() => [] as { name: string }[]));
const cert = vi.hoisted(() => vi.fn((sa: unknown) => sa));
const getFirestore = vi.hoisted(() =>
  vi.fn(() => ({
    collection: (name: "certificates" | "databases") => ({ get: gets[name] }),
  })),
);

vi.mock("firebase-admin/app", () => ({ initializeApp, getApps, cert }));
vi.mock("firebase-admin/firestore", () => ({ getFirestore }));

import {
  CertSourceError,
  getAllCerts,
  getCertsByEmail,
  resetCertCacheForTests,
} from "@/lib/certs/cert-source";

const snap = (docs: { id: string; data: Record<string, unknown> }[]) => ({
  docs: docs.map((d) => ({ id: d.id, data: () => d.data })),
});

const SA = { project_id: "p", client_email: "a@p.iam", private_key: "k\nk" };

function seed() {
  gets.certificates.mockResolvedValue(
    snap([
      {
        id: "c1",
        data: {
          databaseId: "db1",
          uniqueCertId: "PZ-1",
          recipientName: "Ayesha",
          recipientEmail: "ayesha@x.com",
          category: "General",
          subCategory: "Courses",
          topic: "Topic A",
          status: "sent",
          issueDate: "2026-01-01",
        },
      },
    ]),
  );
  gets.databases.mockResolvedValue(
    snap([{ id: "db1", data: { name: "Batch One", category: "General", isLive: true } }]),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  getApps.mockReturnValue([]);
  resetCertCacheForTests();
  process.env.CERT_FIREBASE_SERVICE_ACCOUNT_JSON = Buffer.from(JSON.stringify(SA)).toString(
    "base64",
  );
  seed();
});

afterEach(() => {
  vi.useRealTimers();
  delete process.env.CERT_FIREBASE_SERVICE_ACCOUNT_JSON;
});

describe("cert-source", () => {
  it("maps certs joined with database names and uses a named app", async () => {
    const certs = await getAllCerts();
    expect(certs).toHaveLength(1);
    expect(certs[0]).toMatchObject({ id: "c1", batchName: "Batch One", status: "sent" });
    expect(initializeApp).toHaveBeenCalledTimes(1);
    expect(initializeApp.mock.calls[0][1]).toBe("cert-readonly");
  });

  it("caches for 60 seconds", async () => {
    await getAllCerts();
    vi.advanceTimersByTime(59_000);
    await getAllCerts();
    expect(gets.certificates).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2_000);
    await getAllCerts();
    expect(gets.certificates).toHaveBeenCalledTimes(2);
    expect(gets.databases).toHaveBeenCalledTimes(2);
  });

  it("shares one load between concurrent callers", async () => {
    await Promise.all([getAllCerts(), getAllCerts()]);
    expect(gets.certificates).toHaveBeenCalledTimes(1);
  });

  it("matches email ignoring case and spaces", async () => {
    const found = await getCertsByEmail("  AYESHA@x.com ");
    expect(found).toHaveLength(1);
    expect(await getCertsByEmail("other@x.com")).toHaveLength(0);
  });

  it("rejects with a plain message when the env var is missing", async () => {
    delete process.env.CERT_FIREBASE_SERVICE_ACCOUNT_JSON;
    const err = await getAllCerts().catch((e) => e);
    expect(err).toBeInstanceOf(CertSourceError);
    expect(err.message).toBe("Certificates app is not connected yet.");
  });

  it("rejects when the env var is not valid", async () => {
    process.env.CERT_FIREBASE_SERVICE_ACCOUNT_JSON = "!!not-json!!";
    const err = await getAllCerts().catch((e) => e);
    expect(err).toBeInstanceOf(CertSourceError);
    expect(err.message).toBe("Certificates app is not connected yet.");
  });

  it("hides the underlying Firestore error", async () => {
    gets.certificates.mockRejectedValue(new Error("PERMISSION_DENIED secret-detail"));
    const err = await getAllCerts().catch((e) => e);
    expect(err).toBeInstanceOf(CertSourceError);
    expect(err.message).toBe("Could not reach the Certificates app.");
    expect(err.message).not.toContain("secret-detail");
  });

  it("does not cache a failed load", async () => {
    gets.certificates.mockRejectedValueOnce(new Error("boom"));
    await expect(getAllCerts()).rejects.toBeInstanceOf(CertSourceError);
    const certs = await getAllCerts();
    expect(certs).toHaveLength(1);
  });

  it("drops orphan certificates and certificates in non-live databases, keeps live ones", async () => {
    const c = (id: string, databaseId?: string) => ({
      id,
      data: { ...(databaseId ? { databaseId } : {}), uniqueCertId: id, recipientEmail: "a@x.com" },
    });
    gets.certificates.mockResolvedValue(
      snap([c("live", "db1"), c("orphan", "gone"), c("nodb"), c("dead", "db2"), c("flag", "db3")]),
    );
    gets.databases.mockResolvedValue(
      snap([
        { id: "db1", data: { name: "Live", isLive: true, createdAt: "2026-08-08" } },
        { id: "db2", data: { name: "Hidden", isLive: false } },
        { id: "db3", data: { name: "No flag" } },
      ]),
    );
    const certs = await getAllCerts();
    expect(certs.map((x) => x.id)).toEqual(["live"]);
    expect(certs[0].batchCreatedAt).toBe("2026-08-08");
    expect(await getCertsByEmail("a@x.com")).toHaveLength(1);
  });

  it("contains no Firestore write calls", () => {
    const src = readFileSync(path.resolve(__dirname, "../src/lib/certs/cert-source.ts"), "utf8");
    for (const m of [".set(", ".update(", ".add(", ".delete(", ".create(", ".commit(", ".batch("]) {
      expect(src.includes(m), `found ${m}`).toBe(false);
    }
  });
});
