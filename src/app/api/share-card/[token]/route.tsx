import { ImageResponse } from 'next/og';
import { type NextRequest } from 'next/server';
import { fetchShareCardData } from '@/lib/share-card-data';

export const runtime = 'edge';

const BRAND_GREEN = '#0F3D22';
const BRAND_LIME  = '#7ED957';
const GOLD        = '#C9A84C';

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const data       = await fetchShareCardData(token);

  const title    = data?.title ?? 'Instructor Feedback';
  const avg      = data?.avg   ?? null;
  const count    = data?.count ?? 0;
  const filename = 'pz-academy-' + title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) + '.png';

  const img = new ImageResponse(
    (
      <div style={{ width: 1080, height: 1080, background: BRAND_GREEN, display: 'flex', flexDirection: 'column', fontFamily: 'sans-serif' }}>
        {/* Accent bar */}
        <div style={{ width: '100%', height: 10, background: BRAND_LIME }} />

        {/* Body */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '0 80px', textAlign: 'center' }}>
          <div style={{ color: BRAND_LIME, fontSize: 22, fontWeight: 700, letterSpacing: '0.12em', marginBottom: 48, textTransform: 'uppercase' }}>
            PZ ACADEMY · FEEDBACK
          </div>
          <div style={{ color: '#ffffff', fontSize: 56, fontWeight: 800, lineHeight: 1.2, marginBottom: 56, maxWidth: 860 }}>
            {title}
          </div>
          {avg != null ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ color: GOLD, fontSize: 120, fontWeight: 800, lineHeight: 1, marginBottom: 18 }}>{avg.toFixed(1)}</span>
              <div style={{ display: 'flex', flexDirection: 'row', marginBottom: 18 }}>
                {[1, 2, 3, 4, 5].map((i, idx) => (
                  <span key={i} style={{ color: i <= Math.round(avg) ? GOLD : 'rgba(201,168,76,0.25)', fontSize: 56, marginRight: idx < 4 ? 10 : 0 }}>★</span>
                ))}
              </div>
              <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 28, marginTop: 8 }}>
                {count} {count === 1 ? 'feedback' : 'feedbacks'}
              </span>
            </div>
          ) : (
            <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 32 }}>
              {count} {count === 1 ? 'feedback' : 'feedbacks'}
            </span>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '0 80px 48px', display: 'flex', justifyContent: 'center' }}>
          <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 20 }}>pz-academy.pharmacozyme.com</span>
        </div>
      </div>
    ),
    { width: 1080, height: 1080 },
  );

  return new Response(img.body, {
    headers: {
      'Content-Type':        'image/png',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
