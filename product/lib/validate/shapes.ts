/**
 * Shapes-first validator (shapes-v1/v2/v3.json contracts): schema ->
 * coverage -> semantic. `validateShapes` runs the gates in order and FAILS
 * CLOSED, exactly like the legacy `validate`. A `wave` parameter (default 2 —
 * the wave-1.5 22-op vocabulary) selects which whitelist is enforced; wave 1
 * keeps the original 16-op strictness; wave 3 keeps the 22-op whitelist but
 * enforces the CONTAINMENT semantics (shared/schemas/README.md §1.6): the ctx
 * detections carry `parent`, coverage requires exactly one command per
 * TOP-LEVEL detection and rejects commands answering child detections
 * (`child_spawned_command`), and glyph legality may come from a child glyph.
 *
 * THERE IS NO GEOMETRIC GATE ON SHAPES OUTPUT — deliberately. The builder
 * emits NO coordinates anywhere (shared/schemas/README.md §1, "the
 * no-coordinates rationale"): geometry always derives deterministically from
 * the source strokes, so placement drift is unrepresentable and there is
 * nothing geometric in the output to validate. The only geometry influence the
 * model has is the `snap` policy enum, which the SEMANTIC gate checks for
 * per-op sanity; the snap math itself is pure code in the geometry deriver.
 *
 * Gates:
 *   1. schema   — zod parse against shapesOutputSchema (mirror of
 *                 shared/schemas/shapes-v1.json).
 *   2. coverage — the 1:1 command-per-detection rule: every `from` references
 *                 a real detection (no hallucinations), no detection answered
 *                 twice, no detection unanswered.
 *   3. semantic — op legality for the source detection's kind+glyph, snap
 *                 sanity for the op, params value types (conventions from
 *                 shared/schemas/README.md "params conventions").
 */

import {
  OPS_SHAPES_V1,
  OPS_SHAPES_V2,
  shapesOutputSchema,
  shapesOutputV2Schema,
  shapesOutputV3Schema,
  type OpShapesV1,
  type OpShapesV2,
  type ShapeKind,
  type ShapesOutput,
  type SnapPolicy,
} from "../../types/schemas";

/**
 * Which shapes whitelist/semantics to enforce: 1 = shapes-v1 (16 ops), 2 =
 * shapes-v2 (wave 1.5, 22 ops — the 16 plus the diagram six), 3 = shapes-v3
 * (wave 3 CONTAINMENT: same 22-op output grammar, but coverage/legality run
 * over TOP-LEVEL detections only — ctx detections carry `parent`, children
 * never get commands, and a child glyph letter can legalize the parent's
 * glyph op). Default is 2, the live vocabulary; v1 documents are a strict
 * subset so they always pass under it. Pass 1 when validating output from a
 * wave-1-strict adapter; pass 3 only with a v3 ctx (detections carry parent).
 */
export type ShapesWave = 1 | 2 | 3;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ShapeGateName = "schema" | "coverage" | "semantic";

export interface ShapeValidationIssue {
  gate: ShapeGateName;
  /** Stable machine-readable code, e.g. "op_illegal_for_detection". */
  code: string;
  message: string;
  /** Index into output.components, when the issue is about one command. */
  command_index?: number;
  /** The command's `from` detection id, when known. */
  from?: string;
}

/**
 * Context the coverage and semantic gates check against. Structurally minimal:
 * any richer object (e.g. a full ShapeBuilderInput with its detections) can be
 * passed directly.
 */
export interface ShapeValidationCtx {
  artboard: { width: number; height: number };
  detections: ReadonlyArray<{
    id: string;
    kind: ShapeKind;
    glyph: string | null;
    /**
     * Wave-3 containment (shared/schemas/README.md §1.6): minted id of the
     * immediate enclosing detection, or null for top-level. Optional at the
     * ctx level so wave-1/2 callers (and lib/models/types.ts, which is
     * unchanged) still pass structurally; wave-3 validation treats a missing
     * value as null (top-level). Any richer object — e.g. a full
     * ShapeBuilderInputV3 — is assignable directly.
     */
    parent?: string | null;
  }>;
}

export type ShapeValidationResult =
  | { ok: true; output: ShapesOutput }
  | { ok: false; gate: ShapeGateName; issues: ShapeValidationIssue[] };

type PushFn = (code: string, message: string, index?: number, from?: string) => void;

function makePush(gate: ShapeGateName, issues: ShapeValidationIssue[]): PushFn {
  return (code, message, index, from) =>
    issues.push({
      gate,
      code,
      message,
      ...(index !== undefined ? { command_index: index } : {}),
      ...(from !== undefined ? { from } : {}),
    });
}

