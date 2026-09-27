"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Copy, Check } from "lucide-react";
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
      className="inline-flex items-center gap-1.5 rounded-md border border-pz-outline-variant px-3 py-1.5 font-body text-xs font-medium text-pz-on-surface-variant hover:bg-pz-surface-container-highest transition-colors"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-pz-primary" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? "Copied" : "Copy link"}
    </button>
  );
}

export function AgentsPanel({ initialAgents }: { initialAgents: Agent[] }) {
  const [agents, setAgents] = useState(initialAgents);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function create() {
    const trimmed = name.trim();
    if (!trimmed) return;

    setCreating(true);
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
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(agent: Agent) {
    setBusyId(agent.id);
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
    } finally {
      setBusyId(null);
    }
  }

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
            className="mt-1 w-full h-10 rounded-md border border-pz-outline-variant bg-pz-surface-container-highest px-3 font-body text-sm text-pz-on-surface outline-none focus:border-pz-primary focus:ring-1 focus:ring-pz-primary"
          />
        </div>
        <button
          type="button"
          onClick={create}
          disabled={creating || !name.trim()}
          className="h-10 px-5 rounded-md bg-pz-primary-container font-headline text-sm font-semibold text-pz-on-primary-container hover:bg-pz-primary-container/90 transition-colors disabled:opacity-50"
        >
          {creating ? "Generating…" : "Generate link"}
        </button>
      </div>

      {agents.length === 0 ? (
        <p className="font-body text-sm text-pz-on-surface-variant py-8 text-center">No agents yet.</p>
      ) : (
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
              {agents.map((a) => (
                <tr key={a.id} className="border-t border-pz-outline-variant">
                  <td className="py-2">{a.name}</td>
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
                    <button
                      onClick={() => toggleActive(a)}
                      disabled={busyId === a.id}
                      className="font-body text-sm text-pz-on-surface-variant hover:text-pz-on-surface disabled:opacity-50"
                    >
                      {busyId === a.id ? "…" : a.active ? "deactivate" : "activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
