import { requireAdminPage } from "@/lib/auth/require-admin";
import { listStudents, type StudentFilter } from "@/lib/data/admin-students";
import { StudentsList } from "@/components/admin/students/StudentsList";

export const metadata = { title: "Students — PZ Academy" };
export const dynamic = "force-dynamic";

type SP = { q?: string | string[]; filter?: string | string[]; page?: string | string[] };

const FILTERS: readonly StudentFilter[] = ["all", "active", "payment-pending", "finished"];
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function AdminStudentsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const f = first(sp.filter);
  const filter: StudentFilter = f && (FILTERS as readonly string[]).includes(f) ? (f as StudentFilter) : "all";
  const q = first(sp.q)?.trim() || undefined;
  const parsed = Number.parseInt(first(sp.page) ?? "1", 10);
  const page = Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;

  // A failed load throws a plain Error; the route's error boundary shows it.
  const result = await listStudents({ search: q, filter, page });
  return (
    <StudentsList
      rows={result.rows}
      total={result.total}
      page={result.page}
      pageCount={result.pageCount}
      q={q}
      filter={filter}
    />
  );
}
