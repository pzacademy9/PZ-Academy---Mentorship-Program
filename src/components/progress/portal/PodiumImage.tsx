// The share picture for a batch podium, drawn by next/og (satori): inline styles only, every
// multi-child box is display:flex. It receives names, ranks and scores only: never email or phone.
import { podiumImageEntry, podiumImageTitle, type PodiumSize } from "@/lib/progress/leaderboard";

const DEEP = "#0F3D22";
const DEEPER = "#061A0E";
const BRIGHT = "#7ED957";
const GOLD = "#F6BE3B";

export type PodiumImageEntry = { name: string; rank: number; score: number };
type Drawn = ReturnType<typeof podiumImageEntry>;

/** Metal for each place: light top face, body gradient, ring and the dark text drawn on it. */
const METAL = {
  1: { top: "#FFF1B8", body: "linear-gradient(180deg, #FFE08A 0%, #F6BE3B 45%, #B8860B 100%)", ring: "linear-gradient(135deg, #FFF1B8 0%, #F6BE3B 50%, #A87400 100%)", ink: "#4A3200" },
  2: { top: "#FFFFFF", body: "linear-gradient(180deg, #F4F7F5 0%, #C9D1CC 50%, #87938C 100%)", ring: "linear-gradient(135deg, #FFFFFF 0%, #C9D1CC 50%, #7D8983 100%)", ink: "#2B3530" },
  3: { top: "#FBD9BC", body: "linear-gradient(180deg, #F3C49B 0%, #D49A6A 50%, #8F5426 100%)", ring: "linear-gradient(135deg, #FBD9BC 0%, #D49A6A 50%, #84491C 100%)", ink: "#3D2210" },
} as const;
const metal = (rank: number) => METAL[(rank === 1 ? 1 : rank === 2 ? 2 : 3) as 1 | 2 | 3];

const fmt = (n: number) => n.toLocaleString("en-US");

function Crown({ size }: { size: number }) {
  return (
    <svg width={size} height={size * 0.8} viewBox="0 0 120 96" style={{ display: "block" }}>
      <defs>
        <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFF1B8" />
          <stop offset="0.5" stopColor="#F6BE3B" />
          <stop offset="1" stopColor="#B8860B" />
        </linearGradient>
      </defs>
      <path d="M10 78 L4 22 L34 46 L60 8 L86 46 L116 22 L110 78 Z" fill="url(#cg)" stroke="#8A6200" strokeWidth="3" strokeLinejoin="round" />
      <rect x="10" y="74" width="100" height="16" rx="5" fill="url(#cg)" stroke="#8A6200" strokeWidth="3" />
      <circle cx="4" cy="20" r="7" fill="#FFE08A" stroke="#8A6200" strokeWidth="2.5" />
      <circle cx="60" cy="7" r="7" fill="#FFE08A" stroke="#8A6200" strokeWidth="2.5" />
      <circle cx="116" cy="20" r="7" fill="#FFE08A" stroke="#8A6200" strokeWidth="2.5" />
      <circle cx="60" cy="58" r="8" fill={BRIGHT} stroke="#1D5D00" strokeWidth="2.5" />
      <circle cx="33" cy="64" r="5" fill="#E05656" stroke="#7A1F1F" strokeWidth="2" />
      <circle cx="87" cy="64" r="5" fill="#E05656" stroke="#7A1F1F" strokeWidth="2" />
    </svg>
  );
}

