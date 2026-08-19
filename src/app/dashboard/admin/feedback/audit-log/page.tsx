import { requireAdminPage } from "@/lib/auth/require-admin";
import { listFeedbackAuditLog } from "@/lib/data/feedback-audit";
import { AuditLogClient } from "./AuditLogClient";

export const metadata = { title: "Audit Log — PZ Academy" };

export default async function AdminAuditLogPage() {
  await requireAdminPage();
  const entries = await listFeedbackAuditLog();
  return <AuditLogClient entries={entries} />;
}
