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
import { GripVertical, Pencil, Trash2, PlusCircle, FolderPlus, Video, FileText, FileType2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import type { BuilderModule, BuilderLesson } from "@/lib/data/admin-lms";

const CONTENT_ICON = { video: Video, text: FileText, pdf: FileType2 } as const;

type DeleteTarget = { kind: "module" | "lesson"; id: string; title: string };

interface Props {
  courseId: string;
  flat: boolean;
  modules: BuilderModule[];
  selectedLessonId: string | null;
  onSelectLesson: (lesson: BuilderLesson) => void;
  onModulesChange: (modules: BuilderModule[]) => void;
}

export function CurriculumMap({ courseId, flat, modules, selectedLessonId, onSelectLesson, onModulesChange }: Props) {
  const router = useRouter();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const [addingModule, setAddingModule] = useState(false);
  const [newModuleTitle, setNewModuleTitle] = useState("");
  const [addingLessonFor, setAddingLessonFor] = useState<string | null>(null);
  const [newLessonTitle, setNewLessonTitle] = useState("");
  const [editingModule, setEditingModule] = useState<string | null>(null);
  const [editModuleTitle, setEditModuleTitle] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteWarning, setDeleteWarning] = useState<string | null>(null);

  const totalLessons = modules.reduce((n, m) => n + m.lessons.length, 0);

  async function persistModuleOrder(next: BuilderModule[]) {
    const res = await fetch(`/api/admin/courses/${courseId}/modules/reorder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds: next.map((m) => m.id) }),
    });
    if (!res.ok) {
      toast.error("Could not save module order.");
      router.refresh();
      return;
    }
    const payload = (await res.json().catch(() => null)) as { warning?: string | null } | null;
    if (payload?.warning) toast.warning(payload.warning);
  }

  async function persistLessonOrder(moduleId: string, lessons: BuilderLesson[]) {
    const res = await fetch(`/api/admin/modules/${moduleId}/lessons/reorder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds: lessons.map((l) => l.id) }),
    });
    if (!res.ok) {
      toast.error("Could not save session order.");
      router.refresh();
      return;
    }
    const payload = (await res.json().catch(() => null)) as { warning?: string | null } | null;
    if (payload?.warning) toast.warning(payload.warning);
  }

  function handleModuleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = modules.findIndex((m) => m.id === active.id);
    const newIndex = modules.findIndex((m) => m.id === over.id);
    const next = arrayMove(modules, oldIndex, newIndex);
    onModulesChange(next);
    void persistModuleOrder(next);
  }

  function handleLessonDragEnd(moduleId: string, event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    let reordered: BuilderLesson[] = [];
    const next = modules.map((m) => {
      if (m.id !== moduleId) return m;
      const oldIndex = m.lessons.findIndex((l) => l.id === active.id);
      const newIndex = m.lessons.findIndex((l) => l.id === over.id);
      reordered = arrayMove(m.lessons, oldIndex, newIndex);
      return { ...m, lessons: reordered };
    });
    onModulesChange(next);
    void persistLessonOrder(moduleId, reordered);
  }

  const { run: submitNewModule, pending: addingModuleBusy } = useAsyncAction(async () => {
    const title = newModuleTitle.trim();
    if (!title) return;
    const res = await fetch(`/api/admin/courses/${courseId}/modules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      toast.error(payload?.error ?? "Could not create this module.");
      return;
    }
    setNewModuleTitle("");
    setAddingModule(false);
    router.refresh();
  });

  const { run: submitNewLesson, pending: addingLessonBusy } = useAsyncAction(async (moduleId: string) => {
    const title = newLessonTitle.trim();
    if (!title) return;
    const res = await fetch(`/api/admin/modules/${moduleId}/lessons`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, contentType: "text" }),
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      toast.error(payload?.error ?? "Could not create this session.");
      return;
    }
    setNewLessonTitle("");
    setAddingLessonFor(null);
    router.refresh();
  });

  const { run: submitModuleRename } = useAsyncAction(async (moduleId: string) => {
    const title = editModuleTitle.trim();
    if (!title) {
      setEditingModule(null);
      return;
    }
    const res = await fetch(`/api/admin/modules/${moduleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) {
      toast.error("Could not rename this module.");
      setEditingModule(null);
      return;
    }
    onModulesChange(modules.map((m) => (m.id === moduleId ? { ...m, title } : m)));
    setEditingModule(null);
  });

  function requestDelete(target: DeleteTarget) {
    setDeleteTarget(target);
    setDeleteWarning(null);
  }

  const { run: confirmDelete, pending: deleteBusy } = useAsyncAction(async () => {
    if (!deleteTarget) return;
    const path =
      deleteTarget.kind === "module" ? `/api/admin/modules/${deleteTarget.id}` : `/api/admin/lessons/${deleteTarget.id}`;
    const res = await fetch(path, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: deleteWarning !== null }),
    });

    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as
        | { error?: string; needsConfirmation?: boolean }
        | null;
      if (payload?.needsConfirmation) {
        setDeleteWarning(payload.error ?? "This will affect student records.");
        return;
      }
      toast.error(payload?.error ?? "Could not delete this.");
      setDeleteTarget(null);
      setDeleteWarning(null);
      return;
    }

    const payload = (await res.json().catch(() => null)) as { warning?: string | null } | null;
    if (payload?.warning) toast.warning(payload.warning);
    toast.success(deleteTarget.kind === "module" ? "Module deleted." : "Session deleted.");
    setDeleteTarget(null);
    setDeleteWarning(null);
    router.refresh();
  });

  return (
    <div className="flex flex-col h-full bg-pz-surface-container-low">
      <div className="p-4 md:p-6 border-b border-pz-outline-variant bg-pz-surface flex justify-between items-center">
        <h3 className="font-headline font-bold text-pz-on-surface flex items-center gap-2">
          <FolderPlus className="w-5 h-5 text-pz-primary" />
          Curriculum Map
        </h3>
        <span className="text-xs font-bold text-pz-on-surface-variant bg-pz-surface-container px-2 py-1 rounded">
          {totalLessons} {totalLessons === 1 ? "Lesson" : "Lessons"}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleModuleDragEnd}>
          <SortableContext items={modules.map((m) => m.id)} strategy={verticalListSortingStrategy}>
            {modules.map((mod, index) => (
              <ModuleBlock
                key={mod.id}
                mod={mod}
                index={index}
                flat={flat}
                selectedLessonId={selectedLessonId}
                onSelectLesson={onSelectLesson}
                editing={editingModule === mod.id}
                editTitle={editModuleTitle}
                onStartEdit={() => {
                  setEditingModule(mod.id);
                  setEditModuleTitle(mod.title);
                }}
                onEditTitleChange={setEditModuleTitle}
                onSubmitEdit={() => void submitModuleRename(mod.id)}
                onCancelEdit={() => setEditingModule(null)}
                onDeleteModule={() => requestDelete({ kind: "module", id: mod.id, title: mod.title })}
                onDeleteLesson={(lesson) => requestDelete({ kind: "lesson", id: lesson.id, title: lesson.title })}
                onLessonDragEnd={(e) => handleLessonDragEnd(mod.id, e)}
                sensors={sensors}
                addingLesson={addingLessonFor === mod.id}
                newLessonTitle={newLessonTitle}
                onStartAddLesson={() => {
                  setAddingLessonFor(mod.id);
                  setNewLessonTitle("");
                }}
                onNewLessonTitleChange={setNewLessonTitle}
                onSubmitNewLesson={() => void submitNewLesson(mod.id)}
                addLessonBusy={addingLessonBusy}
                onCancelAddLesson={() => setAddingLessonFor(null)}
              />
            ))}
          </SortableContext>
        </DndContext>

        {!flat &&
          (addingModule ? (
            <div className="bg-pz-surface rounded-lg border-2 border-pz-primary p-3 flex gap-2">
              <input
                autoFocus
                type="text"
                value={newModuleTitle}
                onChange={(e) => setNewModuleTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submitNewModule();
                  if (e.key === "Escape") setAddingModule(false);
                }}
                placeholder="Module title…"
                className="flex-1 min-w-0 border border-pz-outline-variant rounded-lg px-3 py-2 text-sm max-md:text-base max-md:min-h-11 font-body focus:outline-none focus:ring-2 focus:ring-pz-primary/20"
              />
              <Button
                variant="bare"
                size="bare"
                loading={addingModuleBusy}
                onClick={() => submitNewModule()}
                className="px-3 py-2 bg-pz-primary text-pz-on-primary rounded-lg text-xs font-bold max-md:min-h-11"
              >
                Add
              </Button>
            </div>
          ) : (
            <button
              onClick={() => setAddingModule(true)}
              className="w-full py-4 max-md:min-h-11 bg-pz-surface-container-high border-2 border-dashed border-pz-outline rounded-xl text-pz-on-surface-variant font-headline font-bold flex items-center justify-center gap-2 hover:bg-pz-surface-container-highest transition-colors"
            >
              <FolderPlus className="w-4 h-4" />
              Create New Module
            </button>
          ))}

        {flat && modules.length === 0 && (
          <p className="text-sm text-pz-on-surface-variant italic text-center py-8">
            Setting up this program&apos;s session list…
          </p>
        )}
      </div>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setDeleteWarning(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-headline text-pz-on-surface">
              Delete &ldquo;{deleteTarget?.title}&rdquo;?
            </DialogTitle>
            <DialogDescription className="font-body text-pz-on-surface-variant">
              {deleteWarning ??
                (deleteTarget?.kind === "module"
                  ? "This deletes the module and every session inside it."
                  : "This deletes the session and its quiz questions.")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="bare"
              size="bare"
              onClick={() => {
                setDeleteTarget(null);
                setDeleteWarning(null);
              }}
              disabled={deleteBusy}
              className="px-4 py-2.5 max-md:min-h-11 rounded-lg font-headline text-sm font-semibold bg-pz-surface-container-high text-pz-on-surface-variant hover:bg-pz-surface-variant transition-colors"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="bare"
              size="bare"
              loading={deleteBusy}
              onClick={() => confirmDelete()}
              className="px-4 py-2.5 max-md:min-h-11 rounded-lg font-headline text-sm font-semibold bg-pz-solid-danger text-white hover:bg-pz-solid-danger/90 transition-colors"
            >
              {deleteBusy ? "Deleting…" : deleteWarning ? "Delete anyway" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ModuleBlock({
  mod,
  index,
  flat,
  selectedLessonId,
  onSelectLesson,
  editing,
  editTitle,
  onStartEdit,
  onEditTitleChange,
  onSubmitEdit,
  onCancelEdit,
  onDeleteModule,
  onDeleteLesson,
  onLessonDragEnd,
  sensors,
  addingLesson,
  newLessonTitle,
  onStartAddLesson,
  onNewLessonTitleChange,
  onSubmitNewLesson,
  addLessonBusy,
  onCancelAddLesson,
}: {
  mod: BuilderModule;
  index: number;
  flat: boolean;
  selectedLessonId: string | null;
  onSelectLesson: (lesson: BuilderLesson) => void;
  editing: boolean;
  editTitle: string;
  onStartEdit: () => void;
  onEditTitleChange: (v: string) => void;
  onSubmitEdit: () => void;
  onCancelEdit: () => void;
  onDeleteModule: () => void;
  onDeleteLesson: (lesson: BuilderLesson) => void;
  onLessonDragEnd: (event: DragEndEvent) => void;
  sensors: ReturnType<typeof useSensors>;
  addingLesson: boolean;
  newLessonTitle: string;
  onStartAddLesson: () => void;
  onNewLessonTitleChange: (v: string) => void;
  onSubmitNewLesson: () => void;
  addLessonBusy: boolean;
  onCancelAddLesson: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: mod.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="group">
      {!flat && (
        <div className="bg-pz-surface rounded-lg border border-pz-outline-variant p-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3 min-w-0">
            <span
              {...attributes}
              {...listeners}
              className="text-pz-on-surface-variant/40 cursor-grab active:cursor-grabbing shrink-0 max-md:inline-flex max-md:min-h-11 max-md:min-w-11 max-md:items-center max-md:justify-center"
            >
              <GripVertical className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-pz-primary uppercase tracking-widest">Module {index + 1}</p>
              {editing ? (
                <input
                  autoFocus
                  type="text"
                  value={editTitle}
                  onChange={(e) => onEditTitleChange(e.target.value)}
                  onBlur={onSubmitEdit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onSubmitEdit();
                    if (e.key === "Escape") onCancelEdit();
                  }}
                  className="font-headline font-bold text-pz-on-surface bg-transparent border-b border-pz-primary outline-none w-full"
                />
              ) : (
                <h4 className="font-headline font-bold text-pz-on-surface truncate">{mod.title}</h4>
              )}
            </div>
          </div>
          <div className="flex gap-1 shrink-0">
            <button onClick={onStartEdit} aria-label="Rename module" className="p-1 max-md:inline-flex max-md:min-h-11 max-md:min-w-11 max-md:items-center max-md:justify-center text-pz-on-surface-variant hover:text-pz-primary">
              <Pencil className="w-4 h-4" />
            </button>
            <button onClick={onDeleteModule} aria-label="Delete module" className="p-1 max-md:inline-flex max-md:min-h-11 max-md:min-w-11 max-md:items-center max-md:justify-center text-pz-on-surface-variant hover:text-pz-danger">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className={cn("space-y-2", !flat && "mt-2 ml-8")}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onLessonDragEnd}>
          <SortableContext items={mod.lessons.map((l) => l.id)} strategy={verticalListSortingStrategy}>
            {mod.lessons.map((lesson, lessonIndex) => (
              <LessonRow
                key={lesson.id}
                lesson={lesson}
                label={flat ? `${lessonIndex + 1}.` : `${index + 1}.${lessonIndex + 1}`}
                selected={selectedLessonId === lesson.id}
                onSelect={() => onSelectLesson(lesson)}
                onDelete={() => onDeleteLesson(lesson)}
              />
            ))}
          </SortableContext>
        </DndContext>

        {addingLesson ? (
          <div className="bg-pz-surface-container-lowest rounded-lg border-2 border-pz-primary p-2 flex gap-2">
            <input
              autoFocus
              type="text"
              value={newLessonTitle}
              onChange={(e) => onNewLessonTitleChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSubmitNewLesson();
                if (e.key === "Escape") onCancelAddLesson();
              }}
              placeholder={flat ? "Session title…" : "Lesson title…"}
              className="flex-1 min-w-0 border border-pz-outline-variant rounded-lg px-3 py-1.5 text-sm max-md:text-base max-md:min-h-11 font-body focus:outline-none focus:ring-2 focus:ring-pz-primary/20"
            />
            <Button
              variant="bare"
              size="bare"
              loading={addLessonBusy}
              onClick={onSubmitNewLesson}
              className="px-3 py-1.5 bg-pz-primary text-pz-on-primary rounded-lg text-xs font-bold max-md:min-h-11"
            >
              Add
            </Button>
          </div>
        ) : (
          <button
            onClick={onStartAddLesson}
            className="w-full py-2 max-md:min-h-11 border-2 border-dashed border-pz-outline-variant/50 rounded-lg text-xs font-bold text-pz-on-surface-variant hover:border-pz-primary hover:text-pz-primary transition-all flex items-center justify-center gap-1 mt-2"
          >
            <PlusCircle className="w-4 h-4" />
            {flat ? "Add Session" : "Add Lesson"}
          </button>
        )}
      </div>
    </div>
  );
}

function LessonRow({
  lesson,
  label,
  selected,
  onSelect,
  onDelete,
}: {
  lesson: BuilderLesson;
  label: string;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: lesson.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const Icon = CONTENT_ICON[lesson.contentType];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "lesson-row group/lesson flex items-center justify-between p-3 rounded-lg transition-colors shadow-sm cursor-pointer",
        selected
          ? "bg-pz-primary-container/10 border-2 border-pz-primary"
          : "bg-pz-surface-container-lowest border border-pz-outline-variant/40 hover:border-pz-primary/50",
      )}
      onClick={onSelect}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "shrink-0 cursor-grab active:cursor-grabbing transition-opacity max-md:inline-flex max-md:min-h-11 max-md:min-w-11 max-md:items-center max-md:justify-center max-md:opacity-100",
            selected ? "opacity-100 text-pz-primary/60" : "opacity-0 group-hover/lesson:opacity-100 text-pz-on-surface-variant/40",
          )}
        >
          <GripVertical className="w-4 h-4" />
        </span>
        <Icon className={cn("w-4 h-4 shrink-0", selected ? "text-pz-primary" : "text-pz-primary/70")} />
        <span className={cn("text-sm truncate", selected ? "font-bold text-pz-on-primary-container" : "font-medium text-pz-on-surface")}>
          {label} {lesson.title}
        </span>
      </div>
      <div className="flex gap-1 shrink-0">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          aria-label="Delete session"
          className={cn("p-1 max-md:inline-flex max-md:min-h-11 max-md:min-w-11 max-md:items-center max-md:justify-center", selected ? "text-pz-primary/60 hover:text-pz-danger" : "text-pz-on-surface-variant hover:text-pz-danger")}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
