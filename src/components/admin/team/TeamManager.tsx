"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send, UserMinus, UserPlus, Pencil, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { effectiveAreas, startingAreas, type Area } from "@/lib/team/areas";
import { accessSummary, diffFromStarting } from "@/lib/team/summary";
import { AreaTicks } from "@/components/admin/team/AreaTicks";
import type { TeamMember } from "@/lib/data/team-access";

type TeamRole = "admin" | "manager";

const inputClass =
  "w-full border border-pz-outline-variant rounded-lg px-3 py-2.5 text-sm max-md:text-base max-md:min-h-11 font-body focus:outline-none focus:ring-2 focus:ring-pz-primary/20 focus:border-pz-primary";
const labelClass = "block font-headline text-xs font-bold uppercase tracking-wide text-pz-on-surface-variant mb-1.5";
const primaryBtn =
  "gap-2 px-4 py-2.5 max-md:min-h-11 bg-pz-primary-container text-pz-on-primary-container font-headline font-bold text-sm rounded-lg hover:shadow-md transition-all";
const outlineBtn =
  "gap-2 px-4 py-2 max-md:min-h-11 border border-pz-outline-variant text-pz-on-surface font-headline font-bold text-sm rounded-lg hover:bg-pz-surface-container-high transition-colors";

async function call(url: string, method: string, body?: unknown): Promise<{ ok: boolean; payload: { error?: string; status?: string; email?: string } | null }> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { ok: res.ok, payload: (await res.json().catch(() => null)) as { error?: string; status?: string; email?: string } | null };
}

function RolePicker({ value, onChange }: { value: TeamRole; onChange: (r: TeamRole) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as TeamRole)} aria-label="Role" className={inputClass}>
      <option value="manager">Manager</option>
      <option value="admin">Admin</option>
    </select>
  );
}

function AddPerson({ onDone }: { onDone: () => void }) {
  const confirm = useConfirm();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<TeamRole>("manager");
  const [ticked, setTicked] = useState<Area[]>(startingAreas("manager"));

  const pickRole = (r: TeamRole) => { setRole(r); setTicked(startingAreas(r)); };

  const { run: add, pending } = useAsyncAction(async () => {
    const body = { email: email.trim(), fullName: fullName.trim(), role, ...diffFromStarting(role, ticked) };
    try {
      const first = await call("/api/admin/team", "POST", body);
      if (!first.ok) { toast.error(first.payload?.error ?? "Could not add this person."); return; }
      if (first.payload?.status === "existing") {
        const ok = await confirm({
          title: "Use existing account?",
          description: `${first.payload.email} already has an account. Make it ${role === "admin" ? "an Admin" : "a Manager"}? Mentor and sales agent accounts are refused.`,
          confirmLabel: "Add to team",
        });
        if (!ok) return;
        const put = await call("/api/admin/team", "PUT", body);
        if (!put.ok) { toast.error(put.payload?.error ?? "Could not update this account."); return; }
        toast.success(`${first.payload.email} is on the team.`);
      } else {
        toast.success(`Invite sent to ${first.payload?.email}.`);
      }
      setFullName(""); setEmail("");
      onDone();
    } catch {
      toast.error("Could not add this person.");
    }
  });

  return (
    <section className="bg-pz-surface-container-lowest p-4 sm:p-6 rounded-xl border border-pz-outline-variant space-y-4">
      <h2 className="font-headline text-lg font-bold text-pz-on-surface flex items-center gap-2">
        <UserPlus className="w-5 h-5 text-pz-primary" />
        Add a person
      </h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className={labelClass}>Full name</label>
          <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Sara Khan" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="sara@example.com" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Role</label>
          <RolePicker value={role} onChange={pickRole} />
        </div>
      </div>
      <div>
        <p className={labelClass}>Areas (start from the role, then tick or untick)</p>
        <AreaTicks value={ticked} onChange={setTicked} />
      </div>
      <Button
        type="button" variant="bare" size="bare" loading={pending}
        disabled={email.trim().length === 0 || fullName.trim().length === 0}
        onClick={() => add()} className={primaryBtn}
      >
        <Send className="w-4 h-4" />
        {pending ? "Working…" : "Send invite"}
      </Button>
    </section>
  );
}

