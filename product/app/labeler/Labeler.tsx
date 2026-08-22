"use client";

import { useEffect, useRef, useState } from "react";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  COLOR_RELEVANT_OPS,
  LABELS,
  PALETTE,
  PHASE1_COUNT,
  PHASE1_OPS,
  STYLE_CYCLE,
} from "@/lib/labeler/labels";
import { randomGuideBox, type GuideBox } from "@/lib/labeler/guides";
import {
  EMPTY_COUNTS,
  checklistDone,
  isNonBlack,
  type LabelCounts,
  type LabelRecord,
  type LabelsGetResponse,
  type Stroke,
} from "@/lib/labeler/types";
import LabelMenu from "./LabelMenu";

const STROKE_WIDTH = 3;
const ERASE_RADIUS = 14;

type Mode = "idle" | "draw" | "erase";

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function strokeSvgFragment(s: Stroke): string {
  if (s.points.length === 1) {
    const p = s.points[0];
    return `<circle cx="${p.x}" cy="${p.y}" r="${s.width / 2}" fill="${s.color}"/>`;
  }
  const pts = s.points.map((p) => `${p.x},${p.y}`).join(" ");
  return `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="${s.width}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

/** Serialize the drawing to an SVG string, rasterize via <canvas>, return base64 PNG. */
async function renderPngBase64(strokes: Stroke[]): Promise<string> {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" ` +
    `viewBox="0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}">` +
    `<rect width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" fill="#ffffff"/>` +
    strokes.map(strokeSvgFragment).join("") +
    `</svg>`;
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("SVG rasterization failed"));
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  });
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.drawImage(img, 0, 0);
  return canvas.toDataURL("image/png").split(",")[1];
}

