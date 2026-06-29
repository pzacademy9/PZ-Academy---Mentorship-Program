'use client';

import { useState, useEffect } from 'react';
import type { ShareView, ShareSession, SharePerQuestion, ShareResponse } from '@/lib/gas';

// ── Design tokens ─────────────────────────────────────────────────────────────
const DARK_BG      = '#0A2214';
const CARD_BG      = 'oklch(14% 0.04 145)';
const CARD_BORDER  = '1px solid oklch(22% 0.04 145)';
const GOLD         = '#C9A84C';
const GOLD_LIGHT   = '#F3E5AB';
const MUTED        = 'oklch(50% 0.04 145)';
const BRAND_GREEN  = '#0F3D22';
const BRAND_LIME   = '#7ED957';

// ── Helpers ───────────────────────────────────────────────────────────────────
function personAvg(stars: number[]): number | null {
  if (!stars.length) return null;
  return Math.round((stars.reduce((a, b) => a + b, 0) / stars.length) * 10) / 10;
}

type SortOrder = 'newest' | 'oldest' | 'highest' | 'lowest';

function filterAndSort(
  responses: ShareResponse[],
  filterRating: number | null,
  searchQuery: string,
  sortOrder: SortOrder,
): ShareResponse[] {
  let result = responses.filter(r => {
    if (filterRating !== null) {
      const avg = personAvg(r.stars);
      if (avg === null || Math.floor(avg) < filterRating) return false;
    }
    if (searchQuery && !r.comments.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });
  switch (sortOrder) {
    case 'oldest':  result = [...result].reverse(); break;
    case 'highest': result = [...result].sort((a, b) => (personAvg(b.stars) ?? 0) - (personAvg(a.stars) ?? 0)); break;
    case 'lowest':  result = [...result].sort((a, b) => (personAvg(a.stars) ?? 0) - (personAvg(b.stars) ?? 0)); break;
    // 'newest': GAS already returns newest-first
  }
  return result;
}

// ── Stars ─────────────────────────────────────────────────────────────────────
function Stars({ value, max = 5, size = 17 }: { value: number; max?: number; size?: number }) {
  return (
    <span aria-label={`${value} out of ${max} stars`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} style={{ color: GOLD, fontSize: size, opacity: i < Math.round(value) ? 1 : 0.2 }}>★</span>
      ))}
    </span>
  );
}

