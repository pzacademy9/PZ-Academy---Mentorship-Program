// The share picture for a batch podium, drawn by next/og (satori): inline styles only, every
// multi-child box is display:flex. It receives names, ranks and scores only: never email or phone.
import { podiumImageEntry, podiumImageTitle, type PodiumSize } from "@/lib/progress/leaderboard";

const DEEP = "#0F3D22";
const DEEPER = "#071F11";
const BRIGHT = "#7ED957";
const GOLD = "#E8B84B";
const SILVER = "#C9D1CC";
const BRONZE = "#D49A6A";

export type PodiumImageEntry = { name: string; rank: number; score: number };
type Drawn = ReturnType<typeof podiumImageEntry>;

const ordinal = (n: number) => (n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`);
const points = (n: number) => `${n.toLocaleString("en-US")} pts`;
const medalColour = (rank: number) => (rank === 1 ? GOLD : rank === 2 ? SILVER : BRONZE);

function Crown({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "block" }}>
      <path d="M2 19 L3.5 7 L8.5 11.5 L12 4 L15.5 11.5 L20.5 7 L22 19 Z" fill={GOLD} />
    </svg>
  );
}

function Medal({ size, colour }: { size: number; colour: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "block" }}>
      <path d="M7 2 L11 10 L9 11 L5 3 Z M17 2 L13 10 L15 11 L19 3 Z" fill={BRIGHT} />
      <circle cx="12" cy="15.5" r="6.5" fill={colour} />
    </svg>
  );
}

function Place({ entry, story }: { entry: Drawn; story: boolean }) {
  const first = entry.rank === 1;
  const avatar = story ? (first ? 230 : 180) : first ? 170 : 132;
  const pedestal = story ? (first ? 380 : entry.rank === 2 ? 290 : 220) : first ? 230 : entry.rank === 2 ? 170 : 120;
  const colour = medalColour(entry.rank);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: story ? 320 : 300 }}>
      {first ? <Crown size={story ? 96 : 72} /> : <Medal size={story ? 76 : 58} colour={colour} />}
      <div
        style={{
          marginTop: 10,
          width: avatar,
          height: avatar,
          borderRadius: avatar,
          background: first ? GOLD : "rgba(255,255,255,0.14)",
          border: `6px solid ${colour}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: first ? DEEPER : "#ffffff",
          fontSize: avatar * 0.36,
          fontWeight: 800,
        }}
      >
        {entry.initials}
      </div>
      <div
        style={{
          marginTop: -18,
          padding: "4px 18px",
          borderRadius: 40,
          background: colour,
          color: DEEPER,
          fontSize: story ? 30 : 24,
          fontWeight: 800,
          display: "flex",
        }}
      >
        {`#${entry.rank}`}
      </div>
      <div
        style={{
          marginTop: 16,
          maxWidth: story ? 310 : 290,
          maxHeight: story ? 96 : 76,
          overflow: "hidden",
          wordBreak: "break-word",
          color: "#ffffff",
          fontSize: story ? 40 : 32,
          fontWeight: 700,
          textAlign: "center",
          lineHeight: 1.15,
          display: "flex",
          justifyContent: "center",
        }}
      >
        {entry.name}
      </div>
      <div style={{ marginTop: 8, color: BRIGHT, fontSize: story ? 38 : 30, fontWeight: 800, display: "flex" }}>{points(entry.score)}</div>
      <div
        style={{
          marginTop: 20,
          width: "100%",
          height: pedestal,
          borderRadius: "24px 24px 0 0",
          background: first ? BRIGHT : "rgba(255,255,255,0.12)",
          color: first ? DEEPER : "rgba(255,255,255,0.8)",
          fontSize: story ? 52 : 40,
          fontWeight: 800,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          paddingTop: 24,
        }}
      >
        {ordinal(entry.rank)}
      </div>
    </div>
  );
}

export function PodiumImage({ title, label, entries, size }: { title: string; label: string; entries: PodiumImageEntry[]; size: PodiumSize }) {
  const story = size === "story";
  // Visual order: second place left, first in the middle, third right.
  // Names are cut or replaced first (see podiumImageEntry), so nothing outside the font reaches the renderer.
  const drawn = entries.slice(0, 3).map(podiumImageEntry);
  const slots = [drawn[1], drawn[0], drawn[2]].filter((e): e is Drawn => e !== undefined);
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        fontFamily: "sans-serif",
        background: `linear-gradient(160deg, ${DEEP} 0%, ${DEEPER} 100%)`,
        padding: story ? "120px 60px 120px" : "64px 60px 72px",
        position: "relative",
      }}
    >
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 12, background: BRIGHT, display: "flex" }} />
      <div style={{ display: "flex" }}>
        <span
          style={{
            color: BRIGHT,
            fontSize: story ? 30 : 24,
            fontWeight: 700,
            letterSpacing: "0.1em",
            padding: "10px 24px",
            borderRadius: 100,
            border: "2px solid rgba(126,217,87,0.45)",
          }}
        >
          PZ ACADEMY · LEADERBOARD
        </span>
      </div>
      <div
        style={{
          marginTop: story ? 56 : 36,
          color: "#ffffff",
          fontSize: story ? 76 : 56,
          fontWeight: 800,
          lineHeight: 1.1,
          maxHeight: story ? 260 : 130,
          overflow: "hidden",
          wordBreak: "break-word",
          display: "flex",
        }}
      >
        {podiumImageTitle(title, size)}
      </div>
      <div style={{ marginTop: 16, color: BRIGHT, fontSize: story ? 44 : 34, fontWeight: 700, display: "flex" }}>{label}</div>
      <div style={{ flex: 1, display: "flex", alignItems: "flex-end", justifyContent: "center", gap: story ? 20 : 24 }}>
        {slots.map((e, i) => (
          <Place key={i} entry={e} story={story} />
        ))}
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: story ? 120 : 72,
          background: DEEPER,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "rgba(255,255,255,0.75)",
          fontSize: story ? 32 : 26,
          fontWeight: 700,
          letterSpacing: "0.06em",
        }}
      >
        PZ Academy
      </div>
    </div>
  );
}
