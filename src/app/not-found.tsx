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
