import { TableSkeleton } from "@/components/ui/skeletons";

export default function Loading() {
  return <TableSkeleton cols={3} filters={false} />;
}
