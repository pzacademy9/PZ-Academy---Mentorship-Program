import { CertificateGroups } from "@/components/certs/CertificateGroups";
import type { StudentRecordData } from "@/lib/data/admin-students";

export function Certificates({ certs }: { certs: StudentRecordData["certs"] }) {
  if (certs.state === "unavailable") {
    return (
      <div
        role="alert"
        className="rounded-xl border border-pz-outline-variant bg-pz-surface-container-lowest p-4 font-body text-sm text-pz-on-surface"
      >
        We could not reach the Certificates app. Try again in a minute.
      </div>
    );
  }
  if (certs.state === "no-email") {
    return (
      <div
        role="alert"
        className="rounded-xl border border-pz-outline-variant bg-pz-surface-container-lowest p-4 font-body text-sm text-pz-on-surface"
      >
        This student has no email address on their account, so certificates cannot be matched.
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <h2 className="font-headline text-xl font-bold text-pz-on-surface">Certificates</h2>
      <CertificateGroups certs={certs.certs} variant="admin" emptyText="No certificates found for this email." />
    </div>
  );
}