// ---------------------------------------------------------------------------
// Gate 1 — schema
// ---------------------------------------------------------------------------

export type ShapesSchemaGateResult =
  | { ok: true; output: ShapesOutput }
  | { ok: false; issues: ShapeValidationIssue[] };

/** Parse unknown JSON against the active wave's shapes contract. Pure.
 * (Wave 3's output grammar is byte-identical to wave 2's —
 * shapesOutputV3Schema IS shapesOutputV2Schema; the wave-3 differences live
 * in the coverage and semantic gates.) */
export function shapesSchemaGate(json: unknown, wave: ShapesWave = 2): ShapesSchemaGateResult {
  const parsed =
    wave === 1
      ? shapesOutputSchema.safeParse(json)
      : wave === 3
        ? shapesOutputV3Schema.safeParse(json)
        : shapesOutputV2Schema.safeParse(json);
  if (parsed.success) return { ok: true, output: parsed.data };
  return {
    ok: false,
    issues: parsed.error.issues.map((i) => {
      const commandIndex =
        i.path[0] === "components" && typeof i.path[1] === "number" ? i.path[1] : undefined;
      return {
        gate: "schema" as const,
        code: i.code,
        message: `${i.path.join(".") || "(root)"}: ${i.message}`,
        ...(commandIndex !== undefined ? { command_index: commandIndex } : {}),
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Gate 2 — coverage (the 1:1 rule)
// ---------------------------------------------------------------------------

/**
 * Waves 1/2: exactly one command per detection. Wave 3 (containment):
 * exactly one command per TOP-LEVEL detection (`parent` null/absent) — a
 * command whose `from` is a CHILD detection is rejected with
 * `child_spawned_command` (children are details routed into the parent's
 * params, never siblings), and only top-level detections count as missable.
 */
export function shapesCoverageGate(
  output: ShapesOutput,
  ctx: ShapeValidationCtx,
  wave: ShapesWave = 2
): ShapeValidationIssue[] {
  const issues: ShapeValidationIssue[] = [];
  const push = makePush("coverage", issues);
  const detectionIds = new Set(ctx.detections.map((d) => d.id));
  // Ids commands may legally answer: all detections (waves 1/2), or only
  // top-level detections (wave 3). Missing `parent` reads as null (top-level).
  const childIds =
    wave === 3
      ? new Set(ctx.detections.filter((d) => (d.parent ?? null) !== null).map((d) => d.id))
      : new Set<string>();
  const answerableIds = new Set([...detectionIds].filter((id) => !childIds.has(id)));
  const fromCounts = new Map<string, number>();

  output.components.forEach((cmd, i) => {
    if (childIds.has(cmd.from)) {
      push(
        "child_spawned_command",
        `command[${i}] (op "${cmd.op}") answers CHILD detection "${cmd.from}" — children are details routed into the parent's command, never commands of their own (wave-3 containment)`,
        i,
        cmd.from
      );
    } else if (!detectionIds.has(cmd.from)) {
      push(
        "unknown_from",
        `command[${i}] (op "${cmd.op}") references unknown detection "${cmd.from}" (hallucination)`,
        i,
        cmd.from
      );
    }
    fromCounts.set(cmd.from, (fromCounts.get(cmd.from) ?? 0) + 1);
  });

  for (const [from, count] of fromCounts) {
    if (count > 1 && answerableIds.has(from)) {
      push("duplicate_from", `detection "${from}" is answered by ${count} commands (must be exactly 1)`, undefined, from);
    }
  }
  for (const id of answerableIds) {
    if (!fromCounts.has(id)) {
      push(
        "missed_detection",
        `detection "${id}" has no command (must have exactly 1; use "wait" to abstain)`,
        undefined,
        id
      );
    }
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Gate 3 — semantic (op legality, snap sanity, params typing)
// ---------------------------------------------------------------------------

/** The glyph drawing book (vocabulary.md §2): box + letter -> component op.
 * NOTE: box + p (PAGE) is deliberately NOT here. `page` is not a builder op
 * (it stays out of the frozen grammar/enums — no retrain); the glyph p -> page
 * mapping is applied deterministically AFTER the model, in lib/recognize.ts,
 * keyed on the detection glyph. So a p-box validates as the unknown-glyph rect
 * fallback and is re-tagged `page` downstream. */
const GLYPH_TO_OP: Readonly<Record<string, OpShapesV1>> = {
  i: "image",
  f: "form",
  b: "button",
  n: "navbar",
  v: "video",
  "?": "placeholder",
};

/** Case-insensitive single-character glyph, else null (a word is never a glyph). */
function normalizeGlyph(glyph: string | null): string | null {
  if (glyph === null) return null;
  const g = glyph.trim().toLowerCase();
  return g.length === 1 ? g : g.length === 0 ? null : g; // multi-char = unknown glyph
}

/**
 * Which ops may legally answer a detection of this kind+glyph. `wait` is
 * always legal (calibrated abstention is never wrong at the semantic level).
 *
 * Glyphs only trigger on `rect` kind — the book's rule is "a single letter
 * alone INSIDE A BOX"; a glyph reported on any other kind is ignored.
 *
 * Wave 2 (shapes-v2, default) additionally legalizes the six diagram ops:
 * diagram composites arrive as a single kind="scribble" detection (vision
 * prompt "diagram composites" rule), so all six are legal from `scribble`;
 * `periodic_table` is also legal from a plain `rect` (a rect grid read as one
 * box). Under wave 1 they are rejected — a wave-1 adapter never learned them.
 * Wave 3 keeps the wave-2 op set unchanged (its containment semantics live in
 * the coverage/semantic gates, not here).
 */
export function legalOpsForDetection(
  det: { kind: ShapeKind; glyph: string | null },
  wave: ShapesWave = 2,
): ReadonlySet<string> {
  const diagrams = (ops: string[]): string[] => (wave >= 2 ? ops : []);
  switch (det.kind) {
    case "text_writing":
      return new Set(["text", "wait"]);
    case "rect": {
      const g = normalizeGlyph(det.glyph);
      if (g !== null) {
        const mapped = GLYPH_TO_OP[g];
        // Known glyph: the mapped component, or the rect/wait fallbacks. `rect`
        // is the safe degrade (a plain box); `placeholder` stays LEGAL only so a
        // frozen adapter that still emits it passes the gate — the interpretation
        // layer coerces that placeholder to `rect` downstream, so it never
        // surfaces (lib/interpretation/pipeline.ts). The builder decides
        // (vocabulary.md §4 "glyph is a free string").
        if (mapped) return new Set([mapped, "rect", "placeholder", "wait"]);
        // SAFETY (unreadable/unknown glyph): resolve to a plain `rect` — NEVER
        // `page` (ambiguous ink must never spawn a page) and never a surfaced
        // `placeholder` (coerced to rect downstream). `placeholder` is tolerated
        // in the set only so a frozen adapter's output still validates.
        return new Set(["rect", "placeholder", "wait"]);
      }
      // No glyph, no semantics: a plain box stays a crisp rect. A dark rect
      // may seed a night_sky band (vocabulary.md §4 position priors); a rect
      // grid may be a periodic table (wave 1.5).
      return new Set(["rect", "night_sky", ...diagrams(["periodic_table"]), "wait"]);
    }
    case "ellipse":
      return new Set(["ellipse", "wait"]);
    case "line":
      return new Set(["line", "wait"]);
    case "arrow":
      return new Set(["arrow", "wait"]);
    case "scribble":
      // The squiggle family feeds the decorative ops (vocabulary.md §4) and,
      // in wave 1.5, the diagram composites (vocabulary.md §1.5 signatures);
      // an unclassifiable scribble may also crisp to the user's own path.
      return new Set([
        "smooth_path",
        "wave_divider",
        "night_sky",
        "sparkles",
        "aurora_gradient",
        ...diagrams(["bar_chart", "pie_chart", "venn_diagram", "timeline", "periodic_table", "atomic_structure"]),
        "wait",
      ]);
    case "smooth_path":
      return new Set(["smooth_path", "wave_divider", "aurora_gradient", "wait"]);
  }
}

/**
 * Snap policies that make sense per op (shared/schemas/README.md snap table):
 * full_width_top is the navbar policy (also legal for a plain rect header band
 * / night_sky band); straighten_* only applies to line/arrow; square only to
 * area shapes from boxes/ellipses. `none` is always legal (it IS the default).
 */
const SNAPS_BY_OP: Readonly<Record<OpShapesV2, ReadonlySet<SnapPolicy>>> = {
  rect: new Set<SnapPolicy>(["none", "square", "full_width_top", "full_width_bottom", "full_width", "center_in_region"]),
  ellipse: new Set<SnapPolicy>(["none", "square", "center_in_region"]),
  line: new Set<SnapPolicy>(["none", "straighten_h", "straighten_v", "full_width"]),
  arrow: new Set<SnapPolicy>(["none", "straighten_h", "straighten_v"]),
  text: new Set<SnapPolicy>(["none", "center_in_region"]),
  smooth_path: new Set<SnapPolicy>(["none", "full_width", "center_in_region"]),
  image: new Set<SnapPolicy>(["none", "square", "center_in_region"]),
  form: new Set<SnapPolicy>(["none", "center_in_region"]),
  button: new Set<SnapPolicy>(["none", "center_in_region"]),
  navbar: new Set<SnapPolicy>(["none", "full_width_top", "full_width"]),
  video: new Set<SnapPolicy>(["none", "square", "center_in_region"]),
  placeholder: new Set<SnapPolicy>(["none", "square", "center_in_region"]),
  wave_divider: new Set<SnapPolicy>(["none", "full_width", "full_width_bottom"]),
  night_sky: new Set<SnapPolicy>(["none", "full_width", "full_width_top"]),
  sparkles: new Set<SnapPolicy>(["none", "center_in_region"]),
  aurora_gradient: new Set<SnapPolicy>(["none", "full_width", "center_in_region"]),
  // Diagram ops (wave 1.5): snap is `none` for all except timeline, which may
  // stretch full_width when very wide (same band-rule style as wave_divider).
  bar_chart: new Set<SnapPolicy>(["none", "center_in_region"]),
  pie_chart: new Set<SnapPolicy>(["none", "square", "center_in_region"]),
  venn_diagram: new Set<SnapPolicy>(["none", "center_in_region"]),
  timeline: new Set<SnapPolicy>(["none", "full_width"]),
  periodic_table: new Set<SnapPolicy>(["none", "center_in_region"]),
  atomic_structure: new Set<SnapPolicy>(["none", "square", "center_in_region"]),
};

// params typing conventions (shared/schemas/README.md §1) ---------------------

const NUMERIC_PARAM_KEYS = new Set([
  "seed", "amplitude", "layers", "density", "cluster_bias", "count", "blob_count", "blur_radius",
  // diagram knobs (wave 1.5): venn set count, timeline event count, atom shells
  "sets", "events", "shells",
]);
const BOOLEAN_PARAM_KEYS = new Set(["flip"]);
const STRING_PARAM_KEYS = new Set(["fill", "text", "label", "spread_zone"]);
const NUMBER_ARRAY_PARAM_KEYS = new Set(["size_range", "values"]);
/** `palette` may be a named palette (string) or an explicit color list. */
const STRING_OR_ARRAY_PARAM_KEYS = new Set(["palette"]);
const GRADIENT_DIRECTIONS = new Set(["down", "right", "diagonal", "radial"]);

function checkShapeParams(
  op: string,
  params: Record<string, unknown>,
  index: number,
  from: string,
  push: PushFn
): void {
  for (const [key, value] of Object.entries(params)) {
    const bad = (expected: string): void =>
      push("bad_param_type", `command[${index}] (op "${op}") params.${key} must be ${expected}, got ${Array.isArray(value) ? "array" : typeof value}`, index, from);

    if (NUMERIC_PARAM_KEYS.has(key)) {
      if (typeof value !== "number" || !Number.isFinite(value)) bad("a finite number");
    } else if (BOOLEAN_PARAM_KEYS.has(key)) {
      if (typeof value !== "boolean") bad("a boolean");
    } else if (STRING_PARAM_KEYS.has(key)) {
      if (typeof value !== "string") bad("a string");
    } else if (NUMBER_ARRAY_PARAM_KEYS.has(key)) {
      if (!Array.isArray(value) || value.some((v) => typeof v !== "number" || !Number.isFinite(v))) bad("an array of numbers");
    } else if (STRING_OR_ARRAY_PARAM_KEYS.has(key)) {
      const ok = typeof value === "string" || (Array.isArray(value) && value.every((v) => typeof v === "string"));
      if (!ok) bad("a string or array of strings");
    } else if (key === "gradient") {
      const g = value as { colors?: unknown; direction?: unknown } | null;
      const ok =
        g !== null && typeof g === "object" && !Array.isArray(g) &&
        Array.isArray(g.colors) && g.colors.length > 0 && g.colors.every((c) => typeof c === "string") &&
        typeof g.direction === "string" && GRADIENT_DIRECTIONS.has(g.direction);
      if (!ok) bad('{"colors": [<css>, ...], "direction": "down"|"right"|"diagonal"|"radial"}');
    } else if (key === "stroke") {
      const s = value as { color?: unknown; width?: unknown } | null;
      const ok =
        s !== null && typeof s === "object" && !Array.isArray(s) &&
        typeof s.color === "string" &&
        typeof s.width === "number" && Number.isFinite(s.width);
      if (!ok) bad('{"color": <css>, "width": <px>}');
    }
    // Unknown keys pass: params is an open object at the grammar level.
  }
}

export function shapesSemanticGate(
  output: ShapesOutput,
  ctx: ShapeValidationCtx,
  wave: ShapesWave = 2
): ShapeValidationIssue[] {
  const issues: ShapeValidationIssue[] = [];
  const push = makePush("semantic", issues);
  const detById = new Map(ctx.detections.map((d) => [d.id, d]));
  // Wave 3's whitelist is the wave-2 22-op set (v3 output ≡ v2 output).
  const whitelist: ReadonlySet<string> = new Set(wave === 1 ? OPS_SHAPES_V1 : OPS_SHAPES_V2);

  // Wave 3: a glyph letter INSIDE a shape is the parent's function source, so
  // op legality for a top-level detection uses its own glyph when present,
  // else the first (detection-order) immediate child's glyph. (In serving the
  // normalizer's glyph merge usually collapses the letter into the host rect
  // before containment runs, but a child carrying a glyph is still legal
  // input — e.g. a parent rect whose child is glyph "b" may legally become
  // button/placeholder/wait.)
  const childGlyphByParent = new Map<string, string>();
  if (wave === 3) {
    for (const d of ctx.detections) {
      const p = d.parent ?? null;
      if (p !== null && d.glyph !== null && !childGlyphByParent.has(p)) {
        childGlyphByParent.set(p, d.glyph);
      }
    }
  }

  output.components.forEach((cmd, i) => {
    if (cmd.op === "wait") return; // abstention is always semantically legal

    // Belt-and-braces on top of the schema gate's enum (enforcement point 1).
    if (!whitelist.has(cmd.op)) {
      push("op_not_in_whitelist", `command[${i}] op "${cmd.op}" is not in the shapes-v${wave} whitelist`, i, cmd.from);
      return;
    }

    // -- op legal for the source detection's kind+glyph ----------------------
    const det = detById.get(cmd.from);
    if (det) {
      // (unknown `from` is the coverage gate's finding, not ours; so is a
      // wave-3 child-spawned command — skip legality for child detections)
      if (wave === 3 && (det.parent ?? null) !== null) return;
      const effGlyph =
        wave === 3 && det.glyph === null ? childGlyphByParent.get(det.id) ?? null : det.glyph;
      const legal = legalOpsForDetection({ kind: det.kind, glyph: effGlyph }, wave);
      if (!legal.has(cmd.op)) {
        const glyphDesc =
          effGlyph === null
            ? "no glyph"
            : det.glyph === null
              ? `child glyph "${effGlyph}"`
              : `glyph "${effGlyph}"`;
        push(
          "op_illegal_for_detection",
          `command[${i}] op "${cmd.op}" is not legal for detection "${cmd.from}" (kind "${det.kind}", ${glyphDesc}); legal: ${[...legal].join(", ")}`,
          i,
          cmd.from
        );
      }
    }

    // -- snap sanity for the op ----------------------------------------------
    if (cmd.snap !== undefined && !SNAPS_BY_OP[cmd.op].has(cmd.snap)) {
      push(
        "bad_snap_for_op",
        `command[${i}] snap "${cmd.snap}" is not sane for op "${cmd.op}"; allowed: ${[...SNAPS_BY_OP[cmd.op]].join(", ")}`,
        i,
        cmd.from
      );
    }

    // -- params value types --------------------------------------------------
    if (cmd.params) checkShapeParams(cmd.op, cmd.params, i, cmd.from, push);
  });

  return issues;
}

// ---------------------------------------------------------------------------
// validateShapes — the fail-closed pipeline
// ---------------------------------------------------------------------------

/**
 * Validate raw shapes-mode builder output against the active wave's shapes
 * contract (default: shapes-v2, the 22-op wave-1.5 whitelist — pass wave 1 for
 * v1-strict validation, wave 3 for the containment semantics with a ctx whose
 * detections carry `parent`) and the request context. Pure; never throws on
 * bad input — bad input is the point. (No geometric gate: the output carries
 * no coordinates — see the module comment.)
 */
export function validateShapes(
  output: unknown,
  ctx: ShapeValidationCtx,
  wave: ShapesWave = 2
): ShapeValidationResult {
  const schema = shapesSchemaGate(output, wave);
  if (!schema.ok) return { ok: false, gate: "schema", issues: schema.issues };

  const coverageIssues = shapesCoverageGate(schema.output, ctx, wave);
  if (coverageIssues.length > 0) return { ok: false, gate: "coverage", issues: coverageIssues };

  const semanticIssues = shapesSemanticGate(schema.output, ctx, wave);
  if (semanticIssues.length > 0) return { ok: false, gate: "semantic", issues: semanticIssues };

  return { ok: true, output: schema.output };
}
