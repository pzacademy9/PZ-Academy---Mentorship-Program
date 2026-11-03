"use client";

import type { RegistrationListRow } from "@/lib/data/landing-registration-admin";
import { RegistrationStatusBadge } from "./RegistrationStatusBadge";
import { StatusChangeControl } from "./StatusChangeControl";

/**
 * The status in an admin list row. Click it to change the status (amount received, email choice, confirm).
 * Free rows have no payment, and a group member follows its lead, so those stay a plain badge.
 */
export function RowStatusCell({ row }: { row: RegistrationListRow }) {
  if (row.status === "free" || row.rowType === "member") return <RegistrationStatusBadge status={row.status} />;
  return (
    <StatusChangeControl
      trigger="badge"
      registrationId={row.id}
      endpoint={`/api/admin/registrations/${row.id}`}
      status={row.status}
      expectedAmount={row.expectedAmount}
      currency={row.currency}
      studentName={row.name}
      groupSize={row.groupSize}
    />
  );
}
