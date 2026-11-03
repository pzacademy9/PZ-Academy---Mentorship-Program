// src/components/landing/sections/DemoVideo.tsx
import { youtubeId } from "@/lib/landing/simple-text";
import { pauseSeconds } from "@/lib/landing/demo-watch";
import { startSeconds } from "@/lib/landing/video-start";
import { DemoPlayer } from "./DemoPlayer";
import { SectionHeader, str } from "./util";
import type { SectionProps } from "./types";

export function DemoVideo({ data, register }: SectionProps) {
  const id = youtubeId(str(data, "url"));
  if (!id) return null;
  const heading = str(data, "heading");
  return (
    <div className="border-b border-landing-border bg-landing-surface px-4 py-10 md:px-6 md:py-20">
      <div className="mx-auto max-w-7xl">
        <SectionHeader heading={heading} sub={str(data, "subheading")} />
        <div className="mx-auto max-w-4xl">
          <DemoPlayer
            id={id}
            title={heading || "Demo session"}
            seconds={pauseSeconds(str(data, "pauseEvery"))}
            start={startSeconds(str(data, "startAt"))}
            popupTitle={str(data, "popupTitle")}
            popupText={str(data, "popupText")}
            register={register}
          />
        </div>
      </div>
    </div>
  );
}
