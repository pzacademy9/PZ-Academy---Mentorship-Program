"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Copy, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { agentLinkUrl, type AgentChoice, type LinkPage } from "@/lib/landing/registration/promo-form";
import { CONTROL, HELP, LABEL } from "../registration/styles";

/** Clipboard API first; old browsers fall back to execCommand, whose boolean result is the truth. */
async function copyText(text: string, host: HTMLElement | null): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("aria-hidden", "true");
    el.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
    (host ?? document.body).appendChild(el);
    el.select();
    let ok = false;
    try { ok = document.execCommand("copy") === true; } catch { ok = false; }
    el.remove();
    return ok;
  }
}

/**
 * Ruling 8: an admin makes a sales agent's share link. The code belongs to the agent (one per
 * agent, created on first use by Task 13's route); the page only changes the path.
 */
export function AgentLinksPanel({ agents, pages }: { agents: AgentChoice[]; pages: LinkPage[] }) {
  const [agentId, setAgentId] = useState(agents[0]?.id ?? "");
  const [slug, setSlug] = useState(pages[0]?.slug ?? "");
  const [generated, setGenerated] = useState<{ agentId: string; code: string } | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const link = generated && generated.agentId === agentId && slug ? agentLinkUrl(origin, slug, generated.code) : "";

  const { run: generate, pending } = useAsyncAction(async () => {
    try {
      const res = await fetch("/api/admin/landing-agent-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId }),
      });
      const body = (await res.json().catch(() => null)) as { code?: string; error?: string } | null;
      if (!res.ok || !body?.code) { toast.error(body?.error ?? "Could not create the link."); return; }
      setCopyFailed(false);
      setGenerated({ agentId, code: body.code });
    } catch {
      toast.error("Could not reach the server. Please try again.");
    }
  });

  const copy = async (host: HTMLElement | null) => {
    const ok = await copyText(link, host);
    setCopyFailed(!ok);
    if (ok) toast.success("Link copied.");
  };

  return (
    <section aria-labelledby="agent-links-heading" className="space-y-4 rounded-xl border border-pz-outline-variant bg-pz-surface-container-lowest p-4 md:p-6">
      <div className="space-y-1">
        <h2 id="agent-links-heading" className="font-headline text-lg font-bold text-pz-on-surface">Agent links</h2>
        <p className={HELP}>Each sales agent has one personal code. People who open their link and register within 30 days are credited to that agent.</p>
      </div>
      {agents.length === 0 ? (
        <p className={HELP}>No sales agents yet. Add one in Sales Team first.</p>
      ) : pages.length === 0 ? (
        <p className={HELP}>Publish a landing page first. Links only work on published pages.</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className={LABEL}>Sales agent</span>
              <select aria-label="Sales agent" className={CONTROL} value={agentId} onChange={(e) => setAgentId(e.target.value)}>
                {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
            <label className="block space-y-1">
              <span className={LABEL}>Page</span>
              <select aria-label="Page" className={CONTROL} value={slug} onChange={(e) => setSlug(e.target.value)}>
                {pages.map((p) => <option key={p.slug} value={p.slug}>{p.title}</option>)}
              </select>
            </label>
          </div>
          <Button type="button" onClick={() => void generate()} disabled={pending || !agentId} aria-busy={pending || undefined}>
            <Link2 aria-hidden="true" /> {pending ? "Generating…" : "Generate link"}
          </Button>
          {link && (
            <div className="space-y-1">
              <label className="block space-y-1">
                <span className={LABEL}>Share link</span>
                <input aria-label="Share link" readOnly className={`${CONTROL} font-mono`} value={link} onFocus={(e) => e.currentTarget.select()} />
              </label>
              <Button type="button" variant="outline" aria-label="Copy share link" onClick={(e) => void copy(e.currentTarget.parentElement)}>
                <Copy aria-hidden="true" /> Copy
              </Button>
              {copyFailed && <p role="status" className={HELP}>Couldn&apos;t copy, press and hold to copy</p>}
            </div>
          )}
        </>
      )}
    </section>
  );
}
