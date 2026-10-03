"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Triangle, Diamond, Circle, Square, X, Loader2, Flame } from "lucide-react";
import { submitQuizAttempt, checkQuizAnswer } from "@/app/portal/actions";
import type { QuizQuestion } from "@/lib/data/lms";
import { cn } from "@/lib/utils";

const QUESTION_TIME_MS = 20000;
const CIRCUMFERENCE = 2 * Math.PI * 20;
const REVEAL_DELAY_MS = 1200;

const TILE_STYLES = [
  { icon: Triangle, bg: "bg-red-500", hover: "hover:bg-red-600" },
  { icon: Diamond, bg: "bg-blue-500", hover: "hover:bg-blue-600" },
  { icon: Circle, bg: "bg-amber-400", hover: "hover:bg-amber-500" },
  { icon: Square, bg: "bg-emerald-500", hover: "hover:bg-emerald-600" },
] as const;

/* ── WebAudio SFX — ported from the legacy portal, zero audio assets ── */
function useSfx() {
  const ctxRef = useRef<AudioContext | null>(null);

  const getCtx = useCallback(() => {
    if (!ctxRef.current) {
      try {
        const Ctor =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        ctxRef.current = new Ctor();
      } catch {
        /* audio unsupported — SFX becomes a silent no-op */
      }
    }
    return ctxRef.current;
  }, []);

  const tone = useCallback(
    (freq: number, type: OscillatorType, dur: number, vol = 0.14, startOff = 0) => {
      const ctx = getCtx();
      if (!ctx) return;
      try {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g);
        g.connect(ctx.destination);
        o.type = type;
        o.frequency.value = freq;
        const t = ctx.currentTime + startOff;
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        o.start(t);
        o.stop(t + dur + 0.01);
      } catch {
        /* ignore */
      }
    },
    [getCtx],
  );

  return {
    prime: getCtx,
    select: () => tone(660, "sine", 0.07, 0.08),
    correct: () => {
      tone(528, "sine", 0.09, 0.12);
      tone(880, "sine", 0.18, 0.14, 0.09);
    },
    wrong: () => {
      tone(180, "sawtooth", 0.28, 0.1);
      tone(120, "sawtooth", 0.2, 0.06, 0.12);
    },
    tick: () => tone(900, "square", 0.04, 0.05),
    timeup: () => {
      tone(350, "sine", 0.12, 0.1);
      tone(220, "sine", 0.22, 0.1, 0.12);
    },
    pass: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, "sine", 0.18, 0.12, i * 0.14)),
    fail: () => [400, 330, 280].forEach((f, i) => tone(f, "sine", 0.18, 0.1, i * 0.15)),
  };
}

/* ── Confetti — ported verbatim, PZ brand colors ── */
function launchConfetti(canvas: HTMLCanvasElement) {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const colors = ["#194B32", "#7ED957", "#C9960A", "#196432", "#C8F0A0"];
  const particles = Array.from({ length: 120 }, () => ({
    x: Math.random() * canvas.width,
    y: -20,
    vx: (Math.random() - 0.5) * 4,
    vy: Math.random() * 4 + 2,
    color: colors[Math.floor(Math.random() * colors.length)],
    w: Math.random() * 10 + 5,
    h: Math.random() * 6 + 3,
    r: Math.random() * Math.PI * 2,
    vr: (Math.random() - 0.5) * 0.2,
  }));
  let frame = 0;
  function draw() {
    ctx!.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.06;
      p.r += p.vr;
      ctx!.save();
      ctx!.translate(p.x, p.y);
      ctx!.rotate(p.r);
      ctx!.fillStyle = p.color;
      ctx!.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx!.restore();
    });
    if (++frame < 180) requestAnimationFrame(draw);
    else ctx!.clearRect(0, 0, canvas.width, canvas.height);
  }
  draw();
}

let fxId = 0;

