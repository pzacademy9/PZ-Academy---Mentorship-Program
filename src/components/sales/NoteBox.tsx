"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import type { ApiErrorJson } from "@/lib/crm/sales-ui";

/** Free-text note on a contact. Used inside SendPanel and on its own when the send panel is hidden. */
export function NoteBox({ contactId, onSaved }: { contactId: string; onSaved?: (contactId: string) => void }) {
  const [note, setNote] = useState("");

  const { run: saveNote, pending: savingNote } = useAsyncAction(async () => {
    const body = note.trim();
    if (!body) return;
    try {
      const res = await fetch(`/api/sales/contacts/${contactId}/note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as ApiErrorJson | null;
        toast.error(err?.error ?? "Could not save the note.");
        return;
      }
      toast.success("Note saved.");
      setNote("");
      onSaved?.(contactId);
    } catch {
      toast.error("Could not save the note.");
    }
  });

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`note-${contactId}`} className="text-xs font-headline font-semibold text-pz-on-surface-variant">
        Note (your team can see it)
      </label>
      <textarea
        id={`note-${contactId}`}
        rows={2}
        maxLength={2000}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="e.g. Asked about weekend classes"
        className="w-full bg-pz-surface-container-low text-pz-on-surface text-sm rounded-lg p-3 placeholder:text-pz-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-pz-primary/20 resize-none font-body"
      />
      <Button
        type="button"
        variant="bare"
        size="bare"
        disabled={note.trim().length === 0}
        loading={savingNote}
        onClick={() => void saveNote()}
        className="self-end px-4 py-2 max-md:min-h-11 rounded-lg bg-pz-primary-container text-pz-on-primary-container font-headline font-bold text-xs"
      >
        Save note
      </Button>
    </div>
  );
}
