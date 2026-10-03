# UI Polish Spec 1: Feel Fast, Solid and Mobile-First, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every screen gives instant feedback (progress bar, then a skeleton), every action button is spinner-equipped and double-submit-proof, errors, 404s and empty lists are on-brand, and the whole dashboard works comfortably at 360–390px.

**Architecture:** Shared primitives go in `src/components/ui/` and `src/hooks/`: Skeleton plus 5 layout shapes, a `Button` `loading` prop, `useAsyncAction`, `ConfirmProvider`, `EmptyState`, `ErrorState`, `ResponsiveList` and `ChipTabs`. Wiring then happens in three layers:
- a mobile shell: bottom nav 4 + More, safe-area padding, top progress bar;
- Next.js route files: `loading.tsx`, `error.tsx` and `not-found.tsx`;
- a mechanical sweep, area by area, migrating existing components onto the primitives without changing any request or response behavior.

**Tech Stack:** Next.js 14.2 App Router, React 18, Tailwind 3.4 with `tailwindcss-animate`, shadcn/ui (cva + `cn`), Radix Dialog, lucide-react, Sonner, Vitest 4 + jsdom + @testing-library/react 16. One new dependency: `nextjs-toploader`.

**Spec:** `docs/superpowers/specs/2026-10-01-ui-feel-fast-and-solid-design.md`

## Global Constraints

- **Mobile-first:** build at 360–390px first, then enhance with `md:` (768px) and `lg:` (1024px). Every task's "done" includes a 390px check, done visually by the reviewer or noted as not applicable for non-UI tasks.
- **Behavior preserved:** no request payload, endpoint, success or error toast, or redirect changes. The sweep only wraps existing handlers.
- **Tap targets:** at least 44×44px below `md` (`max-md:min-h-11`, `max-md:size-11`).
- **Inputs:** 16px font below `md`, so iOS does not zoom on focus.
- **No sideways page scroll at 360px.** Only explicit scroll containers (tab rows, wide preview blocks) may scroll horizontally.
- **Colors:** use theme tokens only (`bg-muted`, `text-muted-foreground`, `border-border`, `primary`, `destructive`, and the existing `pz-*` classes). No new hex values.
- **`prefers-reduced-motion`:** shimmer and spinner-adjacent decorative motion are disabled under `motion-reduce:`.
- **Running tools:** `npm run` is broken by the `&` in the repo path. Run `node node_modules/typescript/bin/tsc --noEmit` and `node node_modules/vitest/vitest.mjs run` from the repo root. `npm install <pkg>` works.
- **No `next build`** while a dev server is running; it corrupts the dev server.
- **No pushing.** Pushing `master:main` deploys production. Commit locally only, and push only on explicit user request.
- **Do not edit `src/lib/database.types.ts`.** No schema changes in this plan.
- **Test UUIDs**, if any, must be zod-4-valid, for example `11111111-1111-4111-8111-111111111111`.
- **Commit trailer:** `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Rapid double-tap on a mobile action button.** Two `run()` calls in the same tick must call the handler once. Pinned in Task 2's test "ignores a second run while the first is pending".
2. **A handler that throws or gets a non-OK response.** The button must re-enable so the user can retry. Pinned in Task 2's test "releases the lock after a rejection".
3. **An admin on a phone navigating to a page past the 4th nav item** (Feedback, Settings and so on). It must be reachable via More, and More must show as active on those pages. Pinned in Task 5's test "every role item appears exactly once across bar and more" and "moreActive when active href is in the sheet".
4. **Pressing Escape or tapping the overlay on a confirm sheet.** It must resolve `false` and never run the destructive action. Pinned in Task 3's test "resolves false on Escape".
5. **A wide table on a 360px phone.** It must render as cards with no page-level horizontal scroll. Pinned in Task 4's `ResponsiveList` test "renders cards with title and meta on mobile markup", plus the 390px/360px `scrollWidth` check in Task 13.

## Rulings made while planning

- **`ResponsiveList` shape.** The spec describes a per-column `mobile` role. To keep the desktop table pixel-identical ("existing table renders unchanged"), `ResponsiveList` takes the existing `<table>` as a `table` prop and a `mobile` card description (`title`, `meta`, `href`) and renders the table at `md+` and cards below `md`. This keeps the same intent without re-implementing 15 bespoke desktop tables.
- **`useConfirm` busy state.** `confirm(opts)` resolves `true` or `false`. If `opts.onConfirm` (an async function) is passed, the dialog stays open, the confirm button shows `loading` while it runs, and then resolves `true`. Call sites that do their work after `await confirm()` show the busy state on their own `<Button loading>`.
- **16px inputs.** Applied by one global CSS rule under `max-width: 767px` for `input:not([type=checkbox]):not([type=radio]), select, textarea`, because 71 files use raw elements.
- **Raw `<button>` conversion.** Raw buttons that trigger a request become `<Button variant="bare" size="bare" className={<their existing classes>}>`. The new `bare` variant and size add no styling, so existing looks are preserved; `cn` (tailwind-merge) resolves conflicts in favor of the passed classes.
- **Dialogs become bottom sheets on phones.** Implemented once in `DialogContent`'s default classes, so all existing Radix dialogs get it.

---

### Task 1: Skeleton primitive and five layout shapes

**Files:**
- Modify: `tailwind.config.ts` (in `theme.extend`)
- Create: `src/components/ui/skeleton.tsx`
- Create: `src/components/ui/skeletons.tsx`
- Test: `tests/ui-skeletons.test.tsx`

**Interfaces:**
- Produces:
  - `Skeleton({ className }: { className?: string })`
  - `TableSkeleton({ rows?: number = 8, cols?: number = 4, title?: boolean = true, filters?: boolean = true })`
  - `DetailSkeleton({ sections?: number = 3 })`
  - `CardGridSkeleton({ stats?: number = 4, cards?: number = 6 })`
  - `FormSkeleton({ fields?: number = 5 })`
  - `ChatSkeleton()`
  - `LessonSkeleton()`

  All exported from `@/components/ui/skeletons` except `Skeleton`, which comes from `@/components/ui/skeleton`. Each shape's root has `role="status"` and contains `<span className="sr-only">Loading…</span>`.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/ui-skeletons.test.tsx
import { render, screen } from "@testing-library/react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TableSkeleton, DetailSkeleton, CardGridSkeleton, FormSkeleton, ChatSkeleton, LessonSkeleton,
} from "@/components/ui/skeletons";

describe("Skeleton", () => {
  it("is hidden from assistive tech and uses the muted token", () => {
    const { container } = render(<Skeleton className="h-4 w-10" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.getAttribute("aria-hidden")).toBe("true");
    expect(el.className).toContain("bg-muted");
    expect(el.className).toContain("h-4");
  });
});

describe.each([
  ["TableSkeleton", <TableSkeleton key="t" />],
  ["DetailSkeleton", <DetailSkeleton key="d" />],
  ["CardGridSkeleton", <CardGridSkeleton key="c" />],
  ["FormSkeleton", <FormSkeleton key="f" />],
  ["ChatSkeleton", <ChatSkeleton key="ch" />],
  ["LessonSkeleton", <LessonSkeleton key="l" />],
])("%s", (_name, el) => {
  it("announces loading once via role=status", () => {
    render(el);
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByText("Loading…")).toBeTruthy();
  });
});

it("TableSkeleton renders the requested number of mobile cards and desktop rows", () => {
  const { container } = render(<TableSkeleton rows={3} />);
  expect(container.querySelectorAll("[data-skel=card]").length).toBe(3);
  expect(container.querySelectorAll("[data-skel=row]").length).toBe(3);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node node_modules/vitest/vitest.mjs run tests/ui-skeletons.test.tsx`
Expected: FAIL, "Failed to resolve import "@/components/ui/skeleton"".

- [ ] **Step 3: Add the shimmer keyframe to Tailwind**

In `tailwind.config.ts`, inside `theme.extend`, add the following. If `keyframes` or `animation` keys already exist, merge into them.

```ts
keyframes: {
  shimmer: { "100%": { transform: "translateX(100%)" } },
},
animation: {
  shimmer: "shimmer 1.6s infinite",
},
```

- [ ] **Step 4: Implement `skeleton.tsx`**

```tsx
// src/components/ui/skeleton.tsx
import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative overflow-hidden rounded-md bg-muted",
        "before:absolute before:inset-0 before:-translate-x-full before:animate-shimmer",
        "before:bg-gradient-to-r before:from-transparent before:via-white/50 before:to-transparent",
        "dark:before:via-white/10 motion-reduce:before:hidden",
        className,
      )}
    />
  );
}
```

- [ ] **Step 5: Implement `skeletons.tsx`**

The phone layout comes first and desktop is enhanced with `md:`. Outer spacing matches page content, which sits inside `<main className="p-4 sm:p-6">`, so shapes add no outer padding.

