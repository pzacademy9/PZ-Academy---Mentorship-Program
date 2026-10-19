import { Info, Users } from "lucide-react";
import type { RegistrationRecord } from "@/lib/data/landing-registrations";
import { RegistrationStatusBadge } from "./RegistrationStatusBadge";

/** Group registrations only: the lead first, then each member with their own contact details. */
export function GroupMembers({ lead, members }: { lead: RegistrationRecord; members: RegistrationRecord[] }) {
  const people = [{ person: lead, isLead: true }, ...members.map((m) => ({ person: m, isLead: false }))];
  return (
    <section aria-label="Group members" className="bg-pz-surface-container rounded-2xl border border-pz-outline-variant/40 p-6">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h2 className="flex items-center gap-2 font-headline font-bold text-pz-on-surface text-base">
          <Users className="w-4 h-4 text-pz-secondary" aria-hidden="true" /> Group members
        </h2>
        <span className="font-headline text-xs font-bold text-pz-on-surface-variant">{lead.groupSize} seats</span>
      </div>
      <p className="font-body text-xs text-pz-on-surface-variant mb-4">People registered together with {lead.name}.</p>

      <p className="flex items-start gap-2 rounded-lg bg-pz-surface-container-high p-3 mb-4 font-body text-sm text-pz-on-surface-variant">
        <Info className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
        <strong className="font-headline font-bold text-pz-on-surface">Changing the lead changes the whole group.</strong>
      </p>

      <ul className="divide-y divide-pz-outline-variant/40">
        {people.map(({ person, isLead }) => (
          <li key={person.id} className="py-3 flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-headline font-bold text-sm text-pz-on-surface flex items-center gap-2">
                <span>{person.name}</span>
                {isLead && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-headline font-extrabold bg-pz-primary-container text-pz-on-primary-container tracking-wider uppercase">
                    Lead
                  </span>
                )}
              </p>
              <p className="font-body text-xs text-pz-on-surface-variant break-all">{person.email}</p>
              {person.whatsapp && <p className="font-body text-xs text-pz-on-surface-variant">{person.whatsapp}</p>}
            </div>
            <RegistrationStatusBadge status={person.status} />
          </li>
        ))}
      </ul>
    </section>
  );
}
