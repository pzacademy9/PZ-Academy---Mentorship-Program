import { CardGridSkeleton } from "@/components/ui/skeletons";

export default function Loading() {
  return <CardGridSkeleton stats={3} cards={4} />;
}
