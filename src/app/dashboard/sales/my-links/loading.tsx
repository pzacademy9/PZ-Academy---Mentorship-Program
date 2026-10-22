import { TableSkeleton } from "@/components/ui/skeletons";

export default function Loading() {
  return <TableSkeleton rows={4} cols={4} />;
}
