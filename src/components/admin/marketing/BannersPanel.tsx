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
import { GripVertical, Pencil, Trash2, ImageOff, Image } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { cn } from "@/lib/utils";
import { ImageUploadField } from "@/components/admin/program/ImageUploadField";
import { BANNER_SLOTS, getBannerStatus, type BannerStatus } from "@/lib/validations/admin-marketing";
import type { AdminBannerRow } from "@/lib/data/admin-marketing";

const SLOT_LABELS: Record<(typeof BANNER_SLOTS)[number], string> = {
  hero: "Hero",
  mid_page: "Mid Page",
  sidebar: "Sidebar",
  footer: "Footer",
};

const STATUS_STYLES: Record<BannerStatus, string> = {
  active: "bg-pz-primary-container text-pz-on-primary-container",
  scheduled: "bg-pz-secondary-container text-pz-on-secondary-container",
  expired: "bg-pz-surface-container-high text-pz-on-surface-variant",
  inactive: "bg-pz-surface-container-high text-pz-on-surface-variant",
};

interface FormState {
  slot: (typeof BANNER_SLOTS)[number];
  imageUrl: string;
  headline: string;
  ctaText: string;
  ctaLink: string;
  activeFrom: string;
  activeUntil: string;
}

function emptyForm(defaultSlot: (typeof BANNER_SLOTS)[number]): FormState {
  return { slot: defaultSlot, imageUrl: "", headline: "", ctaText: "", ctaLink: "", activeFrom: "", activeUntil: "" };
}

function toFormState(banner: AdminBannerRow): FormState {
  return {
    slot: banner.slot,
    imageUrl: banner.imageUrl ?? "",
    headline: banner.headline,
    ctaText: banner.ctaText,
    ctaLink: banner.ctaLink,
    activeFrom: banner.activeFrom ? banner.activeFrom.slice(0, 16) : "",
    activeUntil: banner.activeUntil ? banner.activeUntil.slice(0, 16) : "",
  };
}

