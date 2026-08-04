import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { getCourseConfig } from "@/lib/data/admin-lms";
import { ProgramConfigForm } from "@/components/admin/program/ProgramConfigForm";
import { ProgramRosterPanel } from "@/components/admin/program/ProgramRosterPanel";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const course = await getCourseConfig(id);
  return { title: course ? `${course.title} — PZ Academy Admin` : "Program — PZ Academy" };
}

export default async function CourseConfigPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  const course = await getCourseConfig(id);
  if (!course) notFound();

  const stats: { label: string; value: number; tone: string }[] = [
    { label: "Total Enrollments", value: course.enrollmentCounts.total, tone: "text-pz-primary" },
    { label: "Active Students", value: course.enrollmentCounts.active, tone: "text-pz-primary" },
    { label: "Pending Approval", value: course.enrollmentCounts.pending, tone: "text-pz-secondary" },
    { label: "Rejected", value: course.enrollmentCounts.rejected, tone: "text-pz-danger" },
    { label: "Expired", value: course.enrollmentCounts.expired, tone: "text-pz-on-surface-variant" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="bg-pz-surface-container-lowest p-5 rounded-lg border border-pz-outline-variant"
          >
            <p className="text-[10px] font-bold uppercase tracking-widest text-pz-on-surface-variant">
              {s.label}
            </p>
            <p className={`font-headline text-2xl font-bold mt-1 ${s.tone}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2">
          <ProgramConfigForm course={course} />
        </div>
        <div className="lg:col-span-1">
          <ProgramRosterPanel
            courseId={course.id}
            courseTitle={course.title}
            counts={course.enrollmentCounts}
          />
        </div>
      </div>
    </div>
  );
}
