/**
 * One source for the mark and the wordmark, so the favicon, the preloader and
 * the corner watermark can never drift apart.
 *
 * The mark is a cat head printed in two risograph inks: a celadon silhouette
 * pulled a hair off-register behind the aubergine line. The wordmark is "baio"
 * set in the display face with the same celadon misregistration (see .wordmark
 * in app/globals.css). app/icon.svg repeats the mark on a celadon tile.
 */

interface MarkProps {
  size?: number
  className?: string
  /** Hide the celadon under-print (for tiny sizes or monochrome contexts). */
  mono?: boolean
}

/** The cat head. Fills `currentColor`; celadon comes from the token. */
export function LogoMark({ size = 20, className, mono = false }: MarkProps): React.JSX.Element {
  const head =
    'M4 3 L9 6.6 Q12 5.6 15 6.6 L20 3 L19.4 10.2 Q21 13 19.6 16.2 Q17.2 21 12 21 Q6.8 21 4.4 16.2 Q3 13 4.6 10.2 Z'
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block', flex: 'none' }}
    >
      {!mono && (
        <path
          d={head}
          fill="var(--accent)"
          transform="translate(1.4 1.2)"
          style={{ mixBlendMode: 'multiply' }}
        />
      )}
      <path
        d={head}
        fill="var(--paper)"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <circle cx="9.1" cy="12.4" r="1.15" fill="currentColor" />
      <circle cx="14.9" cy="12.4" r="1.15" fill="currentColor" />
      <path d="M11 15.2 h2 l-1 1.2 z" fill="currentColor" />
      <path
        d="M1.5 13.6 L6.6 14.3 M1.8 16.4 L6.6 15.6 M22.5 13.6 L17.4 14.3 M22.2 16.4 L17.4 15.6"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

interface TypeProps {
  /** Font size of the wordmark in px. */
  size?: number
  className?: string
}

/** The "baio" wordmark, display face, celadon under-print. */
export function Logotype({ size = 18, className }: TypeProps): React.JSX.Element {
  return (
    <span
      className={`wordmark ${className ?? ''}`}
      data-text="baio"
      style={{ fontSize: size }}
      aria-label="baio"
    >
      baio
    </span>
  )
}

/** Mark + wordmark, side by side. */
export function Lockup({ size = 18 }: { size?: number }): React.JSX.Element {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.45 }}>
      <LogoMark size={size * 1.35} />
      <Logotype size={size} />
    </span>
  )
}
