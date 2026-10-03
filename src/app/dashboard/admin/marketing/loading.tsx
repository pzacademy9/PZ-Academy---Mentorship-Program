import { CardGridSkeleton } from "@/components/ui/skeletons";

export default function Loading() {
  return <CardGridSkeleton stats={0} cards={6} />;
}
