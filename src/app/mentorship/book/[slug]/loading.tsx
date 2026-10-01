import { FormSkeleton } from "@/components/ui/skeletons";

export default function Loading() {
  return <div className="mx-auto w-full max-w-6xl px-4 py-8 md:py-12"><FormSkeleton fields={5} /></div>;
}
