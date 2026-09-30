"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";
import type { AgentDetail } from "@/lib/data/admin-crm-agents";

function agentLink(token: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/leads/add/${token}`;
}

function CopyLinkButton({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard
      .writeText(agentLink(token))
      .then(() => { setCopied(true); toast.success("Link copied."); setTimeout(() => setCopied(false), 2000); })
      .catch(() => toast.error("Could not copy the link."));
  }
  return (
    <button type="button" onClick={copy} title="Copy link"
      className="inline-flex items-center gap-1.5 rounded-md border border-pz-outline-variant px-3 py-1.5 font-body text-xs font-medium text-pz-on-surface-variant hover:bg-pz-surface-container-highest transition-colors">
      {copied ? <Check className="w-3.5 h-3.5 text-pz-primary" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? "Copied" : "Copy link"}
    </button>
  );
}

export function AgentDetailClient({ agent }: { agent: AgentDetail }) {
  const [search, setSearch] = useState("");
  const filtered =
    search.trim() === ""
      ? agent.leads
      : agent.leads.filter((l) => (l.name ?? "").toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/admin/crm?tab=agents"
          className="inline-flex items-center gap-2 font-body text-sm text-pz-on-surface-variant hover:text-pz-primary transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Agents
        </Link>
        <div className="flex flex-wrap items-center gap-3 mt-3">
          <h1 className="font-headline font-bold text-2xl text-pz-secondary">{agent.name}</h1>
          <span className={agent.active ? "inline-flex rounded-full bg-pz-primary-container px-2.5 py-1 text-xs font-semibold text-pz-on-primary-container" : "inline-flex rounded-full bg-pz-surface-container-highest px-2.5 py-1 text-xs font-semibold text-pz-on-surface-variant"}>
            {agent.active ? "Active" : "Inactive"}
          </span>
        </div>
        <p className="font-body text-sm text-pz-on-surface-variant mt-1">Created {formatDate(agent.createdAt)}</p>
        <div className="mt-2"><CopyLinkButton token={agent.token} /></div>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-headline font-bold text-lg">Leads ({agent.leads.length})</h2>
        {agent.leads.length > 0 && (
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search leads…"
            className="rounded-xl border border-pz-outline-variant px-3 py-1.5 font-body text-sm w-64"
          />
        )}
      </div>
      {filtered.length === 0 ? (
        <p className="font-body text-sm text-pz-on-surface-variant py-4">
          {search ? `No leads match "${search}".` : "No leads submitted through this link yet."}
        </p>
      ) : (
        <table className="w-full text-left font-body text-sm">
          <thead className="text-pz-on-surface-variant text-xs uppercase">
            <tr><th className="py-1">Name</th><th>Phone</th><th>Profession</th><th>Status</th><th>Submitted</th></tr>
          </thead>
          <tbody>
            {filtered.map((l) => (
              <tr key={l.id} className="border-t border-pz-outline-variant">
                <td className="py-1">{l.name || "—"}</td>
                <td>{l.phone}</td>
                <td>{l.profession ?? "—"}</td>
                <td>{l.status}</td>
                <td>{formatDate(l.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