// ── Response card ─────────────────────────────────────────────────────────────
function ResponseCard({ r, starQuestions }: { r: ShareResponse; starQuestions: SharePerQuestion[] }) {
  const [open, setOpen] = useState(false);
  const avg         = personAvg(r.stars);
  const displayName = r.name || 'Anonymous';
  const isAnon      = !r.name;

  return (
    <div style={{ background: 'oklch(11% 0.03 145)', borderRadius: 12, marginBottom: 10, border: '1px solid oklch(18% 0.04 145)', overflow: 'hidden' }}>
      {/* Header — always visible */}
      <div
        role="button"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--font-montserrat)', fontWeight: 700, fontSize: 14, color: isAnon ? MUTED : GOLD_LIGHT }}>
              {displayName}
            </span>
            {avg != null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ color: GOLD, fontFamily: 'var(--font-montserrat)', fontWeight: 800, fontSize: 13 }}>{avg.toFixed(1)}</span>
                <Stars value={avg} size={13} />
              </div>
            )}
          </div>
          {r.comments && (
            <p style={{
              color: 'rgba(255,255,255,0.55)', fontSize: 12, fontFamily: 'var(--font-poppins)',
              lineHeight: 1.5, margin: 0,
              overflow: 'hidden',
              display: '-webkit-box',
              ...(!open ? { WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' } : {}),
            } as React.CSSProperties}>
              &ldquo;{r.comments}&rdquo;
            </p>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ color: MUTED, fontSize: 11, fontFamily: 'var(--font-poppins)' }}>{r.submittedOn}</span>
          <span style={{ color: MUTED, fontSize: 18, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', display: 'block' }}>▾</span>
        </div>
      </div>

      {/* Expanded — per-question breakdown + videos */}
      {open && (
        <div style={{ borderTop: '1px solid oklch(16% 0.03 145)', padding: '14px 16px 16px' }}>
          {starQuestions.map((q, i) => r.stars[i] != null && (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <p style={{ color: MUTED, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'var(--font-poppins)', margin: 0, flex: 1, paddingRight: 12 }}>
                {q.question}
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <Stars value={r.stars[i]} size={13} />
                <span style={{ color: GOLD, fontFamily: 'var(--font-montserrat)', fontWeight: 700, fontSize: 13, minWidth: 16 }}>
                  {r.stars[i]}
                </span>
              </div>
            </div>
          ))}
          {r.videos.map((v, j) => (
            <div key={j} style={{ borderRadius: 8, overflow: 'hidden', marginTop: 12, position: 'relative', paddingBottom: '56.25%', background: '#000' }}>
              <iframe
                src={v}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
                sandbox="allow-scripts allow-same-origin"
                allow=""
                title={`Video feedback ${j + 1}`}
                loading="lazy"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Per-question bar (stats section) ──────────────────────────────────────────
function PerQuestionBar({ q }: { q: SharePerQuestion }) {
  if (q.type === 'video') {
    return (
      <div style={{ marginBottom: 14 }}>
        <p style={{ color: MUTED, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--font-poppins)', marginBottom: 4 }}>
          {q.question}
        </p>
        <p style={{ color: GOLD_LIGHT, fontSize: 13, fontFamily: 'var(--font-poppins)' }}>
          {q.count} video{q.count !== 1 ? 's' : ''} submitted
        </p>
      </div>
    );
  }
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <p style={{ color: MUTED, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--font-poppins)', margin: 0 }}>
          {q.question}
        </p>
        {q.avg != null && (
          <span style={{ color: GOLD, fontFamily: 'var(--font-montserrat)', fontWeight: 700, fontSize: 13 }}>
            {q.avg.toFixed(1)}
          </span>
        )}
      </div>
      <div style={{ height: 6, borderRadius: 3, background: 'oklch(20% 0.04 145)', overflow: 'hidden' }}>
        <div style={{
          width: `${q.avg != null ? (q.avg / 5) * 100 : 0}%`, height: '100%', borderRadius: 3,
          background: `linear-gradient(90deg, ${GOLD} 0%, ${GOLD_LIGHT} 100%)`,
          transition: 'width 0.8s ease-out',
        }} />
      </div>
    </div>
  );
}

// ── Sticky action bar ─────────────────────────────────────────────────────────
function StickyBar({
  filterRating, setFilterRating,
  searchQuery,  setSearchQuery,
  sortOrder,    setSortOrder,
  onShare,
}: {
  filterRating: number | null; setFilterRating: (v: number | null) => void;
  searchQuery: string;         setSearchQuery:  (v: string) => void;
  sortOrder: SortOrder;        setSortOrder:    (v: SortOrder) => void;
  onShare: () => void;
}) {
  const chips: { label: string; value: number | null }[] = [
    { label: 'All', value: null },
    { label: '5★',  value: 5 },
    { label: '4★',  value: 4 },
    { label: '3★',  value: 3 },
    { label: '2★',  value: 2 },
    { label: '1★',  value: 1 },
  ];

  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 10,
      background: 'rgba(10,34,20,0.85)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      borderBottom: '1px solid oklch(18% 0.04 145)',
      padding: '10px 16px',
    } as React.CSSProperties}>
      <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {/* Rating chips */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {chips.map(chip => {
            const active = filterRating === chip.value;
            return (
              <button
                key={chip.label}
                onClick={() => setFilterRating(chip.value)}
                style={{
                  padding: '4px 10px', borderRadius: 20, fontSize: 12, fontFamily: 'var(--font-poppins)',
                  border: active ? `1px solid ${BRAND_LIME}` : '1px solid oklch(28% 0.04 145)',
                  background: active ? BRAND_GREEN : 'transparent',
                  color: active ? BRAND_LIME : MUTED,
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                {chip.label}
              </button>
            );
          })}
        </div>

        {/* Search */}
        <input
          type="search"
          placeholder="Search comments…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{
            flex: 1, minWidth: 120, padding: '5px 10px', borderRadius: 8, fontSize: 12,
            fontFamily: 'var(--font-poppins)', background: 'oklch(11% 0.03 145)',
            border: '1px solid oklch(22% 0.04 145)', color: '#fff', outline: 'none',
          }}
        />

        {/* Sort */}
        <select
          value={sortOrder}
          onChange={e => setSortOrder(e.target.value as SortOrder)}
          style={{
            padding: '5px 8px', borderRadius: 8, fontSize: 12, fontFamily: 'var(--font-poppins)',
            background: 'oklch(11% 0.03 145)', border: '1px solid oklch(22% 0.04 145)',
            color: '#fff', cursor: 'pointer',
          }}
        >
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="highest">Highest rated</option>
          <option value="lowest">Lowest rated</option>
        </select>

        {/* Share button */}
        <button
          onClick={onShare}
          style={{
            padding: '5px 14px', borderRadius: 8, fontSize: 12, fontFamily: 'var(--font-poppins)',
            border: `1px solid ${GOLD}`, background: 'transparent', color: GOLD,
            cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap',
          }}
        >
          Share ↗
        </button>
      </div>
    </div>
  );
}

// ── Share modal ───────────────────────────────────────────────────────────────
function ShareModal({ token, onClose }: { token: string; onClose: () => void }) {
  const [copyDone, setCopyDone] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopyDone(true);
      setTimeout(() => setCopyDone(false), 2000);
    });
  }

  function handleDownload() {
    fetch(`/api/share-card/${token}`)
      .then(r => r.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob);
        const a   = document.createElement('a');
        a.href     = url;
        a.download = 'pz-academy-feedback.png';
        a.click();
        URL.revokeObjectURL(url);
      });
  }

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: CARD_BG, border: CARD_BORDER, borderRadius: 16, padding: 24, maxWidth: 400, width: '100%' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontFamily: 'var(--font-montserrat)', fontWeight: 800, fontSize: 17, color: '#fff', margin: 0 }}>
            Share this review
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: MUTED, fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: 0 }}>×</button>
        </div>

        {/* Preview */}
        <div style={{ borderRadius: 8, overflow: 'hidden', marginBottom: 20, background: '#000', aspectRatio: '1 / 1' }}>
          <img
            src={`/api/share-card/${token}`}
            alt="Share card preview"
            style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
          />
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={handleCopy}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 13, fontFamily: 'var(--font-poppins)',
              border: `1px solid ${GOLD}`, background: copyDone ? BRAND_GREEN : 'transparent',
              color: copyDone ? BRAND_LIME : GOLD, cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s',
            }}
          >
            {copyDone ? 'Copied!' : 'Copy link'}
          </button>
          <button
            onClick={handleDownload}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 13, fontFamily: 'var(--font-poppins)',
              border: 'none', background: GOLD, color: DARK_BG, cursor: 'pointer', fontWeight: 700,
            }}
          >
            Download PNG
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Session card ──────────────────────────────────────────────────────────────
function SessionCard({
  session, defaultOpen, filterRating, searchQuery, sortOrder,
}: {
  session: ShareSession; defaultOpen: boolean;
  filterRating: number | null; searchQuery: string; sortOrder: SortOrder;
}) {
  const [open, setOpen]             = useState(defaultOpen);
  const [heroLoaded, setHeroLoaded] = useState(false);
  const starQuestions               = session.perQuestion.filter(q => q.type === 'stars');
  const visibleResponses            = filterAndSort(session.responses, filterRating, searchQuery, sortOrder);

  return (
    <div style={{ borderRadius: 16, overflow: 'hidden', border: CARD_BORDER, marginBottom: 16, background: CARD_BG }}>
      {/* Header */}
      <div
        onClick={() => setOpen(o => !o)}
        role="button"
        aria-expanded={open}
        style={{ padding: '16px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontFamily: 'var(--font-montserrat)', fontWeight: 800, fontSize: 15, color: '#fff', lineHeight: 1.3, marginBottom: 3 }}>
            {session.name}
          </p>
          {session.speaker && (
            <p style={{ color: MUTED, fontSize: 12, fontFamily: 'var(--font-poppins)' }}>
              {session.speaker}{session.date ? ` · ${session.date}` : ''}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          {session.avgRating != null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: GOLD, fontFamily: 'var(--font-montserrat)', fontWeight: 800, fontSize: 18 }}>
                {session.avgRating.toFixed(1)}
              </span>
              <Stars value={session.avgRating} />
            </div>
          )}
          <span style={{ color: MUTED, fontSize: 12, fontFamily: 'var(--font-poppins)' }}>
            {session.responseCount} {session.responseCount === 1 ? 'feedback' : 'feedbacks'}
          </span>
          <span style={{ color: MUTED, fontSize: 20, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', display: 'block' }}>▾</span>
        </div>
      </div>

      {open && (
        <div style={{ borderTop: '1px solid oklch(20% 0.04 145)' }}>
          {/* Cover hero */}
          {session.coverUrl && (
            <div style={{ position: 'relative', height: 130, overflow: 'hidden', background: 'oklch(12% 0.05 145)' }}>
              {!heroLoaded && <div style={{ position: 'absolute', inset: 0, background: 'oklch(18% 0.04 145)' }} />}
              <img
                src={session.coverUrl}
                alt={session.name}
                onLoad={() => setHeroLoaded(true)}
                onError={() => setHeroLoaded(true)}
                style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 20%', opacity: heroLoaded ? 1 : 0, transition: 'opacity 0.3s', display: 'block' }}
              />
            </div>
          )}

          {/* Stats */}
          <div style={{ padding: '20px 20px 8px', display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            {session.avgRating != null && (
              <div style={{ textAlign: 'center', minWidth: 80 }}>
                <p style={{ fontFamily: 'var(--font-montserrat)', fontWeight: 800, fontSize: 38, color: '#fff', lineHeight: 1, marginBottom: 4 }}>
                  {session.avgRating.toFixed(1)}
                </p>
                <Stars value={session.avgRating} />
                <p style={{ color: MUTED, fontSize: 10, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Overall</p>
              </div>
            )}
            <div style={{ flex: 1, minWidth: 200 }}>
              {session.perQuestion.map((q, i) => <PerQuestionBar key={i} q={q} />)}
            </div>
          </div>

          {/* Response cards */}
          <div style={{ padding: '0 20px 20px' }}>
            {visibleResponses.length === 0 ? (
              <p style={{ color: MUTED, fontSize: 13, textAlign: 'center', padding: '16px 0', fontFamily: 'var(--font-poppins)' }}>
                No feedbacks match your filters.
              </p>
            ) : (
              visibleResponses.map((r, i) => (
                <ResponseCard key={i} r={r} starQuestions={starQuestions} />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Program overall stats ─────────────────────────────────────────────────────
function ProgramOverallStats({ sessions }: { sessions: ShareSession[] }) {
  const rated   = sessions.filter(s => s.avgRating != null);
  const overall = rated.length
    ? Math.round((rated.reduce((a, s) => a + (s.avgRating ?? 0), 0) / rated.length) * 10) / 10
    : null;
  const total   = sessions.reduce((a, s) => a + s.responseCount, 0);

  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
      {overall != null && (
        <div style={{ background: CARD_BG, borderRadius: 12, padding: '16px 20px', flex: 1, minWidth: 110, textAlign: 'center', border: CARD_BORDER }}>
          <p style={{ fontFamily: 'var(--font-montserrat)', fontWeight: 800, fontSize: 34, color: '#fff', lineHeight: 1, marginBottom: 6 }}>{overall.toFixed(1)}</p>
          <Stars value={overall} />
          <p style={{ color: MUTED, fontSize: 10, marginTop: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Overall rating</p>
        </div>
      )}
      <div style={{ background: CARD_BG, borderRadius: 12, padding: '16px 20px', flex: 1, minWidth: 110, textAlign: 'center', border: CARD_BORDER }}>
        <p style={{ fontFamily: 'var(--font-montserrat)', fontWeight: 800, fontSize: 34, color: '#fff', lineHeight: 1, marginBottom: 6 }}>{total}</p>
        <p style={{ color: MUTED, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total feedbacks</p>
      </div>
      <div style={{ background: CARD_BG, borderRadius: 12, padding: '16px 20px', flex: 1, minWidth: 110, textAlign: 'center', border: CARD_BORDER }}>
        <p style={{ fontFamily: 'var(--font-montserrat)', fontWeight: 800, fontSize: 34, color: '#fff', lineHeight: 1, marginBottom: 6 }}>{sessions.length}</p>
        <p style={{ color: MUTED, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Sessions</p>
      </div>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function ReviewClient({ view, token }: { view: ShareView; token: string }) {
  const [filterRating,   setFilterRating]   = useState<number | null>(null);
  const [searchQuery,    setSearchQuery]    = useState('');
  const [sortOrder,      setSortOrder]      = useState<SortOrder>('newest');
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [heroLoaded,     setHeroLoaded]     = useState(false);
  const [isMember,       setIsMember]       = useState(false);

  useEffect(() => {
    setIsMember(new URLSearchParams(window.location.search).get('member') === '1');
  }, []);

  const title    = view.type === 'session' ? view.session.name     : view.program.name;
  const coverUrl = view.type === 'session' ? view.session.coverUrl : view.program.coverUrl;

  return (
    <>
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .hero-content { animation: fadeUp 0.5s ease-out both; }
        button:focus-visible, input:focus-visible, select:focus-visible {
          outline: 2px solid ${GOLD}; outline-offset: 2px;
        }
      `}</style>

      <div style={{ minHeight: '100vh', background: DARK_BG, color: '#fff', fontFamily: 'var(--font-poppins)' }}>

        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <div style={{ position: 'relative', height: 280, overflow: 'hidden', background: 'oklch(13% 0.05 145)' }}>
          {coverUrl && (
            <img
              src={coverUrl}
              alt={title}
              onLoad={() => setHeroLoaded(true)}
              onError={() => setHeroLoaded(true)}
              style={{
                width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 20%',
                opacity: heroLoaded ? 1 : 0, transition: 'opacity 0.5s', display: 'block',
              }}
            />
          )}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 20%, rgba(10,34,20,0.95) 100%)' }} />
          <div className="hero-content" style={{ position: 'absolute', bottom: 24, left: 24, right: 24 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 10, background: 'rgba(201,168,76,0.2)', color: GOLD, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', marginBottom: 10, fontFamily: 'var(--font-montserrat)' }}>
              PZ Academy · {view.type === 'session' ? 'Session' : view.program.type || 'Program'}
            </div>
            <h1 style={{ fontFamily: 'var(--font-montserrat)', fontWeight: 800, fontSize: 'clamp(20px, 4vw, 28px)', lineHeight: 1.2, marginBottom: 6 }}>
              {title}
            </h1>
            {view.type === 'session' && view.session.speaker && (
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>Speaker · {view.session.speaker}</p>
            )}
            {view.type === 'program' && (
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>{view.sessions.length} sessions</p>
            )}
          </div>
        </div>

        {/* ── Attribution ─────────────────────────────────────────── */}
        <div style={{ padding: '6px 24px', borderBottom: '1px solid oklch(18% 0.04 145)', display: 'flex', justifyContent: 'flex-end' }}>
          <span style={{ color: MUTED, fontSize: 11 }}>Powered by PZ Academy Feedback</span>
        </div>

        {/* ── Sticky bar (member only) ─────────────────────────────── */}
        {isMember && (
          <StickyBar
            filterRating={filterRating} setFilterRating={setFilterRating}
            searchQuery={searchQuery}   setSearchQuery={setSearchQuery}
            sortOrder={sortOrder}       setSortOrder={setSortOrder}
            onShare={() => setShareModalOpen(true)}
          />
        )}

        {/* ── Content ─────────────────────────────────────────────── */}
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px 56px' }}>
          {view.type === 'session' ? (
            <SessionCard
              session={view.session}
              defaultOpen
              filterRating={filterRating}
              searchQuery={searchQuery}
              sortOrder={sortOrder}
            />
          ) : (
            <>
              {view.sessions.length > 0 && <ProgramOverallStats sessions={view.sessions} />}
              {view.sessions.map(s => (
                <SessionCard
                  key={s.id}
                  session={s}
                  defaultOpen={false}
                  filterRating={filterRating}
                  searchQuery={searchQuery}
                  sortOrder={sortOrder}
                />
              ))}
              {view.sessions.length === 0 && (
                <p style={{ color: MUTED, textAlign: 'center', padding: '40px 0', fontSize: 14 }}>
                  No sessions in this program yet.
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Share modal (member only) ────────────────────────────────── */}
      {isMember && shareModalOpen && <ShareModal token={token} onClose={() => setShareModalOpen(false)} />}
    </>
  );
}
