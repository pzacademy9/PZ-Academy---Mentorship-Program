'use client';

import { useState } from 'react';
import type { ShareView, ShareSession, SharePerQuestion } from '@/lib/gas';

const DARK_BG    = '#0A2214';
const CARD_BG    = 'oklch(14% 0.04 145)';
const CARD_BORDER = '1px solid oklch(22% 0.04 145)';
const GOLD       = '#C9A84C';
const GOLD_LIGHT = '#F3E5AB';
const MUTED      = 'oklch(50% 0.04 145)';

function Stars({ value, max = 5 }: { value: number; max?: number }) {
  return (
    <span aria-label={`${value} out of ${max} stars`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} style={{ color: GOLD, fontSize: 17, opacity: i < Math.round(value) ? 1 : 0.2 }}>★</span>
      ))}
    </span>
  );
}

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
        <p style={{ color: MUTED, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--font-poppins)' }}>
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
          width:        `${q.avg != null ? (q.avg / 5) * 100 : 0}%`,
          height:       '100%',
          borderRadius: 3,
          background:   `linear-gradient(90deg, ${GOLD} 0%, ${GOLD_LIGHT} 100%)`,
          transition:   'width 0.8s ease-out',
        }} />
      </div>
    </div>
  );
}

function SessionCard({ session, defaultOpen = false }: { session: ShareSession; defaultOpen?: boolean }) {
  const [open, setOpen]             = useState(defaultOpen);
  const [heroLoaded, setHeroLoaded] = useState(false);

  return (
    <div style={{ borderRadius: 16, overflow: 'hidden', border: CARD_BORDER, marginBottom: 16, background: CARD_BG }}>
      {/* Header row — always visible */}
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
            {session.responses.length === 0 ? (
              <p style={{ color: MUTED, fontSize: 13, textAlign: 'center', padding: '16px 0', fontFamily: 'var(--font-poppins)' }}>
                No feedbacks yet.
              </p>
            ) : (
              session.responses.map((r, i) => (
                <div key={i} style={{ background: 'oklch(11% 0.03 145)', borderRadius: 12, padding: 16, marginBottom: 12, border: '1px solid oklch(18% 0.04 145)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: (r.comments || r.videos.length > 0) ? 12 : 0 }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {r.stars.map((s, j) => <Stars key={j} value={s} />)}
                    </div>
                    <span style={{ color: MUTED, fontSize: 11, fontFamily: 'var(--font-poppins)', flexShrink: 0, marginLeft: 8 }}>
                      {r.submittedOn}
                    </span>
                  </div>
                  {r.comments && (
                    <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, fontFamily: 'var(--font-poppins)', lineHeight: 1.65, marginBottom: r.videos.length > 0 ? 12 : 0 }}>
                      &ldquo;{r.comments}&rdquo;
                    </p>
                  )}
                  {r.videos.map((v, j) => (
                    <div key={j} style={{ borderRadius: 8, overflow: 'hidden', marginTop: 8, position: 'relative', paddingBottom: '56.25%', background: '#000' }}>
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
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

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

export default function ReviewClient({ view, token }: { view: ShareView; token: string }) {
  const title    = view.type === 'session' ? view.session.name     : view.program.name;
  const coverUrl = view.type === 'session' ? view.session.coverUrl : view.program.coverUrl;
  const [heroLoaded, setHeroLoaded] = useState(false);

  return (
    <div style={{ minHeight: '100vh', background: DARK_BG, color: '#fff', fontFamily: 'var(--font-poppins)' }}>
      {/* Hero */}
      <div style={{ position: 'relative', height: 200, overflow: 'hidden', background: 'oklch(13% 0.05 145)' }}>
        {coverUrl && (
          <img
            src={coverUrl}
            alt={title}
            onLoad={() => setHeroLoaded(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 20%', opacity: heroLoaded ? 1 : 0, transition: 'opacity 0.5s', display: 'block' }}
          />
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 25%, oklch(10% 0.05 145 / .9) 100%)' }} />
        <div style={{ position: 'absolute', bottom: 20, left: 24, right: 24 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 10, background: 'rgba(201,168,76,0.2)', color: GOLD, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', marginBottom: 8, fontFamily: 'var(--font-montserrat)' }}>
            PZ Academy · {view.type === 'session' ? 'Session' : view.program.type || 'Program'}
          </div>
          <h1 style={{ fontFamily: 'var(--font-montserrat)', fontWeight: 800, fontSize: 'clamp(18px, 4vw, 26px)', lineHeight: 1.2, marginBottom: 4 }}>
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

      {/* Attribution bar */}
      <div style={{ padding: '6px 24px', borderBottom: '1px solid oklch(18% 0.04 145)', display: 'flex', justifyContent: 'flex-end' }}>
        <span style={{ color: MUTED, fontSize: 11 }}>Powered by PZ Academy Feedback</span>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px 56px' }}>
        {view.type === 'session' ? (
          <SessionCard session={view.session} defaultOpen />
        ) : (
          <>
            {view.sessions.length > 0 && <ProgramOverallStats sessions={view.sessions} />}
            {view.sessions.map(s => <SessionCard key={s.id} session={s} />)}
            {view.sessions.length === 0 && (
              <p style={{ color: MUTED, textAlign: 'center', padding: '40px 0', fontFamily: 'var(--font-poppins)', fontSize: 14 }}>
                No sessions in this program yet.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
