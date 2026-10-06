"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ListChecks, Upload, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { ASSIGN_CONTACTS_STORAGE_KEY } from "@/lib/crm/assignment";
import { hubPath } from "@/lib/crm/sales-hub-routes";
import { cn } from "@/lib/utils";

const inputClass =
  "w-full border border-pz-outline-variant rounded-lg px-3 py-2.5 text-sm max-md:text-base max-md:min-h-11 font-body bg-pz-surface-container-lowest text-pz-on-surface focus:outline-none focus:ring-2 focus:ring-pz-primary/20 focus:border-pz-primary";
const labelClass = "block font-headline text-xs font-bold uppercase tracking-wide text-pz-on-surface-variant mb-1.5";

type Cohort = { id: string; sheetName: string; tabName: string; purchaseCount: number };
type Agent = { id: string; fullName: string };
type AgentCount = { agentId: string; fullName: string; contactCount: number };
type Source = "cohort" | "contacts";
type PreviewCounts = {
  toAssign: number;
  alreadyYours: number;
  skippedOwned: number;
  skippedDnc: number;
  reassigning: number;
  total: number;
};
type RequestBody = {
  source: { kind: "cohort"; batchId: string } | { kind: "contacts"; contactIds: string[] };
  agentId: string;
  includeOwned: boolean;
};
/** The preview plus the exact request that produced it, so commit sends the same thing. */
type Preview = { agentName: string; counts: PreviewCounts; body: RequestBody };

