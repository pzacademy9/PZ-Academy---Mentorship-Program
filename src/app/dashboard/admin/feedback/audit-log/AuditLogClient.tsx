"use client";

import { useState } from "react";
import Link from "next/link";
import { CirclePlus, Trash2, EyeOff, Pencil, Share2, Inbox, ArrowLeft } from "lucide-react";
import { relativeTime, formatDateTime } from "@/lib/format";
import { describeAuditAction, type AuditCategory, type AuditTone } from "@/lib/data/feedback-audit-actions";
import type { AuditLogEntry } from "@/lib/data/feedback-audit";
import { EmptyState } from "@/components/ui/empty-state";
import { ResponsiveList } from "@/components/ui/responsive-list";
import { cn } from "@/lib/utils";

const CATEGORY_TABS: { value: AuditCategory | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "sessions", label: "Sessions" },
  { value: "programs", label: "Programs" },
  { value: "responses", label: "Responses" },
  { value: "questionBank", label: "Question Bank" },
  { value: "sharing", label: "Sharing" },
];

const TONE_ICON: Record<AuditTone, typeof CirclePlus> = {
  create: CirclePlus,
  destructive: Trash2,
  moderate: EyeOff,
  neutral: Pencil,
  share: Share2,
};

const TONE_CLASSES: Record<AuditTone, string> = {
  create: "bg-pz-tertiary-container text-pz-on-tertiary-container",
  destructive: "bg-pz-error-container text-pz-on-error-container",
  moderate: "bg-pz-secondary-container text-pz-on-secondary-container",
  neutral: "bg-pz-surface-container-highest text-pz-on-surface",
  share: "bg-pz-primary-container text-pz-on-primary-container",
};

function ActionBadge({ action }: { action: string }) {
  const info = describeAuditAction(action);
  const Icon = TONE_ICON[info.tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-headline font-bold text-xs whitespace-nowrap",
        TONE_CLASSES[info.tone],
      )}
    >
      <Icon className="w-3.5 h-3.5" />
      {info.label}
    </span>
  );
}

export function AuditLogClient({ entries }: { entries: AuditLogEntry[] }) {
  const [category, setCategory] = useState<AuditCategory | "all">("all");

  const visible =
    category === "all" ? entries : entries.filter((e) => describeAuditAction(e.action).category === category);

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/admin/feedback"
        className="inline-flex items-center gap-2 max-md:min-h-11 font-body text-sm text-pz-on-surface-variant hover:text-pz-primary transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to sessions
      </Link>

      <div>
        <h1 className="font-headline font-bold text-2xl text-pz-secondary">Audit Log</h1>
        <p className="font-body text-pz-on-surface-variant text-sm mt-1">
          A record of every change made to feedback sessions, programs, and responses.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {CATEGORY_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setCategory(tab.value)}
            className={cn(
              "px-4 py-2 max-md:min-h-11 rounded-full font-headline font-bold text-sm transition-colors border",
              category === tab.value
                ? "bg-pz-primary-container text-pz-on-primary-container border-pz-primary"
                : "bg-pz-surface-container-lowest text-pz-on-surface-variant border-pz-outline-variant hover:bg-pz-surface-container-high",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={category === "all" ? "No activity yet" : "No activity in this category"}
          description="Changes to feedback sessions, programs and responses will show up here."
        />
      ) : (
        <div className="bg-pz-surface-container-lowest rounded-2xl border border-pz-outline-variant/40 overflow-hidden max-md:border-0 max-md:bg-transparent">
          <ResponsiveList
            rows={visible}
            getKey={(entry) => entry.id}
            mobile={{
              title: (entry) => <ActionBadge action={entry.action} />,
              meta: (entry) => [
                `${relativeTime(entry.createdAt)} · ${entry.actorName ?? "System"}`,
                entry.detail ? <span key="detail" className="block whitespace-normal break-words">{entry.detail}</span> : null,
              ].filter(Boolean),
            }}
            table={
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[48rem]">
              <thead>
                <tr className="border-b border-pz-outline-variant/40 text-pz-on-surface text-left">
                  <th className="py-4 px-6 font-headline font-semibold">Timestamp</th>
                  <th className="py-4 px-6 font-headline font-semibold">Action</th>
                  <th className="py-4 px-6 font-headline font-semibold">Actor</th>
                  <th className="py-4 px-6 font-headline font-semibold">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pz-outline-variant/30 text-pz-on-surface">
                {visible.map((entry) => (
                  <tr key={entry.id} className="hover:bg-pz-surface-container/40 transition-colors">
                    <td
                      className="py-4 px-6 whitespace-nowrap font-body text-pz-on-surface-variant"
                      title={formatDateTime(entry.createdAt)}
                    >
                      {relativeTime(entry.createdAt)}
                    </td>
                    <td className="py-4 px-6 whitespace-nowrap">
                      <ActionBadge action={entry.action} />
                    </td>
                    <td className="py-4 px-6 whitespace-nowrap font-body font-medium">{entry.actorName ?? "System"}</td>
                    <td className="py-4 px-6 font-body text-pz-on-surface-variant">{entry.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
            }
          />
          <div className="px-6 py-4 border-t border-pz-outline-variant/40 font-body text-sm text-pz-on-surface-variant">
            Showing {visible.length} entr{visible.length === 1 ? "y" : "ies"}
          </div>
        </div>
      )}
    </div>
  );
}
