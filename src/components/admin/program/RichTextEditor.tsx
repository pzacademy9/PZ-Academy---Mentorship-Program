"use client";

import { useEffect, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  Link as LinkIcon,
  Image as ImageIcon,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TOOLBAR_BUTTON =
  "p-1.5 rounded hover:bg-pz-surface-container-low text-pz-on-surface-variant transition-colors";
const TOOLBAR_BUTTON_ACTIVE = "bg-pz-primary-container text-pz-on-primary-container";

/**
 * Stores/edits sanitised HTML in lessons.text_content. Sanitisation itself
 * happens server-side (sanitizeLessonHtml, applied on every write) — this
 * editor only needs to produce HTML that maps onto that allowlist, which is
 * why the toolbar is deliberately limited to bold/italic/underline/lists/
 * link/image and nothing script-capable.
 */
export function RichTextEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (html: string) => void;
}) {
  const [fullscreen, setFullscreen] = useState(false);
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false }),
      Image,
    ],
    content: value,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "min-h-[300px] p-6 font-body text-pz-on-surface/90 leading-relaxed outline-none prose prose-sm max-w-none " +
          "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-pz-primary [&_a]:underline",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  // The Builder swaps `value` wholesale when the admin selects a different
  // lesson — Tiptap otherwise keeps editing the previous lesson's document.
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, value]);

  if (!editor) return null;

  return (
    <>
      {fullscreen && <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setFullscreen(false)} />}
      <div
        className={cn(
          "bg-pz-surface rounded-xl border border-pz-outline-variant shadow-sm overflow-hidden",
          fullscreen && "fixed inset-4 z-50 flex flex-col shadow-2xl",
        )}
      >
      <div className="flex items-center gap-1 p-2 border-b border-pz-outline-variant bg-pz-surface-container-low">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={cn(TOOLBAR_BUTTON, editor.isActive("bold") && TOOLBAR_BUTTON_ACTIVE)}
        >
          <Bold className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={cn(TOOLBAR_BUTTON, editor.isActive("italic") && TOOLBAR_BUTTON_ACTIVE)}
        >
          <Italic className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={cn(TOOLBAR_BUTTON, editor.isActive("underline") && TOOLBAR_BUTTON_ACTIVE)}
        >
          <UnderlineIcon className="w-4 h-4" />
        </button>
        <div className="w-px h-6 bg-pz-outline-variant mx-1" />
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={cn(TOOLBAR_BUTTON, editor.isActive("bulletList") && TOOLBAR_BUTTON_ACTIVE)}
        >
          <List className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={cn(TOOLBAR_BUTTON, editor.isActive("orderedList") && TOOLBAR_BUTTON_ACTIVE)}
        >
          <ListOrdered className="w-4 h-4" />
        </button>
        <div className="w-px h-6 bg-pz-outline-variant mx-1" />
        <button
          type="button"
          onClick={() => {
            const url = window.prompt("Link URL");
            if (url) editor.chain().focus().setLink({ href: url }).run();
          }}
          className={cn(TOOLBAR_BUTTON, editor.isActive("link") && TOOLBAR_BUTTON_ACTIVE)}
        >
          <LinkIcon className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => {
            const url = window.prompt("Image URL");
            if (url) editor.chain().focus().setImage({ src: url }).run();
          }}
          className={TOOLBAR_BUTTON}
        >
          <ImageIcon className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => setFullscreen((v) => !v)}
          title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
          className={cn(TOOLBAR_BUTTON, "ml-auto")}
        >
          {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>
        <EditorContent editor={editor} className={cn(fullscreen && "flex-1 overflow-y-auto")} />
      </div>
    </>
  );
}
