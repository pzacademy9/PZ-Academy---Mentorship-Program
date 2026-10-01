import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function Status({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div role="status" className={cn("w-full", className)}>
      <span className="sr-only">Loading…</span>
      {children}
    </div>
  );
}

function Header({ subtitle = true }: { subtitle?: boolean }) {
  return (
    <div className="space-y-2">
      <Skeleton className="h-7 w-40 md:h-8 md:w-56" />
      {subtitle && <Skeleton className="h-4 w-64 max-w-full" />}
    </div>
  );
}

export function TableSkeleton({
  rows = 8, cols = 4, title = true, filters = true,
}: { rows?: number; cols?: number; title?: boolean; filters?: boolean }) {
  return (
    <Status className="space-y-5">
      {title && <Header />}
      {filters && (
        <div className="flex gap-2 overflow-hidden">
          <Skeleton className="h-11 flex-1 md:max-w-sm" />
          <Skeleton className="h-11 w-24" />
        </div>
      )}
      {/* phone: stacked cards */}
      <div className="space-y-2 md:hidden">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} data-skel="card" className="rounded-xl border border-border p-4 space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        ))}
      </div>
      {/* desktop: table rows */}
      <div className="hidden md:block rounded-xl border border-border">
        <div className="flex gap-4 border-b border-border p-4">
          {Array.from({ length: cols }, (_, c) => <Skeleton key={c} className="h-3 flex-1" />)}
        </div>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} data-skel="row" className="flex gap-4 border-b border-border p-4 last:border-0">
            {Array.from({ length: cols }, (_, c) => <Skeleton key={c} className="h-4 flex-1" />)}
          </div>
        ))}
      </div>
    </Status>
  );
}

export function DetailSkeleton({ sections = 3 }: { sections?: number }) {
  return (
    <Status className="space-y-5">
      <Skeleton className="h-4 w-28" />
      <Header />
      {Array.from({ length: sections }, (_, i) => (
        <div key={i} className="rounded-xl border border-border p-4 md:p-6 space-y-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ))}
    </Status>
  );
}

export function CardGridSkeleton({ stats = 4, cards = 6 }: { stats?: number; cards?: number }) {
  return (
    <Status className="space-y-5">
      <Header />
      {stats > 0 && (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 md:gap-4">
          {Array.from({ length: stats }, (_, i) => (
            <div key={i} className="rounded-xl border border-border p-4 space-y-3">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <Skeleton className="h-6 w-12" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>
      )}
      {cards > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: cards }, (_, i) => (
            <div key={i} className="overflow-hidden rounded-xl border border-border">
              <Skeleton className="h-32 w-full rounded-none" />
              <div className="p-4 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-2 w-full rounded-full" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      )}
    </Status>
  );
}

export function FormSkeleton({ fields = 5 }: { fields?: number }) {
  return (
    <Status className="space-y-5 md:max-w-2xl">
      <Header />
      <div className="rounded-xl border border-border p-4 md:p-6 space-y-5">
        {Array.from({ length: fields }, (_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-11 w-full" />
          </div>
        ))}
        <Skeleton className="h-11 w-full md:w-32" />
      </div>
    </Status>
  );
}

export function ChatSkeleton() {
  return (
    <Status className="flex gap-4">
      {/* thread list: the only column on phones */}
      <div className="w-full space-y-2 md:w-72 md:shrink-0">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-border p-3">
            <Skeleton className="h-11 w-11 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          </div>
        ))}
      </div>
      {/* conversation: desktop only */}
      <div className="hidden flex-1 space-y-3 rounded-xl border border-border p-4 md:block">
        {["w-3/5", "w-2/5", "w-2/3", "w-1/3", "w-1/2"].map((width, i) => (
          <div key={i} className={cn("flex", i % 2 ? "justify-end" : "justify-start")}>
            <Skeleton className={cn("h-10 rounded-2xl", width)} />
          </div>
        ))}
      </div>
    </Status>
  );
}

export function LessonSkeleton() {
  return (
    <Status className="space-y-5">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="aspect-video w-full rounded-xl" />
      <Header />
      <div className="space-y-2">
        {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-4 w-full last:w-2/3" />)}
      </div>
    </Status>
  );
}