```tsx
// src/components/ui/skeletons.tsx
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function Status({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div role="status" className={cn("w-full", className)}>
      <span className="sr-only">Loading…</span>
      {children}
    </div>
  );
}

function Header({ subtitle = true }: { subtitle?: boolean }) {
  return (
    <div className="space-y-2">
      <Skeleton className="h-7 w-40 md:h-8 md:w-56" />
      {subtitle && <Skeleton className="h-4 w-64 max-w-full" />}
    </div>
  );
}

export function TableSkeleton({
  rows = 8, cols = 4, title = true, filters = true,
}: { rows?: number; cols?: number; title?: boolean; filters?: boolean }) {
  return (
    <Status className="space-y-5">
      {title && <Header />}
      {filters && (
        <div className="flex gap-2 overflow-hidden">
          <Skeleton className="h-11 flex-1 md:max-w-sm" />
          <Skeleton className="h-11 w-24" />
        </div>
      )}
      {/* phone: stacked cards */}
      <div className="space-y-2 md:hidden">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} data-skel="card" className="rounded-xl border border-border p-4 space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        ))}
      </div>
      {/* desktop: table rows */}
      <div className="hidden md:block rounded-xl border border-border">
        <div className="flex gap-4 border-b border-border p-4">
          {Array.from({ length: cols }, (_, c) => <Skeleton key={c} className="h-3 flex-1" />)}
        </div>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} data-skel="row" className="flex gap-4 border-b border-border p-4 last:border-0">
            {Array.from({ length: cols }, (_, c) => <Skeleton key={c} className="h-4 flex-1" />)}
          </div>
        ))}
      </div>
    </Status>
  );
}

export function DetailSkeleton({ sections = 3 }: { sections?: number }) {
  return (
    <Status className="space-y-5">
      <Skeleton className="h-4 w-28" />
      <Header />
      {Array.from({ length: sections }, (_, i) => (
        <div key={i} className="rounded-xl border border-border p-4 md:p-6 space-y-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ))}
    </Status>
  );
}

export function CardGridSkeleton({ stats = 4, cards = 6 }: { stats?: number; cards?: number }) {
  return (
    <Status className="space-y-5">
      <Header />
      {stats > 0 && (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 md:gap-4">
          {Array.from({ length: stats }, (_, i) => (
            <div key={i} className="rounded-xl border border-border p-4 space-y-3">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <Skeleton className="h-6 w-12" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>
      )}
      {cards > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: cards }, (_, i) => (
            <div key={i} className="overflow-hidden rounded-xl border border-border">
              <Skeleton className="h-32 w-full rounded-none" />
              <div className="p-4 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-2 w-full rounded-full" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      )}
    </Status>
  );
}

export function FormSkeleton({ fields = 5 }: { fields?: number }) {
  return (
    <Status className="space-y-5 md:max-w-2xl">
      <Header />
      <div className="rounded-xl border border-border p-4 md:p-6 space-y-5">
        {Array.from({ length: fields }, (_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-11 w-full" />
          </div>
        ))}
        <Skeleton className="h-11 w-full md:w-32" />
      </div>
    </Status>
  );
}

export function ChatSkeleton() {
  return (
    <Status className="flex gap-4">
      {/* thread list: the only column on phones */}
      <div className="w-full space-y-2 md:w-72 md:shrink-0">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-border p-3">
            <Skeleton className="h-11 w-11 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          </div>
        ))}
      </div>
      {/* conversation: desktop only */}
      <div className="hidden flex-1 space-y-3 rounded-xl border border-border p-4 md:block">
        {["w-3/5", "w-2/5", "w-2/3", "w-1/3", "w-1/2"].map((width, i) => (
          <div key={i} className={cn("flex", i % 2 ? "justify-end" : "justify-start")}>
            <Skeleton className={cn("h-10 rounded-2xl", width)} />
          </div>
        ))}
      </div>
    </Status>
  );
}

export function LessonSkeleton() {
  return (
    <Status className="space-y-5">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="aspect-video w-full rounded-xl" />
      <Header />
      <div className="space-y-2">
        {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-4 w-full last:w-2/3" />)}
      </div>
    </Status>
  );
}
```

- [ ] **Step 6: Run the tests and verify they pass**

Run: `node node_modules/vitest/vitest.mjs run tests/ui-skeletons.test.tsx`
Expected: PASS (8 tests).

- [ ] **Step 7: Type-check and commit**

Run: `node node_modules/typescript/bin/tsc --noEmit`. Expected: no new errors.

```bash
git add tailwind.config.ts src/components/ui/skeleton.tsx src/components/ui/skeletons.tsx tests/ui-skeletons.test.tsx
git commit -m "feat(ui): skeleton primitive and mobile-first layout shapes"
```

---

### Task 2: `Button` loading and bare variants, `useAsyncAction`, mobile input sizing

**Files:**
- Modify: `src/components/ui/button.tsx`
- Create: `src/hooks/useAsyncAction.ts`
- Modify: `src/app/globals.css` (append to the second `@layer base` block)
- Test: `tests/use-async-action.test.tsx`, `tests/ui-button.test.tsx`

**Interfaces:**
- Produces:
  - `ButtonProps` gains `loading?: boolean`. `variant` gains `"bare"` and `size` gains `"bare"`.
  - `useAsyncAction<A extends unknown[], R>(fn: (...args: A) => Promise<R>, options?: { getKey?: (...args: A) => string }): { run: (...args: A) => Promise<R | undefined>; pending: boolean; pendingKey: string | null }`
  - `run` returns `undefined` when ignored. It rethrows `fn`'s errors after releasing the lock.

- [ ] **Step 1: Write the failing hook test**

```tsx
// tests/use-async-action.test.tsx
import { renderHook, act } from "@testing-library/react";
import { useAsyncAction } from "@/hooks/useAsyncAction";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

it("ignores a second run while the first is pending", async () => {
  const d = deferred<string>();
  const fn = vi.fn(() => d.promise);
  const { result } = renderHook(() => useAsyncAction(fn));
  let p1!: Promise<string | undefined>;
  let p2!: Promise<string | undefined>;
  act(() => { p1 = result.current.run(); p2 = result.current.run(); });
  expect(fn).toHaveBeenCalledTimes(1);
  expect(result.current.pending).toBe(true);
  await act(async () => { d.resolve("ok"); await p1; });
  await expect(p1).resolves.toBe("ok");
  await expect(p2).resolves.toBeUndefined();
  expect(result.current.pending).toBe(false);
});

it("releases the lock after a rejection and rethrows", async () => {
  const fn = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce("second");
  const { result } = renderHook(() => useAsyncAction(fn));
  await act(async () => { await expect(result.current.run()).rejects.toThrow("boom"); });
  expect(result.current.pending).toBe(false);
  let second: string | undefined;
  await act(async () => { second = await result.current.run(); });
  expect(second).toBe("second");
  expect(fn).toHaveBeenCalledTimes(2);
});

it("exposes pendingKey from getKey while running", async () => {
  const d = deferred<void>();
  const { result } = renderHook(() =>
    useAsyncAction((id: string) => d.promise, { getKey: (id) => id }),
  );
  let p!: Promise<void | undefined>;
  act(() => { p = result.current.run("row-7"); });
  expect(result.current.pendingKey).toBe("row-7");
  await act(async () => { d.resolve(); await p; });
  expect(result.current.pendingKey).toBeNull();
});

it("uses the latest fn without re-creating run", async () => {
  const { result, rerender } = renderHook(({ v }) => useAsyncAction(async () => v), {
    initialProps: { v: 1 },
  });
  const firstRun = result.current.run;
  rerender({ v: 2 });
  expect(result.current.run).toBe(firstRun);
  let out: number | undefined;
  await act(async () => { out = await result.current.run(); });
  expect(out).toBe(2);
});
```

- [ ] **Step 2: Write the failing Button test**

```tsx
// tests/ui-button.test.tsx
import { render, screen } from "@testing-library/react";
import { Button } from "@/components/ui/button";

it("loading disables, sets aria-busy and shows a spinner, keeping the label", () => {
  render(<Button loading>Save</Button>);
  const btn = screen.getByRole("button", { name: /save/i });
  expect(btn).toHaveProperty("disabled", true);
  expect(btn.getAttribute("aria-busy")).toBe("true");
  expect(btn.querySelector("[data-spinner]")).not.toBeNull();
});

it("without loading renders unchanged: enabled, no aria-busy, no spinner", () => {
  render(<Button>Save</Button>);
  const btn = screen.getByRole("button", { name: /save/i });
  expect(btn).toHaveProperty("disabled", false);
  expect(btn.getAttribute("aria-busy")).toBeNull();
  expect(btn.querySelector("[data-spinner]")).toBeNull();
});

it("respects an explicit disabled even when not loading", () => {
  render(<Button disabled>Save</Button>);
  expect(screen.getByRole("button")).toHaveProperty("disabled", true);
});

it("bare variant and size add no visual classes beyond the base", () => {
  render(<Button variant="bare" size="bare" className="px-1 text-xs">x</Button>);
  const cls = screen.getByRole("button").className;
  expect(cls).not.toContain("bg-primary");
  expect(cls).not.toContain("h-9");
  expect(cls).toContain("px-1");
});

it("default size gets the mobile 44px minimum", () => {
  render(<Button>Go</Button>);
  expect(screen.getByRole("button").className).toContain("max-md:min-h-11");
});
```

- [ ] **Step 3: Run both tests to verify they fail**

Run: `node node_modules/vitest/vitest.mjs run tests/use-async-action.test.tsx tests/ui-button.test.tsx`
Expected: FAIL. The hook import cannot be resolved, and the Button `loading` assertions fail.

- [ ] **Step 4: Implement the hook**

```ts
// src/hooks/useAsyncAction.ts
"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Wraps an async action so it cannot run twice at once.
 * The lock is a ref, so two clicks in the same tick (before React re-renders
 * a disabled button) still call `fn` only once. The lock and `pending` always
 * release in `finally`; errors are rethrown to the caller.
 */
export function useAsyncAction<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  options: { getKey?: (...args: A) => string } = {},
) {
  const lock = useRef(false);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const getKeyRef = useRef(options.getKey);
  getKeyRef.current = options.getKey;

  const [pending, setPending] = useState(false);
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const run = useCallback(async (...args: A): Promise<R | undefined> => {
    if (lock.current) return undefined;
    lock.current = true;
    setPending(true);
    setPendingKey(getKeyRef.current ? getKeyRef.current(...args) : null);
    try {
      return await fnRef.current(...args);
    } finally {
      lock.current = false;
      setPending(false);
      setPendingKey(null);
    }
  }, []);

  return { run, pending, pendingKey };
}
```

- [ ] **Step 5: Implement the Button changes**

