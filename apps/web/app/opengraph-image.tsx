import { ImageResponse } from 'next/og';

export const alt = 'NestWork — retrouve les échanges spontanés de ton équipe';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          overflow: 'hidden',
          color: '#18191d',
          background: '#fffaf0',
          fontFamily: 'Arial, sans-serif',
        }}
      >
        <div
          style={{
            width: '65%',
            padding: '64px 0 64px 72px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, fontSize: 34, fontWeight: 700 }}>
            <div
              style={{
                width: 46,
                height: 46,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '8px solid #18191d',
                transform: 'rotate(30deg)',
              }}
            >
              <div style={{ width: 12, height: 12, background: '#ffc500' }} />
            </div>
            NestWork
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
            <div style={{ fontSize: 72, lineHeight: 0.98, letterSpacing: '-3px', fontWeight: 800 }}>
              Retrouve les échanges spontanés de ton équipe.
            </div>
            <div style={{ maxWidth: 650, color: '#665e53', fontSize: 25, lineHeight: 1.35 }}>
              Un espace partagé où voir, s’approcher et parler redeviennent un seul geste.
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#795a00', fontSize: 18 }}>
            <div style={{ width: 9, height: 9, borderRadius: 99, background: '#ffc500' }} />
            Pilote accompagné · équipes de 4 à 12 personnes
          </div>
        </div>

        <div
          style={{
            width: '35%',
            display: 'flex',
            position: 'relative',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#18191d',
          }}
        >
          <div style={{ position: 'absolute', width: 310, height: 310, border: '2px solid #786a56', borderRadius: 999 }} />
          <div style={{ position: 'absolute', width: 205, height: 205, border: '2px solid #a48d60', borderRadius: 999 }} />
          <div
            style={{
              position: 'absolute',
              left: 78,
              top: 196,
              width: 112,
              height: 112,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 999,
              color: '#18191d',
              background: '#ff8f78',
              border: '8px solid #fffaf0',
              fontSize: 28,
              fontWeight: 800,
            }}
          >
            CM
          </div>
          <div
            style={{
              position: 'absolute',
              right: 64,
              bottom: 168,
              width: 112,
              height: 112,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 999,
              color: '#18191d',
              background: '#8fc8ff',
              border: '8px solid #fffaf0',
              fontSize: 28,
              fontWeight: 800,
            }}
          >
            NL
          </div>
          <div
            style={{
              position: 'absolute',
              right: 36,
              top: 42,
              padding: '12px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              borderRadius: 99,
              color: '#f8f2e6',
              background: '#2d2f35',
              fontSize: 15,
            }}
          >
            <div style={{ width: 8, height: 8, borderRadius: 99, background: '#a7d879' }} />
            Conversation ouverte
          </div>
        </div>
      </div>
    ),
    size,
  );
}
