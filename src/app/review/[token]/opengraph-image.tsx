import { ImageResponse } from 'next/og';
import { fetchShareCardData } from '@/lib/share-card-data';

export const alt         = 'PZ Academy Session Feedback';
export const size        = { width: 1200, height: 630 };
export const contentType = 'image/png';

const BRAND_GREEN = '#0F3D22';
const BRAND_LIME  = '#7ED957';
const GOLD        = '#C9A84C';

interface Props { params: Promise<{ token: string }> }

export default async function OGImage({ params }: Props) {
  const { token } = await params;
  const data       = await fetchShareCardData(token);

  const title = data?.title ?? 'Instructor Feedback';
  const avg   = data?.avg   ?? null;
  const count = data?.count ?? 0;

  return new ImageResponse(
    (
      <div style={{ width: 1200, height: 630, background: BRAND_GREEN, display: 'flex', flexDirection: 'column', fontFamily: 'sans-serif' }}>
        {/* Accent bar */}
        <div style={{ width: '100%', height: 8, background: BRAND_LIME }} />

        {/* Body */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 80px' }}>
          <div style={{ color: BRAND_LIME, fontSize: 18, fontWeight: 700, letterSpacing: '0.12em', marginBottom: 32, textTransform: 'uppercase' }}>
            PZ ACADEMY · FEEDBACK
          </div>
          <div style={{ color: '#ffffff', fontSize: 54, fontWeight: 800, lineHeight: 1.2, marginBottom: 40, maxWidth: 900 }}>
            {title}
          </div>
          {avg != null ? (
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ color: GOLD, fontSize: 80, fontWeight: 800, lineHeight: 1, marginRight: 24 }}>{avg.toFixed(1)}</span>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', marginBottom: 10 }}>
                  {[1, 2, 3, 4, 5].map((i, idx) => (
                    <span key={i} style={{ color: i <= Math.round(avg) ? GOLD : 'rgba(201,168,76,0.25)', fontSize: 40, marginRight: idx < 4 ? 8 : 0 }}>★</span>
                  ))}
                </div>
                <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 22 }}>
                  {count} {count === 1 ? 'feedback' : 'feedbacks'}
                </span>
              </div>
            </div>
          ) : (
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 24 }}>
              {count} {count === 1 ? 'feedback' : 'feedbacks'}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '0 80px 40px', display: 'flex', justifyContent: 'flex-end' }}>
          <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 16 }}>pz-academy.pharmacozyme.com</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
