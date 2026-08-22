/* Generate the shapes WAVE-3.1 synthetic dataset (train/eval/test JSONL + coverage report).
   Run: npx tsx scripts/generate-dataset.ts --n 800 --seed 48 --out freesolo/dataset
   Every pair is validated (shapeBuilderInputV31Schema — v3 + optional
   `composite`, README §1.7 — shapesOutputV3Schema, one-command-per-TOP-LEVEL-
   detection coverage, zero child-spawned commands, parent-link geometric
   parity with the §1.6 containment rules, no geometry in output); the run
   HARD-FAILS if any pair is invalid or any quota (all 22 ops ≥10, snaps ≥10,
   ~25% wait, ≥30% color, detail routing ≥80, night_sky-from-rect ≥15, style
   words ≥90 / theme-on-glyph ≥45 / descriptor-only ≥60 (wave 3.1b: tripled),
   composite hint→op ≥50 / hinted-wait ≥24 (doubled), common labels ≥120 —
   train, at n=800) is unmet. */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SPLITS, buildDataset, validateRow, type CoverageReport, type Split } from "../lib/datagen/build";
import { OPS_SHAPES_V3, SNAP_POLICIES_V1 } from "../types/schemas";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
}

const n = Number(arg("n", "800"));
const seed = Number(arg("seed", "47"));
const out = arg("out", "freesolo/dataset");
if (!Number.isInteger(n) || n < 5) {
  console.error("--n must be an integer >= 5");
  process.exit(1);
}
if (!Number.isInteger(seed)) {
  console.error("--seed must be an integer");
  process.exit(1);
}

console.log(`Generating n=${n} seed=${seed} → ${out}/`);
const { rows, splits, report } = buildDataset({ n, seed });

// -- Validate EVERY pair; hard-fail on any error ------------------------------
let bad = 0;
rows.forEach((row, i) => {
  const errs = validateRow(row);
  if (errs.length > 0) {
    bad++;
    if (bad <= 10) console.error(`INVALID example ${i}: ${errs.join("; ")}`);
  }
});
if (bad > 0) {
  console.error(`\n${bad}/${rows.length} pairs invalid — aborting, nothing written.`);
  process.exit(1);
}
console.log(`All ${rows.length} pairs valid.`);

// -- Write split files --------------------------------------------------------
mkdirSync(out, { recursive: true });
for (const split of SPLITS) {
  const lines = rows
    .filter((_, i) => splits[i] === split)
    .map((r) => JSON.stringify(r))
    .join("\n");
  writeFileSync(join(out, `${split}.jsonl`), lines + "\n");
}

