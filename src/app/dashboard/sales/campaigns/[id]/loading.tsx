export default function Loading() {
  return (
    <div role="status" aria-label="Loading your campaign" className="flex flex-col gap-6">
      <div className="h-32 rounded-xl bg-pz-surface-container-low animate-pulse" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="h-96 rounded-xl bg-pz-surface-container-low animate-pulse" />
        <div className="h-64 rounded-xl bg-pz-surface-container-low animate-pulse" />
      </div>
    </div>
  );
}
