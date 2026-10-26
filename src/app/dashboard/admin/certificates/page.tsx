import { requireAdminPage } from "@/lib/auth/require-admin";
import { getAllCerts, CertSourceError } from "@/lib/certs/cert-source";
import {
  CATEGORY_SUBCATS,
  batchesFor,
  queryCerts,
  type CertCategory,
  type CertRecord,
} from "@/lib/certs/cert-model";
import { AdminCertificates } from "@/components/admin/certs/AdminCertificates";

export const metadata = { title: "Certificates — PZ Academy" };
export const dynamic = "force-dynamic";

type SP = { tab?: string; group?: string; batch?: string; q?: string; page?: string };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function AdminCertificatesPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const tab = first(sp.tab) === "official" ? "official" : "general";
  const category: CertCategory = tab === "official" ? "Official" : "General";
  const g = first(sp.group);
  const group = g && CATEGORY_SUBCATS[category].includes(g) ? g : undefined;
  const batch = first(sp.batch)?.trim() || undefined;
  const q = first(sp.q)?.trim() || undefined;
  const pageNum = Number.parseInt(first(sp.page) ?? "1", 10);
  const view = { tab, group, batch, q } as const;

  let all: CertRecord[];
  try {
    all = await getAllCerts();
  } catch (e) {
    if (!(e instanceof CertSourceError)) throw e;
    return (
      <AdminCertificates
        {...view}
        rows={[]}
        total={0}
        page={1}
        pageCount={1}
        counts={{ byCategory: {}, bySubCategory: {} }}
        batches={[]}
        unavailable
      />
    );
  }

  const result = queryCerts(all, {
    category,
    subCategory: group,
    batchId: batch,
    search: q,
    page: Number.isFinite(pageNum) ? pageNum : 1,
  });
  return (
    <AdminCertificates
      {...view}
      rows={result.rows}
      total={result.total}
      page={result.page}
      pageCount={result.pageCount}
      counts={{ byCategory: result.counts.byCategory, bySubCategory: result.counts.bySubCategory }}
      batches={batchesFor(all, category, group)}
      unavailable={false}
    />
  );
}
