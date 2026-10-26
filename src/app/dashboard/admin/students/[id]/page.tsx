import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { getStudentRecord } from "@/lib/data/admin-students";
import { StudentRecord, parseTab } from "@/components/admin/students/StudentRecord";

export const metadata = { title: "Student — PZ Academy" };
export const dynamic = "force-dynamic";

export default async function AdminStudentRecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  await requireAdminPage();
  const { id } = await params;
  const sp = await searchParams;
  // A failed load throws a plain Error; this route's error boundary shows it.
  const data = await getStudentRecord(id);
  if (!data) notFound();
  return <StudentRecord data={data} tab={parseTab(sp.tab)} />;
}
