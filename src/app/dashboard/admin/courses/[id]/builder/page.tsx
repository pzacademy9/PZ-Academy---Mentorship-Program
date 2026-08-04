import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { getBuilderState } from "@/lib/data/admin-lms";
import { CourseBuilder } from "@/components/admin/program/CourseBuilder";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const state = await getBuilderState(id);
  return { title: state ? `Builder — ${state.course.title} — PZ Academy Admin` : "Course Builder — PZ Academy" };
}

export default async function CourseBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  const state = await getBuilderState(id);
  if (!state) notFound();

  return <CourseBuilder initialState={state} />;
}
