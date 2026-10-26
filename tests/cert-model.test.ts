import { describe, expect, it } from "vitest";
import {
  batchesFor,
  isIssuedForStudent,
  mapCert,
  normEmail,
  queryCerts,
  type CertBatch,
  type CertRecord,
} from "@/lib/certs/cert-model";

const batches = new Map<string, CertBatch>([
  [
    "b1",
    { id: "b1", name: "Batch One", category: "General", subCategory: "Courses", topic: "Pharmacology", createdAt: "2026-02-01T00:00:00.000Z" },
  ],
]);

function raw(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    uniqueCertId: "PZ-2026-AAAA1111",
    recipientName: "Ayesha Khan",
    recipientEmail: "ayesha@x.com",
    category: "General",
    subCategory: "Courses",
    topic: "Pharmacology",
    databaseId: "b1",
    issueDate: "2026-03-01",
    status: "generated",
    pdfUrl: "https://drive.example/pdf",
    driveLink: "https://drive.example/link",
    ...extra,
  };
}

function rec(extra: Partial<CertRecord> = {}): CertRecord {
  return {
    id: "d1",
    certId: "PZ-2026-0001",
    name: "Fatima Noor",
    email: "fatima@x.com",
    category: "General",
    subCategory: "Courses",
    topic: "T",
    batchId: "b1",
    batchName: "Batch One",
    batchCreatedAt: "2026-02-01T00:00:00.000Z",
    issueDate: "2026-01-01",
    status: "generated",
    viewUrl: "https://cert.pharmacozyme.com/verify?certId=PZ-2026-0001",
    ...extra,
  };
}

describe("mapCert", () => {
  it("uses verificationUrl when present", () => {
    const c = mapCert("d1", raw({ verificationUrl: "https://v.example/x" }), batches);
    expect(c.viewUrl).toBe("https://v.example/x");
  });
  it("rejects non-https verificationUrl values and uses the fallback", () => {
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "http://x.com/a", "not a url", "/relative/path"]) {
      const c = mapCert("d1", raw({ verificationUrl: bad }), batches);
      expect(c.viewUrl).toBe("https://cert.pharmacozyme.com/verify?certId=PZ-2026-AAAA1111");
    }
  });
  it("keeps a normal https verificationUrl", () => {
    const u = "https://cert.pharmacozyme.com/verify?certId=X";
    expect(mapCert("d1", raw({ verificationUrl: u }), batches).viewUrl).toBe(u);
  });
  it("falls back to the verify url and ignores pdfUrl/driveLink", () => {
    const c = mapCert("d1", raw(), batches);
    expect(c.viewUrl).toBe("https://cert.pharmacozyme.com/verify?certId=PZ-2026-AAAA1111");
    expect(c.certId).toBe("PZ-2026-AAAA1111");
    expect(c.batchName).toBe("Batch One");
  });
  it("uses own topic as batchName when the batch is missing", () => {
    const c = mapCert("d1", raw({ databaseId: "nope" }), batches);
    expect(c.batchName).toBe("Pharmacology");
  });
  it("reads name and email from recipientName/recipientEmail", () => {
    const c = mapCert("d9", { recipientName: "Zed", recipientEmail: "z@x.com" }, batches);
    expect(c.name).toBe("Zed");
    expect(c.email).toBe("z@x.com");
    const full = mapCert("d1", raw(), batches);
    expect(full.name).toBe("Ayesha Khan");
    expect(full.email).toBe("ayesha@x.com");
  });
  it("maps unknown category to Other and missing status to pending", () => {
    const c = mapCert("d1", raw({ databaseId: "none", category: "Weird", status: undefined }), batches);
    expect(c.category).toBe("Other");
    expect(c.status).toBe("pending");
  });
});

describe("mapCert case-insensitive normalisation", () => {
  it("canonicalises category, status and sub-category case", () => {
    const c = mapCert("d1", raw({ databaseId: "none", category: " general ", status: "Sent", subCategory: "workshops" }), batches);
    expect(c.category).toBe("General");
    expect(c.status).toBe("sent");
    expect(c.subCategory).toBe("Workshops");
    const o = mapCert("d2", raw({ databaseId: "none", category: "OFFICIAL", status: "REVOKED", subCategory: "central team" }), batches);
    expect(o.category).toBe("Official");
    expect(o.status).toBe("revoked");
    expect(o.subCategory).toBe("Central Team");
  });
  it("keeps an unknown sub-category as written", () => {
    const c = mapCert("d1", raw({ databaseId: "none", category: "general", subCategory: "Seminars" }), batches);
    expect(c.subCategory).toBe("Seminars");
  });
});

describe("mapCert database wins", () => {
  it("takes category, sub-category and topic from the database doc", () => {
    const b = new Map<string, CertBatch>([
      ["b9", { id: "b9", name: "AMS Programme", category: "Official", subCategory: "mentors", topic: "AMS", createdAt: "2026-05-05" }],
    ]);
    const c = mapCert("d1", raw({ databaseId: "b9", category: "General", subCategory: "Courses", topic: "Old" }), b);
    expect(c.category).toBe("Official");
    expect(c.subCategory).toBe("Mentors");
    expect(c.topic).toBe("AMS");
    expect(c.batchCreatedAt).toBe("2026-05-05");
  });
  it("falls back to the cert's own fields when the database has none", () => {
    const b = new Map<string, CertBatch>([
      ["b9", { id: "b9", name: "X", category: "Other", subCategory: "", topic: "", createdAt: "" }],
    ]);
    const c = mapCert("d1", raw({ databaseId: "b9" }), b);
    expect(c.category).toBe("General");
    expect(c.subCategory).toBe("Courses");
    expect(c.topic).toBe("Pharmacology");
  });
});

