"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Search, Download, ChevronRight, GripVertical, AlertTriangle, Users } from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { ResponsiveList } from "@/components/ui/responsive-list";
import { EmptyState } from "@/components/ui/empty-state";
import type { MentorListRow } from "@/lib/data/admin-mentors";
import { MentorTierPill } from "./MentorTierPill";

const VISIBILITY_BADGE: Record<MentorListRow["visibility"], string> = {
  published: "bg-pz-primary-container text-pz-on-primary-container",
  draft: "bg-pz-surface-container-high text-pz-on-surface-variant",
  hidden: "bg-pz-secondary-container text-pz-on-secondary-container",
};

function toCsv(rows: MentorListRow[]): string {
  const header = ["Name", "Slug", "Expertise", "Price (PKR)", "Tier", "Visibility", "Bookings"];
  const lines = rows.map((r) =>
    [r.name, r.slug, r.expertise, r.pricePerSession, r.tier, r.visibility, r.bookingCount]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(","),
  );
  return [header.join(","), ...lines].join("\n");
}

function downloadCsv(rows: MentorListRow[]) {
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "mentors.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function MentorRegistryTable({ rows: initialRows }: { rows: MentorListRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [query, setQuery] = useState("");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q) || r.slug.toLowerCase().includes(q));
  }, [rows, query]);

  const searching = query.trim().length > 0;

  async function persistOrder(next: MentorListRow[]) {
    const res = await fetch("/api/admin/mentors/reorder", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds: next.map((r) => r.id) }),
    });
    if (!res.ok) {
      toast.error("Could not save mentor order.");
      router.refresh();
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = rows.findIndex((r) => r.id === active.id);
    const newIndex = rows.findIndex((r) => r.id === over.id);
    const next = arrayMove(rows, oldIndex, newIndex);
    setRows(next);
    void persistOrder(next);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="relative w-full md:flex-1 md:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-pz-on-surface-variant" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search mentors by name or slug..."
            className="w-full bg-pz-surface-container-lowest border border-pz-outline-variant rounded-lg pl-9 pr-4 py-2 text-sm max-md:text-base max-md:min-h-11 focus:outline-none focus:ring-2 focus:ring-pz-primary/30 focus:border-pz-primary"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => downloadCsv(filtered)}
            className="flex items-center gap-2 px-4 py-2 max-md:min-h-11 rounded-lg border border-pz-outline-variant text-sm font-medium text-pz-on-surface-variant hover:bg-pz-surface-container-low transition-colors"
          >
            <Download className="w-4 h-4" />
            Export List
          </button>
          <Link
            href="/dashboard/admin/mentors/new"
            className="flex items-center gap-2 px-4 py-2 max-md:min-h-11 rounded-lg bg-pz-primary text-pz-on-primary text-sm font-bold shadow-sm hover:opacity-90 transition-opacity"
          >
            + Create New Mentor
          </Link>
        </div>
      </div>

      <ResponsiveList
        rows={filtered}
        getKey={(r) => r.id}
        mobile={{
          title: (r) => r.name,
          meta: (r) =>
            [
              r.expertise,
              `PKR ${r.pricePerSession.toLocaleString()} · ${r.tier} · ${r.visibility}`,
              `${r.bookingCount} ${r.bookingCount === 1 ? "booking" : "bookings"}`,
            ].filter(Boolean),
          href: (r) => `/dashboard/admin/mentors/${r.id}`,
        }}
        empty={
          searching ? (
            <EmptyState icon={Search} title="No mentors match your search." description="Try a different name or slug." />
          ) : (
            <EmptyState
              icon={Users}
              title="No mentors yet"
              description="Create the first mentor profile to get started."
              action={{ label: "+ Create New Mentor", href: "/dashboard/admin/mentors/new" }}
            />
          )
        }
        table={
          <div className="bg-pz-surface-container-lowest rounded-xl border border-pz-outline-variant overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-pz-outline-variant bg-pz-surface-container-low text-left text-[10px] uppercase tracking-widest text-pz-on-surface-variant">
                  <th className="px-4 py-3 font-bold w-8" />
                  <th className="px-6 py-3 font-bold">Mentor</th>
                  <th className="px-6 py-3 font-bold">Price</th>
                  <th className="px-6 py-3 font-bold">Tier</th>
                  <th className="px-6 py-3 font-bold">Visibility</th>
                  <th className="px-6 py-3 font-bold">Bookings</th>
                  <th className="px-6 py-3 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={filtered.map((r) => r.id)} strategy={verticalListSortingStrategy}>
                  <tbody>
                    {filtered.map((row) => (
                      <MentorRow key={row.id} row={row} dragDisabled={searching} />
                    ))}
                  </tbody>
                </SortableContext>
              </DndContext>
            </table>
            <div className="px-6 py-3 text-xs text-pz-on-surface-variant border-t border-pz-outline-variant bg-pz-surface-container-low">
              Showing {filtered.length} of {rows.length} mentors
            </div>
          </div>
        }
      />
      {filtered.length > 0 && (
        <p className="text-xs text-pz-on-surface-variant md:hidden">
          Showing {filtered.length} of {rows.length} mentors
        </p>
      )}

      <p className="text-xs text-pz-on-surface-variant italic">
        On desktop, drag rows to set the order mentors appear in within their tier on the public /mentorship page. Higher tiers always sort above lower ones. Draft and Hidden mentors are never shown publicly.
      </p>
    </div>
  );
}

function MentorRow({ row, dragDisabled }: { row: MentorListRow; dragDisabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className="border-b border-pz-outline-variant/50 last:border-b-0 hover:bg-pz-surface-container-low/50 transition-colors"
    >
      <td className="px-4 py-4">
        {!dragDisabled && (
          <span
            {...attributes}
            {...listeners}
            className="text-pz-on-surface-variant/40 cursor-grab active:cursor-grabbing inline-flex"
          >
            <GripVertical className="w-4 h-4" />
          </span>
        )}
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-1.5">
          <p className="font-headline font-bold text-pz-on-surface">{row.name}</p>
          {!row.hasLinkedAccount && (
            <span
              title="No linked account — mentorship feedback won't auto-create."
              aria-label="No linked account — mentorship feedback won't auto-create."
              className="inline-flex shrink-0"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-pz-danger" />
            </span>
          )}
        </div>
        <span className="text-xs text-pz-on-surface-variant font-mono">{row.slug}</span>
        {row.expertise && <span className="block text-xs text-pz-on-surface-variant mt-0.5">{row.expertise}</span>}
      </td>
      <td className="px-6 py-4 text-pz-on-surface">PKR {row.pricePerSession.toLocaleString()}</td>
      <td className="px-6 py-4">
        <MentorTierPill tier={row.tier} />
      </td>
      <td className="px-6 py-4">
        <span
          className={cn(
            "text-xs font-bold px-2.5 py-1 rounded-full capitalize",
            VISIBILITY_BADGE[row.visibility],
          )}
        >
          {row.visibility}
        </span>
      </td>
      <td className="px-6 py-4 text-pz-on-surface-variant">{row.bookingCount}</td>
      <td className="px-6 py-4 text-right">
        <Link
          href={`/dashboard/admin/mentors/${row.id}`}
          className="inline-flex items-center gap-1 text-pz-primary font-medium hover:underline"
        >
          Edit <ChevronRight className="w-4 h-4" />
        </Link>
      </td>
    </tr>
  );
}