interface QuizModalProps {
  courseSlug: string;
  lessonId: string;
  questions: QuizQuestion[];
  attemptsLeft: number;
  onClose: () => void;
  onPassed: () => void;
}

export function QuizModal({
  courseSlug,
  lessonId,
  questions,
  attemptsLeft,
  onClose,
  onPassed,
}: QuizModalProps) {
  const router = useRouter();
  const sfx = useSfx();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timerFillRef = useRef<SVGCircleElement>(null);
  const timerNumRef = useRef<HTMLSpanElement>(null);
  const rafRef = useRef<number | null>(null);
  const answersRef = useRef<number[]>([]);
  // Synchronous double-tap guard: `answered` state only updates after a render,
  // so two taps (or a tap racing the timer) in the same tick would both pass.
  const answeringRef = useRef(false);

  const [qi, setQi] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [correctIdx, setCorrectIdx] = useState<number | null>(null);
  const [phase, setPhase] = useState<"question" | "submitting" | "results" | "blocked">(
    attemptsLeft <= 0 ? "blocked" : "question",
  );
  const [popups, setPopups] = useState<{ id: number; x: number; y: number; text: string; ok: boolean }[]>([]);
  const [rings, setRings] = useState<{ id: number; x: number; y: number }[]>([]);
  const [flashKind, setFlashKind] = useState<"correct" | "wrong" | null>(null);
  const [result, setResult] = useState<{
    score: number;
    total: number;
    passed: boolean;
    attemptsLeft: number;
  } | null>(null);

  const question = questions[qi];
  const total = questions.length;

  const spawnFx = useCallback((x: number, y: number, ok: boolean) => {
    const id = ++fxId;
    setPopups((p) => [...p, { id, x, y, text: ok ? "+1" : "✗", ok }]);
    setRings((r) => [...r, { id, x, y }]);
    setTimeout(() => {
      setPopups((p) => p.filter((f) => f.id !== id));
      setRings((r) => r.filter((f) => f.id !== id));
    }, 950);
  }, []);

  const finishQuiz = useCallback(
    async (finalAnswers: number[]) => {
      setPhase("submitting");
      const res = await submitQuizAttempt(courseSlug, lessonId, finalAnswers);
      if (!res.ok) {
        toast.error(res.error ?? "Could not submit quiz — try again.");
        setPhase("blocked");
        return;
      }
      const passed = !!res.passed;
      setResult({
        score: res.score ?? 0,
        total: res.total ?? total,
        passed,
        attemptsLeft: res.attemptsLeft ?? 0,
      });
      setPhase("results");
      if (passed) {
        sfx.pass();
        if (canvasRef.current) launchConfetti(canvasRef.current);
        toast.success("Quiz passed — next lesson unlocked! 🎉");
        router.refresh();
        onPassed();
      } else {
        sfx.fail();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [courseSlug, lessonId, total],
  );

  const revealAnswer = useCallback(
    async (idx: number, clientX?: number, clientY?: number) => {
      if (answered || answeringRef.current) return;
      answeringRef.current = true;
      setAnswered(true);
      setSelected(idx);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (idx >= 0) sfx.select();

      const correct = await checkQuizAnswer(question.id);
      setCorrectIdx(correct);
      const isRight = correct !== null && idx === correct;

      answersRef.current[qi] = idx;

      const x = clientX ?? window.innerWidth / 2;
      const y = clientY ?? window.innerHeight / 3;

      if (isRight) {
        setScore((s) => s + 1);
        setStreak((s) => s + 1);
        sfx.correct();
        setFlashKind("correct");
        spawnFx(x, y, true);
      } else {
        setStreak(0);
        sfx.wrong();
        setFlashKind("wrong");
        spawnFx(x, y, false);
      }
      setTimeout(() => setFlashKind(null), 400);

      setTimeout(() => {
        if (qi + 1 < total) {
          setQi((n) => n + 1);
          answeringRef.current = false;
          setAnswered(false);
          setSelected(null);
          setCorrectIdx(null);
        } else {
          finishQuiz(answersRef.current);
        }
      }, REVEAL_DELAY_MS);
    },
    [answered, question, qi, total, sfx, spawnFx, finishQuiz],
  );

  const startTimer = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const start = performance.now();
    let lastSec = 20;
    const tick = (now: number) => {
      const elapsed = now - start;
      const remaining = Math.max(0, QUESTION_TIME_MS - elapsed);
      const frac = remaining / QUESTION_TIME_MS;
      if (timerFillRef.current) {
        timerFillRef.current.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - frac));
        timerFillRef.current.style.stroke = `hsl(${Math.round(frac * 120)}, 80%, 55%)`;
      }
      const secLeft = Math.ceil(remaining / 1000);
      if (secLeft !== lastSec) {
        if (timerNumRef.current) timerNumRef.current.textContent = String(secLeft);
        lastSec = secLeft;
        if (secLeft <= 5 && secLeft > 0) sfx.tick();
      }
      if (remaining <= 0) {
        sfx.timeup();
        revealAnswer(-1);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qi]);

  useEffect(() => {
    sfx.prime();
    if (phase === "question") startTimer();
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qi, phase]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const stars = result ? (result.score / result.total >= 0.8 ? "★★★" : result.score / result.total >= 0.6 ? "★★☆" : "★☆☆") : "";

  return (
    <div className="fixed inset-0 z-[80] bg-pz-solid-forest/95 dark:bg-pz-surface-container-lowest/95 backdrop-blur-sm flex flex-col">
      <canvas ref={canvasRef} className="fixed inset-0 z-[95] pointer-events-none" />

      {flashKind && (
        <div
          className={cn(
            "pointer-events-none fixed inset-0 z-[90]",
            flashKind === "correct" ? "bg-emerald-500/25" : "bg-red-500/25",
          )}
          style={{ animation: "fadeOut 0.5s ease-out forwards" }}
        />
      )}

      {popups.map((p) => (
        <div
          key={p.id}
          className={cn(
            "pointer-events-none fixed z-[92] text-3xl font-black",
            p.ok ? "text-emerald-300" : "text-red-300",
          )}
          style={{ left: p.x, top: p.y, animation: "popupDrift 0.95s ease-out forwards" }}
        >
          {p.text}
        </div>
      ))}
      {rings.map((r) => (
        <div
          key={r.id}
          className="pointer-events-none fixed z-[91] w-10 h-10 rounded-full border-2 border-white/70"
          style={{ left: r.x, top: r.y, animation: "ringBurst 0.7s ease-out forwards" }}
        />
      ))}

      <button
        onClick={onClose}
        aria-label="Close quiz"
        className="absolute top-4 right-4 z-[96] w-10 h-10 max-md:size-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
      >
        <X className="w-5 h-5" />
      </button>

      {phase === "blocked" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="font-montserrat font-bold text-white text-xl">No attempts remaining</p>
          <p className="text-white/70 text-sm max-w-sm">
            You&apos;ve used all 3 quiz attempts for this lesson. Contact support if you need another try.
          </p>
        </div>
      )}

      {phase !== "blocked" && phase !== "results" && question && (
        <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-10">
          <div className="flex items-center justify-between text-white mb-6">
            <span className="font-montserrat font-bold text-sm">
              Q <span className="text-pz-lime">{qi + 1}</span> of {total}
            </span>
            <div className="flex items-center gap-3">
              {streak >= 3 && (
                <span className="flex items-center gap-1 text-amber-300 font-bold text-sm">
                  <Flame className="w-4 h-4" /> {streak} streak
                </span>
              )}
              <span className="font-montserrat font-bold text-sm tabular-nums">Score: {score}</span>
            </div>
          </div>

          <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden mb-8">
            <div
              className="h-full bg-pz-lime transition-[width] duration-300"
              style={{ width: `${(qi / total) * 100}%` }}
            />
          </div>

          <div className="flex-1 flex flex-col items-center justify-center gap-8">
            <div className="relative w-14 h-14 shrink-0">
              <svg className="w-14 h-14 -rotate-90" viewBox="0 0 44 44">
                <circle cx="22" cy="22" r="20" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="3" />
                <circle
                  ref={timerFillRef}
                  cx="22"
                  cy="22"
                  r="20"
                  fill="none"
                  stroke="hsl(120,80%,55%)"
                  strokeWidth="3"
                  strokeDasharray={CIRCUMFERENCE}
                  strokeDashoffset={0}
                  strokeLinecap="round"
                />
              </svg>
              <span
                ref={timerNumRef}
                className="absolute inset-0 flex items-center justify-center text-white font-bold text-sm tabular-nums"
              >
                20
              </span>
            </div>

            <h2 className="font-montserrat font-bold text-white text-xl sm:text-2xl text-center leading-snug px-2">
              {question.question}
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
              {question.options.map((opt, i) => {
                const style = TILE_STYLES[i % TILE_STYLES.length];
                const Icon = style.icon;
                const isSelected = selected === i;
                const isCorrectTile = answered && correctIdx === i;
                const isWrongSelected = answered && isSelected && correctIdx !== i;
                const dim = answered && !isCorrectTile && !isWrongSelected;

                return (
                  <button
                    key={i}
                    disabled={answered}
                    onClick={(e) => revealAnswer(i, e.clientX, e.clientY)}
                    className={cn(
                      "flex items-center gap-3 px-5 py-4 rounded-xl text-white font-semibold text-left transition-all duration-200",
                      style.bg,
                      !answered && style.hover,
                      isCorrectTile && "ring-4 ring-white scale-[1.03]",
                      isWrongSelected && "ring-4 ring-white/60",
                      dim && "opacity-25 grayscale",
                    )}
                  >
                    <Icon className="w-5 h-5 shrink-0 fill-current" />
                    <span>{opt}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {phase === "submitting" && (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-white animate-spin" />
        </div>
      )}

      {phase === "results" && result && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <span className="text-5xl">{result.passed ? "🎉" : "😔"}</span>
          <h2 className="font-montserrat font-bold text-white text-2xl">
            {result.passed ? "Quiz Passed!" : "Not Passed"}
          </h2>
          <p className="text-4xl font-black text-white tabular-nums">
            {result.score}
            <span className="text-lg text-white/60">/{result.total}</span>
          </p>
          <p className="text-amber-300 text-2xl tracking-widest">{stars}</p>
          <p className="text-white/70 text-sm max-w-sm">
            {result.passed
              ? "Great work — the next lesson is now unlocked."
              : result.attemptsLeft > 0
                ? `You need 50% to pass. ${result.attemptsLeft} attempt${result.attemptsLeft === 1 ? "" : "s"} remaining.`
                : "No attempts remaining. Contact support if you need another try."}
          </p>
          <div className="flex items-center gap-3 mt-2">
            {!result.passed && result.attemptsLeft > 0 && (
              <button
                onClick={() => {
                  setQi(0);
                  setScore(0);
                  setStreak(0);
                  answeringRef.current = false;
                  setAnswered(false);
                  setSelected(null);
                  setCorrectIdx(null);
                  answersRef.current = [];
                  setResult(null);
                  setPhase("question");
                }}
                className="px-5 py-2.5 max-md:min-h-11 rounded-lg border border-white/30 text-white font-semibold text-sm hover:bg-white/10 transition-colors"
              >
                Try Again
              </button>
            )}
            <button
              onClick={onClose}
              className="px-5 py-2.5 max-md:min-h-11 rounded-lg bg-pz-lime text-pz-forest dark:text-pz-solid-forest font-bold text-sm shadow-md hover:opacity-90 transition-all"
            >
              {result.passed ? "Continue →" : "Close"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
