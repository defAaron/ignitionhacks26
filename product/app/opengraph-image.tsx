import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'baio — autocomplete for drawing'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const INK = '#421040'
const CELADON = '#9ddbb9'
const CELADON_INK = '#0b764d'

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          background: '#ffffff',
          color: INK,
          fontFamily: 'Helvetica, Arial, sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          <svg width="72" height="72" viewBox="0 0 24 24">
            <path
              d="M4 3 L9 6.6 Q12 5.6 15 6.6 L20 3 L19.4 10.2 Q21 13 19.6 16.2 Q17.2 21 12 21 Q6.8 21 4.4 16.2 Q3 13 4.6 10.2 Z"
              fill={CELADON}
              transform="translate(1.4 1.2)"
            />
            <path
              d="M4 3 L9 6.6 Q12 5.6 15 6.6 L20 3 L19.4 10.2 Q21 13 19.6 16.2 Q17.2 21 12 21 Q6.8 21 4.4 16.2 Q3 13 4.6 10.2 Z"
              fill="#fff"
              stroke={INK}
              strokeWidth="1.7"
              strokeLinejoin="round"
            />
            <circle cx="9.1" cy="12.4" r="1.15" fill={INK} />
            <circle cx="14.9" cy="12.4" r="1.15" fill={INK} />
            <path d="M11 15.2 h2 l-1 1.2 z" fill={INK} />
            <path
              d="M1.5 13.6 L6.6 14.3 M1.8 16.4 L6.6 15.6 M22.5 13.6 L17.4 14.3 M22.2 16.4 L17.4 15.6"
              stroke={INK}
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          </svg>
          <div style={{ fontSize: 64, fontWeight: 700, letterSpacing: -2 }}>baio</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ fontSize: 84, fontWeight: 700, lineHeight: 1, letterSpacing: -3 }}>
            Autocomplete for drawing.
          </div>
          <div style={{ fontSize: 34, color: CELADON_INK, fontWeight: 600 }}>
            Sketch it. Press Enter. It prints.
          </div>
        </div>
      </div>
    ),
    size,
  )
}
