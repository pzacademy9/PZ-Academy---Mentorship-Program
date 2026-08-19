import Link from "next/link";
import { Inbox } from "lucide-react";
import { relativeTime } from "@/lib/format";
import type { ConversationSummary } from "@/lib/data/mentor-messaging";

export function ConversationList({
  conversations,
  emptyMessage,
}: {
  conversations: ConversationSummary[];
  emptyMessage: string;
}) {
  if (conversations.length === 0) {
    return (
      <div className="bg-pz-surface-container rounded-2xl border border-pz-outline-variant/40 p-10 flex flex-col items-center text-center">
        <Inbox className="w-10 h-10 text-pz-outline-variant mb-3" />
        <p className="font-body text-pz-on-surface-variant text-sm">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {conversations.map((c) => (
        <Link
          key={c.id}
          href={c.href}
          className="flex items-center justify-between gap-4 bg-pz-surface-container-lowest rounded-2xl border border-pz-outline-variant/40 hover:border-pz-primary/40 hover:shadow-card transition-all p-5"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {c.unread && <span className="w-2 h-2 rounded-full bg-pz-primary shrink-0" />}
              <p className="font-headline font-bold text-pz-on-surface truncate">{c.counterpartName}</p>
            </div>
            {c.lastMessagePreview && (
              <p className="font-body text-sm text-pz-on-surface-variant truncate mt-1">{c.lastMessagePreview}</p>
            )}
          </div>
          {c.lastMessageAt && (
            <span className="font-body text-xs text-pz-on-surface-variant shrink-0">{relativeTime(c.lastMessageAt)}</span>
          )}
        </Link>
      ))}
    </div>
  );
}
