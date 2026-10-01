"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X, ImageOff, PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { cn } from "@/lib/utils";
import type { AdminFeaturedItemRow, AvailableCourseRow } from "@/lib/data/admin-marketing";

const AVAIL_PREFIX = "avail-";
const FEAT_PREFIX = "feat-";
const FEATURED_DROP_ZONE = "featured-drop-zone";

interface FeaturedEntry {
  courseId: string;
  featuredItemId: string;
  title: string;
  slug: string;
  thumbnailUrl: string | null;
  itemType: "course" | "webinar";
}

export function FeaturedBoard({
  initialAvailable,
  initialFeatured,
}: {
  initialAvailable: AvailableCourseRow[];
  initialFeatured: AdminFeaturedItemRow[];
}) {
  const router = useRouter();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const [available, setAvailable] = useState<AvailableCourseRow[]>(initialAvailable);
  const [featured, setFeatured] = useState<FeaturedEntry[]>(
    initialFeatured.map((f) => ({
      courseId: f.itemId,
      featuredItemId: f.id,
      title: f.courseTitle,
      slug: f.courseSlug,
      thumbnailUrl: f.courseThumbnailUrl,
      itemType: f.itemType,
    })),
  );

  async function persistOrder(next: FeaturedEntry[]) {
    const res = await fetch("/api/admin/featured-items/reorder", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds: next.map((f) => f.featuredItemId) }),
    });
    if (!res.ok) {
      toast.error("Could not save featured order.");
      router.refresh();
    }
  }

  async function addToFeatured(course: AvailableCourseRow, atIndex: number) {
    setAvailable((prev) => prev.filter((c) => c.id !== course.id));
    const placeholder: FeaturedEntry = {
      courseId: course.id,
      featuredItemId: `pending-${course.id}`,
      title: course.title,
      slug: course.slug,
      thumbnailUrl: course.thumbnailUrl,
      itemType: course.type === "webinar" ? "webinar" : "course",
    };
    setFeatured((prev) => {
      const next = [...prev];
      next.splice(atIndex, 0, placeholder);
      return next;
    });

    const res = await fetch("/api/admin/featured-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemType: placeholder.itemType, itemId: course.id }),
    });
    const payload = (await res.json().catch(() => null)) as { id?: string; error?: string } | null;

    if (!res.ok || !payload?.id) {
      toast.error(payload?.error ?? "Could not feature this item.");
      setFeatured((prev) => prev.filter((f) => f.courseId !== course.id));
      setAvailable((prev) => [...prev, course].sort((a, b) => a.title.localeCompare(b.title)));
      return;
    }

    setFeatured((prev) => {
      const next = prev.map((f) => (f.courseId === course.id ? { ...f, featuredItemId: payload.id! } : f));
      void persistOrder(next);
      return next;
    });
    toast.success("Added to featured.");
  }

  async function removeFromFeatured(entry: FeaturedEntry) {
    setFeatured((prev) => prev.filter((f) => f.courseId !== entry.courseId));
    setAvailable((prev) =>
      [...prev, { id: entry.courseId, title: entry.title, slug: entry.slug, type: entry.itemType, thumbnailUrl: entry.thumbnailUrl }].sort(
        (a, b) => a.title.localeCompare(b.title),
      ),
    );
    const res = await fetch(`/api/admin/featured-items/${entry.featuredItemId}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Could not remove featured item.");
      router.refresh();
      return;
    }
    toast.success("Removed from featured.");
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);

    if (activeId.startsWith(AVAIL_PREFIX)) {
      const courseId = activeId.slice(AVAIL_PREFIX.length);
      const course = available.find((c) => c.id === courseId);
      if (!course) return;
      const overId = String(over.id);
      let dropIndex = featured.length;
      if (overId.startsWith(FEAT_PREFIX)) {
        const overCourseId = overId.slice(FEAT_PREFIX.length);
        const overIndex = featured.findIndex((f) => f.courseId === overCourseId);
        if (overIndex !== -1) dropIndex = overIndex;
      } else if (overId !== FEATURED_DROP_ZONE) {
        return;
      }
      void addToFeatured(course, dropIndex);
      return;
    }

    if (activeId.startsWith(FEAT_PREFIX)) {
      const overId = String(over.id);
      if (!overId.startsWith(FEAT_PREFIX) || overId === activeId) return;
      const fromCourseId = activeId.slice(FEAT_PREFIX.length);
      const toCourseId = overId.slice(FEAT_PREFIX.length);
      const oldIndex = featured.findIndex((f) => f.courseId === fromCourseId);
      const newIndex = featured.findIndex((f) => f.courseId === toCourseId);
      if (oldIndex === -1 || newIndex === -1) return;
      const next = arrayMove(featured, oldIndex, newIndex);
      setFeatured(next);
      void persistOrder(next);
    }
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h3 className="font-headline font-bold text-pz-on-surface mb-3 flex items-center justify-between">
            Available Courses <span className="text-xs font-normal text-pz-on-surface-variant">{available.length} items</span>
          </h3>
          <div className="space-y-2 max-h-[32rem] overflow-y-auto pr-1">
            {available.length === 0 ? (
              <p className="text-sm font-body text-pz-on-surface-variant italic py-6 text-center">Everything published is already featured.</p>
            ) : (
              available.map((course) => <DraggableCourseCard key={course.id} course={course} />)
            )}
          </div>
        </div>

        <div>
          <h3 className="font-headline font-bold text-pz-on-surface mb-3 flex items-center gap-2">
            <span className="text-pz-secondary">★</span> Featured — Homepage Order
          </h3>
          <SortableContext items={featured.map((f) => `${FEAT_PREFIX}${f.courseId}`)} strategy={verticalListSortingStrategy}>
            <FeaturedDropZone>
              {featured.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
                  <PlusCircle className="w-6 h-6 text-pz-on-surface-variant/40" />
                  <p className="text-xs font-body text-pz-on-surface-variant">Drag a course here to feature it.</p>
                </div>
              )}
              {featured.map((entry, index) => (
                <FeaturedCard key={entry.courseId} entry={entry} index={index} onRemove={() => removeFromFeatured(entry)} />
              ))}
            </FeaturedDropZone>
          </SortableContext>
        </div>
      </div>
    </DndContext>
  );
}

/**
 * useDroppable() must be called by a component rendered as a child of
 * DndContext, not by the component that renders DndContext itself — that
 * component's own hook calls run before its returned JSX becomes a subtree,
 * so it can never see a context its own output provides. Confirmed by
 * instrumenting onDragMove: collisions was Array(0) the entire drag while
 * this hook lived in FeaturedBoard directly.
 */
function FeaturedDropZone({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: FEATURED_DROP_ZONE });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "space-y-2 min-h-[8rem] rounded-xl p-2 border-2 border-dashed transition-colors",
        isOver ? "border-pz-primary bg-pz-primary-container/10" : "border-pz-outline-variant/40",
      )}
    >
      {children}
    </div>
  );
}

function DraggableCourseCard({ course }: { course: AvailableCourseRow }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `${AVAIL_PREFIX}${course.id}` });
  const style = transform ? { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.5 : 1, zIndex: isDragging ? 10 : undefined } : undefined;
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="bg-pz-surface rounded-lg border border-pz-outline-variant p-3 flex items-center gap-3 cursor-grab active:cursor-grabbing touch-none"
    >
      <div className="w-10 h-10 shrink-0 rounded-md overflow-hidden bg-pz-surface-container flex items-center justify-center">
        {course.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={course.thumbnailUrl} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
        ) : (
          <ImageOff className="w-4 h-4 text-pz-on-surface-variant/40" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-body font-medium text-sm text-pz-on-surface truncate">{course.title}</p>
        <p className="font-body text-xs text-pz-on-surface-variant capitalize">{course.type}</p>
      </div>
    </div>
  );
}

function FeaturedCard({ entry, index, onRemove }: { entry: FeaturedEntry; index: number; onRemove: () => Promise<void> }) {
  // Per-card lock: removing one card must never block removing another.
  const { run: remove, pending: removing } = useAsyncAction(onRemove);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `${FEAT_PREFIX}${entry.courseId}` });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div ref={setNodeRef} style={style} className="bg-pz-surface rounded-lg border border-pz-outline-variant p-3 flex items-center gap-3">
      <span
        {...attributes}
        {...listeners}
        className="text-pz-on-surface-variant/40 cursor-grab active:cursor-grabbing shrink-0 touch-none max-md:min-h-11 max-md:min-w-11 max-md:inline-flex max-md:items-center max-md:justify-center"
      >
        <GripVertical className="w-4 h-4" />
      </span>
      <span className="w-6 h-6 shrink-0 rounded-full bg-pz-secondary-container text-pz-on-secondary-container grid place-items-center text-xs font-bold">
        {index + 1}
      </span>
      <div className="w-10 h-10 shrink-0 rounded-md overflow-hidden bg-pz-surface-container flex items-center justify-center">
        {entry.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={entry.thumbnailUrl} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
        ) : (
          <ImageOff className="w-4 h-4 text-pz-on-surface-variant/40" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-body font-medium text-sm text-pz-on-surface truncate">{entry.title}</p>
        <p className="font-body text-xs text-pz-on-surface-variant capitalize">{entry.itemType}</p>
      </div>
      <Button
        variant="bare"
        size="bare"
        onClick={() => remove()}
        loading={removing}
        aria-label="Remove from featured"
        className="p-1 max-md:min-h-11 max-md:min-w-11 text-pz-on-surface-variant hover:text-pz-danger shrink-0"
      >
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
}
