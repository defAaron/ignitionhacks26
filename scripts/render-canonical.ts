/* Pick 40 diverse train examples (seed-stable) for the human review UI
   (checkpoint 3 / labeler mode 2) and write canonical-review.json with the
   input/output already parsed.
   Run: npx tsx scripts/render-canonical.ts --dataset freesolo/dataset --n 40 --seed 7 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Rng, hashSeed } from "../lib/datagen/prng";
import { validateRow, type DatasetRow } from "../lib/datagen/build";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
}

const dir = arg("dataset", "freesolo/dataset");
const n = Number(arg("n", "40"));
const seed = Number(arg("seed", "7"));

const trainPath = join(dir, "train.jsonl");
const rows: DatasetRow[] = readFileSync(trainPath, "utf8")
  .split("\n")
  .filter((l) => l.trim().length > 0)
  .map((l) => JSON.parse(l) as DatasetRow);

// Diversity buckets: archetype × has-wait × has-color-params. Round-robin
// across buckets (seed-stable order) so the review set spans the space.
const buckets = new Map<string, { row: DatasetRow; index: number }[]>();
rows.forEach((row, index) => {
  const m = row.metadata as { archetype?: string; wait_count?: number; color_param_commands?: number };
  const key = `${m.archetype}|${(m.wait_count ?? 0) > 0 ? "wait" : "nowait"}|${(m.color_param_commands ?? 0) > 0 ? "color" : "plain"}`;
  if (!buckets.has(key)) buckets.set(key, []);
  buckets.get(key)!.push({ row, index });
});

const rng = new Rng(hashSeed(seed, 0xca90));
const bucketList = rng.shuffle([...buckets.keys()].sort()).map((k) => rng.shuffle(buckets.get(k)!));

const picked: { row: DatasetRow; index: number }[] = [];
let round = 0;
while (picked.length < Math.min(n, rows.length)) {
  let took = false;
  for (const bucket of bucketList) {
    if (picked.length >= Math.min(n, rows.length)) break;
    if (round < bucket.length) {
      picked.push(bucket[round]);
      took = true;
    }
  }
  if (!took) break;
  round++;
}

const review = picked.map(({ row, index }) => {
  const errs = validateRow(row);
  if (errs.length > 0) throw new Error(`train row ${index} invalid: ${errs.join("; ")}`);
  return {
    train_index: index,
    metadata: row.metadata,
    input: JSON.parse(row.input) as unknown,
    output: JSON.parse(row.output) as unknown,
  };
});

const outPath = join(dir, "canonical-review.json");
writeFileSync(outPath, JSON.stringify(review, null, 2) + "\n");
console.log(`Picked ${review.length} diverse train examples (${buckets.size} buckets) → ${outPath}`);
