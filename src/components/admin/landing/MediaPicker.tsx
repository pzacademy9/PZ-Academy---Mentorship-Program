"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { coverProxyUrl } from "@/lib/feedback/cover-url";
import { MEDIA_FOLDERS, fitFor, orientationOf, type MediaFolder, type MediaOrientation } from "@/lib/landing/media";

type Item = {
  id: string; url: string; name: string; folder: MediaFolder;
  width: number | null; height: number | null; orientation: MediaOrientation | null;
};

const CONTROL =
  "w-full rounded-md border border-pz-outline-variant bg-pz-surface-container-lowest px-3 py-2 font-body text-sm text-pz-on-surface placeholder:text-pz-on-surface-variant/60 shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring max-md:min-h-11 max-md:text-base";
const TAB =
  "rounded-full border px-3 py-1.5 font-body text-xs font-semibold transition-colors max-md:min-h-11 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/** Pop-up to choose a picture already in the shared library. */
export function MediaPicker({
  open, onClose, onPick, want,
}: { open: boolean; onClose: () => void; onPick: (url: string) => void; want?: "wide" | "tall" }) {
  const [folder, setFolder] = useState<MediaFolder | "all">("all");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<Item[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async (f: MediaFolder | "all") => {
    setItems(null); setFailed(false);
    try {
      const res = await fetch(f === "all" ? "/api/admin/landing-media" : `/api/admin/landing-media?folder=${f}`);
      if (!res.ok) throw new Error("load");
      const body = (await res.json()) as { items?: Item[] };
      setItems(body.items ?? []);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => { if (open) void load(folder); }, [open, folder, load]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = (items ?? []).filter((i) => q === "" || i.name.toLowerCase().includes(q));
    if (!want) return list;
    const rank = (i: Item) => (fitFor(i.orientation ?? orientationOf(i.width, i.height), want) === "fits" ? 0 : 1);
    return [...list].sort((a, b) => rank(a) - rank(b));
  }, [items, search, want]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Choose a picture</DialogTitle>
          <DialogDescription>Pick one from the library, or close this and use Upload new to add one.</DialogDescription>
        </DialogHeader>
        <input
          type="search" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search pictures" aria-label="Search pictures" className={CONTROL}
        />
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
        <div className="max-h-[50dvh] overflow-y-auto">
          {failed ? (
            <div className="space-y-2 py-6 text-center">
              <p className="font-body text-sm text-pz-danger">Could not load the pictures</p>
              <Button type="button" variant="outline" className="max-md:min-h-11" onClick={() => void load(folder)}>Try again</Button>
            </div>
          ) : items === null ? (
            <p className="py-6 text-center font-body text-sm text-pz-on-surface-variant">Loading pictures…</p>
          ) : shown.length === 0 ? (
            <p className="py-6 text-center font-body text-sm text-pz-on-surface-variant">
              {items.length === 0 ? "No pictures yet. Use Upload new to add one." : "No pictures match that search."}
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {shown.map((i) => {
                const fits = want && fitFor(i.orientation ?? orientationOf(i.width, i.height), want) === "fits";
                return (
                  <li key={i.id}>
                    <button
                      type="button" onClick={() => { onPick(i.url); onClose(); }}
                      className="w-full space-y-1 rounded-lg border border-pz-outline-variant p-1.5 text-left hover:bg-pz-surface-container-high focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring max-md:min-h-11"
                    >
                      <div className="aspect-[4/3] overflow-hidden rounded-md bg-pz-surface-container">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={coverProxyUrl(i.url)} alt="" loading="lazy" className="h-full w-full object-cover" />
                      </div>
                      <span data-testid="media-name" className="block truncate font-body text-xs font-semibold text-pz-on-surface">{i.name}</span>
                      {fits && (
                        <span className="inline-block rounded-full bg-pz-surface-container px-2 py-0.5 font-body text-[11px] font-semibold text-pz-on-surface-variant">
                          {want === "wide" ? "Fits computers" : "Fits phones"}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
