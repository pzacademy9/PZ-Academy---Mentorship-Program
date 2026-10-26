import { getMyCertificates } from "@/lib/data/student-certificates";
import { CertificateGroups } from "@/components/certs/CertificateGroups";
import { ErrorState } from "@/components/ui/error-state";

export const metadata = { title: "Certificates — PZ Academy" };

export default async function CertificatesPage() {
  const result = await getMyCertificates();

  return (
    <div className="space-y-6">
      <h1 className="font-montserrat font-bold text-2xl text-pz-forest">Certificates</h1>
      {result.state === "unavailable" ? (
        <ErrorState message="We could not load your certificates. Try again in a minute." />
      ) : (
        <CertificateGroups
          certs={result.issued}
          variant="student"
          pendingCount={result.pendingCount}
          emptyText="You do not have any certificates yet. Finish a course to earn one."
        />
      )}
    </div>
  );
}
