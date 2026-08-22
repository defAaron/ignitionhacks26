import Link from 'next/link'
import { LogoMark, Logotype } from '@/components/Logo'
import './landing.css'

/**
 * The landing page IS the pitch: problem → solution → features → pipeline →
 * the trained-model stats. Copy mirrors pitch/pitch.md and the README; if the
 * story changes there, change it here.
 *
 * Look: a two-ink risograph poster. Pure white paper, aubergine ink, celadon as the
 * second ink — slightly off-register, with a touch of grain in the hero. The
 * studio shares the same tokens (app/tokens.css) but keeps the celadon to its
 * one primary action.
 */

/** Paper grain: one SVG turbulence filter, multiplied over the hero. */
function Grain(): React.JSX.Element {
  return (
    <svg className="grain" aria-hidden="true" focusable="false">
      <filter id="riso-grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#riso-grain)" />
    </svg>
  )
}

/** A printed ink blob. Two inks only. */
function Blob({ ink, className }: { ink: 'celadon' | 'aubergine'; className: string }): React.JSX.Element {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/splotches/${ink}.svg`} alt="" aria-hidden="true" draggable={false} className={`blob ${className}`} />
  )
}

/**
 * The hero demo: the sketch on the left (wobbly box, a lone "b", the word
 * "Login"), the print on the right (a real button), and the Enter key between
 * them. Pure SVG, so it prints crisp at any size.
 */
function HeroDemo(): React.JSX.Element {
  return (
    <svg className="demo" viewBox="0 0 560 220" role="img" aria-label="A sketched box with the letter b and the word Login becomes a real Login button">
      {/* sketch */}
      <g className="demo-sketch" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M34 72 C 80 66, 140 70, 196 68 C 199 96, 197 118, 199 140 C 150 144, 90 141, 36 143 C 33 120, 35 96, 34 72 Z" />
        <path d="M64 86 C 63 104, 64 118, 65 128 M65 108 C 74 100, 90 104, 88 118 C 86 130, 70 132, 65 126" />
        <path d="M100 118 c 6 -14 10 -14 14 -2 c 4 12 8 12 12 -2 c 4 -12 8 -12 12 0 c 4 12 8 10 12 -2 c 4 -10 8 -8 12 0 c 4 10 8 8 12 -4" />
      </g>
      {/* enter */}
      <g className="demo-enter">
        <rect x="238" y="86" width="84" height="48" rx="10" />
        <path d="M300 100 v10 H262 m8 -8 l-8 8 8 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      {/* print */}
      <g className="demo-print">
        <rect x="362" y="78" width="166" height="56" rx="12" className="demo-print-under" />
        <rect x="358" y="74" width="166" height="56" rx="12" className="demo-print-btn" />
        <text x="441" y="109" textAnchor="middle" className="demo-print-label">
          Login
        </text>
      </g>
    </svg>
  )
}

function ArrowIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
      <path d="M4 10h12m-5-5 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const GLYPHS: Array<{ g: string; name: string; note: string }> = [
  { g: 'b', name: 'Button', note: 'a word inside labels it' },
  { g: 'n', name: 'Navbar', note: 'snaps full-width' },
  { g: 'f', name: 'Form', note: 'working inputs' },
  { g: 'i', name: 'Image', note: 'drop a photo in' },
  { g: 'v', name: 'Video', note: 'a real player' },
  { g: 'p', name: 'Page', note: 'spawns a new page' },
  { g: '?', name: 'Placeholder', note: 'decide later' }
]

const EXTRAS: Array<{ icon: React.JSX.Element; text: string }> = [
  {
    icon: (
      <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="4" width="14" height="12" rx="2" /><circle cx="7" cy="8" r="0.9" fill="currentColor" stroke="none" /><circle cx="12" cy="11" r="0.9" fill="currentColor" stroke="none" /><circle cx="14" cy="7" r="0.9" fill="currentColor" stroke="none" /></svg>
    ),
    text: 'Shade a box dark, scatter dots: a night sky'
  },
  {
    icon: (
      <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 16V9M9 16V5M14 16v-6M3 16h14" /></svg>
    ),
    text: 'Six diagram types, up to the full periodic table'
  },
  {
    icon: (
      <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="7" width="10" height="9" rx="1.5" /><path d="M7 7V5a1.5 1.5 0 0 1 1.5-1.5H16A1.5 1.5 0 0 1 17.5 5v7a1.5 1.5 0 0 1-1.5 1.5h-2" /></svg>
    ),
    text: 'Overlap two things and a layer appears'
  },
  {
    icon: (
      <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 3h10v14H5zM10 17v-3" /><path d="M8 7h4M8 10h4" /></svg>
    ),
    text: 'An infinite plane of pages you can pan and connect'
  },
  {
    icon: (
      <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 6c3-3 9-3 12 0 2 3 1 8-2 10-4 2-9 0-10-4-1-2 0-4 0-6z" /><circle cx="8" cy="9" r="1.2" fill="currentColor" stroke="none" /><path d="M6 14l3-3 2 2 3-4 2 3" /></svg>
    ),
    text: 'Photos cropped to the frame you drew'
  },
  {
    icon: (
      <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="3" width="14" height="14" rx="2" /><path d="M3 8h14M8 8v9" /></svg>
    ),
    text: 'Seal a page, Frame the space: a working multi-page site'
  }
]

const STAGES: Array<{ role: string; name: string; what: string }> = [
  { role: 'Your ink', name: 'Canvas', what: 'Screenshot plus a per-stroke manifest, colors included.' },
  { role: 'The eyes', name: 'Gemini vision', what: 'Describes only: kind, glyph, text, colors. Never places, never decides.' },
  { role: 'The ruler', name: 'Normalizer', what: 'Pure code. Geometry from your strokes; what is inside what.' },
  { role: 'The brain', name: 'FreeSolo 2B', what: 'Our fine-tuned model decides op and params. Zero coordinates in its output.' },
  { role: 'The law', name: 'Validators', what: 'Schema, geometric, domain. Fail closed: junk output means nothing happens.' },
  { role: 'The hand', name: 'Renderer', what: 'Deterministic seeded templates. The model cannot draw an ugly button.' }
]

export default function Home(): React.JSX.Element {
  return (
    <main className="landing">
      {/* ---------- header ---------- */}
      <header className="top-bar">
        <div className="top-bar-inner">
          <Link href="/" className="top-brand" aria-label="baio home">
            <LogoMark size={26} />
            <Logotype size={19} />
          </Link>
          <Link href="/studio?welcome=1" className="cta cta-primary cta-small">
            Open the studio
            <ArrowIcon />
          </Link>
        </div>
      </header>

      {/* ---------- hero ---------- */}
      <section className="hero">
        <Grain />
        <Blob ink="celadon" className="blob-hero-right" />
        <Blob ink="aubergine" className="blob-hero-left" />
        <h1 className="riso" data-text="Autocomplete for drawing.">
          Autocomplete for drawing.
        </h1>
        <p className="hero-sub">
          Sketch a rough page. Press Enter. Real, editable components print in exactly where you
          drew them. Seal a page, Frame the space, and it becomes a working website.
        </p>
        <div className="cta-row">
          <Link href="/studio?welcome=1" className="cta cta-primary">
            Open the studio
            <ArrowIcon />
          </Link>
          <a href="#how" className="cta cta-secondary">
            How it works
          </a>
        </div>
        <div className="demo-wrap">
          <HeroDemo />
          <p className="demo-caption">
            Draw a box, write <kbd>b</kbd> and a word, press <kbd>Enter</kbd>.
          </p>
        </div>
      </section>

      {/* ---------- problem ---------- */}
      <section className="section section-problem">
        <h2>Fast but fading, or faithful but slow.</h2>
        <p className="lede">
          Drawing is the least restrictive way to get an idea out of your head. But every way of
          capturing it loses something, and everyone who thinks faster than they can draw makes the
          same trade.
        </p>
        <dl className="trade">
          <div>
            <dt>Pen and paper</dt>
            <dd>Fast and free. The result is dead ink: not structured, not editable, not shareable.</dd>
          </div>
          <div>
            <dt>Design tools</dt>
            <dd>Real structure. Menus, component browsers, and precision dragging interrupt thinking.</dd>
          </div>
          <div>
            <dt>Text-to-image AI</dt>
            <dd>A pretty picture. Uneditable, detached from what you drew, no spatial control.</dd>
          </div>
          <div className="trade-us">
            <dt>
              <LogoMark size={22} mono /> baio
            </dt>
            <dd>The speed of sketching and the structure of a design tool. Fast and faithful, at once.</dd>
          </div>
        </dl>
      </section>

      {/* ---------- glyphs ---------- */}
      <section className="section section-glyphs">
        <Blob ink="aubergine" className="blob-glyphs" />
        <h2>Plain shapes stay shapes. One letter adds function.</h2>
        <p className="lede">
          Every enclosed shape gets crisp and keeps the color you shaded it. Write one lone letter
          inside a box and it becomes a working component. Words and colors around it become labels,
          fills, and gradients. No surprises.
        </p>
        <ol className="specimen" aria-label="The glyphs">
          {GLYPHS.map(({ g, name, note }) => (
            <li key={g}>
              <span className="specimen-glyph" aria-hidden="true">
                {g}
              </span>
              <span className="specimen-name">{name}</span>
              <span className="specimen-note">{note}</span>
            </li>
          ))}
        </ol>
        <ul className="extras">
          {EXTRAS.map(({ icon, text }) => (
            <li key={text}>
              <span className="extras-icon">{icon}</span>
              {text}
            </li>
          ))}
        </ul>
      </section>

      {/* ---------- pipeline ---------- */}
      <section className="section section-how" id="how">
        <h2>Two models. Strict separation of powers.</h2>
        <p className="lede">
          No model is ever trusted with geometry. Each layer does the one thing it is good at, and
          every hand-off is validated, so a hallucination becomes nothing, never a broken page.
        </p>
        <ol className="pipeline">
          {STAGES.map(({ role, name, what }, i) => (
            <li key={name}>
              <span className="stage-n" aria-hidden="true">
                {i + 1}
              </span>
              <span className="stage-role">{role}</span>
              <h3>{name}</h3>
              <p>{what}</p>
            </li>
          ))}
        </ol>
        <p className="pipeline-note">
          <strong>Zero coordinates, by design.</strong> The model never says <em>where</em>. Geometry
          always derives from your actual ink, so nothing can be misplaced. When it is not confident,
          it abstains: your ink stays ink.
        </p>
      </section>

      {/* ---------- stats ---------- */}
      <section className="section section-receipts">
        <Blob ink="celadon" className="blob-receipts" />
        <h2>We trained the brain ourselves. It beats Gemini.</h2>
        <p className="lede">
          The decision-maker is Qwen3.5-2B, LoRA-fine-tuned on FreeSolo against our own synthetic
          sketch dataset. Every number below is the untouched held-out test split, our model against
          the Gemini Flash baseline.
        </p>
        <dl className="receipts">
          <div>
            <dt>Op accuracy</dt>
            <dd>
              <b>96.7%</b> <span>vs 75.0% baseline</span>
            </dd>
          </div>
          <div>
            <dt>Detail routing</dt>
            <dd>
              <b>+33 pts</b> <span>word-in-box to label, colors to fill: 90–93.5% vs 58.7%</span>
            </dd>
          </div>
          <div>
            <dt>Night sky from a rect</dt>
            <dd>
              <b>100%</b> <span>vs 25% baseline</span>
            </dd>
          </div>
          <div>
            <dt>Abstention F1</dt>
            <dd>
              <b>0.97</b> <span>vs 0.67. It knows when to stay quiet.</span>
            </dd>
          </div>
          <div>
            <dt>Total training spend</dt>
            <dd>
              <b>under $0.25</b> <span>about 10 runs, 640 examples × 4 epochs, LoRA SFT</span>
            </dd>
          </div>
          <div>
            <dt>Broken pages possible</dt>
            <dd>
              <b>0</b> <span>0–1.7% hallucination, all caught by fail-closed validators</span>
            </dd>
          </div>
        </dl>
        <p className="footnote">
          Full eval ledger, test bank, and training configs live in the repo. Every number is
          reproducible with <code>scripts/eval-harness.ts</code>.
        </p>
      </section>

      {/* ---------- footer ---------- */}
      <footer className="footer">
        <p className="footer-line riso" data-text="Start the drawing. baio finishes the thought.">
          Start the drawing. baio finishes the thought.
        </p>
        <Link href="/studio?welcome=1" className="cta cta-primary">
          Open the studio
          <ArrowIcon />
        </Link>
        <div className="footer-meta">
          <span className="footer-brand">
            <LogoMark size={20} />
            <Logotype size={15} />
          </span>
          <span>Built at Ignition Hacks 2026</span>
          <nav className="footer-links" aria-label="Footer">
            <Link href="/studio?welcome=1">Studio</Link>
            <Link href="/gallery">Gallery</Link>
            <Link href="/labeler">Labeler</Link>
          </nav>
        </div>
      </footer>
    </main>
  )
}