Replace `src/components/ui/button.tsx` with:

```tsx
import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline:
          "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        bare: "",
      },
      size: {
        default: "h-9 px-4 py-2 max-md:min-h-11",
        sm: "h-8 rounded-md px-3 text-xs max-md:min-h-11",
        lg: "h-10 rounded-md px-8 max-md:min-h-11",
        icon: "h-9 w-9 max-md:size-11",
        bare: "",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  /** Shows a spinner, disables the button and sets aria-busy. Ignored with asChild. */
  loading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }, ref) => {
    const classes = cn(buttonVariants({ variant, size, className }))
    if (asChild) {
      return <Slot className={classes} ref={ref} {...props}>{children}</Slot>
    }
    return (
      <button
        className={cn(classes, loading && "[&>svg:not([data-spinner])]:hidden")}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && <Loader2 data-spinner="" aria-hidden="true" className="animate-spin" />}
        {children}
      </button>
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
```

- [ ] **Step 6: Add the mobile input font rule**

In `src/app/globals.css`, inside the second `@layer base { ... }` block (the one with `* { @apply border-border; }`), append:

```css
  /* iOS Safari zooms on focus when an input's font-size is below 16px. */
  @media (max-width: 767px) {
    input:not([type="checkbox"]):not([type="radio"]):not([type="range"]),
    select,
    textarea {
      font-size: 16px;
    }
  }
```

- [ ] **Step 7: Run the tests and verify they pass**

Run: `node node_modules/vitest/vitest.mjs run tests/use-async-action.test.tsx tests/ui-button.test.tsx`
Expected: PASS (9 tests).

- [ ] **Step 8: Run the full suite and type-check, then commit**

Run `node node_modules/vitest/vitest.mjs run`. Expected: all pass (545 + new).
Run `node node_modules/typescript/bin/tsc --noEmit`. Expected: no new errors.

```bash
git add src/components/ui/button.tsx src/hooks/useAsyncAction.ts src/app/globals.css tests/use-async-action.test.tsx tests/ui-button.test.tsx
git commit -m "feat(ui): Button loading/bare variants, useAsyncAction lock, 16px mobile inputs"
```

---

### Task 3: Dialogs as mobile sheets, and `ConfirmProvider`/`useConfirm`

**Files:**
- Modify: `src/components/ui/dialog.tsx` (`DialogContent` default classes)
- Create: `src/components/ui/confirm-dialog.tsx`
- Modify: `src/app/layout.tsx` (wrap children in `ConfirmProvider`)
- Test: `tests/ui-confirm.test.tsx`

**Interfaces:**
- Consumes: `Button` (`loading`) from Task 2.
- Produces:
  - `ConfirmProvider({ children })`
  - `useConfirm(): (opts: ConfirmOptions) => Promise<boolean>`
  - `type ConfirmOptions = { title: string; description?: string; confirmLabel?: string; cancelLabel?: string; destructive?: boolean; onConfirm?: () => Promise<void> }`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/ui-confirm.test.tsx
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { ConfirmProvider, useConfirm, type ConfirmOptions } from "@/components/ui/confirm-dialog";

let result: boolean | undefined;
function Trigger(props: { opts: ConfirmOptions }) {
  const confirm = useConfirm();
  return <button onClick={async () => { result = await confirm(props.opts); }}>open</button>;
}
function setup(opts: ConfirmOptions) {
  result = undefined;
  render(<ConfirmProvider><Trigger opts={opts} /></ConfirmProvider>);
  fireEvent.click(screen.getByText("open"));
}

it("resolves true on confirm", async () => {
  setup({ title: "Delete it?", confirmLabel: "Delete" });
  fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
  await waitFor(() => expect(result).toBe(true));
});

it("resolves false on cancel", async () => {
  setup({ title: "Delete it?" });
  fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(result).toBe(false));
});

it("resolves false on Escape", async () => {
  setup({ title: "Delete it?" });
  const dialog = await screen.findByRole("dialog");
  fireEvent.keyDown(dialog, { key: "Escape" });
  await waitFor(() => expect(result).toBe(false));
});

it("runs onConfirm with a busy button, then resolves true", async () => {
  let finish!: () => void;
  const onConfirm = vi.fn(() => new Promise<void>((r) => { finish = r; }));
  setup({ title: "Send?", confirmLabel: "Send", onConfirm });
  const send = await screen.findByRole("button", { name: "Send" });
  fireEvent.click(send);
  expect(onConfirm).toHaveBeenCalledTimes(1);
  expect(send.getAttribute("aria-busy")).toBe("true");
  fireEvent.click(send); // ignored while busy
  expect(onConfirm).toHaveBeenCalledTimes(1);
  await act(async () => { finish(); });
  await waitFor(() => expect(result).toBe(true));
});

