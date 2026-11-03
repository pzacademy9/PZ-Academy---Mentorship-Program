// src/components/landing/sections/Instructors.tsx
import { LandingImage } from "../LandingImage";
import { SimpleText } from "../SimpleText";
import { SectionHeader, rows, str } from "./util";
import type { SectionProps } from "./types";

type Person = { name: string; role: string; bio: string; photo: string; credentials: string[] };

/** One credential per line; a leading "-" and blank lines are dropped. */
function credentialLines(raw: string): string[] {
  return raw.split(/\r?\n/).map((l) => l.replace(/^\s*-\s*/, "").trim()).filter(Boolean);
}

export function Instructors({ data }: SectionProps) {
  const items: Person[] = rows(data, "items")
    .map((i) => ({ name: str(i, "name"), role: str(i, "role"), bio: str(i, "bio"), photo: str(i, "photo"), credentials: credentialLines(str(i, "credentials")) }))
    .filter((i) => i.name || i.bio);
  if (items.length === 0) return null;
  const layout = str(data, "layout");
  // Missing or unknown layout means a page saved before the new looks: keep the old cards.
  if (layout !== "a" && layout !== "b") return <ClassicInstructors data={data} items={items} />;
  return <NewInstructors heading={str(data, "heading")} items={items} dark={layout === "b"} />;
}

function ClassicInstructors({ data, items }: { data: Record<string, unknown>; items: Person[] }) {
  return (
    <div className="border-b border-landing-border bg-landing-surface px-4 py-10 md:px-6 md:py-20">
      <div className="mx-auto max-w-7xl">
        <SectionHeader heading={str(data, "heading")} />
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-4 md:grid-cols-2 md:gap-8">
          {items.map((it, i) => (
            <div key={i} className="flex flex-col items-center gap-5 rounded-landing border border-landing-border bg-landing-surface-container-lowest p-5 text-center shadow-landing-soft sm:flex-row sm:items-start sm:gap-6 sm:text-left md:p-8">
              {it.photo ? (
                <LandingImage
                  src={it.photo}
                  alt={it.name}
                  width={112}
                  height={112}
                  className="h-28 w-28 shrink-0 rounded-full border-4 border-landing-mint/30 object-cover shadow-landing-soft"
                />
              ) : null}
              <div className="min-w-0">
                {it.name ? <h3 className="font-headline text-lg font-bold text-landing-deep md:text-xl">{it.name}</h3> : null}
                {it.role ? <p className="mb-3 mt-1 text-xs font-semibold text-landing-primary">{it.role}</p> : null}
                <SimpleText text={it.bio} className="text-sm leading-relaxed text-landing-muted" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Credentials({ lines, dark }: { lines: string[]; dark: boolean }) {
  if (lines.length === 0) return null;
  return (
    <ul className="mt-5 flex flex-col gap-2">
      {lines.map((c, i) => (
        <li key={i} className={`flex items-start gap-3 rounded-landing border px-3 py-2.5 text-sm font-medium ${dark ? "border-white/20 bg-white/10 text-white" : "border-landing-border bg-landing-surface-container-lowest text-landing-deep"}`}>
          <span aria-hidden="true" className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-landing-mint/30 text-xs font-bold text-landing-primary">✓</span>
          <span className="min-w-0 break-words">{c}</span>
        </li>
      ))}
    </ul>
  );
}

// Layout A (light) and B (dark green band). One person gets a big two-column spread; two or more get side-by-side cards.
function NewInstructors({ heading, items, dark }: { heading: string; items: Person[]; dark: boolean }) {
  const single = items.length === 1;
  const nameCls = dark ? "text-white" : "text-landing-primary";
  const roleCls = dark ? "text-landing-mint" : "text-landing-muted";
  const bioCls = dark ? "text-sm leading-relaxed text-white/85 md:text-base" : "text-sm leading-relaxed text-landing-on-surface md:text-base";
  return (
    <div className={`border-b border-landing-border px-4 py-10 md:px-6 md:py-20 ${dark ? "bg-landing-deep" : "bg-landing-surface"}`}>
      <div className="mx-auto max-w-7xl">
        {heading ? (
          <div className="mx-auto mb-8 max-w-2xl text-center md:mb-12">
            <h2 className={`break-words font-headline text-xl font-bold tracking-tight sm:text-3xl lg:text-4xl ${dark ? "text-white" : "text-landing-deep"}`}>{heading}</h2>
          </div>
        ) : null}
        {single ? (
          <article className="mx-auto grid max-w-5xl grid-cols-1 items-center gap-8 lg:grid-cols-2 lg:gap-14">
            {items[0].photo ? (
              <div className={`mx-auto w-full max-w-md overflow-hidden rounded-3xl border-4 shadow-landing-soft-lg lg:max-w-none ${dark ? "border-white/20 lg:order-2" : "border-landing-mint/50"}`}>
                <LandingImage src={items[0].photo} alt={items[0].name} width={800} height={1000} className="h-full w-full object-cover" />
              </div>
            ) : null}
            <div className={`min-w-0 ${items[0].photo ? "" : "lg:col-span-2"}`}>
              {items[0].name ? <h3 className={`break-words font-headline text-2xl font-extrabold leading-tight md:text-4xl ${nameCls}`}>{items[0].name}</h3> : null}
              {items[0].role ? <p className={`mt-2 break-words text-xs font-bold uppercase tracking-wider ${roleCls}`}>{items[0].role}</p> : null}
              {items[0].bio ? <SimpleText text={items[0].bio} className={`mt-4 break-words ${bioCls}`} /> : null}
              <Credentials lines={items[0].credentials} dark={dark} />
            </div>
          </article>
        ) : (
          <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 md:grid-cols-2 md:gap-8">
            {items.map((it, i) => (
              <article key={i} className="flex flex-col items-center gap-5 rounded-landing border border-landing-border bg-landing-surface-container-lowest p-5 text-center shadow-landing-soft sm:flex-row sm:items-start sm:gap-6 sm:text-left md:p-8">
                {it.photo ? (
                  <LandingImage src={it.photo} alt={it.name} width={128} height={160} className="h-40 w-32 shrink-0 rounded-2xl border-4 border-landing-mint/30 object-cover shadow-landing-soft" />
                ) : null}
                <div className="min-w-0 max-w-full">
                  {it.name ? <h3 className="max-w-full break-words font-headline text-lg font-bold text-landing-primary md:text-xl">{it.name}</h3> : null}
                  {it.role ? <p className="mt-1 break-words text-xs font-bold uppercase tracking-wider text-landing-muted">{it.role}</p> : null}
                  {it.bio ? <SimpleText text={it.bio} className="mt-3 break-words text-sm leading-relaxed text-landing-on-surface" /> : null}
                  <Credentials lines={it.credentials} dark={false} />
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