function Medal({ size, rank }: { size: number; rank: number }) {
  const c = rank === 2 ? ["#FFFFFF", "#C9D1CC", "#7D8983"] : ["#FBD9BC", "#D49A6A", "#84491C"];
  return (
    <svg width={size} height={size * 1.25} viewBox="0 0 80 100" style={{ display: "block" }}>
      <defs>
        <linearGradient id={`m${rank}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={c[0]} />
          <stop offset="0.5" stopColor={c[1]} />
          <stop offset="1" stopColor={c[2]} />
        </linearGradient>
      </defs>
      <path d="M18 0 L36 40 L26 46 L6 6 Z" fill="#2E7D52" />
      <path d="M62 0 L44 40 L54 46 L74 6 Z" fill={BRIGHT} />
      <circle cx="40" cy="66" r="30" fill={`url(#m${rank})`} stroke={c[2]} strokeWidth="3" />
      <circle cx="40" cy="66" r="21" fill="none" stroke={c[0]} strokeOpacity="0.8" strokeWidth="3" />
      <path d="M40 52 L44 61 L54 62 L46.5 68.5 L49 78 L40 73 L31 78 L33.5 68.5 L26 62 L36 61 Z" fill={c[0]} fillOpacity="0.9" />
    </svg>
  );
}

function Place({ entry, story, unit }: { entry: Drawn; story: boolean; unit: string }) {
  const first = entry.rank === 1;
  const m = metal(entry.rank);
  const avatar = story ? (first ? 220 : 170) : first ? 148 : 114;
  const ring = story ? 10 : 8;
  const pedestal = story ? (first ? 420 : entry.rank === 2 ? 310 : 230) : first ? 220 : entry.rank === 2 ? 160 : 112;
  const width = story ? 316 : 300;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width }}>
      {first ? <Crown size={story ? 130 : 96} /> : <Medal size={story ? 70 : 52} rank={entry.rank} />}
      <div
        style={{
          marginTop: story ? 14 : 8,
          width: avatar,
          height: avatar,
          borderRadius: avatar,
          backgroundImage: m.ring,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: first ? "0 0 60px rgba(246,190,59,0.55)" : "0 12px 30px rgba(0,0,0,0.35)",
        }}
      >
        <div
          style={{
            width: avatar - ring * 2,
            height: avatar - ring * 2,
            borderRadius: avatar,
            backgroundImage: first ? "linear-gradient(160deg, #1E6B3A 0%, #0F3D22 100%)" : "linear-gradient(160deg, #18502D 0%, #0B2E18 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#FFFFFF",
            fontSize: avatar * 0.34,
            fontWeight: 800,
            letterSpacing: "0.02em",
          }}
        >
          {entry.initials}
        </div>
      </div>
      <div
        style={{
          marginTop: -20,
          padding: story ? "6px 22px" : "4px 18px",
          borderRadius: 40,
          backgroundImage: m.ring,
          color: m.ink,
          fontSize: story ? 32 : 24,
          fontWeight: 800,
          display: "flex",
          boxShadow: "0 6px 14px rgba(0,0,0,0.3)",
        }}
      >
        {`#${entry.rank}`}
      </div>
      <div
        style={{
          marginTop: story ? 20 : 14,
          maxWidth: width - 10,
          maxHeight: story ? 100 : 74,
          overflow: "hidden",
          color: "#FFFFFF",
          fontSize: story ? 42 : 31,
          fontWeight: 800,
          textAlign: "center",
          lineHeight: 1.18,
          display: "flex",
          justifyContent: "center",
        }}
      >
        {entry.name}
      </div>
      <div style={{ marginTop: story ? 10 : 6, display: "flex", alignItems: "baseline" }}>
        <span style={{ color: first ? GOLD : BRIGHT, fontSize: story ? (first ? 64 : 52) : first ? 48 : 40, fontWeight: 800, letterSpacing: "-0.02em" }}>{fmt(entry.score)}</span>
        <span style={{ marginLeft: 8, color: "rgba(255,255,255,0.7)", fontSize: story ? 28 : 22, fontWeight: 600 }}>{unit}</span>
      </div>
      <div style={{ marginTop: story ? 26 : 18, width: "100%", display: "flex", flexDirection: "column" }}>
        <div style={{ height: story ? 22 : 16, backgroundColor: m.top, borderRadius: "18px 18px 0 0", display: "flex", opacity: 0.95 }} />
        <div
          style={{
            height: pedestal,
            backgroundImage: m.body,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            paddingTop: story ? 30 : 16,
            color: m.ink,
            fontSize: story ? (first ? 150 : 120) : first ? 110 : 84,
            fontWeight: 800,
            lineHeight: 1,
            // Never "boxShadow: none": satori draws that as a black box at the top left.
            ...(first ? { boxShadow: "0 0 80px rgba(246,190,59,0.35)" } : {}),
          }}
        >
          {String(entry.rank)}
        </div>
      </div>
    </div>
  );
}

function Spark({ x, y, s, o }: { x: number; y: number; s: number; o: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" style={{ position: "absolute", left: x, top: y, opacity: o }}>
      <path d="M12 0 L14.5 9.5 L24 12 L14.5 14.5 L12 24 L9.5 14.5 L0 12 L9.5 9.5 Z" fill={GOLD} />
    </svg>
  );
}

