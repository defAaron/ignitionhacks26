# baio — Label Tree (shapes-first)

The complete label set, phased. Companion to `vocabulary.md` (the 16-op tables, glyph book, disambiguation rules) and `ai-pipeline.md` §6 (labeler tool).

**Legend:**
`●` = **Phase 1** — the shapes-v1 16: label these first, submit, wave-1 training launches
`◐` = **Wave 1.5** — the six diagram ops promoted into the live shapes-v2 grammar (2026-07-19); labeled with the phase-2 pool but already builder-emittable
`○` = **Phase 2** — the bench: remaining web-ui components, remaining decorative, remaining diagrams; label while wave 1 trains
`†` = hard-to-render flag (renderer risk, may slip to a later wave)

This tree is the source for the labeler's **hamburger menu** (☰): same grouping, phase-marked, ordered within each group by expected drawing volume (`vocabulary.md` §3). Number keys in the labeler are ink colors, not label jumps.

```text
baio-labels
│
├── base shapes (6)
│   ├── ● rect                    four roughly straight sides, roughly closed
│   ├── ● ellipse                 closed convex roundish curve
│   ├── ● line                    single open low-curvature stroke
│   ├── ● arrow                   line with chevron/triangle head at one end
│   ├── ● text                    handwriting — a word, phrase, or sentence
│   └── ● smooth_path             freeform closed/open doodle, kept as drawn (smoothed)
│
├── glyph components (6) ── a single letter alone inside a box
│   ├── ● image                   box + i
│   ├── ● form                    box + f
│   ├── ● button                  box + b
│   ├── ● navbar                  box + n
│   ├── ● video                   box + v
│   └── ● placeholder             box + ?
│
├── decorative (4)
│   ├── ● wave_divider            long free curved-crest squiggle at section edge
│   ├── ● night_sky               dark rect + scattered dots/asterisks (gradient + starfield)
│   ├── ● sparkles                small 4-point asterisk scribbles near text
│   └── ● aurora_gradient         loose overlapping scribbled ovals in hero region
│
└── bench (Phase 2)
    ├── web-ui components (20) ── future glyphs / composite recognition
    │   ├── ○ footer              ○ card                ○ card_grid           ○ hero
    │   ├── ○ search_bar          ○ dropdown            ○ text_input          ○ cta_banner
    │   ├── ○ tabs                ○ modal               ○ accordion           ○ carousel
    │   ├── ○ table               ○ sidebar             ○ testimonial         ○ logo_cloud
    │   └── ○ newsletter_signup   ○ pricing_table       ○ image_gallery       ○ map
    ├── decorative (15)
    │   ├── ○ dot_grid            ○ grid_lines          ○ hero_glow           ○ layered_waves
    │   ├── ○ hand_drawn_underline  ○ hand_drawn_highlight  ○ shape_scatter   ○ confetti
    │   ├── ○ concentric_rings    ○ squiggle_accents    ○ landscape_silhouette
    │   └── ○ tiled_pattern       ○ noise_grain         ○ topo_contours †     ○ low_poly_mesh †
    └── diagrams (22 — 6 promoted ◐, 16 benched ○)
        ├── ◐ bar_chart 1.5       ◐ venn_diagram 1.5    ○ flowchart ★         ◐ timeline 1.5
        ├── ○ line_chart          ◐ pie_chart 1.5       ◐ periodic_table 1.5  ◐ atomic_structure 1.5
        ├── ○ table_grid          ○ org_chart           ○ quadrant_chart      ○ scatter_plot
        ├── ○ funnel_chart        ○ cycle_diagram       ○ pyramid_chart       ○ coordinate_plane
        ├── ○ mind_map            ○ gantt_chart         ○ sequence_diagram †  ○ block_diagram †
        └── ○ state_diagram †     ○ er_diagram †
```

**Totals:** Phase 1: **16** (6 base + 6 glyph + 4 decorative) · Wave 1.5 promoted: **6** diagrams (shapes-v2 = 16 + 6 = **22** grammar-live ops; `periodic_table` and `atomic_structure` are new — they were never on the original bench) · Phase 2 bench: **51** remaining (20 web-ui + 15 decorative + 16 diagrams). Wave 2 freezes its own whitelist from the bench before any wave-2 data generation (rule zero); bench membership is a backlog, not a schema.

**Wave-1.5 recognition note:** the six promoted diagrams are recognized as **composites** — vision reports an obvious diagram cluster as ONE `kind: "scribble"` detection; the builder maps it via the bbox/color signature thresholds in `vocabulary.md` §1.5 (POLICY, `lib/datagen/scenes.ts`), kept disjoint from the four decorative scribble signatures.

## Not ops (absorbed — never label these as standalone)

| You might draw | It belongs to |
|---|---|
| heading / paragraph / any word or sentence | `text` — a word is content; only a *single letter alone in a box* is a glyph |
| blob (rough closed potato doodle) | `smooth_path` with a gradient fill |
| rect with X through it | a `rect` + two `line`s, exactly as drawn — the X-box convention is retired; draw box + `i` for `image` |
| hand-drawn arrow accent | the `arrow` base shape |
| checkbox / radio / toggle / slider | strokes inside a `form` glyph box |
| hamburger (3 stacked lines) | a `navbar` state |
| stats row / team section / feature grid | bench `card_grid` (Phase 2) |
| icon / badge / tag / avatar | rides inside components; too small to classify |
| breadcrumb / pagination | bench, not v-anything yet |

## Labeling flow (matches ai-pipeline.md §6)

```text
Phase 1: blitz the 16  (☰ menu / Tab to pick labels; hold-D draw, E erase, 1–9 colors)
   → submit → calibration + synthetic generation + wave-1 sweep launches
     (wave 1 trains against shapes-v1.json — the 16-op schema)
Phase 2: blitz the bench while wave 1 trains
   → wave-2 whitelist frozen from the bench → wave-2 dataset → wave-2 sweep
```

Each wave freezes its own op whitelist before data generation (rule zero). `†` items may ship as recognition-only (classified but rendered with a placeholder) if their renderers slip.