// -- Coverage report ----------------------------------------------------------
function printReport(r: CoverageReport): void {
  const pct = (a: number, b: number) => `${((100 * a) / Math.max(1, b)).toFixed(1)}%`;
  console.log(
    "\n== baio shapes-v3.1 (containment + composite/style/label densification) synthetic dataset — coverage report ==",
  );
  console.log(
    `n=${r.n}  seed=${r.seed}  splits: train=${r.splitSizes.train} eval=${r.splitSizes.eval} test=${r.splitSizes.test}`,
  );
  console.log(
    `detections total: ${r.detections}   quotas (train): op >=${r.minPerOpTrain}, snap >=${r.minPerSnapTrain}, ` +
      `detail-routing >=${r.minDetailRoutingTrain} (both >=${r.minBothRoutingTrain}), night_sky-from-rect >=${r.minNightSkyFromRectTrain}\n`,
  );

  console.log("  op                train  total       snap policy        train  total");
  console.log("  ----------------  -----  -----       -----------------  -----  -----");
  const snapRows = [...SNAP_POLICIES_V1];
  for (let i = 0; i < OPS_SHAPES_V3.length; i++) {
    const op = OPS_SHAPES_V3[i];
    const c = r.opCounts[op];
    let line = `  ${op.padEnd(16)}  ${String(c.train).padStart(5)}  ${String(c.total).padStart(5)}`;
    if (i < snapRows.length) {
      const s = snapRows[i];
      const sc = r.snapCounts[s];
      line += `       ${s.padEnd(17)}  ${String(sc.train).padStart(5)}  ${String(sc.total).padStart(5)}`;
    }
    console.log(line);
  }
  console.log(
    `\n  wait: ${r.waitExamples}/${r.n} examples contain >=1 wait (${pct(r.waitExamples, r.n)}); ` +
      `${r.waitCommands} wait commands (reasons: ${Object.entries(r.waitReasons)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ")})`,
  );
  console.log(
    `  color/gradient params: ${r.colorParamExamples}/${r.n} examples (${pct(r.colorParamExamples, r.n)}); ` +
      `${r.fillCommands} fill + ${r.gradientCommands} gradient commands`,
  );
  const d = r.depthCounts;
  console.log(
    `  nesting: ${r.nestedExamples}/${r.n} examples contain >=1 parent link (${pct(r.nestedExamples, r.n)}); ` +
      `${r.childDetections} child detections; depth 0=${d.d0}  1=${d.d1}  2+=${d.d2plus}`,
  );
  const dr = r.detailRouting;
  console.log(
    `  detail routing (examples, train/total): label=${dr.labelRouted.train}/${dr.labelRouted.total}  ` +
      `fill=${dr.fillRouted.train}/${dr.fillRouted.total}  gradient=${dr.gradientRouted.train}/${dr.gradientRouted.total}  ` +
      `both-on-one-command=${dr.both.train}/${dr.both.total}`,
  );
  console.log(
    `  night_sky from rect (commands, train/total): ${r.nightSkyFromRect.train}/${r.nightSkyFromRect.total}`,
  );
  const sd = r.styleDescriptor;
  console.log(
    `  style descriptors (examples, train/total): color-word=${sd.colorWord.train}/${sd.colorWord.total}  ` +
      `theme-word=${sd.themeWord.train}/${sd.themeWord.total}  theme-on-glyph=${sd.themeOnGlyph.train}/${sd.themeOnGlyph.total}  ` +
      `mixed=${sd.mixed.train}/${sd.mixed.total}  descriptor-only=${sd.descriptorOnly.train}/${sd.descriptorOnly.total}`,
  );
  console.log(
    `    brand-guard=${sd.brandGuard.train}/${sd.brandGuard.total}  ink-override=${sd.inkOverride.train}/${sd.inkOverride.total}  ` +
      `child-sourced=${sd.childSourced.train}/${sd.childSourced.total}  ` +
      `(quotas: word >=${r.minStyleWordTrain}, theme-glyph >=${r.minThemeGlyphTrain}, mixed >=${r.minStyleMixTrain}, ` +
      `only >=${r.minStyleOnlyTrain}, guard >=${r.minStyleGuardTrain})`,
  );
  const co = r.composite;
  console.log(
    `  composite hints: ${co.hintDetections} detections; examples hint->op=${co.commandExamples.train}/${co.commandExamples.total} ` +
      `(>=${r.minCompositeCommandTrain})  hinted-but-wait=${co.waitExamples.train}/${co.waitExamples.total} ` +
      `(>=${r.minCompositeWaitTrain})  ignored-non-scribble=${co.ignoredNonScribble}`,
  );
  console.log(
    `  common labels (16 words): ${r.commonLabelExamples.train}/${r.commonLabelExamples.total} examples ` +
      `(>=${r.minCommonLabelTrain} train), ${r.commonLabelCommands} commands`,
  );
  console.log(
    "  detection kinds: " +
      Object.entries(r.kindCounts)
        .map(([k, v]) => `${k}=${v}`)
        .join("  "),
  );
  console.log(
    "  archetypes: " +
      Object.entries(r.archetypes)
        .map(([k, v]) => `${k}=${v}`)
        .join("  "),
  );
}
printReport(report);

const sizes = SPLITS.map((s: Split) => `${s}.jsonl (${report.splitSizes[s]})`).join(", ");
console.log(`\nWrote ${sizes} to ${out}/`);