function readHandPicked(): string[] {
  try {
    const raw = sessionStorage.getItem(ASSIGN_CONTACTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string" && v !== "") : [];
  } catch {
    return [];
  }
}

export function AssignListsPanel({
  cohorts,
  agents,
  counts,
}: {
  cohorts: Cohort[];
  agents: Agent[];
  counts: AgentCount[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [isRefreshing, startTransition] = useTransition();
  const [source, setSource] = useState<Source>("cohort");
  const [batchId, setBatchId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [includeOwned, setIncludeOwned] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [handPicked, setHandPicked] = useState<string[]>([]);
  // Bumped on every input change: a preview that lands after the inputs moved
  // on is dropped, so the card always describes the current choice.
  const generation = useRef(0);

  useEffect(() => {
    const ids = readHandPicked();
    if (ids.length > 0) {
      setHandPicked(ids);
      setSource("contacts");
    }
  }, []);

  function invalidate() {
    generation.current += 1;
    setPreview(null);
  }

  function buildBody(): RequestBody | null {
    if (agentId === "") return null;
    if (source === "cohort") {
      if (batchId === "") return null;
      return { source: { kind: "cohort", batchId }, agentId, includeOwned };
    }
    if (handPicked.length === 0) return null;
    return { source: { kind: "contacts", contactIds: handPicked }, agentId, includeOwned };
  }

  const { run: runPreview, pending: previewing } = useAsyncAction(async () => {
    const body = buildBody();
    if (!body) return;
    const ticket = generation.current;
    try {
      const res = await fetch("/api/admin/sales/assignments/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await res.json().catch(() => null)) as
        | { preview?: { agentName: string; counts: PreviewCounts }; error?: string }
        | null;
      if (ticket !== generation.current) return;
      if (!res.ok || !payload?.preview) {
        toast.error(payload?.error ?? "Could not preview this assignment.");
        return;
      }
      setPreview({ ...payload.preview, body });
    } catch {
      toast.error("Could not preview this assignment.");
    }
  });

  const { run: runCommit, pending: committing } = useAsyncAction(async () => {
    if (!preview || preview.counts.toAssign === 0) return;
    const { counts: c, agentName, body } = preview;
    const extra = [
      c.reassigning > 0 ? `${c.reassigning} of them currently belong to other agents and will move.` : null,
      c.skippedOwned > 0 ? `${c.skippedOwned} owned by other agents stay where they are.` : null,
      c.skippedDnc > 0 ? `${c.skippedDnc} do-not-contact are skipped.` : null,
    ].filter(Boolean);
    const ok = await confirm({
      title: "Assign contacts?",
      description: [`${c.toAssign} contacts will be assigned to ${agentName}.`, ...extra].join(" "),
      confirmLabel: "Assign",
    });
    if (!ok) return;
    try {
      const res = await fetch("/api/admin/sales/assignments/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await res.json().catch(() => null)) as
        | { result?: { assigned: number; reassigned: number }; error?: string }
        | null;
      if (!res.ok || !payload?.result) {
        toast.error(payload?.error ?? "Could not assign these contacts.");
        return;
      }
      const { assigned, reassigned } = payload.result;
      toast.success(
        `Assigned ${assigned} contacts to ${agentName}.` + (reassigned > 0 ? ` ${reassigned} were reassigned.` : ""),
      );
      invalidate();
      if (body.source.kind === "contacts") {
        try {
          sessionStorage.removeItem(ASSIGN_CONTACTS_STORAGE_KEY);
        } catch {
          // Storage unavailable: nothing to clean up.
        }
        setHandPicked([]);
        setSource("cohort");
      }
      startTransition(() => router.refresh());
    } catch {
      toast.error("Could not assign these contacts.");
    }
  });

  if (agents.length === 0) {
    return (
      <section className="bg-pz-surface-container-lowest rounded-xl border border-pz-outline-variant">
        <EmptyState
          icon={UserPlus}
          title="Add a sales agent first"
          description="Lists are given to sales agents. Add one on the Sales Team page."
          action={{ label: "Go to Sales Team", href: hubPath("team") }}
        />
      </section>
    );
  }

  const noCohorts = cohorts.length === 0;
  const busy = previewing || committing || isRefreshing;
  const canPreview = buildBody() !== null;
  const chipClass = (active: boolean) =>
    cn(
      "px-4 py-2 max-md:min-h-11 rounded-full border font-headline text-sm font-bold transition-colors",
      active
        ? "bg-pz-primary-container text-pz-on-primary-container border-pz-primary-container"
        : "border-pz-outline-variant text-pz-on-surface-variant hover:bg-pz-surface-container-high",
    );

  return (
    <div className="space-y-6">
      <section className="bg-pz-surface-container-lowest p-4 sm:p-6 rounded-xl border border-pz-outline-variant space-y-5">
        <h2 className="font-headline text-lg font-bold text-pz-on-surface flex items-center gap-2">
          <ListChecks className="w-5 h-5 text-pz-primary" />
          Give a list to an agent
        </h2>

        <div>
          <p className={labelClass} id="assign-source-label">Source</p>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby="assign-source-label">
            <Button
              type="button"
              variant="bare"
              size="bare"
              aria-pressed={source === "cohort"}
              onClick={() => { setSource("cohort"); invalidate(); }}
              className={chipClass(source === "cohort")}
            >
              A cohort
            </Button>
            <Button
              type="button"
              variant="bare"
              size="bare"
              aria-pressed={source === "contacts"}
              disabled={handPicked.length === 0}
              onClick={() => { setSource("contacts"); invalidate(); }}
              className={chipClass(source === "contacts")}
            >
              Hand-picked contacts ({handPicked.length})
            </Button>
          </div>
        </div>

        {source === "cohort" ? (
          noCohorts ? (
            <EmptyState
              icon={Upload}
              title="No imported lists yet"
              description="Import a cohort sheet first, then come back to give it to an agent."
              action={{ label: "Import contacts", href: hubPath("import") }}
              className="py-6 md:py-8"
            />
          ) : (
            <div>
              <label htmlFor="assign-cohort" className={labelClass}>Cohort</label>
              <select
                id="assign-cohort"
                value={batchId}
                onChange={(e) => { setBatchId(e.target.value); invalidate(); }}
                className={inputClass}
              >
                <option value="">Choose a cohort…</option>
                {cohorts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.sheetName} — {c.tabName} ({c.purchaseCount})
                  </option>
                ))}
              </select>
            </div>
          )
        ) : (
          <p className="font-body text-sm text-pz-on-surface">
            {handPicked.length} hand-picked contacts from the Contacts page.
          </p>
        )}

        <div>
          <label htmlFor="assign-agent" className={labelClass}>Sales agent</label>
          <select
            id="assign-agent"
            value={agentId}
            onChange={(e) => { setAgentId(e.target.value); invalidate(); }}
            className={inputClass}
          >
            <option value="">Choose an agent…</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.fullName || "(no name)"}</option>
            ))}
          </select>
        </div>

        <label className="flex items-start gap-2 font-body text-sm text-pz-on-surface cursor-pointer max-md:min-h-11">
          <input
            type="checkbox"
            checked={includeOwned}
            onChange={(e) => { setIncludeOwned(e.target.checked); invalidate(); }}
            className="mt-0.5"
          />
          Also reassign contacts that already belong to another agent
        </label>

        <Button
          type="button"
          variant="bare"
          size="bare"
          loading={previewing}
          disabled={!canPreview || busy}
          onClick={() => runPreview()}
          className="gap-2 px-5 py-2.5 max-md:min-h-11 border border-pz-primary text-pz-primary font-headline font-bold text-sm rounded-lg hover:bg-pz-primary/10 transition-colors"
        >
          Preview
        </Button>

        {preview && (
          <div
            className="rounded-xl border border-pz-outline-variant bg-pz-surface-container-high p-4 space-y-3"
            aria-live="polite"
          >
            <p className="font-headline font-bold text-pz-on-surface">
              {preview.counts.toAssign} will be assigned to {preview.agentName}
            </p>
            <ul className="font-body text-sm text-pz-on-surface-variant space-y-1">
              {preview.counts.skippedOwned > 0 && (
                <li>{preview.counts.skippedOwned} already owned by other agents will be skipped</li>
              )}
              {preview.body.includeOwned && preview.counts.reassigning > 0 && (
                <li>{preview.counts.reassigning} currently owned by other agents will be reassigned</li>
              )}
              {preview.counts.alreadyYours > 0 && (
                <li>{preview.counts.alreadyYours} already belong to {preview.agentName}</li>
              )}
              {preview.counts.skippedDnc > 0 && <li>{preview.counts.skippedDnc} do-not-contact will be skipped</li>}
            </ul>
            <Button
              type="button"
              variant="bare"
              size="bare"
              loading={committing || isRefreshing}
              disabled={preview.counts.toAssign === 0 || busy}
              onClick={() => runCommit()}
              className="gap-2 px-5 py-2.5 max-md:min-h-11 bg-pz-primary-container text-pz-on-primary-container font-headline font-bold text-sm rounded-lg hover:shadow-md transition-all"
            >
              Assign {preview.counts.toAssign} contacts
            </Button>
          </div>
        )}
      </section>

      <section className="bg-pz-surface-container-lowest rounded-xl border border-pz-outline-variant">
        <h2 className="font-headline text-lg font-bold text-pz-on-surface flex items-center gap-2 p-4 sm:px-6 border-b border-pz-outline-variant">
          <Users className="w-5 h-5 text-pz-primary" />
          Current assignments
        </h2>
        {counts.length === 0 ? (
          <p className="p-4 sm:px-6 font-body text-sm text-pz-on-surface-variant">No sales agents yet.</p>
        ) : (
          <ul className="divide-y divide-pz-outline-variant">
            {counts.map((row) => (
              <li key={row.agentId} className="flex items-center justify-between gap-3 p-4 sm:px-6">
                <span className="font-headline font-bold text-pz-on-surface truncate">{row.fullName || "(no name)"}</span>
                <span className="font-body text-sm text-pz-on-surface-variant tabular-nums shrink-0">
                  {row.contactCount} {row.contactCount === 1 ? "contact" : "contacts"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
