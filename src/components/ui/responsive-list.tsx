import Link from "next/link";
import { cn } from "@/lib/utils";

export function ResponsiveList<T>({
  rows, getKey, mobile, table, selection, empty,
}: {
  rows: T[];
  getKey: (row: T) => string;
  mobile: {
    title: (row: T) => React.ReactNode;
    meta?: (row: T) => React.ReactNode[];
    href?: (row: T) => string;
  };
  /** The existing desktop table, rendered unchanged at md and up. */
  table: React.ReactNode;
  selection?: { isSelected: (row: T) => boolean; onToggle: (row: T) => void; label: (row: T) => string };
  empty?: React.ReactNode;
}) {
  if (rows.length === 0 && empty) return <>{empty}</>;
  return (
    <>
      <ul data-testid="responsive-cards" className="space-y-2 md:hidden">
        {rows.map((row) => {
          const href = mobile.href?.(row);
          const meta = mobile.meta?.(row) ?? [];
          const body = (
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium text-foreground">{mobile.title(row)}</div>
              {meta.map((m, i) => (
                <div key={i} className="truncate text-sm text-muted-foreground">{m}</div>
              ))}
            </div>
          );
          return (
            <li key={getKey(row)} className="flex items-stretch rounded-xl border border-border bg-card">
              {selection && (
                <label className="flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center">
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-primary"
                    aria-label={selection.label(row)}
                    checked={selection.isSelected(row)}
                    onChange={() => selection.onToggle(row)}
                  />
                </label>
              )}
              {href ? (
                <Link href={href} className={cn("flex min-h-11 flex-1 items-center p-3 active:bg-muted", selection && "pl-0")}>
                  {body}
                </Link>
              ) : (
                <div className={cn("flex flex-1 items-center p-3", selection && "pl-0")}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="hidden md:block">{table}</div>
    </>
  );
}