it("throws a clear error when used outside the provider", () => {
  function Bad() { useConfirm(); return null; }
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(() => render(<Bad />)).toThrow(/ConfirmProvider/);
  spy.mockRestore();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node node_modules/vitest/vitest.mjs run tests/ui-confirm.test.tsx`
Expected: FAIL, the import cannot be resolved.

- [ ] **Step 3: Make `DialogContent` a bottom sheet below `md`**

In `src/components/ui/dialog.tsx`, change the `DialogPrimitive.Content` `className={cn(...)}` first argument from the current string to:

```tsx
"fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg max-md:left-0 max-md:top-auto max-md:bottom-0 max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-t-2xl max-md:max-h-[90dvh] max-md:overflow-y-auto max-md:pb-[calc(1.5rem+env(safe-area-inset-bottom))] max-md:data-[state=open]:slide-in-from-bottom max-md:data-[state=closed]:slide-out-to-bottom max-md:data-[state=open]:zoom-in-100 max-md:data-[state=closed]:zoom-out-100"
```

Also change the close button classes `absolute right-4 top-4 rounded-sm` to `absolute right-3 top-3 rounded-sm p-1 max-md:p-2.5`, so the X has a 44px hit area on phones.

- [ ] **Step 4: Implement `confirm-dialog.tsx`**

```tsx
// src/components/ui/confirm-dialog.tsx
"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** If set, runs inside the dialog with a busy confirm button; resolves true after it settles. */
  onConfirm?: () => Promise<void>;
};

type Pending = { opts: ConfirmOptions; resolve: (v: boolean) => void };

const ConfirmContext = createContext<((opts: ConfirmOptions) => Promise<boolean>) | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const confirm = useCallback(
    (opts: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ opts, resolve })),
    [],
  );

  const settle = useCallback((value: boolean) => {
    setPending((p) => {
      p?.resolve(value);
      return null;
    });
  }, []);

  async function handleConfirm() {
    if (!pending || busyRef.current) return;
    const { onConfirm } = pending.opts;
    if (!onConfirm) return settle(true);
    busyRef.current = true;
    setBusy(true);
    try {
      await onConfirm();
      settle(true);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const opts = pending?.opts;
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog
        open={pending !== null}
        onOpenChange={(open) => { if (!open && !busyRef.current) settle(false); }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogTitle className="pr-8 font-headline text-lg">{opts?.title}</DialogTitle>
          {opts?.description && <DialogDescription>{opts.description}</DialogDescription>}
          <div className="flex flex-col-reverse gap-2 pt-2 md:flex-row md:justify-end">
            <Button variant="outline" disabled={busy} onClick={() => settle(false)} className="max-md:w-full">
              {opts?.cancelLabel ?? "Cancel"}
            </Button>
            <Button
              variant={opts?.destructive ? "destructive" : "default"}
              loading={busy}
              onClick={handleConfirm}
              className="max-md:w-full"
            >
              {opts?.confirmLabel ?? "Confirm"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return ctx;
}
```

- [ ] **Step 5: Mount the provider in the root layout**

In `src/app/layout.tsx`, add `import { ConfirmProvider } from "@/components/ui/confirm-dialog";` and change:

```tsx
        <ThemeProvider>
          {children}
          <Toaster richColors position="bottom-right" />
        </ThemeProvider>
```

to:

```tsx
        <ThemeProvider>
          <ConfirmProvider>
            {children}
            <Toaster richColors position="bottom-right" />
          </ConfirmProvider>
        </ThemeProvider>
```

- [ ] **Step 6: Run the tests and verify they pass**

Run: `node node_modules/vitest/vitest.mjs run tests/ui-confirm.test.tsx`
Expected: PASS (5 tests). If Radix warns about a missing `Description`, that is a console warning only. The `description` branch covers it when one is provided.

- [ ] **Step 7: Run the full suite and type-check, then commit**

```bash
git add src/components/ui/dialog.tsx src/components/ui/confirm-dialog.tsx src/app/layout.tsx tests/ui-confirm.test.tsx
git commit -m "feat(ui): promise-based confirm dialog; dialogs open as bottom sheets on phones"
```

---

### Task 4: `EmptyState`, `ErrorState`, `ResponsiveList`, `ChipTabs`

**Files:**
- Create: `src/components/ui/empty-state.tsx`, `src/components/ui/error-state.tsx`, `src/components/ui/responsive-list.tsx`, `src/components/ui/chip-tabs.tsx`
- Test: `tests/ui-states.test.tsx`, `tests/ui-responsive-list.test.tsx`

**Interfaces:**
- Consumes: `Button` from Task 2.
- Produces:
  - `type StateAction = { label: string; href?: string; onClick?: () => void }`
  - `EmptyState({ icon: LucideIcon, title: string, description?: string, action?: StateAction, secondaryAction?: StateAction, className?: string })`
  - `ErrorState({ title?: string = "Something went wrong", message?: string, onRetry?: () => void, homeHref?: string = "/dashboard", homeLabel?: string = "Go to dashboard" })`
  - `ResponsiveList<T>({ rows: T[]; getKey: (row: T) => string; mobile: { title: (row: T) => React.ReactNode; meta?: (row: T) => React.ReactNode[]; href?: (row: T) => string }; table: React.ReactNode; selection?: { isSelected: (row: T) => boolean; onToggle: (row: T) => void; label: (row: T) => string }; empty?: React.ReactNode })`
  - `ChipTabs({ children: React.ReactNode; className?: string; label: string })`. Each child is a link or button; the active one carries `aria-current="page"`.

- [ ] **Step 1: Write the failing tests**

```tsx
// tests/ui-states.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { Inbox } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { ChipTabs } from "@/components/ui/chip-tabs";

it("EmptyState renders title, description and a link action", () => {
  render(<EmptyState icon={Inbox} title="No contacts yet" description="Import a sheet."
    action={{ label: "Import contacts", href: "/dashboard/admin/crm?tab=import" }} />);
  expect(screen.getByRole("heading", { name: "No contacts yet" })).toBeTruthy();
  expect(screen.getByText("Import a sheet.")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Import contacts" }).getAttribute("href"))
    .toBe("/dashboard/admin/crm?tab=import");
});

it("EmptyState renders a button action that calls onClick", () => {
  const onClick = vi.fn();
  render(<EmptyState icon={Inbox} title="Empty" action={{ label: "Create", onClick }} />);
  fireEvent.click(screen.getByRole("button", { name: "Create" }));
  expect(onClick).toHaveBeenCalledTimes(1);
});

it("ErrorState retry calls onRetry and offers a home link", () => {
  const onRetry = vi.fn();
  render(<ErrorState onRetry={onRetry} />);
  expect(screen.getByRole("alert")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /try again/i }));
  expect(onRetry).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("link", { name: /go to dashboard/i }).getAttribute("href")).toBe("/dashboard");
});

it("ChipTabs renders a labelled scroll row that does not wrap on mobile", () => {
  render(<ChipTabs label="CRM sections"><a href="#a" aria-current="page">A</a><a href="#b">B</a></ChipTabs>);
  const nav = screen.getByRole("navigation", { name: "CRM sections" });
  const row = nav.querySelector("[data-chip-row]") as HTMLElement;
  expect(row.className).toContain("overflow-x-auto");
  expect(row.className).toContain("max-md:flex-nowrap");
});
```

```tsx
// tests/ui-responsive-list.test.tsx
import { render, screen, fireEvent, within } from "@testing-library/react";
import { ResponsiveList } from "@/components/ui/responsive-list";

type Row = { id: string; name: string; email: string; phone: string };
const rows: Row[] = [
  { id: "1", name: "Abdul Wajid", email: "a@x.com", phone: "+92311" },
  { id: "2", name: "Sadia Yousuf", email: "s@x.com", phone: "+92316" },
];

it("renders cards with title and meta on mobile markup and keeps the table for desktop", () => {
  render(
    <ResponsiveList
      rows={rows}
      getKey={(r) => r.id}
      mobile={{ title: (r) => r.name, meta: (r) => [r.email, r.phone], href: (r) => `/c/${r.id}` }}
      table={<table data-testid="desktop-table"><tbody /></table>}
    />,
  );
  const cards = screen.getByTestId("responsive-cards");
  expect(cards.className).toContain("md:hidden");
  const items = within(cards).getAllByRole("listitem");
  expect(items).toHaveLength(2);
  expect(within(items[0]).getByRole("link", { name: /abdul wajid/i }).getAttribute("href")).toBe("/c/1");
  expect(within(items[0]).getByText("a@x.com")).toBeTruthy();
  expect(screen.getByTestId("desktop-table").parentElement!.className).toContain("hidden md:block");
});

it("selection checkbox toggles and has a 44px hit area", () => {
  const onToggle = vi.fn();
  render(
    <ResponsiveList
      rows={rows}
      getKey={(r) => r.id}
      mobile={{ title: (r) => r.name }}
      table={<table />}
      selection={{ isSelected: (r) => r.id === "1", onToggle, label: (r) => `Select ${r.name}` }}
    />,
  );
  const box = screen.getByRole("checkbox", { name: "Select Sadia Yousuf" });
  expect(box.closest("label")!.className).toContain("min-h-11");
  fireEvent.click(box);
  expect(onToggle).toHaveBeenCalledWith(rows[1]);
  expect((screen.getByRole("checkbox", { name: "Select Abdul Wajid" }) as HTMLInputElement).checked).toBe(true);
});

it("shows the empty node instead of cards and table when there are no rows", () => {
  render(<ResponsiveList rows={[]} getKey={() => ""} mobile={{ title: () => "" }}
    table={<table data-testid="t" />} empty={<p>Nothing here</p>} />);
  expect(screen.getByText("Nothing here")).toBeTruthy();
  expect(screen.queryByTestId("t")).toBeNull();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node node_modules/vitest/vitest.mjs run tests/ui-states.test.tsx tests/ui-responsive-list.test.tsx`
Expected: FAIL, the imports cannot be resolved.

- [ ] **Step 3: Implement `empty-state.tsx`**

```tsx
// src/components/ui/empty-state.tsx
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type StateAction = { label: string; href?: string; onClick?: () => void };

function ActionButton({ action, variant }: { action: StateAction; variant: "default" | "outline" }) {
  if (action.href) {
    return (
      <Button asChild variant={variant} className="max-md:w-full">
        <Link href={action.href}>{action.label}</Link>
      </Button>
    );
  }
  return <Button variant={variant} onClick={action.onClick} className="max-md:w-full">{action.label}</Button>;
}

export function EmptyState({
  icon: Icon, title, description, action, secondaryAction, className,
}: {
  icon: LucideIcon; title: string; description?: string;
  action?: StateAction; secondaryAction?: StateAction; className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-4 py-10 text-center md:py-14", className)}>
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
        <Icon className="h-8 w-8 text-primary" aria-hidden="true" />
      </div>
      <h3 className="font-headline text-lg font-bold text-foreground">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {(action || secondaryAction) && (
        <div className="mt-5 flex w-full flex-col gap-2 md:w-auto md:flex-row">
          {action && <ActionButton action={action} variant="default" />}
          {secondaryAction && <ActionButton action={secondaryAction} variant="outline" />}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Implement `error-state.tsx`**

```tsx
// src/components/ui/error-state.tsx
"use client";

import Link from "next/link";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ErrorState({
  title = "Something went wrong",
  message = "We couldn't load this page. It's usually temporary — please try again.",
  onRetry,
  homeHref = "/dashboard",
  homeLabel = "Go to dashboard",
}: {
  title?: string; message?: string; onRetry?: () => void; homeHref?: string; homeLabel?: string;
}) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4 py-10">
      <div role="alert" className="w-full max-w-md rounded-xl border border-destructive/30 border-l-4 border-l-destructive bg-destructive/5 p-5">
        <div className="flex gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="font-headline text-base font-bold text-foreground">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{message}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-2 md:flex-row">
          {onRetry && (
            <Button onClick={onRetry} className="max-md:w-full">
              <RotateCw aria-hidden="true" /> Try again
            </Button>
          )}
          <Button asChild variant="outline" className="max-md:w-full">
            <Link href={homeHref}>{homeLabel}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Implement `responsive-list.tsx`**

```tsx
// src/components/ui/responsive-list.tsx
import Link from "next/link";
import { cn } from "@/lib/utils";

export function ResponsiveList<T>({
  rows, getKey, mobile, table, selection, empty,
}: {
  rows: T[];
  getKey: (row: T) => string;
  mobile: {
    title: (row: T) => React.ReactNode;
    meta?: (row: T) => React.ReactNode[];
    href?: (row: T) => string;
  };
  /** The existing desktop table, rendered unchanged at md and up. */
  table: React.ReactNode;
  selection?: { isSelected: (row: T) => boolean; onToggle: (row: T) => void; label: (row: T) => string };
  empty?: React.ReactNode;
}) {
  if (rows.length === 0 && empty) return <>{empty}</>;
  return (
    <>
      <ul data-testid="responsive-cards" className="space-y-2 md:hidden">
        {rows.map((row) => {
          const href = mobile.href?.(row);
          const meta = mobile.meta?.(row) ?? [];
          const body = (
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium text-foreground">{mobile.title(row)}</div>
              {meta.map((m, i) => (
                <div key={i} className="truncate text-sm text-muted-foreground">{m}</div>
              ))}
            </div>
          );
          return (
            <li key={getKey(row)} className="flex items-stretch rounded-xl border border-border bg-card">
              {selection && (
                <label className="flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center">
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-primary"
                    aria-label={selection.label(row)}
                    checked={selection.isSelected(row)}
                    onChange={() => selection.onToggle(row)}
                  />
                </label>
              )}
              {href ? (
                <Link href={href} className={cn("flex min-h-11 flex-1 items-center p-3 active:bg-muted", selection && "pl-0")}>
                  {body}
                </Link>
              ) : (
                <div className={cn("flex flex-1 items-center p-3", selection && "pl-0")}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="hidden md:block">{table}</div>
    </>
  );
}
```

- [ ] **Step 6: Implement `chip-tabs.tsx`**

```tsx
// src/components/ui/chip-tabs.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Tab/chip row: one horizontally scrollable line on phones (active chip
 * scrolled into view, fade on the side that has more), wraps at md and up.
 */
export function ChipTabs({ children, className, label }: { children: React.ReactNode; className?: string; label: string }) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [fadeRight, setFadeRight] = useState(false);
  const [fadeLeft, setFadeLeft] = useState(false);

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const active = row.querySelector<HTMLElement>("[aria-current=page]");
    active?.scrollIntoView?.({ block: "nearest", inline: "center" });
    const update = () => {
      setFadeLeft(row.scrollLeft > 4);
      setFadeRight(row.scrollLeft + row.clientWidth < row.scrollWidth - 4);
    };
    update();
    row.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      row.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [children]);

  return (
    <nav aria-label={label} className={cn("relative -mx-4 md:mx-0", className)}>
      <div
        ref={rowRef}
        data-chip-row
        className="flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden max-md:flex-nowrap md:flex-wrap md:overflow-visible md:px-0 [&>*]:shrink-0 [&>*]:snap-start"
      >
        {children}
      </div>
      {fadeLeft && <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-background to-transparent md:hidden" />}
      {fadeRight && <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent md:hidden" />}
    </nav>
  );
}
```

Note: the `-mx-4` / `px-4` pair lets the row bleed to the screen edge on phones, matching `<main className="p-4">`.

- [ ] **Step 7: Run the tests and verify they pass, then commit**

Run: `node node_modules/vitest/vitest.mjs run tests/ui-states.test.tsx tests/ui-responsive-list.test.tsx`
Expected: PASS (7 tests). Then run the full suite and `tsc`.

```bash
git add src/components/ui/empty-state.tsx src/components/ui/error-state.tsx src/components/ui/responsive-list.tsx src/components/ui/chip-tabs.tsx tests/ui-states.test.tsx tests/ui-responsive-list.test.tsx
git commit -m "feat(ui): EmptyState, ErrorState, ResponsiveList (cards on phones), ChipTabs"
```

---

### Task 5: Mobile shell (bottom nav 4 + More, safe areas, brand name, top progress bar)

**Files:**
- Create: `src/components/dashboard/nav.ts` (`NAV_ITEMS` moves here from `Sidebar.tsx`)
- Modify: `src/components/dashboard/Sidebar.tsx`
- Modify: `src/components/dashboard/Topbar.tsx:47`
- Modify: `src/app/dashboard/layout.tsx:36`
- Modify: `src/app/layout.tsx` (top loader and `viewport` export)
- Modify: `package.json` / `package-lock.json` (via npm install)
- Test: `tests/dashboard-nav.test.ts`

**Interfaces:**
- Consumes: `Dialog`, `DialogContent` and `DialogTitle` (sheet on mobile) from Task 3.
- Produces:
  - `NAV_ITEMS: NavItem[]`
  - `navForRole(role: Role): NavItem[]`
  - `activeHrefFor(items: NavItem[], pathname: string): string | undefined`
  - `splitMobileNav(items: NavItem[], activeHref: string | undefined, barSize = 4): { bar: NavItem[]; more: NavItem[]; moreActive: boolean }`
  - `NavItem`, exported as a type.

- [ ] **Step 1: Write the failing test**

```ts
// tests/dashboard-nav.test.ts
import { NAV_ITEMS, navForRole, activeHrefFor, splitMobileNav } from "@/components/dashboard/nav";
import type { Role } from "@/lib/roles";

const ROLES: Role[] = ["student", "mentor", "admin", "super_admin"];

describe.each(ROLES)("role %s", (role) => {
  it("every role item appears exactly once across bar and more", () => {
    const items = navForRole(role);
    const { bar, more } = splitMobileNav(items, undefined);
    expect(bar.length).toBeLessThanOrEqual(4);
    const hrefs = [...bar, ...more].map((i) => i.href);
    expect(hrefs.sort()).toEqual(items.map((i) => i.href).sort());
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});

it("admin has items past the 4th, all reachable via more", () => {
  const items = navForRole("admin");
  const { more } = splitMobileNav(items, undefined);
  for (const label of ["Feedback", "Sheet Sync", "Send Notice", "Analytics", "Notifications", "Settings"]) {
    expect(more.map((i) => i.label)).toContain(label);
  }
});

it("moreActive when active href is in the sheet", () => {
  const items = navForRole("admin");
  const active = activeHrefFor(items, "/dashboard/admin/feedback/abc");
  expect(active).toBe("/dashboard/admin/feedback");
  expect(splitMobileNav(items, active).moreActive).toBe(true);
  expect(splitMobileNav(items, "/dashboard").moreActive).toBe(false);
});

it("activeHrefFor picks the longest matching href, not ancestors", () => {
  const items = navForRole("admin");
  expect(activeHrefFor(items, "/dashboard/admin/enrollments")).toBe("/dashboard/admin/enrollments");
  expect(activeHrefFor(items, "/dashboard/adminfoo")).toBe("/dashboard");
});

it("NAV_ITEMS is non-empty and every item has at least one role", () => {
  expect(NAV_ITEMS.length).toBeGreaterThan(0);
  for (const i of NAV_ITEMS) expect(i.roles.length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node node_modules/vitest/vitest.mjs run tests/dashboard-nav.test.ts`
Expected: FAIL, "@/components/dashboard/nav" cannot be resolved.

- [ ] **Step 3: Create `nav.ts`**

Move the `NavItem` interface and the `NAV_ITEMS` array verbatim from `Sidebar.tsx` lines 13–48 into `src/components/dashboard/nav.ts`. Keep the lucide imports they need and export both. Then add:

```ts
export function navForRole(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}

/** Longest matching href wins; matches `href` exactly or `href + "/"` prefix. */
export function activeHrefFor(items: NavItem[], pathname: string): string | undefined {
  return items
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

export function splitMobileNav(items: NavItem[], activeHref: string | undefined, barSize = 4) {
  const bar = items.slice(0, barSize);
  const more = items.slice(barSize);
  return { bar, more, moreActive: more.some((i) => i.href === activeHref) };
}
```

The file starts with `import { type Role } from "@/lib/roles";` and the lucide-react import from `Sidebar.tsx`. Do not add `"use client"`; it is a plain module.

- [ ] **Step 4: Rewrite the `Sidebar` mobile nav**

In `Sidebar.tsx`:
- Delete the moved interface and array, and the `slice(0, 8)` block with its comment.
- Import `{ navForRole, activeHrefFor, splitMobileNav, type NavItem } from "./nav"`.
- Import `{ Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"`, `{ useState } from "react"` and `{ Menu } from "lucide-react"`.

The body becomes:

```tsx
export function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname();
  const items = navForRole(role);
  const activeHref = activeHrefFor(items, pathname);
  const { bar, more, moreActive } = splitMobileNav(items, activeHref);
  const [moreOpen, setMoreOpen] = useState(false);

  const tab = (active: boolean) =>
    cn(
      "flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-[11px] font-label transition-colors",
      active ? "text-pz-on-secondary-container" : "text-pz-on-surface-variant",
    );
  const pill = (active: boolean) =>
    cn("flex h-7 w-12 items-center justify-center rounded-full transition-colors", active && "bg-pz-secondary-container");

  return (
    <>
      {/* Desktop side nav: unchanged markup from before, iterating `items` with `activeHref` */}
      {/* ...keep the existing <aside> block exactly as it was... */}

      {/* Mobile bottom nav: 4 items + More */}
      <nav
        aria-label="Main"
        className="lg:hidden fixed bottom-0 inset-x-0 z-50 flex items-stretch gap-1 border-t border-pz-outline-variant/20 bg-pz-surface-container-highest px-2 pt-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))] shadow-lg"
      >
        {bar.map((item: NavItem) => {
          const active = item.href === activeHref;
          return (
            <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={tab(active)}>
              <span className={pill(active)}><item.icon className="h-5 w-5" /></span>
              <span className="max-w-full truncate">{item.shortLabel ?? item.label}</span>
            </Link>
          );
        })}
        {more.length > 0 && (
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            className={tab(moreActive)}
          >
            <span className={pill(moreActive)}><Menu className="h-5 w-5" /></span>
            <span>More</span>
          </button>
        )}
      </nav>

      <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
        <DialogContent className="lg:hidden">
          <DialogTitle className="font-headline text-base">More</DialogTitle>
          <div className="grid grid-cols-3 gap-2">
            {more.map((item) => {
              const active = item.href === activeHref;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-xl p-2 text-center text-xs font-label",
                    active ? "bg-pz-primary-container text-pz-on-primary-container font-bold" : "bg-pz-surface-container text-pz-on-surface",
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  {item.shortLabel ?? item.label}
                </Link>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

Keep the existing desktop `<aside>` JSX verbatim in place of the comment placeholder above.

- [ ] **Step 5: Fix the brand name and the safe-area bottom padding**

In `src/components/dashboard/Topbar.tsx:47`, replace `PharmaZyme` with `PZ Academy`.

In `src/app/dashboard/layout.tsx:36`, change `className="flex-1 p-4 sm:p-6 pb-24 lg:pb-6"` to:

```tsx
className="flex-1 p-4 sm:p-6 pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-6"
```

- [ ] **Step 6: Add the top progress bar and `viewport-fit`**

Run: `npm install nextjs-toploader@^3`. It must be added to `dependencies`.

In `src/app/layout.tsx`:
- Add `import NextTopLoader from "nextjs-toploader";` and `import type { Viewport } from "next";`. Merge the latter into the existing `import type { Metadata } from "next";`.
- Add the export:

```tsx
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};
```

- Put this as the first child of `<body>`:

```tsx
        <NextTopLoader color="hsl(var(--primary))" height={3} showSpinner={false} shadow={false} />
```

- [ ] **Step 7: Run the tests, type-check and commit**

Run: `node node_modules/vitest/vitest.mjs run tests/dashboard-nav.test.ts` (expected PASS, 8 tests), then the full suite and `tsc`.

```bash
git add src/components/dashboard/nav.ts src/components/dashboard/Sidebar.tsx src/components/dashboard/Topbar.tsx src/app/dashboard/layout.tsx src/app/layout.tsx package.json package-lock.json tests/dashboard-nav.test.ts
git commit -m "feat(mobile): bottom nav 4 + More sheet (all items reachable), safe areas, top progress bar"
```

---

### Task 6: Route `loading.tsx` files

**Files (create every one, with exact content per the table):** each file is:

```tsx
import { <Shape> } from "@/components/ui/skeletons";

export default function Loading() {
  return <<Shape> <props> />;
}
```

| Path (`src/app/…/loading.tsx`) | Shape and props |
|---|---|
| `dashboard/` | `CardGridSkeleton stats={4} cards={4}` |
| `dashboard/admin/` | `CardGridSkeleton stats={4} cards={0}` |
| `dashboard/admin/crm/` | `TableSkeleton cols={5}` |
| `dashboard/admin/enrollments/` | `TableSkeleton cols={5}` |
| `dashboard/admin/feedback/` | `TableSkeleton cols={4}` |
| `dashboard/admin/mentors/` | `TableSkeleton cols={4}` |
| `dashboard/admin/courses/` | `TableSkeleton cols={4}` |
| `dashboard/admin/mentorship/` | `TableSkeleton cols={5}` |
| `dashboard/admin/sheet-sync/` | `TableSkeleton cols={3}` |
| `dashboard/admin/marketing/` | `CardGridSkeleton stats={0} cards={6}` |
| `dashboard/admin/crm/contacts/[id]/` | `DetailSkeleton sections={3}` |
| `dashboard/admin/crm/campaigns/[id]/` | `DetailSkeleton sections={2}` |
| `dashboard/admin/crm/whatsapp/[id]/` | `DetailSkeleton sections={2}` |
| `dashboard/admin/crm/cohorts/[id]/` | `DetailSkeleton sections={2}` |
| `dashboard/admin/crm/agents/[id]/` | `DetailSkeleton sections={2}` |
| `dashboard/admin/enrollments/[id]/` | `DetailSkeleton sections={3}` |
| `dashboard/admin/feedback/[id]/` | `DetailSkeleton sections={3}` |
| `dashboard/admin/mentors/[id]/` | `DetailSkeleton sections={3}` |
| `dashboard/admin/courses/[id]/` | `DetailSkeleton sections={3}` |
| `dashboard/admin/courses/[id]/builder/` | `FormSkeleton fields={6}` |
| `dashboard/admin/courses/new/` | `FormSkeleton fields={5}` |
| `dashboard/admin/mentors/new/` | `FormSkeleton fields={6}` |
| `dashboard/admin/notifications/` | `FormSkeleton fields={4}` |
| `dashboard/settings/` | `FormSkeleton fields={5}` |
| `dashboard/mentor/profile/` | `FormSkeleton fields={6}` |
| `dashboard/mentor/availability/` | `FormSkeleton fields={4}` |
| `dashboard/mentor-application/` | `FormSkeleton fields={5}` |
| `dashboard/messages/` | `ChatSkeleton` |
| `dashboard/mentor/messages/` | `ChatSkeleton` |
| `dashboard/courses/` | `CardGridSkeleton stats={0} cards={6}` |
| `dashboard/sessions/` | `TableSkeleton cols={4} filters={false}` |
| `dashboard/notes/` | `TableSkeleton cols={3} filters={false}` |
| `dashboard/notifications/` | `TableSkeleton cols={2} filters={false}` |
| `dashboard/mentor/` | `CardGridSkeleton stats={3} cards={4}` |
| `dashboard/mentor/feedback/` | `TableSkeleton cols={4} filters={false}` |
| `dashboard/mentor/feedback/[id]/` | `DetailSkeleton sections={3}` |
| `portal/[slug]/` | `DetailSkeleton sections={4}` |
| `portal/[slug]/lessons/[lessonId]/` | `LessonSkeleton` |
| `courses/` | `CardGridSkeleton stats={0} cards={6}` |
| `webinars/` | `CardGridSkeleton stats={0} cards={6}` |
| `workshops/` | `CardGridSkeleton stats={0} cards={6}` |
| `mentorship/` | `CardGridSkeleton stats={0} cards={6}` |
| `courses/[slug]/` | `DetailSkeleton sections={3}` |
| `mentorship/mentors/[slug]/` | `DetailSkeleton sections={3}` |
| `mentorship/book/[slug]/` | `FormSkeleton fields={5}` |
| `enroll/[slug]/` | `FormSkeleton fields={5}` |
| `feedback/[id]/` | `FormSkeleton fields={5}` |

Public pages (the last 9 rows) render outside the dashboard layout, so wrap them in padding. For those files only, use:

```tsx
export default function Loading() {
  return <div className="mx-auto w-full max-w-6xl px-4 py-8 md:py-12"><<Shape> <props> /></div>;
}
```

`portal/[slug]/` has its own layout; check `src/app/portal/[slug]/layout.tsx`. If that layout already pads its children, use the plain form; otherwise use the padded form.

**Interfaces:**
- Consumes: the shapes from Task 1.

- [ ] **Step 1: Check whether each target directory already has a `loading.tsx`**

Run: `find src/app -name loading.tsx`
Expected: no output, confirming nothing gets overwritten.

- [ ] **Step 2: Create all the files from the table**

Use the exact template and props listed above.

- [ ] **Step 3: Type-check**

Run: `node node_modules/typescript/bin/tsc --noEmit`. Expected: no new errors.

- [ ] **Step 4: Run a dev smoke check**

Start the dev server with `node node_modules/next/dist/bin/next dev` (run it in the background). Then, with the Playwright browser at 390×844 and network throttling set to "Slow 3G" via `page.route` delay or CDP, navigate to `/dashboard/admin/crm`, `/dashboard/settings`, `/dashboard/messages` and `/courses`. Confirm a skeleton matching the phone layout appears before content and that the bottom nav stays visible. The admin login is needed, so ask the user to sign in if the session has expired. Stop the dev server afterwards.

- [ ] **Step 5: Commit**

```bash
git add src/app
git commit -m "feat(ui): route loading skeletons for dashboard, portal and public pages"
```

---

### Task 7: Error boundaries and the 404

**Files:**
- Create: `src/app/error.tsx`, `src/app/dashboard/error.tsx`, `src/app/portal/[slug]/error.tsx`, `src/app/global-error.tsx`, `src/app/not-found.tsx`
- Test: `tests/route-boundaries.test.tsx`

**Interfaces:**
- Consumes: `ErrorState` from Task 4 and `Button`.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/route-boundaries.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import DashboardError from "@/app/dashboard/error";
import RootError from "@/app/error";
import NotFound from "@/app/not-found";

it("dashboard error shows the alert card and Try again calls reset", () => {
  const reset = vi.fn();
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  render(<DashboardError error={Object.assign(new Error("x"), { digest: "d1" })} reset={reset} />);
  expect(screen.getByRole("alert")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /try again/i }));
  expect(reset).toHaveBeenCalledTimes(1);
  expect(spy).toHaveBeenCalled();
  spy.mockRestore();
});

it("root error links home, not to the dashboard", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  render(<RootError error={new Error("x")} reset={() => {}} />);
  expect(screen.getByRole("link", { name: /go home/i }).getAttribute("href")).toBe("/");
});

it("404 offers dashboard and courses", () => {
  render(<NotFound />);
  expect(screen.getByRole("heading", { name: /page not found/i })).toBeTruthy();
  expect(screen.getByRole("link", { name: /go to dashboard/i }).getAttribute("href")).toBe("/dashboard");
  expect(screen.getByRole("link", { name: /browse courses/i }).getAttribute("href")).toBe("/courses");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node node_modules/vitest/vitest.mjs run tests/route-boundaries.test.tsx`
Expected: FAIL, the modules cannot be resolved.

- [ ] **Step 3: Implement the error files**

```tsx
// src/app/dashboard/error.tsx
"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui/error-state";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("Dashboard route error", error.digest ?? error.message); }, [error]);
  return <ErrorState onRetry={reset} />;
}
```

`src/app/portal/[slug]/error.tsx` is identical except the function is named `PortalError`, it logs `"Portal route error"`, and it renders `<ErrorState onRetry={reset} homeHref="/dashboard/courses" homeLabel="Back to my courses" />`.

`src/app/error.tsx` is identical except the function is named `RootError`, it logs `"Route error"`, and it renders `<ErrorState onRetry={reset} homeHref="/" homeLabel="Go home" />`.

```tsx
// src/app/global-error.tsx
"use client";

/* Replaces the root layout when it crashes, so it renders its own <html>
   and cannot rely on Tailwind tokens or providers. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#F7FAF5", color: "#0F3D22" }}>
        <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24 }}>
          <div style={{ maxWidth: 420, textAlign: "center" }}>
            <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>Something went wrong</h1>
            <p style={{ margin: "0 0 20px", color: "#196432" }}>Please try again in a moment.</p>
            <button
              onClick={reset}
              style={{ minHeight: 44, padding: "0 20px", borderRadius: 10, border: 0, background: "#194B32", color: "#fff", fontSize: 16 }}
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
```

The hex values here are the documented `pz` palette (`deep`, `mid`, `forest`, `offwhite`). This is the only file allowed literal colors, because the theme is unavailable when the root layout has crashed.

- [ ] **Step 4: Implement `not-found.tsx`**

The layout follows the Stitch "404: Page Not Found" screen. No illustration asset exists in `public/`, so it uses an icon tile.

```tsx
// src/app/not-found.tsx
import Link from "next/link";
import { BookOpen, LayoutDashboard, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-pz-offwhite px-4 py-12 dark:bg-[#101412]">
      <div className="flex w-full max-w-3xl flex-col items-center gap-8 text-center md:flex-row md:text-left">
        <div className="flex h-32 w-32 shrink-0 rotate-[-4deg] items-center justify-center rounded-3xl bg-pz-primary-container md:h-44 md:w-44">
          <SearchX className="h-16 w-16 text-pz-on-primary-container md:h-20 md:w-20" aria-hidden="true" />
        </div>
        <div>
          <p className="inline-block rounded-full border border-border px-3 py-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Error 404
          </p>
          <h1 className="mt-3 font-headline text-3xl font-black text-foreground md:text-5xl">Page Not Found</h1>
          <p className="mt-3 max-w-md text-muted-foreground">
            This page seems to have gone missing. Let&apos;s get you back to your learning.
          </p>
          <div className="mt-6 flex flex-col gap-2 md:flex-row">
            <Button asChild size="lg" className="max-md:w-full">
              <Link href="/dashboard"><LayoutDashboard aria-hidden="true" /> Go to Dashboard</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="max-md:w-full">
              <Link href="/courses"><BookOpen aria-hidden="true" /> Browse Courses</Link>
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Run the tests, type-check and commit**

Run: `node node_modules/vitest/vitest.mjs run tests/route-boundaries.test.tsx` (expected PASS, 3 tests), then the full suite and `tsc`.

```bash
git add src/app/error.tsx src/app/dashboard/error.tsx "src/app/portal/[slug]/error.tsx" src/app/global-error.tsx src/app/not-found.tsx tests/route-boundaries.test.tsx
git commit -m "feat(ui): branded error boundaries and 404 page"
```

---

## Sweep tasks (8–12): shared recipe

Every sweep task applies the same recipe to its file list. Apply each step only where the file has the pattern. Read each file fully before editing it.

**R1: Single action with a state flag.**

Before:

```tsx
const [saving, setSaving] = useState(false);
async function save() {
  setSaving(true);
  try { /* body */ } finally { setSaving(false); }
}
<button disabled={saving} onClick={save} className="…">{saving ? "Saving…" : "Save"}</button>
```

After:

```tsx
const { run: save, pending: saving } = useAsyncAction(async () => {
  /* body, unchanged, minus setSaving calls */
});
<Button variant="bare" size="bare" loading={saving} onClick={() => save()} className="…">
  {saving ? "Saving…" : "Save"}
</Button>
```

Keep the existing label text logic. Keep the `try`/`catch` and toasts inside the body. Delete the now-unused `useState` flag. If the original button was already a shadcn `<Button>`, keep its variant and size and just add `loading`.

**R2: Per-row action** (an `xxxId` state holding which row is busy).

```tsx
const { run: remove, pending: removing, pendingKey: removingId } =
  useAsyncAction(async (t: Template) => { /* body */ }, { getKey: (t) => t.id });
<Button … loading={removingId === t.id} disabled={removing} onClick={() => remove(t)}>
```

**R3: Form submit.** `onSubmit={(e) => { e.preventDefault(); void submit(); }}`, where `submit` is a `run` from R1. The submit button is `<Button type="submit" loading={pending}>`.

**R4: `useTransition`.** Keep `startTransition(() => router.refresh())` as it is. Move only the `fetch` into `useAsyncAction`, and combine the two flags: `loading={pending || isRefreshing}`.

**R5: `confirm()`.**

```tsx
const confirm = useConfirm();
// …inside the handler, before the request:
if (!(await confirm({ title: "Delete template?", description: `"${t.name}" will be removed.`, confirmLabel: "Delete", destructive: true }))) return;
```

The handler must be the `useAsyncAction` body, so the lock covers the confirm too.

**R6: `alert(msg)`.** Replace with `toast.error(msg)`, or `toast.info(msg)` for non-errors. Import `toast` from `"sonner"` if it isn't imported already.

**R7: Table to `ResponsiveList`.** Wrap the existing `<table>` JSX, unchanged, as the `table` prop:

```tsx
<ResponsiveList
  rows={rows}
  getKey={(r) => r.id}
  mobile={{ title: (r) => r.full_name, meta: (r) => [r.email, r.phone].filter(Boolean), href: (r) => `/…/${r.id}` }}
  selection={/* only if the table has row checkboxes: isSelected / onToggle / label from existing state */}
  table={/* the existing table element, including its overflow wrapper */}
/>
```

Choose the title as the row's primary name column and the meta as the 2–3 most useful other columns. If the table had a "no rows" message, pass it as `empty` using `<EmptyState>` (R9).

**R8: Tab rows.** Replace the tab wrapper `<div className="flex gap-2 flex-wrap">` with `<ChipTabs label="<Section> sections">`. Add `aria-current={active ? "page" : undefined}` to each tab link, where `active` is the same condition already passed to the tab's class function.

**R9: Empty lists.** Replace plain "No … yet" text or blank renders for empty collections with `<EmptyState icon={…} title="…" description="…" action={…} />`. Use a fitting lucide icon. Add an action only where an obvious next step exists, for example the "Import contacts" link to `?tab=import`.

**R10: Client loading text.** Replace "Loading…" text, or a bare spinner shown while a client component fetches its initial data, with the matching skeleton shape from `@/components/ui/skeletons` (for example, `<TableSkeleton title={false} filters={false} rows={5} />` inside a panel).

**R11: Stat grids.** `grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4` becomes `grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4`. In `StatCard`, use `p-4 md:p-5` for compact phone tiles.

**R12: Tap targets.** Any remaining icon-only `<button>` or `<a>` (for example a row delete X) gets `max-md:min-h-11 max-md:min-w-11` and centered content. Checkboxes outside `ResponsiveList` get wrapped in a `<label className="inline-flex min-h-11 min-w-11 items-center justify-center">`.

**R13: Sticky primary action** (long forms only, as named in the task). Wrap the form's primary action row with:

```tsx
<div className="max-md:sticky max-md:bottom-[calc(4.5rem+env(safe-area-inset-bottom))] max-md:z-40 max-md:-mx-4 max-md:border-t max-md:border-border max-md:bg-background/95 max-md:px-4 max-md:py-3 max-md:backdrop-blur">
```

**Per-file verification, required for every sweep task.** After editing a task's files:
1. Run `tsc` and the full Vitest suite.
2. Grep the task's files: `grep -nE "[^a-zA-Z.](confirm|alert)\(" <files>` must return nothing. Every remaining `fetch(` in a click or submit handler must sit inside a `useAsyncAction` body.
3. Do a 390×844 Playwright pass on the task's pages (dev server). Check:
   - `document.documentElement.scrollWidth === innerWidth`;
   - tables show as cards;
   - a double click on one representative action produces exactly one request in `browser_network_requests`.

   Ask the user to sign in if the session has expired. Use only the test accounts named in memory, and never write real data without asking.
4. Commit with the task's message.

---

### Task 8: Sweep CRM

**Files:**
- `src/app/dashboard/admin/crm/page.tsx`: R8, plus R11 if it has a stat grid.
- `src/components/admin/crm/ContactsPanel.tsx`: R1, R2, R7 (with selection), R8 (its filter tabs, if any), R9, R10, R12.
- `src/components/admin/crm/ImportWizard.tsx`: R1, R3, R7, R10.
- `src/components/admin/crm/MergeReviewPanel.tsx`: R1, R2, R9.
- `src/components/admin/crm/CampaignsPanel.tsx`: R1, R2, R3, R7, R9.
- `src/components/admin/crm/CohortsPanel.tsx`: R1, R7, R9.
- `src/components/admin/crm/WhatsAppPanel.tsx`: R1, R2, R5 (line 127), R9.
- `src/components/admin/crm/AgentsPanel.tsx`: R1, R2, R7, R9.
- `src/components/admin/crm/SegmentBuilder.tsx`: R1.
- `src/components/admin/crm/TemplatePicker.tsx`: R1 (`saving`), R2 (`removeTemplate` / `deletingId`), R5 (line 82).
- `src/components/admin/crm/ContactDetailClient.tsx`: R1, R2, R3, R8, R12, R13 (manual-conversion form).
- `src/components/admin/crm/WhatsAppBatchDetailClient.tsx`: R1, R2, R7, R8.
- `src/components/admin/crm/AgentDetailClient.tsx`: R7, R8.
- `src/components/admin/crm/CampaignDetailClient.tsx`: R7, R8.
- `src/components/admin/crm/CohortDetailClient.tsx`: R7, R8.

**Interfaces:** consumes `useAsyncAction`, `Button`, `useConfirm`, `ResponsiveList`, `ChipTabs`, `EmptyState` and the skeletons from Tasks 1–4.

- [ ] **Step 1:** Read all 15 files.
- [ ] **Step 2:** Apply the recipe steps listed per file.
- [ ] **Step 3:** Run the per-file verification. Pages: `/dashboard/admin/crm?tab=` for each of contacts, import, merge, campaigns, cohorts, whatsapp, conversion and agents, plus one detail page of each kind. Double-click check: use "Mark converted" on a contact. Do not save; cancel at the dialog, or ask the user for a contact and delete the rows afterwards.
- [ ] **Step 4:** Commit.

```bash
git add src/app/dashboard/admin/crm src/components/admin/crm
git commit -m "feat(crm): mobile cards, scrollable tabs, double-submit guards, confirm dialogs, empty states"
```

---

### Task 9: Sweep admin (feedback, enrollments, mentorship, marketing)

**Files:**
- `src/app/dashboard/admin/feedback/page.tsx`: R7, R9.
- `src/app/dashboard/admin/feedback/audit-log/AuditLogClient.tsx`: R7, R9, R10.
- `src/app/dashboard/admin/feedback/NewSessionModal.tsx`: R1, R3.
- `src/app/dashboard/admin/feedback/ShareReviewModal.tsx`: R1.
- `src/app/dashboard/admin/feedback/[id]/EditSessionModal.tsx`: R1, R3.
- `src/app/dashboard/admin/feedback/[id]/SessionDetailClient.tsx`: R1, R2, R12.
- `src/app/dashboard/admin/feedback/question-bank/QuestionBankEditor.tsx`: R1, R2, R3, R13.
- `src/app/dashboard/admin/enrollments/page.tsx`: R7, R9.
- `src/components/admin/EnrollmentReviewActions.tsx`: R1, R2.
- `src/app/dashboard/admin/mentorship/page.tsx`: R7, R8, R9.
- `src/components/admin/mentorship/MentorshipReviewActions.tsx`: R1, R2.
- `src/components/admin/mentorship/ScheduleSessionModal.tsx`: R1, R3.
- `src/app/dashboard/admin/marketing/page.tsx`: R8.
- `src/components/admin/marketing/BannersPanel.tsx`: R1, R2, R5 (line 163), R9.
- `src/components/admin/marketing/FeaturedBoard.tsx`: R1. FeaturedBoard uses drag-and-drop, so do not change DndContext structure or `useDroppable` placement. See the Phase 7 memory: `useDroppable` above `DndContext` broke once.

- [ ] **Step 1:** Read all files.
- [ ] **Step 2:** Apply the recipe.
- [ ] **Step 3:** Run the per-file verification on those pages. Double-click check: "Schedule session" in a modal. Cancel before saving unless the user approves a test write.
- [ ] **Step 4:** Commit.

```bash
git commit -m "feat(admin): mobile cards and guards for feedback, enrollments, mentorship, marketing"
```

Stage the listed files explicitly.

---

### Task 10: Sweep admin (programs, mentors, notices, sheet sync, analytics)

**Files:**
- `src/app/dashboard/admin/page.tsx`: R11.
- `src/components/dashboard/StatCard.tsx`: R11 (`p-4 md:p-5`).
- `src/components/admin/program/ProgramLibraryTable.tsx`: R7, R9.
- `src/components/admin/program/CourseBuilder.tsx`: R1, R2, R12.
- `src/components/admin/program/CurriculumMap.tsx`: R1, R2, R12. Keep the drag-and-drop structure untouched.
- `src/components/admin/program/LessonEditorPanel.tsx`: R1, R3, R10, R13.
- `src/components/admin/program/QuizEditor.tsx`: R1, R2, R13.
- `src/components/admin/program/NewCourseForm.tsx`: R1, R3, R13.
- `src/components/admin/program/ProgramConfigForm.tsx`: R1, R3, R13.
- `src/components/admin/program/ImageUploadField.tsx`: R1, R10.
- `src/components/admin/mentors/MentorRegistryTable.tsx`: R1, R2, R7, R9.
- `src/components/admin/mentors/MentorAccountCard.tsx`: R1.
- `src/components/admin/mentors/MentorConfigForm.tsx`: R1, R3, R13.
- `src/components/admin/mentors/NewMentorForm.tsx`: R1, R3, R13.
- `src/components/admin/ComposeNotificationForm.tsx`: R1, R3.
- `src/components/admin/PurgeNotificationsCard.tsx`: R1. If it uses no confirm today, do not add one; behavior is preserved.
- `src/components/admin/ConnectSheetForm.tsx`: R1, R3.
- `src/components/admin/SheetPendingBanner.tsx`: R1.

- [ ] **Step 1:** Read all files.
- [ ] **Step 2:** Apply the recipe.
- [ ] **Step 3:** Run the per-file verification. Pages: `/dashboard/admin`, `/dashboard/admin/courses`, one course builder, `/dashboard/admin/mentors`, `/dashboard/admin/notifications` and `/dashboard/admin/sheet-sync`. Double-click check: "Save" in the lesson editor on the "Test" course (title "Test"), with no content changes. A save with identical content is harmless.
- [ ] **Step 4:** Commit.

```bash
git commit -m "feat(admin): mobile stat grid, cards and guards for programs, mentors, notices, sheet sync"
```

---

### Task 11: Sweep student and mentor dashboards

**Files:**
- `src/app/dashboard/page.tsx`: R11 (lines 48, 72), R9 for the empty "My Courses" and "Upcoming Sessions" blocks (actions "Browse courses" to `/courses` and "Book a session" to `/mentorship`).
- `src/components/dashboard/NotificationBell.tsx`: R1, R12.
- `src/components/dashboard/NotificationHistory.tsx`: R1, R2, R9.
- `src/components/dashboard/SettingsForm.tsx`: R1, R3, R13.
- `src/components/mentor/AvailabilityForm.tsx`: R1, R3, R12, R13.
- `src/components/mentor/MentorSelfProfileForm.tsx`: R1, R3, R13.
- `src/components/mentor/UpcomingSessionsList.tsx`: R1, R2, R9.
- `src/components/messaging/MessageThread.tsx`: R3 (send). Keep the optimistic/realtime reconciliation logic untouched (see the mentor messaging memory). Add `max-md:min-h-11` to the send button and make the composer sticky above the bottom nav with R13's wrapper.
- `src/components/sessions/BookSessionsStepper.tsx`: R1, R3, R13.
- `src/components/lms/MarkCompleteButton.tsx`: R1. It already shows a `Loader2`; replace it with `<Button loading>`.
- `src/components/lms/QuizModal.tsx`: R1, R3.

- [ ] **Step 1:** Read all files.
- [ ] **Step 2:** Apply the recipe.
- [ ] **Step 3:** Run the per-file verification. Pages: `/dashboard`, `/dashboard/settings`, `/dashboard/notifications`, `/dashboard/messages` and one lesson. The student view needs a student session; `hamzaansari4you@gmail.com` is role=mentor and has no role gate on student routes, so ask the user to sign in with it. Double-click check: send a message. Ask the user before sending real messages.
- [ ] **Step 4:** Commit.

```bash
git commit -m "feat(dashboard): mobile-first stats, guards, sticky actions for student and mentor screens"
```

---

### Task 12: Sweep public, booking, enroll and auth

**Files:**
- `src/components/mentorship/BookingClient.tsx`: R1, R3, R6 (lines 105, 147, 152). The "Please wait a moment" message becomes `toast.info`; the others become `toast.error`. Add R13.
- `src/components/mentorship/RecruitmentForm.tsx`: R1, R3, R13.
- `src/components/enroll/EnrollWizard.tsx`: R1, R3, R13.
- `src/components/leads/LeadCaptureForm.tsx`: R1, R3.
- `src/app/feedback/[id]/FeedbackClient.tsx`: R1, R3.
- `src/app/review/[token]/ReviewClient.tsx`: R1, R3.
- `src/components/auth/LoginForm.tsx`, `src/components/auth/RegisterForm.tsx`, `src/app/(auth)/forgot-password/page.tsx`, `src/app/(auth)/reset-password/page.tsx`: R1, R3. Replace the existing `Loader2` usage with `<Button loading>`.

Do not touch `src/app/api/share-card/[token]/route.tsx` or `src/app/review/[token]/opengraph-image.tsx`. They are server image routes, not UI handlers.

- [ ] **Step 1:** Read all files.
- [ ] **Step 2:** Apply the recipe.
- [ ] **Step 3:** Run the per-file verification. Pages: `/login`, `/register`, `/courses`, one `/courses/[slug]`, one `/mentorship/book/[slug]` and one `/enroll/[slug]`. Double-click check: Login with a wrong password, which is harmless. Two clicks must produce one auth request and one error toast.
- [ ] **Step 4:** Commit.

```bash
git commit -m "feat(public): guards, toasts instead of alerts, sticky actions on booking/enroll/auth"
```

---

### Task 13: Whole-app mobile verification and cleanup

**Files:** none planned. Fixes found here are committed per finding.

- [ ] **Step 1: Repo-wide checks**

```bash
grep -rnE "[^a-zA-Z.](confirm|alert)\(" --include=*.tsx src     # expect: no output
grep -rn "slice(0, 8)" src/components/dashboard                 # expect: no output
grep -rn "PharmaZyme" src/components/dashboard                  # expect: no output
```

Run `node node_modules/typescript/bin/tsc --noEmit` and `node node_modules/vitest/vitest.mjs run`. Both must be clean.

- [ ] **Step 2: Overflow audit at 360 and 390**

With the dev server and an admin session, run this in Playwright for each route in Task 6's table, plus `/login` and a 404 URL, at 360×780 and at 390×844:

```js
() => ({ path: location.pathname, sw: document.documentElement.scrollWidth, vw: innerWidth })
```

Every result must have `sw === vw`. Fix any offender (usually a fixed-width element or an unwrapped long string, for example `break-all` on emails) and commit `fix(mobile): <page> overflow`.

- [ ] **Step 3: Dark mode spot-check**

Toggle dark mode. On a phone viewport, check a skeleton (throttled navigation), an empty state, the More sheet, a confirm sheet and the 404.

- [ ] **Step 4: Report**

List for the user:
- every route checked;
- any page left with a known issue;
- the commits made.

Do not push. Ask the user whether to push `master:main`, which deploys to production.

---

## Self-review notes (completed while writing)

- **Spec coverage:**
  - Section 1 items 1–7 map to Tasks 1–5.
  - Section 2 maps to Task 6 (routes) and Task 7 (errors and 404). Client panels and empty states are covered by R9 and R10 in Tasks 8–12.
  - Section 3 maps to recipes R1–R6 in Tasks 8–12.
  - Section 4 items map as follows: 1 to Task 5, 2 to R7, 3 to R8 and `ChipTabs`, 4 to R11, 5 to Task 2 and R12, 6 to R13, 7 to Task 3, 8 to Task 5, 9 to Task 1, 10 to Task 13.
  - Testing maps to the per-task tests, the per-file verification and Task 13.
  - Rollout waves: Tasks 1–4 are wave 1, Task 5 is wave 2, Tasks 6–7 are wave 3 and Tasks 8–12 are wave 4.
- **Known non-spec observation, out of scope:** `NAV_ITEMS` links to `/dashboard/admin/students` and `/dashboard/certificates`, which have no `page.tsx`. A 404 was seen in production on the `/dashboard/admin/students` prefetch. With Task 7 these show the branded 404 instead of the default one; building those pages is not part of this plan. Report this to the user.