export function BannersPanel({ initialBanners }: { initialBanners: AdminBannerRow[] }) {
  const router = useRouter();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const [banners, setBanners] = useState(initialBanners);
  const [slotFilter, setSlotFilter] = useState<(typeof BANNER_SLOTS)[number] | "all">("hero");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm("hero"));
  const confirm = useConfirm();

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function startNew() {
    setEditingId(null);
    setForm(emptyForm(slotFilter === "all" ? "hero" : slotFilter));
  }

  function startEdit(banner: AdminBannerRow) {
    setEditingId(banner.id);
    setForm(toFormState(banner));
  }

  const { run: submit, pending: saving } = useAsyncAction(async () => {
    if (!form.headline.trim() || !form.ctaText.trim() || !form.ctaLink.trim()) {
      toast.error("Headline, CTA text, and CTA link are required.");
      return;
    }
    const body = {
      slot: form.slot,
      imageUrl: form.imageUrl.trim() || undefined,
      headline: form.headline.trim(),
      ctaText: form.ctaText.trim(),
      ctaLink: form.ctaLink.trim(),
      activeFrom: form.activeFrom ? new Date(form.activeFrom).toISOString() : undefined,
      activeUntil: form.activeUntil ? new Date(form.activeUntil).toISOString() : undefined,
    };
    const res = await fetch(editingId ? `/api/admin/banners/${editingId}` : "/api/admin/banners", {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await res.json().catch(() => null)) as { id?: string; error?: string; warning?: string | null } | null;
    if (!res.ok) {
      toast.error(payload?.error ?? "Could not save banner.");
      return;
    }
    if (payload?.warning) toast.warning(payload.warning);

    // router.refresh() alone won't update this component's state — it only
    // re-renders the server tree; a mounted client component's useState
    // keeps its existing value across that re-render. Update locally instead.
    const existing = editingId ? banners.find((b) => b.id === editingId) : undefined;
    const savedRow: AdminBannerRow = {
      id: editingId ?? payload!.id!,
      slot: form.slot,
      imageUrl: form.imageUrl.trim() || null,
      headline: form.headline.trim(),
      ctaText: form.ctaText.trim(),
      ctaLink: form.ctaLink.trim(),
      isActive: existing?.isActive ?? true,
      activeFrom: form.activeFrom ? new Date(form.activeFrom).toISOString() : null,
      activeUntil: form.activeUntil ? new Date(form.activeUntil).toISOString() : null,
      orderIndex:
        existing?.orderIndex ??
        Math.max(-1, ...banners.filter((b) => b.slot === form.slot).map((b) => b.orderIndex)) + 1,
    };
    setBanners((prev) => (editingId ? prev.map((b) => (b.id === editingId ? savedRow : b)) : [...prev, savedRow]));

    toast.success(editingId ? "Banner updated." : "Banner created.");
    setEditingId(null);
    setForm(emptyForm(form.slot));
  });

  const { run: toggleActive, pending: toggling, pendingKey: togglingId } = useAsyncAction(async (banner: AdminBannerRow) => {
    setBanners((prev) => prev.map((b) => (b.id === banner.id ? { ...b, isActive: !b.isActive } : b)));
    const res = await fetch(`/api/admin/banners/${banner.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !banner.isActive }),
    });
    if (!res.ok) {
      toast.error("Could not update banner.");
      setBanners((prev) => prev.map((b) => (b.id === banner.id ? { ...b, isActive: banner.isActive } : b)));
    }
  }, { getKey: (banner) => banner.id });

  const { run: remove, pending: removing, pendingKey: removingId } = useAsyncAction(async (banner: AdminBannerRow) => {
    if (!(await confirm({ title: "Delete banner?", description: `"${banner.headline}" will be removed.`, confirmLabel: "Delete", destructive: true }))) return;
    const res = await fetch(`/api/admin/banners/${banner.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Could not delete banner.");
      return;
    }
    const payload = (await res.json().catch(() => null)) as { warning?: string | null } | null;
    setBanners((prev) => prev.filter((b) => b.id !== banner.id));
    toast.success("Banner deleted.");
    if (payload?.warning) toast.warning(payload.warning);
    if (editingId === banner.id) startNew();
  }, { getKey: (banner) => banner.id });

  async function persistOrder(slot: (typeof BANNER_SLOTS)[number], next: AdminBannerRow[]) {
    const res = await fetch("/api/admin/banners/reorder", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot, orderedIds: next.map((b) => b.id) }),
    });
    if (!res.ok) {
      toast.error("Could not save banner order.");
      router.refresh();
    }
  }

  function handleDragEnd(slot: (typeof BANNER_SLOTS)[number], event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const slotBanners = banners.filter((b) => b.slot === slot);
    const oldIndex = slotBanners.findIndex((b) => b.id === active.id);
    const newIndex = slotBanners.findIndex((b) => b.id === over.id);
    const reordered = arrayMove(slotBanners, oldIndex, newIndex);
    setBanners((prev) => [...prev.filter((b) => b.slot !== slot), ...reordered]);
    void persistOrder(slot, reordered);
  }

  const visible =
    slotFilter === "all"
      ? [...banners].sort((a, b) => (a.slot === b.slot ? a.orderIndex - b.orderIndex : a.slot.localeCompare(b.slot)))
      : banners.filter((b) => b.slot === slotFilter).sort((a, b) => a.orderIndex - b.orderIndex);

  const rowState = { togglingId, removingId, busy: toggling || removing };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSlotFilter("all")}
            className={cn(
              "px-4 py-1.5 max-md:min-h-11 rounded-full font-headline text-xs font-semibold transition-all",
              slotFilter === "all"
                ? "bg-pz-primary-container text-pz-on-primary-container"
                : "bg-pz-surface-container-high text-pz-on-surface-variant hover:bg-pz-surface-variant",
            )}
          >
            All Slots
          </button>
          {BANNER_SLOTS.map((slot) => (
            <button
              key={slot}
              onClick={() => setSlotFilter(slot)}
              className={cn(
                "px-4 py-1.5 max-md:min-h-11 rounded-full font-headline text-xs font-semibold transition-all",
                slotFilter === slot
                  ? "bg-pz-primary-container text-pz-on-primary-container"
                  : "bg-pz-surface-container-high text-pz-on-surface-variant hover:bg-pz-surface-variant",
              )}
            >
              {SLOT_LABELS[slot]}
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <EmptyState
            icon={ImageOff}
            title="No banners in this slot yet"
            description="Use the form to create one."
          />
        ) : slotFilter === "all" ? (
          <div className="space-y-2">
            {visible.map((b) => (
              <BannerRow key={b.id} banner={b} onEdit={() => startEdit(b)} onToggle={() => toggleActive(b)} onDelete={() => remove(b)} {...rowState} />
            ))}
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDragEnd(slotFilter, e)}>
            <SortableContext items={visible.map((b) => b.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {visible.map((b) => (
                  <SortableBannerRow key={b.id} banner={b} onEdit={() => startEdit(b)} onToggle={() => toggleActive(b)} onDelete={() => remove(b)} {...rowState} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      <div className="bg-pz-surface-container-lowest rounded-2xl border border-pz-outline-variant/40 p-5 space-y-4 h-fit">
        <div className="flex items-center justify-between">
          <h3 className="font-headline font-bold text-pz-on-surface">{editingId ? "Edit Banner" : "New Banner"}</h3>
          {editingId && (
            <button onClick={startNew} className="text-xs font-bold text-pz-on-surface-variant hover:text-pz-primary max-md:min-h-11 max-md:min-w-11">
              Cancel
            </button>
          )}
        </div>

        <div>
          <label className="text-xs font-bold text-pz-on-surface-variant block mb-1">Slot</label>
          <select
            value={form.slot}
            onChange={(e) => set("slot", e.target.value as FormState["slot"])}
            className="w-full border border-pz-outline-variant rounded-lg px-3 py-2 text-sm font-body bg-pz-surface max-md:text-base max-md:min-h-11"
          >
            {BANNER_SLOTS.map((slot) => (
              <option key={slot} value={slot}>
                {SLOT_LABELS[slot]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-bold text-pz-on-surface-variant block mb-1">Banner Image</label>
          <ImageUploadField
            value={form.imageUrl}
            onChange={(url) => set("imageUrl", url)}
            courseSlug="marketing"
            kind="banner"
            shape="square"
            icon={Image}
            inputClassName="w-full border border-pz-outline-variant rounded-lg px-3 py-2 text-sm font-body max-md:text-base max-md:min-h-11"
          />
        </div>

        <div>
          <label className="text-xs font-bold text-pz-on-surface-variant block mb-1">Headline</label>
          <input
            type="text"
            value={form.headline}
            onChange={(e) => set("headline", e.target.value)}
            className="w-full border border-pz-outline-variant rounded-lg px-3 py-2 text-sm font-body max-md:text-base max-md:min-h-11"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-pz-on-surface-variant block mb-1">CTA Text</label>
            <input
              type="text"
              value={form.ctaText}
              onChange={(e) => set("ctaText", e.target.value)}
              placeholder="e.g. Enroll Now"
              className="w-full border border-pz-outline-variant rounded-lg px-3 py-2 text-sm font-body max-md:text-base max-md:min-h-11"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-pz-on-surface-variant block mb-1">CTA Link</label>
            <input
              type="text"
              value={form.ctaLink}
              onChange={(e) => set("ctaLink", e.target.value)}
              placeholder="/courses"
              className="w-full border border-pz-outline-variant rounded-lg px-3 py-2 text-sm font-body max-md:text-base max-md:min-h-11"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-pz-on-surface-variant block mb-1">Schedule (optional)</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="datetime-local"
              value={form.activeFrom}
              onChange={(e) => set("activeFrom", e.target.value)}
              className="w-full border border-pz-outline-variant rounded-lg px-3 py-2 text-sm font-body max-md:text-base max-md:min-h-11"
            />
            <input
              type="datetime-local"
              value={form.activeUntil}
              onChange={(e) => set("activeUntil", e.target.value)}
              className="w-full border border-pz-outline-variant rounded-lg px-3 py-2 text-sm font-body max-md:text-base max-md:min-h-11"
            />
          </div>
        </div>

        <Button
          variant="bare"
          size="bare"
          loading={saving}
          onClick={() => submit()}
          className="w-full bg-pz-primary text-pz-on-primary rounded-lg py-2.5 max-md:min-h-11 font-headline font-bold text-sm disabled:opacity-50"
        >
          {saving ? "Saving…" : editingId ? "Save Changes" : "Create Banner"}
        </Button>
      </div>
    </div>
  );
}

function BannerRow({
  banner,
  onEdit,
  onToggle,
  onDelete,
  dragHandle,
  togglingId,
  removingId,
  busy,
}: {
  banner: AdminBannerRow;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  dragHandle?: React.ReactNode;
  togglingId: string | null;
  removingId: string | null;
  busy: boolean;
}) {
  const status = getBannerStatus(banner);
  return (
    <div className="bg-pz-surface rounded-lg border border-pz-outline-variant p-3 flex flex-wrap md:flex-nowrap items-center gap-3">
      {dragHandle}
      <div className="w-14 h-10 shrink-0 rounded-md overflow-hidden bg-pz-surface-container flex items-center justify-center">
        {banner.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={banner.imageUrl} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
        ) : (
          <ImageOff className="w-4 h-4 text-pz-on-surface-variant/40" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-body font-medium text-sm text-pz-on-surface truncate">{banner.headline}</p>
        <p className="font-body text-xs text-pz-on-surface-variant truncate">
          {SLOT_LABELS[banner.slot]} · {banner.ctaText}
        </p>
      </div>
      {/* Controls drop to their own line on phones so the headline keeps room; md:contents keeps the desktop row identical. */}
      <div className="flex items-center gap-3 max-md:basis-full max-md:justify-end md:contents">
        <span className={cn("text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full shrink-0", STATUS_STYLES[status])}>
          {status}
        </span>
        <Button
          variant="bare"
          size="bare"
          onClick={onToggle}
          loading={togglingId === banner.id}
          disabled={busy}
          title={banner.isActive ? "Deactivate" : "Activate"}
          aria-label={banner.isActive ? "Deactivate banner" : "Activate banner"}
          className="shrink-0 max-md:min-h-11 max-md:min-w-11"
        >
          <span
            className={cn(
              "relative block w-9 h-5 rounded-full transition-colors",
              banner.isActive ? "bg-pz-primary" : "bg-pz-outline-variant",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform",
                banner.isActive && "translate-x-4",
              )}
            />
          </span>
        </Button>
        <button
          onClick={onEdit}
          aria-label="Edit banner"
          className="p-1.5 max-md:min-h-11 max-md:min-w-11 inline-flex items-center justify-center text-pz-on-surface-variant hover:text-pz-primary shrink-0"
        >
          <Pencil className="w-4 h-4" />
        </button>
        <Button
          variant="bare"
          size="bare"
          onClick={onDelete}
          loading={removingId === banner.id}
          disabled={busy}
          aria-label="Delete banner"
          className="p-1.5 max-md:min-h-11 max-md:min-w-11 text-pz-on-surface-variant hover:text-pz-danger shrink-0"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

function SortableBannerRow(props: {
  banner: AdminBannerRow;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  togglingId: string | null;
  removingId: string | null;
  busy: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.banner.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div ref={setNodeRef} style={style}>
      <BannerRow
        {...props}
        dragHandle={
          <span {...attributes} {...listeners} className="text-pz-on-surface-variant/40 cursor-grab active:cursor-grabbing shrink-0 max-md:min-h-11 max-md:min-w-11 max-md:inline-flex max-md:items-center max-md:justify-center max-md:touch-none">
            <GripVertical className="w-4 h-4" />
          </span>
        }
      />
    </div>
  );
}
