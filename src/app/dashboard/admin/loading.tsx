import { CardGridSkeleton } from "@/components/ui/skeletons";

export default function Loading() {
  return <CardGridSkeleton stats={4} cards={0} />;
}
