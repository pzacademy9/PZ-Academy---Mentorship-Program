// src/components/landing/SimpleText.tsx
import { Fragment } from "react";
import { parseSimpleText, type Inline } from "@/lib/landing/simple-text";

export function InlineNodes({ nodes }: { nodes: Inline[] }) {
  return (
    <>
      {nodes.map((n, i) => {
        if (n.t === "bold") return <strong key={i}>{n.v}</strong>;
        if (n.t === "link") {
          const external = /^https?:\/\//i.test(n.href);
          return (
            <a key={i} href={n.href} className="underline underline-offset-2" rel="noopener noreferrer" {...(external ? { target: "_blank" } : {})}>
              {n.v}
            </a>
          );
        }
        return <Fragment key={i}>{n.v}</Fragment>;
      })}
    </>
  );
}

/** Renders admin-authored mini-markup as React elements. No HTML is ever injected. */
export function SimpleText({ text, className }: { text: string; className?: string }) {
  const blocks = parseSimpleText(text);
  if (blocks.length === 0) return null;
  return (
    <div className={className}>
      {blocks.map((b, i) =>
        b.t === "p" ? (
          <p key={i} className="mb-3 last:mb-0"><InlineNodes nodes={b.inline} /></p>
        ) : (
          <ul key={i} className="mb-3 list-disc pl-5 last:mb-0">
            {b.items.map((item, j) => <li key={j}><InlineNodes nodes={item} /></li>)}
          </ul>
        ),
      )}
    </div>
  );
}
