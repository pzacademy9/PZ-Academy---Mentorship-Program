import { FileDown } from "lucide-react";
import type { LessonView } from "@/lib/data/lms";
import { sanitizeLessonHtml } from "@/lib/sanitize-html";
import { toEmbedUrl } from "@/lib/video-embed";

const TEXT_CARD =
  "bg-pz-surface-container-lowest rounded-2xl shadow-xl border border-pz-border dark:border-pz-outline-variant p-8 text-pz-ink dark:text-pz-on-surface leading-relaxed " +
  "[&_p]:mb-3 [&_h2]:font-montserrat [&_h2]:font-bold [&_h2]:text-pz-forest dark:[&_h2]:text-pz-lime [&_h2]:text-lg [&_h2]:mt-4 [&_h2]:mb-2 " +
  "[&_h3]:font-semibold [&_h3]:text-pz-forest dark:[&_h3]:text-pz-lime [&_h3]:mt-3 [&_h3]:mb-1.5 " +
  "[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-3 [&_li]:mb-1 " +
  "[&_a]:text-pz-forest dark:[&_a]:text-pz-lime [&_a]:underline [&_strong]:text-pz-forest dark:[&_strong]:text-pz-lime [&_strong]:font-semibold";

function VideoBlock({ url, title, label }: { url: string; title: string; label?: string }) {
  return (
    <div>
      {label && (
        <h2 className="font-montserrat font-semibold text-sm text-pz-forest dark:text-pz-on-surface mb-2">
          {label}
        </h2>
      )}
      <div className="aspect-video w-full rounded-2xl overflow-hidden bg-black shadow-xl border border-pz-border dark:border-pz-outline-variant">
        <iframe
          src={toEmbedUrl(url)}
          title={label ? `${title} - ${label}` : title}
          className="w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    </div>
  );
}

/** Renders every part a session has, in order: video 1, video 2, PDF, written text. */
export function LessonContent({ lesson }: { lesson: LessonView }) {
  const video1 = lesson.videoUrl;
  const video2 = lesson.videoUrl2;
  const twoVideos = !!video1 && !!video2;
  const hasPdf = !!lesson.pdfFileId;
  // Legacy rows published before migration 0020 still hold a public pdf_url and no pdf_file_id.
  const legacyPdfUrl = !hasPdf ? lesson.pdfUrl : null;
  const hasText = !!lesson.textContent && lesson.textContent.trim().length > 0;

  if (!video1 && !video2 && !hasPdf && !legacyPdfUrl && !hasText) {
    return <div className={TEXT_CARD} dangerouslySetInnerHTML={{ __html: "<p>No content.</p>" }} />;
  }

  return (
    <div className="space-y-6">
      {video1 && <VideoBlock url={video1} title={lesson.title} label={twoVideos ? "Part 1" : undefined} />}
      {video2 && <VideoBlock url={video2} title={lesson.title} label={twoVideos ? "Part 2" : undefined} />}

      {hasPdf && (
        <div className="bg-pz-surface-container-lowest rounded-2xl shadow-xl border border-pz-border dark:border-pz-outline-variant overflow-hidden">
          <iframe
            src={`/api/lessons/${lesson.id}/pdf#toolbar=0&navpanes=0`}
            title={lesson.title}
            className="w-full aspect-[3/4] sm:aspect-video"
          />
        </div>
      )}

      {legacyPdfUrl && (
        <div className="bg-pz-surface-container-lowest rounded-2xl shadow-xl border border-pz-border dark:border-pz-outline-variant p-8 flex flex-col items-center text-center gap-4">
          <FileDown className="w-10 h-10 text-pz-forest dark:text-pz-lime" />
          <div>
            <p className="font-montserrat font-semibold text-pz-forest dark:text-pz-on-surface">{lesson.title}</p>
            <p className="text-sm text-pz-muted dark:text-pz-on-surface-variant mt-1">This lesson is a downloadable PDF resource.</p>
          </div>
          <a
            href={legacyPdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-pz-solid-forest text-white text-sm font-semibold px-5 py-2.5 hover:bg-pz-solid-mid transition-colors shadow-md"
          >
            <FileDown className="w-4 h-4" /> Open PDF
          </a>
        </div>
      )}

      {hasText && (
        <div className={TEXT_CARD} dangerouslySetInnerHTML={{ __html: sanitizeLessonHtml(lesson.textContent!) }} />
      )}
    </div>
  );
}
