"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

export type Template = {
  id: string;
  channel: "email" | "whatsapp";
  name: string;
  subject: string | null;
  body: string;
  createdAt: string;
};

/**
 * Shared between CampaignsPanel (email) and WhatsAppPanel (whatsapp) — a
 * row of saved-template chips. Picking one hands the template to the
 * caller via onLoad; the caller decides how to apply it (email also sets
 * subject, WhatsApp doesn't have one). Saving/deleting never mutates the
 * caller's compose state directly, matching the "load a copy, edit the
 * copy" pattern campaigns already use for duplicateCampaign.
 */
export function TemplatePicker({
  channel,
  onLoad,
  currentSubject,
  currentBody,
}: {
  channel: "email" | "whatsapp";
  onLoad: (template: Template) => void;
  currentSubject?: string;
  currentBody: string;
}) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/crm/templates?channel=${channel}`)
      .then((res) => (res.ok ? res.json() : { templates: [] }))
      .then((json: { templates?: Template[] }) => {
        if (!cancelled) setTemplates(json.templates ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [channel]);

  async function saveAsTemplate() {
    if (currentBody.trim() === "") {
      toast.error("Nothing to save — the message is empty.");
      return;
    }
    const name = window.prompt("Template name:")?.trim();
    if (!name) return;

    setSaving(true);
    try {
      const res = await fetch("/api/admin/crm/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, name, subject: currentSubject, body: currentBody }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? "Could not save this template.");
        return;
      }
      setTemplates((prev) => [
        ...prev,
        { id: json.id, channel, name, subject: currentSubject ?? null, body: currentBody, createdAt: new Date().toISOString() },
      ]);
      toast.success("Template saved.");
    } finally {
      setSaving(false);
    }
  }

  async function removeTemplate(template: Template) {
    if (!confirm(`Delete template "${template.name}"?`)) return;
    setDeletingId(template.id);
    try {
      const res = await fetch(`/api/admin/crm/templates/${template.id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toast.error(json.error ?? "Could not delete this template.");
        return;
      }
      setTemplates((prev) => prev.filter((t) => t.id !== template.id));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {templates.map((t) => (
        <span
          key={t.id}
          className="inline-flex items-center gap-1 pl-3 pr-1.5 py-1 rounded-full bg-pz-surface-variant text-pz-on-surface-variant font-body text-xs font-medium"
        >
          <button type="button" onClick={() => onLoad(t)} className="hover:underline">
            {t.name}
          </button>
          <button
            type="button"
            onClick={() => removeTemplate(t)}
            disabled={deletingId === t.id}
            aria-label={`Delete template ${t.name}`}
            className="leading-none opacity-60 hover:opacity-100 hover:text-pz-danger disabled:opacity-30"
          >
            ×
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={saveAsTemplate}
        disabled={saving}
        className="px-3 py-1 rounded-full bg-pz-surface-variant text-pz-on-surface-variant font-body text-xs font-medium disabled:opacity-50"
      >
        {saving ? "Saving…" : "+ Save as template"}
      </button>
    </div>
  );
}
