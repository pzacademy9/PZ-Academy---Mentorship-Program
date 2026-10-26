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
  return <CertificateGroups certs={certs.certs} variant="admin" emptyText="No certificates found for this email." />;
}