describe("normEmail", () => {
  it("trims and lowercases", () => {
    expect(normEmail("  Ayesha@X.COM ")).toBe("ayesha@x.com");
    expect(normEmail(null)).toBe("");
    expect(normEmail(undefined)).toBe("");
  });
});

describe("isIssuedForStudent", () => {
  it("is true only for generated and sent", () => {
    expect(isIssuedForStudent(rec({ status: "generated" }))).toBe(true);
    expect(isIssuedForStudent(rec({ status: "sent" }))).toBe(true);
    expect(isIssuedForStudent(rec({ status: "pending" }))).toBe(false);
    expect(isIssuedForStudent(rec({ status: "revoked" }))).toBe(false);
  });
});

describe("queryCerts", () => {
  const all = [
    rec({ id: "1", name: "Fatima Noor", email: "fatima@gmail.com", certId: "PZ-2026-F001", status: "generated" }),
    rec({ id: "2", name: "Ali Raza", email: "ali@x.com", certId: "PZ-2026-A002", status: "pending", category: "Official", subCategory: "Mentors", batchId: "b2" }),
    rec({ id: "3", name: "Sara", email: "sara@x.com", certId: "PZ-2026-S003", status: "sent", issueDate: "not a date" }),
  ];

  it("searches name, partial email and certId", () => {
    expect(queryCerts(all, { search: "fatima" }).rows.map((c) => c.id)).toEqual(["1"]);
    expect(queryCerts(all, { search: "@gmail" }).rows.map((c) => c.id)).toEqual(["1"]);
    expect(queryCerts(all, { search: "a002" }).rows.map((c) => c.id)).toEqual(["2"]);
  });
  it("treats regex characters literally", () => {
    const r = queryCerts(all, { search: "(a+" });
    expect(r.rows).toEqual([]);
    expect(r.total).toBe(0);
  });
  it("sorts newest first with unparsable dates last", () => {
    const r = queryCerts(all, {});
    expect(r.rows[r.rows.length - 1].id).toBe("3");
  });
  it("clamps page", () => {
    const many = Array.from({ length: 30 }, (_, i) => rec({ id: String(i), certId: `C${i}` }));
    const r = queryCerts(many, { page: 99 });
    expect(r.pageCount).toBe(2);
    expect(r.page).toBe(2);
    expect(r.rows).toHaveLength(5);
    expect(queryCerts(many, { page: -3 }).page).toBe(1);
  });
  it("handles empty input", () => {
    const r = queryCerts([], {});
    expect(r.total).toBe(0);
    expect(r.pageCount).toBe(1);
    expect(r.page).toBe(1);
    expect(r.rows).toEqual([]);
  });
  it("keeps tab and chip counts real while a batch, search or sub-category is open", () => {
    const r = queryCerts(all, { category: "General", subCategory: "Courses", batchId: "b1", search: "fatima" });
    expect(r.rows.map((c) => c.id)).toEqual(["1"]);
    expect(r.counts.byCategory).toEqual({ General: 2, Official: 1 });
    expect(r.counts.bySubCategory).toEqual({ Courses: 2 });
    const off = queryCerts(all, { category: "Official", batchId: "nope" });
    expect(off.total).toBe(0);
    expect(off.counts.byCategory).toEqual({ General: 2, Official: 1 });
    expect(off.counts.bySubCategory).toEqual({ Mentors: 1 });
  });
  it("breaks date ties by certificate number", () => {
    const r = queryCerts(
      [rec({ id: "b", certId: "B", issueDate: "x" }), rec({ id: "a", certId: "A", issueDate: "y" })],
      {},
    );
    expect(r.rows.map((c) => c.id)).toEqual(["a", "b"]);
  });
});

describe("batchesFor", () => {
  it("returns batches with counts", () => {
    const all = [
      rec({ id: "1", batchId: "b1", batchName: "Batch One", topic: "A", batchCreatedAt: "2026-01-01" }),
      rec({ id: "2", batchId: "b1", batchName: "Batch One", topic: "A", batchCreatedAt: "2026-01-01" }),
      rec({ id: "3", batchId: "b2", batchName: "Batch Two", topic: "B", subCategory: "Webinars", batchCreatedAt: "2026-06-01" }),
      rec({ id: "4", batchId: "b3", batchName: "Off", category: "Official", subCategory: "Mentors" }),
    ];
    expect(batchesFor(all, "General")).toEqual([
      { id: "b2", name: "Batch Two", topic: "B", subCategory: "Webinars", createdAt: "2026-06-01", count: 1 },
      { id: "b1", name: "Batch One", topic: "A", subCategory: "Courses", createdAt: "2026-01-01", count: 2 },
    ]);
    expect(batchesFor(all, "General", "Webinars")).toEqual([
      { id: "b2", name: "Batch Two", topic: "B", subCategory: "Webinars", createdAt: "2026-06-01", count: 1 },
    ]);
  });
});
