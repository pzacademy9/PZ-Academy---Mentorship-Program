import { DetailSkeleton } from "@/components/ui/skeletons";

export default function Loading() {
  return <div className="mx-auto w-full max-w-6xl px-4 py-8 md:py-12"><DetailSkeleton sections={4} /></div>;
}
