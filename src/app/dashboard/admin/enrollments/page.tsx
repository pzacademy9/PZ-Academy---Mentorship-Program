import { redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { enrollmentsEntryTarget } from "@/lib/registrations/enrollments-entry";

export default async function EnrollmentsEntryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPage("enrollments");
  redirect(enrollmentsEntryTarget(await searchParams));
}
