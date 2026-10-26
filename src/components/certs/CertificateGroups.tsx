import { Award } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { groupCerts, type CertRecord, type CertStatus } from "@/lib/certs/cert-model";

const CHIP_LABEL: Record<CertStatus, string> = {
  sent: "Sent",
  generated: "Generated",
  pending: "Pending",
  revoked: "Revoked",
};

const CHIP_CLASS: Record<CertStatus, string> = {
  sent: "bg-pz-primary-container text-pz-on-primary-container",
  generated: "bg-pz-tertiary-container text-pz-on-tertiary-container",
  pending: "bg-pz-warning/20 text-pz-on-surface",
  revoked: "bg-pz-surface-container-high text-pz-on-surface-variant",
};

export function CertStatusChip({ status, label }: { status: CertStatus; label?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 font-body text-xs font-bold uppercase",
        CHIP_CLASS[status],
      )}
    >
      {label ?? CHIP_LABEL[status]}
    </span>
  );
}

function safeHref(c: CertRecord): string {
  return c.viewUrl.startsWith("https://")
    ? c.viewUrl
    : `https://cert.pharmacozyme.com/verify?certId=${encodeURIComponent(c.certId)}`;
}

function pendingText(n: number): string {
  return n === 1
    ? "1 certificate is being prepared. We will tell you here when it is ready."
    : `${n} certificates are being prepared. We will tell you here when they are ready.`;
}

export function CertificateGroups({
  certs,
  variant,
  pendingCount = 0,
  emptyText,
}: {
  certs: CertRecord[];
  variant: "student" | "admin";
  pendingCount?: number;
  emptyText: string;
}) {
  const showPending = variant === "student" && pendingCount > 0;
  const sections = groupCerts(certs);

  return (
    <div className="space-y-8">
      {showPending && (
        <div
          role="status"
          className="rounded-xl border border-pz-warning/40 bg-pz-warning/10 p-4 font-body text-sm text-pz-on-surface"
        >
          {pendingText(pendingCount)}
        </div>
      )}

      {sections.length === 0 && !showPending && (
        <EmptyState icon={Award} title={emptyText} />
      )}

      {sections.map((section) => (
        <section key={section.category} className="space-y-4">
          <h2 className="font-headline text-xl font-bold text-pz-on-surface">{section.category}</h2>
          {section.groups.map((group) => (
            <div key={group.subCategory} className="space-y-2">
              <h3 className="font-body text-xs font-bold uppercase text-pz-on-surface-variant">
                {group.subCategory}
              </h3>
              <ul className="space-y-2">
                {group.certs.map((c) => (
                  <li
                    key={c.id}
                    data-testid={`cert-row-${c.id}`}
                    className={cn(
                      "flex flex-col gap-3 rounded-xl border border-pz-outline-variant bg-pz-surface-container-lowest p-4 sm:flex-row sm:items-center sm:justify-between",
                      c.status === "revoked" && "opacity-60",
                    )}
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="break-words font-headline text-base font-bold text-pz-on-surface">{c.topic}</p>
                      <p className="break-words font-body text-sm text-pz-on-surface-variant">{c.batchName}</p>
                      <p className="break-all font-body text-xs text-pz-on-surface-variant">{c.certId}</p>
                      {c.issueDate && (
                        <p className="font-body text-xs text-pz-on-surface-variant">{c.issueDate}</p>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                      <CertStatusChip
                        status={c.status}
                        label={variant === "student" ? "Issued" : undefined}
                      />
                      <a
                        href={safeHref(c)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-11 items-center font-body text-sm font-bold text-pz-primary hover:underline"
                      >
                        View certificate
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
