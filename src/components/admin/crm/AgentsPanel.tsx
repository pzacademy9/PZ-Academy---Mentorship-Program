"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Copy, Check, UserPlus, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ResponsiveList } from "@/components/ui/responsive-list";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { formatDate } from "@/lib/format";

type Agent = {
  id: string;
  name: string;
  token: string;
  active: boolean;
  createdAt: string;
};

function agentLink(token: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/leads/add/${token}`;
}

function CopyLinkButton({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard
      .writeText(agentLink(token))
      .then(() => {
        setCopied(true);
        toast.success("Link copied.");
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => toast.error("Could not copy the link."));
  }

  return (
    <button
      type="button"
      onClick={copy}
      title="Copy link"
      className="inline-flex items-center gap-1.5 rounded-md border border-pz-outline-variant px-3 py-1.5 font-body text-xs font-medium text-pz-on-surface-variant hover:bg-pz-surface-container-highest transition-colors max-md:min-h-11"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-pz-primary" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? "Copied" : "Copy link"}
    </button>
  );
}

export function AgentsPanel({ initialAgents }: { initialAgents: Agent[] }) {
  const [agents, setAgents] = useState(initialAgents);
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const filteredAgents = search.trim() === "" ? agents : agents.filter((a) => a.name.toLowerCase().includes(search.trim().toLowerCase()));

  const { run: create, pending: creating } = useAsyncAction(async () => {
    const trimmed = name.trim();
    if (!trimmed) return;

    try {
      const res = await fetch("/api/admin/crm/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Could not create this agent.");

      setAgents((prev) => [json.agent as Agent, ...prev]);
      setName("");
      toast.success(`Agent link created for ${trimmed}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create this agent.");
    }
  });

  const { run: toggleActive, pending: toggling, pendingKey: busyId } = useAsyncAction(async (agent: Agent) => {
    try {
      const res = await fetch(`/api/admin/crm/agents/${agent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !agent.active }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Could not update this agent.");
      }
      setAgents((prev) => prev.map((a) => (a.id === agent.id ? { ...a, active: !a.active } : a)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update this agent.");
    }
  }, { getKey: (agent) => agent.id });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
        <div className="flex-1">
          <label className="font-body text-xs font-medium text-pz-on-surface-variant">Agent name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") create();
            }}
            placeholder="e.g. Ayesha Khan"
            className="mt-1 w-full h-10 max-md:h-11 rounded-md border border-pz-outline-variant bg-pz-surface-container-highest px-3 font-body text-sm max-md:text-base text-pz-on-surface outline-none focus:border-pz-primary focus:ring-1 focus:ring-pz-primary"
          />
        </div>
        <Button
          type="button"
          variant="bare"
          size="bare"
          loading={creating}
          onClick={() => create()}
          disabled={!name.trim()}
          className="h-10 max-md:h-11 px-5 rounded-md bg-pz-primary-container font-headline text-sm font-semibold text-pz-on-primary-container hover:bg-pz-primary-container/90 transition-colors"
        >
          {creating ? "Generating…" : "Generate link"}
        </Button>
      </div>

      {agents.length > 0 && (
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search agents…"
          className="rounded-xl border border-pz-outline-variant px-3 py-1.5 font-body text-sm w-64 max-md:w-full max-md:min-h-11 max-md:text-base"
        />
      )}
      {agents.length === 0 ? (
        <EmptyState icon={UserPlus} title="No agents yet" description="Generate a link above and share it with an agent so they can add leads." />
      ) : filteredAgents.length === 0 ? (
        <EmptyState icon={SearchX} title="No agents match" description={`Nothing matches "${search}".`} />
      ) : (
        <ResponsiveList
          rows={filteredAgents}
          getKey={(a) => a.id}
          mobile={{
            title: (a) => (
              <Link href={`/dashboard/admin/crm/agents/${a.id}`} className="inline-flex min-h-11 items-center underline">
                {a.name}
              </Link>
            ),
            meta: (a) => [
              `${a.active ? "Active" : "Inactive"} · ${formatDate(a.createdAt)}`,
              <div key="actions" className="flex flex-wrap items-center gap-2">
                <CopyLinkButton token={a.token} />
                <Button
                  variant="bare"
                  size="bare"
                  loading={busyId === a.id}
                  disabled={toggling}
                  onClick={() => toggleActive(a)}
                  className="min-h-11 min-w-11 px-2 font-body text-sm text-pz-on-surface-variant hover:text-pz-on-surface"
                >
                  {busyId === a.id ? "…" : a.active ? "deactivate" : "activate"}
                </Button>
              </div>,
            ],
          }}
          table={
            <div className="overflow-x-auto">
              <table className="w-full text-left font-body text-sm">
                <thead className="text-pz-on-surface-variant text-xs uppercase">
                  <tr>
                    <th className="py-2">Name</th>
                    <th>Link</th>
                    <th>Created</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAgents.map((a) => (
                    <tr key={a.id} className="border-t border-pz-outline-variant">
                      <td className="py-2">
                        <Link href={`/dashboard/admin/crm/agents/${a.id}`} className="underline">
                          {a.name}
                        </Link>
                      </td>
                      <td>
                        <CopyLinkButton token={a.token} />
                      </td>
                      <td>{formatDate(a.createdAt)}</td>
                      <td>
                        <span
                          className={
                            a.active
                              ? "inline-flex rounded-full bg-pz-primary-container px-2.5 py-1 text-xs font-semibold text-pz-on-primary-container"
                              : "inline-flex rounded-full bg-pz-surface-container-highest px-2.5 py-1 text-xs font-semibold text-pz-on-surface-variant"
                          }
                        >
                          {a.active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td>
                        <Button
                          variant="bare"
                          size="bare"
                          loading={busyId === a.id}
                          disabled={toggling}
                          onClick={() => toggleActive(a)}
                          className="font-body text-sm text-pz-on-surface-variant hover:text-pz-on-surface"
                        >
                          {busyId === a.id ? "…" : a.active ? "deactivate" : "activate"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          }
        />
      )}
    </div>
  );
}