export function PodiumImage({
  title,
  label,
  entries,
  size,
  logo = null,
  unit = "pts",
  heading,
  fallbackLabel = "Student",
}: {
  title: string;
  label: string;
  entries: PodiumImageEntry[];
  size: PodiumSize;
  /** PZ Academy logo as a data URL; without it a lettered mark is drawn. */
  logo?: string | null;
  /** Word drawn after each score. Default "pts" (the student board). */
  unit?: string;
  /** Replaces the "<label> · Top n" pill. */
  heading?: string;
  /** Replaces "Student" in "Student #rank" for names the font cannot draw. */
  fallbackLabel?: string;
}) {
  const story = size === "story";
  // Visual order: second place left, first in the middle, third right.
  // Names are cut or replaced first (see podiumImageEntry), so nothing outside the font reaches the renderer.
  const drawn = entries.slice(0, 3).map((e) => podiumImageEntry(e, fallbackLabel));
  const slots = [drawn[1], drawn[0], drawn[2]].filter((e): e is Drawn => e !== undefined);
  const pad = story ? 72 : 56;
  const logoSize = story ? 104 : 76;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        fontFamily: "Montserrat, sans-serif",
        backgroundColor: DEEPER,
        backgroundImage: `radial-gradient(circle at 50% ${story ? "58%" : "64%"}, #2A7A45 0%, ${DEEP} 38%, ${DEEPER} 80%)`,
        position: "relative",
      }}
    >
      {/* Glow behind first place. */}
      <div
        style={{
          position: "absolute",
          left: story ? 140 : 190,
          top: story ? 640 : 330,
          width: story ? 800 : 700,
          height: story ? 800 : 700,
          borderRadius: 800,
          backgroundImage: "radial-gradient(circle, rgba(246,190,59,0.45) 0%, rgba(126,217,87,0.16) 38%, rgba(15,61,34,0) 68%)",
          display: "flex",
        }}
      />
      <Spark x={story ? 120 : 110} y={story ? 760 : 380} s={story ? 40 : 30} o={0.8} />
      <Spark x={story ? 900 : 930} y={story ? 700 : 350} s={story ? 30 : 24} o={0.6} />
      <Spark x={story ? 210 : 230} y={story ? 1000 : 520} s={story ? 22 : 16} o={0.5} />
      <Spark x={story ? 840 : 860} y={story ? 960 : 500} s={story ? 26 : 18} o={0.55} />
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 10, backgroundImage: `linear-gradient(90deg, ${BRIGHT} 0%, ${GOLD} 100%)`, display: "flex" }} />

      {/* Logo strip. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: `${story ? 90 : 44}px ${pad}px 0` }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- next/og draws plain img tags
            <img src={logo} width={logoSize} height={logoSize} alt="" style={{ width: logoSize, height: logoSize }} />
          ) : (
            <div
              style={{
                width: logoSize,
                height: logoSize,
                borderRadius: logoSize,
                backgroundColor: BRIGHT,
                color: DEEPER,
                fontSize: logoSize * 0.38,
                fontWeight: 800,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              PZ
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", marginLeft: story ? 22 : 16 }}>
            <span style={{ color: "#FFFFFF", fontSize: story ? 40 : 30, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase" }}>PZ Academy</span>
            <span style={{ color: BRIGHT, fontSize: story ? 24 : 18, fontWeight: 600, letterSpacing: "0.02em" }}>by Pharmacozyme</span>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            padding: story ? "12px 26px" : "9px 20px",
            borderRadius: 100,
            border: `2px solid ${GOLD}`,
            color: GOLD,
            fontSize: story ? 26 : 19,
            fontWeight: 800,
            letterSpacing: "0.12em",
          }}
        >
          LEADERBOARD
        </div>
      </div>

      {/* Batch name and board. */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: `${story ? 90 : 34}px ${pad}px 0` }}>
        <div
          style={{
            color: "#FFFFFF",
            fontSize: story ? 74 : 58,
            fontWeight: 800,
            lineHeight: 1.08,
            letterSpacing: "-0.02em",
            textAlign: "center",
            maxHeight: story ? 245 : 128,
            overflow: "hidden",
            display: "flex",
            justifyContent: "center",
          }}
        >
          {podiumImageTitle(title, size)}
        </div>
        <div
          style={{
            marginTop: story ? 30 : 18,
            display: "flex",
            alignItems: "center",
            padding: story ? "12px 30px" : "8px 22px",
            borderRadius: 100,
            backgroundColor: BRIGHT,
            color: DEEPER,
            fontSize: story ? 34 : 24,
            fontWeight: 800,
          }}
        >
          {heading ?? `${label} · Top ${slots.length}`}
        </div>
      </div>

      {/* Podium. */}
      <div style={{ flex: 1, display: "flex", alignItems: "flex-end", justifyContent: "center", gap: story ? 22 : 24, padding: `0 ${story ? 40 : 48}px` }}>
        {slots.map((e, i) => (
          <Place key={i} entry={e} story={story} unit={unit} />
        ))}
      </div>

      {/* Footer strip. */}
      <div
        style={{
          height: story ? 130 : 78,
          backgroundColor: DEEPER,
          borderTop: `3px solid ${BRIGHT}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "rgba(255,255,255,0.8)",
          fontSize: story ? 30 : 22,
          fontWeight: 600,
          letterSpacing: "0.14em",
        }}
      >
        PZ ACADEMY · EDUCATING WITH INNOVATION
      </div>
    </div>
  );
}
