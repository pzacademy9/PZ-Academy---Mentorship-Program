"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { coverProxyUrl } from "@/lib/feedback/cover-url";
import { MEDIA_FOLDERS, type MediaFolder, type MediaOrientation } from "@/lib/landing/media";
import { compressImage } from "@/lib/landing/compress-image";
import { readImageSize, registerUpload } from "./media-client";

type Item = {
  id: string; url: string; name: string; folder: MediaFolder;
  width: number | null; height: number | null; orientation: MediaOrientation | null;
};

const CONTROL =
  "w-full rounded-md border border-pz-outline-variant bg-pz-surface-container-lowest px-3 py-2 font-body text-sm text-pz-on-surface placeholder:text-pz-on-surface-variant/60 shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring max-md:min-h-11 max-md:text-base";
const TAB =
  "rounded-full border px-3 py-1.5 font-body text-xs font-semibold transition-colors max-md:min-h-11 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
const SMALL = "max-md:min-h-11";

export function MediaLibrary({ initialItems }: { initialItems: Item[] }) {
  const confirm = useConfirm();
  const [items, setItems] = useState<Item[]>(initialItems);
  const [folder, setFolder] = useState<MediaFolder | "all">("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<{ id: string; text: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => (folder === "all" || i.folder === folder) && (q === "" || i.name.toLowerCase().includes(q)));
  }, [items, folder, search]);

  const replace = (next: Item) => setItems((cur) => cur.map((i) => (i.id === next.id ? { ...i, ...next } : i)));

  async function patch(id: string, body: { name?: string; folder?: MediaFolder }): Promise<boolean> {
    try {
      const res = await fetch(`/api/admin/landing-media/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { item?: Item; error?: string };
      if (!res.ok || !data.item) {
        setNotice({ id, text: data.error ?? "Could not update the picture" });
        return false;
      }
      replace(data.item);
      return true;
    } catch {
      setNotice({ id, text: "Could not update the picture" });
      return false;
    }
  }

  async function saveName(id: string) {
    const name = draft.trim();
    if (name === "") return setNotice({ id, text: "Give the picture a name." });
    if (name.length > 80) return setNotice({ id, text: "Keep the name to 80 characters or fewer." });
    setNotice(null);
    if (await patch(id, { name })) setEditing(null);
  }

  async function remove(item: Item) {
    setNotice(null);
    await confirm({
      title: "Delete this picture?",
      description: `"${item.name}" will be removed from the library.`,
      confirmLabel: "Delete",
      destructive: true,
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/admin/landing-media/${item.id}`, { method: "DELETE" });
          const data = (await res.json().catch(() => ({}))) as { error?: string; pages?: { title: string }[] };
          if (res.ok) {
            setItems((cur) => cur.filter((i) => i.id !== item.id));
            toast.success("Picture deleted");
          } else if (res.status === 409 && data.pages?.length) {
            setNotice({ id: item.id, text: `Used by: ${data.pages.map((p) => p.title).join(", ")}. Remove it from those pages first.` });
          } else {
            setNotice({ id: item.id, text: data.error ?? "Could not delete the picture" });
          }
        } catch {
          setNotice({ id: item.id, text: "Could not delete the picture" });
        }
      },
    });
  }

  async function upload(file: File) {
    setUploading(true);
    try {
      const small = await compressImage(file);
      const size = await readImageSize(small);
      const form = new FormData();
      form.append("file", small);
      form.append("courseSlug", "landing-pages");
      form.append("kind", "landing");
      const res = await fetch("/api/admin/uploads/image", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "Upload failed");
      const name = file.name.replace(/\.[^.]+$/, "").slice(0, 80) || "Picture";
      const ok = await registerUpload({
        url: data.url, name, width: size?.width ?? null, height: size?.height ?? null, sizeBytes: small.size,
      });
      if (!ok) throw new Error("Could not add the picture to the library");
      const list = await fetch("/api/admin/landing-media");
      if (list.ok) setItems(((await list.json()) as { items?: Item[] }).items ?? []);
      toast.success("Picture added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <input
          type="search" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search pictures" aria-label="Search pictures" className={cn(CONTROL, "md:max-w-sm")}
        />
        <input
          ref={fileRef} type="file" accept="image/*" hidden aria-label="Upload new picture"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }}
        />
        <Button type="button" loading={uploading} className="max-md:min-h-11 md:ml-auto" onClick={() => fileRef.current?.click()}>
          Upload new
        </Button>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Folder">
        {[{ key: "all" as const, label: "All" }, ...MEDIA_FOLDERS].map((f) => (
          <button
            key={f.key} type="button" aria-pressed={folder === f.key} onClick={() => setFolder(f.key)}
            className={cn(TAB, folder === f.key
              ? "border-pz-primary bg-pz-primary text-pz-on-primary"
              : "border-pz-outline-variant text-pz-on-surface-variant hover:bg-pz-surface-container-high")}
          >{f.label}</button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="py-10 text-center font-body text-sm text-pz-on-surface-variant">
          {items.length === 0 ? "No pictures yet. Use Upload new to add one." : "No pictures match that search."}
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {shown.map((i) => (
            <li key={i.id} className="min-w-0 space-y-2 rounded-lg border border-pz-outline-variant bg-pz-surface-container-lowest p-2">
              <div className="aspect-[4/3] overflow-hidden rounded-md bg-pz-surface-container">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={coverProxyUrl(i.url)} alt="" loading="lazy" className="h-full w-full object-cover" />
              </div>
              {editing === i.id ? (
                <div className="space-y-2">
                  <input value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Picture name" className={CONTROL} />
                  <div className="flex gap-2">
                    <Button type="button" className={SMALL} onClick={() => void saveName(i.id)}>Save name</Button>
                    <Button type="button" variant="outline" className={SMALL} onClick={() => { setEditing(null); setNotice(null); }}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <p data-testid="media-name" className="truncate font-body text-sm font-semibold text-pz-on-surface">{i.name}</p>
              )}
              <select
                aria-label={`Folder for ${i.name}`} value={i.folder} className={CONTROL}
                onChange={(e) => void patch(i.id, { folder: e.target.value as MediaFolder })}
              >
                {MEDIA_FOLDERS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
              <div className="flex gap-2">
                <Button
                  type="button" variant="outline" className={SMALL} aria-label={`Rename ${i.name}`}
                  onClick={() => { setEditing(i.id); setDraft(i.name); setNotice(null); }}
                >Rename</Button>
                <Button type="button" variant="outline" className={cn(SMALL, "text-pz-danger")} aria-label={`Delete ${i.name}`} onClick={() => void remove(i)}>
                  Delete
                </Button>
              </div>
              {notice?.id === i.id && <p role="alert" className="break-words font-body text-xs text-pz-danger">{notice.text}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
