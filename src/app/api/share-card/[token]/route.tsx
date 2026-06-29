import { ImageResponse } from 'next/og';
import { type NextRequest } from 'next/server';
import { fetchShareCardData } from '@/lib/share-card-data';

export const runtime = 'edge';

const BRAND_GREEN = '#0F3D22';
const BRAND_LIME  = '#7ED957';
const GOLD        = '#C9A84C';

async function fetchCoverBase64(url: string): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const buf   = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const type = res.headers.get('content-type') ?? 'image/jpeg';
    return `data:${type};base64,${btoa(binary)}`;
  } catch {
    return null;
  }
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const data       = await fetchShareCardData(token);

  const title        = data?.title    ?? 'Instructor Feedback';
  const avg          = data?.avg      ?? null;
  const count        = data?.count    ?? 0;
  const coverDataUrl = data?.coverUrl ? await fetchCoverBase64(data.coverUrl) : null;
  const filename     = 'pz-academy-' + title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) + '.png';

  const img = new ImageResponse(
    (
      <div style={{
        width: 1080, height: 1080,
        position: 'relative',
        display: 'flex', flexDirection: 'column',
        fontFamily: 'sans-serif',
        background: BRAND_GREEN,
        overflow: 'hidden',
      }}>

        {/* Full-bleed cover image */}
        {coverDataUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverDataUrl}
            width={1080}
            height={1080}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            alt=""
          />
        )}

        {/* Dark gradient overlay */}
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          background: coverDataUrl
            ? 'linear-gradient(to bottom, rgba(10,34,20,0.25) 0%, rgba(10,34,20,0.7) 45%, rgba(5,15,10,0.97) 72%, rgba(3,10,7,1) 100%)'
            : 'linear-gradient(135deg, #0a2f18 0%, #030a07 100%)',
        }} />

        {/* Top accent bar */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 10, background: BRAND_LIME }} />

        {/* Top-left badge */}
        <div style={{ position: 'absolute', top: 52, left: 60, display: 'flex' }}>
          <span style={{
            color: BRAND_LIME, fontSize: 21, fontWeight: 700, letterSpacing: '0.1em',
            padding: '10px 24px', borderRadius: 100,
            background: 'rgba(10,34,20,0.72)',
            border: '1.5px solid rgba(126,217,87,0.4)',
          }}>
            PZ ACADEMY · FEEDBACK
          </span>
        </div>

        {/* Bottom content block */}
        <div style={{
          position: 'absolute',
          bottom: 72, left: 60, right: 60,
          display: 'flex', flexDirection: 'column',
        }}>
          {/* Session title */}
          <div style={{
            color: '#ffffff', fontSize: 60, fontWeight: 800, lineHeight: 1.15,
            marginBottom: 40,
            textShadow: '0 2px 16px rgba(0,0,0,0.5)',
          }}>
            {title}
          </div>

          {/* Rating */}
          {avg != null ? (
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 30 }}>
              <span style={{ color: GOLD, fontSize: 100, fontWeight: 800, lineHeight: 1, marginRight: 28 }}>
                {avg.toFixed(1)}
              </span>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', marginBottom: 10 }}>
                  {[1, 2, 3, 4, 5].map((i, idx) => (
                    <span key={i} style={{ color: i <= Math.round(avg) ? GOLD : 'rgba(201,168,76,0.22)', fontSize: 54, marginRight: idx < 4 ? 8 : 0 }}>★</span>
                  ))}
                </div>
                <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 27 }}>
                  {count} {count === 1 ? 'feedback' : 'feedbacks'}
                </span>
              </div>
            </div>
          ) : (
            <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 30, marginBottom: 30 }}>
              {count} {count === 1 ? 'feedback' : 'feedbacks'}
            </span>
          )}

          {/* Divider + watermark */}
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ width: 44, height: 3, background: BRAND_LIME, borderRadius: 2, marginRight: 16 }} />
            <span style={{ color: 'rgba(255,255,255,0.38)', fontSize: 21 }}>pz-academy.pharmacozyme.com</span>
          </div>
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
