import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div role="status" aria-label="Loading the page editor" className="space-y-4">
      <Skeleton className="h-10 w-full" />
      <div className="grid gap-4 lg:grid-cols-[17rem_minmax(0,1fr)_minmax(0,1.1fr)]">
        <Skeleton className="h-96" />
        <Skeleton className="h-96" />
        <Skeleton className="hidden h-96 lg:block" />
      </div>
    </div>
  );
}