function Editor({ member, onDone, onCancel }: { member: TeamMember; onDone: () => void; onCancel: () => void }) {
  const startRole: TeamRole = (member.active ? member.role : member.previousRole) === "admin" ? "admin" : "manager";
  const [role, setRole] = useState<TeamRole>(startRole);
  const [ticked, setTicked] = useState<Area[]>(effectiveAreas(startRole, member.custom));

  const pickRole = (r: TeamRole) => { setRole(r); setTicked(startingAreas(r)); };

  const { run: save, pending } = useAsyncAction(async () => {
    try {
      const r = await call(`/api/admin/team/${member.id}`, "PATCH", { role, ...diffFromStarting(role, ticked) });
      if (!r.ok) { toast.error(r.payload?.error ?? "Could not save."); return; }
      toast.success("Access saved.");
      onDone();
    } catch {
      toast.error("Could not save.");
    }
  });

  return (
    <div className="mt-3 w-full space-y-3 rounded-lg bg-pz-surface-container-low p-3">
      <div className="max-w-xs"><label className={labelClass}>Role</label><RolePicker value={role} onChange={pickRole} /></div>
      <AreaTicks value={ticked} onChange={setTicked} />
      <p className="font-body text-xs text-pz-on-surface-variant">Now: {accessSummary(role, diffFromStarting(role, ticked))}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="bare" size="bare" loading={pending} onClick={() => save()} className={primaryBtn}>Save access</Button>
        <Button type="button" variant="bare" size="bare" onClick={onCancel} className={outlineBtn}>Cancel</Button>
      </div>
    </div>
  );
}

export function TeamManager({ members }: { members: TeamMember[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const refresh = () => { setEditing(null); startTransition(() => router.refresh()); };

  const { run: switchOff, pending: switching } = useAsyncAction(async (m: TeamMember) => {
    const ok = await confirm({
      title: `Switch off ${m.fullName || m.email}?`,
      description: "They become a regular student account and lose all admin access. You can add them back later and their custom areas come back.",
      confirmLabel: "Switch off",
      destructive: true,
    });
    if (!ok) return;
    try {
      const r = await call(`/api/admin/team/${m.id}`, "DELETE");
      if (!r.ok) { toast.error(r.payload?.error ?? "Could not switch this person off."); return; }
      toast.success("Switched off.");
      refresh();
    } catch {
      toast.error("Could not switch this person off.");
    }
  });

  return (
    <div className="space-y-6">
      <AddPerson onDone={refresh} />

      <section className="bg-pz-surface-container-lowest rounded-xl border border-pz-outline-variant">
        {members.length === 0 ? (
          <EmptyState icon={UserPlus} title="No team yet" description="Add your first person above." />
        ) : (
          <ul className="divide-y divide-pz-outline-variant">
            {members.map((m) => {
              const isOwner = m.role === "super_admin";
              const isCustom = m.active && !isOwner && accessSummary(m.role, m.custom) !== accessSummary(m.role, null);
              const name = m.fullName || m.email;
              return (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="font-headline font-bold text-pz-on-surface truncate">{m.fullName || "(no name)"}</p>
                    <p className="font-body text-sm text-pz-on-surface-variant truncate">{m.email}</p>
                    <p className="font-body text-xs text-pz-on-surface-variant mt-0.5">
                      {m.active ? accessSummary(m.role, m.custom) : "Switched off"}
                      {isCustom && <span className="ml-2 rounded-full bg-pz-primary-container px-2 py-0.5 font-headline font-bold text-pz-on-primary-container">Custom</span>}
                    </p>
                  </div>
                  {!isOwner && (
                    <div className="flex flex-wrap gap-2">
                      {m.active ? (
                        <>
                          <Button type="button" variant="bare" size="bare" aria-label={`Edit ${name}`} onClick={() => setEditing(editing === m.id ? null : m.id)} className={outlineBtn}>
                            <Pencil className="w-4 h-4" />Edit
                          </Button>
                          <Button type="button" variant="bare" size="bare" aria-label={`Switch off ${name}`} disabled={switching} onClick={() => switchOff(m)}
                            className="gap-2 px-4 py-2 max-md:min-h-11 border border-pz-danger/40 text-pz-danger font-headline font-bold text-sm rounded-lg hover:bg-pz-danger/10 transition-colors">
                            <UserMinus className="w-4 h-4" />Switch off
                          </Button>
                        </>
                      ) : (
                        <Button type="button" variant="bare" size="bare" aria-label={`Add back ${name}`} onClick={() => setEditing(editing === m.id ? null : m.id)} className={outlineBtn}>
                          <RotateCcw className="w-4 h-4" />Add back
                        </Button>
                      )}
                    </div>
                  )}
                  {editing === m.id && <Editor member={m} onDone={refresh} onCancel={() => setEditing(null)} />}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="font-body text-sm text-pz-on-surface-variant">
        Sales agents are managed in <Link href="/dashboard/admin/sales-hub/team" className="font-semibold text-pz-primary underline underline-offset-2">Sales Hub, Team</Link>.
      </p>
    </div>
  );
}