function StrokeShape({ s }: { s: Stroke }) {
  if (s.points.length === 1) {
    const p = s.points[0];
    return <circle cx={p.x} cy={p.y} r={s.width / 2} fill={s.color} />;
  }
  return (
    <polyline
      points={s.points.map((p) => `${p.x},${p.y}`).join(" ")}
      fill="none"
      stroke={s.color}
      strokeWidth={s.width}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

export default function Labeler() {
  const [labelIndex, setLabelIndex] = useState(0);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [current, setCurrent] = useState<Stroke | null>(null);
  const [colorIdx, setColorIdx] = useState(0);
  const [drawing, setDrawing] = useState(false);
  const [erasing, setErasing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [guide, setGuide] = useState<GuideBox | null>(null); // set on mount (Math.random ≠ SSR-safe)
  const [counts, setCounts] = useState<Record<string, LabelCounts>>({});
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const strokeSeq = useRef(0);
  const strokeStart = useRef(0);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const label = LABELS[labelIndex];
  const labelCounts = counts[label.op] ?? EMPTY_COUNTS;
  const nextStyle = STYLE_CYCLE[labelCounts.saves % 3];
  const nextSplit = labelCounts.saves % 2 === 0 ? "calibration" : "golden";
  const colorRelevant = COLOR_RELEVANT_OPS.includes(label.op);
  const mode: Mode = erasing ? "erase" : drawing ? "draw" : "idle";
  const phase1Done = PHASE1_OPS.filter((op) =>
    checklistDone(counts[op], COLOR_RELEVANT_OPS.includes(op))
  ).length;

  const showFlash = (msg: string) => {
    setFlash(msg);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 2600);
  };

  const refreshCounts = async () => {
    try {
      const res = await fetch("/api/labels");
      if (!res.ok) return;
      const data = (await res.json()) as LabelsGetResponse;
      setCounts(data.counts);
    } catch {
      /* offline dev — ignore */
    }
  };

  useEffect(() => {
    setGuide(randomGuideBox(LABELS[0].op));
    void refreshCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearCanvas = () => {
    setStrokes([]);
    setCurrent(null);
    setDrawing(false);
    strokeSeq.current = 0;
  };

  const gotoLabel = (i: number) => {
    clearCanvas(); // unsaved ink must never carry across labels
    setLabelIndex(i);
    setGuide(randomGuideBox(LABELS[i].op));
    setMenuOpen(false);
  };

  const beginStroke = () => {
    setDrawing(true);
    strokeStart.current = performance.now();
    const stroke: Stroke = {
      id: `s${strokeSeq.current++}`,
      points: cursor ? [{ x: round1(cursor.x), y: round1(cursor.y), t: 0 }] : [],
      color: PALETTE[colorIdx].hex,
      width: STROKE_WIDTH,
    };
    setCurrent(stroke);
  };

  const commitStroke = () => {
    if (current && current.points.length > 0) {
      setStrokes((prev) => [...prev, current]);
    }
    setCurrent(null);
    setDrawing(false);
  };

  const save = async () => {
    if (!guide) return;
    const all = current && current.points.length > 0 ? [...strokes, current] : strokes;
    if (all.length === 0) {
      showFlash("nothing to save — hold D and draw first");
      return;
    }
    const def = LABELS[labelIndex];
    const n = (counts[def.op] ?? EMPTY_COUNTS).saves;
    const id = crypto.randomUUID();
    const record: LabelRecord = {
      id,
      label: def.op,
      phase: def.phase,
      split: n % 2 === 0 ? "calibration" : "golden",
      guide_bbox: guide,
      canvas: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
      strokes: all,
      colors_used: [...new Set(all.map((s) => s.color))],
      style_prompt: STYLE_CYCLE[n % 3],
      png_path: `data/labels/png/${id}.png`,
      created_at: new Date().toISOString(),
    };

    // optimistic progress update, canvas clears immediately so blitzing never waits
    setCounts((prev) => {
      const pc = prev[def.op] ?? EMPTY_COUNTS;
      return {
        ...prev,
        [def.op]: {
          saves: pc.saves + 1,
          sloppy: pc.sloppy + (record.style_prompt === "sloppy" ? 1 : 0),
          neat: pc.neat + (record.style_prompt === "neat" ? 1 : 0),
          free: pc.free + (record.style_prompt === "free" ? 1 : 0),
          nonBlack: pc.nonBlack + (record.colors_used.some(isNonBlack) ? 1 : 0),
          calibration: pc.calibration + (record.split === "calibration" ? 1 : 0),
          golden: pc.golden + (record.split === "golden" ? 1 : 0),
        },
      };
    });
    clearCanvas();
    setGuide(randomGuideBox(def.op));

    try {
      const png_base64 = await renderPngBase64(all);
      const res = await fetch("/api/labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...record, png_base64 }),
      });
      if (!res.ok) throw new Error(`POST /api/labels → ${res.status}`);
      showFlash(`saved ${def.op} #${n + 1} · ${record.split} · ${record.style_prompt}`);
    } catch (err) {
      console.error(err);
      showFlash("SAVE FAILED — record not written");
      void refreshCounts(); // roll back optimistic count to server truth
    }
  };

  // ── keyboard (handlers stay fresh via refs; listeners attach once) ──
  const onKeyDown = (e: KeyboardEvent) => {
    if (menuOpen) {
      if (e.key === "Escape") {
        e.preventDefault();
        setMenuOpen(false);
      }
      return; // no other shortcuts while the menu is open
    }
    if (e.key === "Tab") {
      e.preventDefault(); // keep browser focus where it is
      gotoLabel((labelIndex + 1) % LABELS.length);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      void save();
      return;
    }
    if (e.key === "Backspace") {
      e.preventDefault();
      clearCanvas();
      showFlash("canvas cleared (not saved)");
      return;
    }
    if (/^[1-9]$/.test(e.key)) {
      const idx = Number(e.key) - 1;
      setColorIdx(idx);
      showFlash(`ink: ${PALETTE[idx].name}`);
      return;
    }
    const k = e.key.toLowerCase();
    if (k === "d" && !e.repeat && !erasing) {
      beginStroke();
    } else if (k === "e" && !e.repeat) {
      commitStroke(); // eraser interrupts any in-flight stroke
      setErasing(true);
    }
  };

  const onKeyUp = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (k === "d") commitStroke();
    else if (k === "e") setErasing(false);
  };

  const keyDownRef = useRef(onKeyDown);
  const keyUpRef = useRef(onKeyUp);
  keyDownRef.current = onKeyDown;
  keyUpRef.current = onKeyUp;

  useEffect(() => {
    const kd = (e: KeyboardEvent) => keyDownRef.current(e);
    const ku = (e: KeyboardEvent) => keyUpRef.current(e);
    const blur = () => {
      keyUpRef.current(new KeyboardEvent("keyup", { key: "d" }));
      keyUpRef.current(new KeyboardEvent("keyup", { key: "e" }));
    };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      window.removeEventListener("blur", blur);
    };
  }, []);

  // ── pointer ──
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const x = Math.min(Math.max(((e.clientX - r.left) / r.width) * CANVAS_WIDTH, 0), CANVAS_WIDTH);
    const y = Math.min(Math.max(((e.clientY - r.top) / r.height) * CANVAS_HEIGHT, 0), CANVAS_HEIGHT);
    setCursor({ x, y });

    if (erasing) {
      setStrokes((prev) =>
        prev.filter(
          (s) => !s.points.some((q) => Math.hypot(q.x - x, q.y - y) <= ERASE_RADIUS)
        )
      );
      return;
    }
    if (drawing) {
      if (!current) {
        setCurrent({
          id: `s${strokeSeq.current++}`,
          points: [{ x: round1(x), y: round1(y), t: 0 }],
          color: PALETTE[colorIdx].hex,
          width: STROKE_WIDTH,
        });
        return;
      }
      const last = current.points[current.points.length - 1];
      if (!last || Math.hypot(x - last.x, y - last.y) >= 1) {
        const t = Math.round(performance.now() - strokeStart.current);
        setCurrent({
          ...current,
          points: [...current.points, { x: round1(x), y: round1(y), t }],
        });
      }
    }
  };

  const modeBadge =
    mode === "draw"
      ? { text: "✏ DRAWING (D held)", bg: "#166534", fg: "#bbf7d0" }
      : mode === "erase"
        ? { text: "⌫ ERASING (E held)", bg: "#7f1d1d", fg: "#fecaca" }
        : { text: "pen up — hold D to ink", bg: "#1f2532", fg: "#8b93a7" };

  const check = (ok: boolean) => (
    <span style={{ color: ok ? "#4ade80" : "#5a6275", marginRight: 6 }}>{ok ? "✓" : "○"}</span>
  );

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        background: "#0e1118",
        color: "#e6e9f0",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        overflow: "hidden",
      }}
    >
      {/* ── canvas area ── */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
          position: "relative",
          minWidth: 0,
        }}
      >
        <div style={{ position: "relative", width: "100%", maxWidth: 1024 }}>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
            style={{
              display: "block",
              width: "100%",
              aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}`,
              background: "#ffffff",
              borderRadius: 8,
              cursor: "none",
              boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
            }}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setCursor(null)}
          >
            {guide && (
              <g>
                <rect
                  x={guide.x}
                  y={guide.y}
                  width={guide.width}
                  height={guide.height}
                  fill="none"
                  stroke="#6b8afd"
                  strokeWidth={2}
                  strokeDasharray="10 7"
                  rx={6}
                />
                <text x={guide.x + 8} y={guide.y + 18} fill="#93a8fd" fontSize={13}>
                  draw «{label.op}» in here
                </text>
              </g>
            )}
            {strokes.map((s) => (
              <StrokeShape key={s.id} s={s} />
            ))}
            {current && <StrokeShape s={current} />}
            {cursor &&
              (mode === "erase" ? (
                <circle
                  cx={cursor.x}
                  cy={cursor.y}
                  r={ERASE_RADIUS}
                  fill="rgba(220,38,38,0.12)"
                  stroke="#dc2626"
                  strokeWidth={1.5}
                />
              ) : (
                <g>
                  <circle
                    cx={cursor.x}
                    cy={cursor.y}
                    r={mode === "draw" ? 4 : 6}
                    fill={mode === "draw" ? PALETTE[colorIdx].hex : "none"}
                    stroke={PALETTE[colorIdx].hex}
                    strokeWidth={1.5}
                  />
                  {mode === "idle" && (
                    <circle cx={cursor.x} cy={cursor.y} r={1.5} fill={PALETTE[colorIdx].hex} />
                  )}
                </g>
              ))}
          </svg>

          {/* mode badge over the canvas */}
          <div
            style={{
              position: "absolute",
              top: 10,
              left: 10,
              padding: "4px 12px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 700,
              background: modeBadge.bg,
              color: modeBadge.fg,
              pointerEvents: "none",
            }}
          >
            {modeBadge.text}
          </div>

          {flash && (
            <div
              style={{
                position: "absolute",
                bottom: 12,
                left: "50%",
                transform: "translateX(-50%)",
                background: "#1f2532",
                border: "1px solid #3a4152",
                borderRadius: 999,
                padding: "6px 16px",
                fontSize: 13,
                pointerEvents: "none",
                whiteSpace: "nowrap",
              }}
            >
              {flash}
            </div>
          )}
        </div>
      </div>

      {/* ── sidebar ── */}
      <aside
        style={{
          width: 320,
          flexShrink: 0,
          background: "#151922",
          borderLeft: "1px solid #2a3040",
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 14,
          overflowY: "auto",
          fontSize: 13,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={(e) => {
              setMenuOpen(true);
              e.currentTarget.blur(); // keep Enter meaning "save", not "re-open menu"
            }}
            title="label menu"
            style={{
              fontSize: 20,
              background: "#1f2532",
              color: "#e6e9f0",
              border: "1px solid #3a4152",
              borderRadius: 8,
              width: 40,
              height: 36,
              cursor: "pointer",
            }}
          >
            ☰
          </button>
          <div>
            <div style={{ fontWeight: 700 }}>baio Labeler</div>
            <div style={{ color: "#8b93a7", fontSize: 11 }}>blitz mode · hold-to-draw</div>
          </div>
        </div>

        {/* current label */}
        <div style={{ background: "#1a1f2b", borderRadius: 10, padding: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 19, fontWeight: 800 }}>{label.op}</span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: "2px 8px",
                borderRadius: 999,
                background: label.phase === 1 ? "#1e3a5f" : "#2a3040",
                color: label.phase === 1 ? "#7cc7ff" : "#8b93a7",
              }}
            >
              PHASE {label.phase}
            </span>
          </div>
          <div style={{ color: "#8b93a7", marginTop: 4 }}>{label.sketchHint}</div>
          <div style={{ color: "#5a6275", fontSize: 11, marginTop: 2 }}>{label.group}</div>
          <div style={{ marginTop: 10, display: "flex", gap: 14 }}>
            <span>
              saves <strong>{labelCounts.saves}</strong>
            </span>
            <span style={{ color: "#8b93a7" }}>next split: {nextSplit}</span>
          </div>
        </div>

        {/* style prompt for this rep */}
        <div
          style={{
            borderRadius: 10,
            padding: "10px 12px",
            background:
              nextStyle === "sloppy" ? "#4a2510" : nextStyle === "neat" ? "#12324a" : "#1f2532",
            border: "1px solid #3a4152",
          }}
        >
          <div style={{ fontSize: 11, color: "#8b93a7", textTransform: "uppercase", letterSpacing: 1 }}>
            this rep, draw it
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>
            {nextStyle.toUpperCase()}
            <span style={{ fontSize: 11, fontWeight: 400, color: "#8b93a7", marginLeft: 8 }}>
              (cycle: sloppy → neat → free)
            </span>
          </div>
        </div>

        {/* variation checklist */}
        <div style={{ background: "#1a1f2b", borderRadius: 10, padding: 12 }}>
          <div style={{ fontSize: 11, color: "#8b93a7", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
            variation checklist
          </div>
          <div>{check(labelCounts.saves >= 3)}≥3 saves ({Math.min(labelCounts.saves, 3)}/3)</div>
          <div>{check(labelCounts.sloppy >= 1)}≥1 «sloppy» pass</div>
          <div>{check(labelCounts.neat >= 1)}≥1 «neat» pass</div>
          {colorRelevant && (
            <div>{check(labelCounts.nonBlack >= 1)}≥1 save with non-black ink</div>
          )}
          {checklistDone(labelCounts, colorRelevant) && (
            <div style={{ color: "#4ade80", fontWeight: 700, marginTop: 6 }}>
              label complete — Tab onward!
            </div>
          )}
        </div>

        {/* palette */}
        <div style={{ background: "#1a1f2b", borderRadius: 10, padding: 12 }}>
          <div style={{ fontSize: 11, color: "#8b93a7", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
            ink — keys 1–9
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {PALETTE.map((c, i) => (
              <button
                key={c.hex}
                onClick={(e) => {
                  setColorIdx(i);
                  e.currentTarget.blur();
                }}
                title={`${i + 1} — ${c.name}`}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  background: c.hex,
                  cursor: "pointer",
                  border: i === colorIdx ? "3px solid #ffffff" : "1px solid #3a4152",
                  boxShadow: i === colorIdx ? "0 0 0 2px #6b8afd" : "none",
                  color: "#fff",
                  fontSize: 10,
                  lineHeight: 1,
                  padding: 0,
                }}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </div>

        {/* overall progress */}
        <div style={{ background: "#1a1f2b", borderRadius: 10, padding: 12 }}>
          <div style={{ fontSize: 11, color: "#8b93a7", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
            phase-1 progress
          </div>
          <div style={{ fontWeight: 800, fontSize: 16 }}>
            {phase1Done}/{PHASE1_COUNT} labels complete
          </div>
          <div
            style={{
              marginTop: 8,
              height: 8,
              borderRadius: 999,
              background: "#2a3040",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${(phase1Done / PHASE1_COUNT) * 100}%`,
                height: "100%",
                background: "#4ade80",
                transition: "width 0.3s",
              }}
            />
          </div>
        </div>

        {/* key help */}
        <div style={{ color: "#8b93a7", fontSize: 12, lineHeight: 1.8, marginTop: "auto" }}>
          <div><b style={{ color: "#e6e9f0" }}>hold D</b> ink flows (mouse just moves the pen)</div>
          <div><b style={{ color: "#e6e9f0" }}>hold E</b> eraser (removes whole strokes)</div>
          <div><b style={{ color: "#e6e9f0" }}>1–9</b> ink color</div>
          <div><b style={{ color: "#e6e9f0" }}>Enter</b> save + clear, same label</div>
          <div><b style={{ color: "#e6e9f0" }}>Backspace</b> clear, no save</div>
          <div><b style={{ color: "#e6e9f0" }}>Tab</b> next label · <b style={{ color: "#e6e9f0" }}>☰</b> jump anywhere</div>
        </div>
      </aside>

      {menuOpen && (
        <LabelMenu
          currentIndex={labelIndex}
          counts={counts}
          onSelect={gotoLabel}
          onClose={() => setMenuOpen(false)}
        />
      )}
    </div>
  );
}
