"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send, UserMinus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { SalesAgentRow } from "@/lib/data/sales-agents";

const inputClass =
  "w-full border border-pz-outline-variant rounded-lg px-3 py-2.5 text-sm max-md:text-base max-md:min-h-11 font-body focus:outline-none focus:ring-2 focus:ring-pz-primary/20 focus:border-pz-primary";
const labelClass = "block font-headline text-xs font-bold uppercase tracking-wide text-pz-on-surface-variant mb-1.5";

export function SalesTeamPanel({ agents }: { agents: SalesAgentRow[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [isRefreshing, startTransition] = useTransition();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");

  const { run: sendInvite, pending: inviting } = useAsyncAction(async () => {
    try {
      const res = await fetch("/api/admin/sales-agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), fullName: fullName.trim() }),
      });
      const payload = (await res.json().catch(() => null)) as
        | { status?: string; email?: string; error?: string }
        | null;

      if (!res.ok) {
        toast.error(payload?.error ?? "Could not process this invite.");
        return;
      }
      if (payload?.status === "existing" && payload.email) {
        const ok = await confirm({
          title: "Use existing account?",
          description: `${payload.email} already has an account. Make it a sales agent? A student account becomes a sales agent. Admin and mentor accounts are refused.`,
          confirmLabel: "Make sales agent",
        });
        if (!ok) return;
        const put = await fetch("/api/admin/sales-agents", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: payload.email, fullName: fullName.trim() }),
        });
        if (!put.ok) {
          const err = (await put.json().catch(() => null)) as { error?: string } | null;
          toast.error(err?.error ?? "Could not update this account.");
          return;
        }
        toast.success(`${payload.email} is now a sales agent.`);
      } else {
        toast.success(`Invite sent to ${payload?.email}.`);
      }
      setFullName("");
      setEmail("");
      startTransition(() => router.refresh());
    } catch {
      toast.error("Could not process this invite.");
    }
  });

  const { run: removeAgent, pending: removing } = useAsyncAction(async (agent: SalesAgentRow) => {
    const ok = await confirm({
      title: `Remove ${agent.fullName || agent.email}?`,
      description:
        "They lose access to the Sales Workspace and become a regular student account. Their contacts go back to unclaimed.",
      confirmLabel: "Remove access",
      destructive: true,
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/admin/sales-agents/${agent.id}`, { method: "DELETE" });
      const payload = (await res.json().catch(() => null)) as { error?: string; released?: number } | null;
      if (!res.ok) {
        toast.error(payload?.error ?? "Could not remove this sales agent.");
        return;
      }
      toast.success(`Removed. ${payload?.released ?? 0} contacts are unclaimed again.`);
      startTransition(() => router.refresh());
    } catch {
      toast.error("Could not remove this sales agent.");
    }
  });

  return (
    <div className="space-y-6">
      <section className="bg-pz-surface-container-lowest p-4 sm:p-6 rounded-xl border border-pz-outline-variant space-y-4">
        <h2 className="font-headline text-lg font-bold text-pz-on-surface flex items-center gap-2">
          <UserPlus className="w-5 h-5 text-pz-primary" />
          Add a sales agent
        </h2>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <div>
            <label className={labelClass}>Full name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Sara Khan"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="sara@example.com"
              className={inputClass}
            />
          </div>
          <Button
            type="button"
            variant="bare"
            size="bare"
            loading={inviting || isRefreshing}
            disabled={email.trim().length === 0 || fullName.trim().length === 0}
            onClick={() => sendInvite()}
            className="gap-2 px-4 py-2.5 max-md:min-h-11 sm:self-end bg-pz-primary-container text-pz-on-primary-container font-headline font-bold text-sm rounded-lg hover:shadow-md transition-all"
          >
            <Send className="w-4 h-4" />
            {inviting || isRefreshing ? "Working…" : "Send invite"}
          </Button>
        </div>
        <p className="font-body text-xs text-pz-on-surface-variant">
          They get an email to set a password, then land straight in the Sales Workspace.
        </p>
      </section>

      <section className="bg-pz-surface-container-lowest rounded-xl border border-pz-outline-variant">
        {agents.length === 0 ? (
          <EmptyState
            icon={UserPlus}
            title="No sales agents yet"
            description="Add your first agent above. They will only see the Sales Workspace."
          />
        ) : (
          <ul className="divide-y divide-pz-outline-variant">
            {agents.map((agent) => (
              <li key={agent.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-headline font-bold text-pz-on-surface truncate">{agent.fullName || "(no name)"}</p>
                  <p className="font-body text-sm text-pz-on-surface-variant truncate">{agent.email}</p>
                  <p className="font-body text-xs text-pz-on-surface-variant mt-0.5">
                    {agent.contactCount} {agent.contactCount === 1 ? "contact" : "contacts"} claimed
                  </p>
                </div>
                <Button
                  type="button"
                  variant="bare"
                  size="bare"
                  disabled={removing || isRefreshing}
                  onClick={() => removeAgent(agent)}
                  className="gap-2 px-4 py-2 max-md:min-h-11 border border-pz-danger/40 text-pz-danger font-headline font-bold text-sm rounded-lg hover:bg-pz-danger/10 transition-colors"
                >
                  <UserMinus className="w-4 h-4" />
                  Remove access
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
