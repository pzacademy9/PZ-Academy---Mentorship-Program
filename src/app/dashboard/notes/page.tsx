import { redirect } from "next/navigation";
import Link from "next/link";
import { NotebookPen } from "lucide-react";
import { createServerSupabase } from "@/lib/supabase/server";
import { getAllNotes } from "@/lib/data/notes";

export const metadata = { title: "My Notes — PZ Academy" };

export default async function MyNotesPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const notes = await getAllNotes(user.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline font-bold text-2xl text-pz-secondary">My Notes</h1>
        <p className="font-body text-pz-on-surface-variant text-sm mt-1">
          Everything you&apos;ve written across your lessons, in one place.
        </p>
      </div>

      {notes.length === 0 ? (
        <div className="bg-pz-surface-container rounded-2xl border border-pz-outline-variant/40 p-10 flex flex-col items-center text-center">
          <NotebookPen className="w-10 h-10 text-pz-outline-variant mb-3" />
          <p className="font-body text-pz-on-surface-variant text-sm">
            No notes yet — notes you take on lessons will show up here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {notes.map((note) => (
            <Link
              key={note.id}
              href={`/portal/${note.courseSlug}/lessons/${note.lessonId}`}
              className="p-5 rounded-xl bg-pz-surface-container border border-pz-outline-variant/40 hover:border-pz-primary transition-colors flex flex-col gap-2"
            >
              <span className="font-label text-[11px] uppercase tracking-widest text-pz-secondary/80">
                {note.courseTitle}
              </span>
              <h3 className="font-headline font-bold text-pz-on-surface text-base leading-tight">
                {note.lessonTitle}
              </h3>
              <p className="font-body text-sm text-pz-on-surface-variant line-clamp-3">
                {note.preview || "No content yet."}
              </p>
              <p className="font-label text-[11px] text-pz-on-surface-variant/60 mt-auto pt-2">
                {new Date(note.updatedAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
