/**
 * Seeded PRNG utilities for the synthetic data generator.
 * Everything downstream of a seed must be deterministic — never Math.random.
 */

/** mulberry32 — small, fast, good-enough 32-bit PRNG. Returns a () => [0,1) stream. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mix two integers into one 32-bit seed (for per-example sub-streams). */
export function hashSeed(a: number, b = 0): number {
  let h = (a ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ ((b + 0x85ebca6b) >>> 0), 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x2c1b3c6d) >>> 0;
  h ^= h >>> 13;
  return h >>> 0;
}

/** Convenience wrapper with the sampling helpers the generator needs. */
export class Rng {
  private u: () => number;

  constructor(seed: number) {
    this.u = mulberry32(seed >>> 0);
  }

  /** Uniform [0,1). */
  next(): number {
    return this.u();
  }

  /** Uniform [min, max). */
  float(min: number, max: number): number {
    return min + (max - min) * this.u();
  }

  /** Uniform integer in [min, max], inclusive. */
  int(min: number, max: number): number {
    if (max < min) max = min;
    return Math.floor(this.float(min, max + 1));
  }

  /** True with probability p. */
  chance(p: number): boolean {
    return this.u() < p;
  }

  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error("Rng.pick on empty array");
    return arr[this.int(0, arr.length - 1)];
  }

  /** Fisher–Yates on a copy; input untouched. */
  shuffle<T>(arr: readonly T[]): T[] {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      const tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  }

  /** Fresh positive int, e.g. for decorative `params.seed`. */
  seed(): number {
    return this.int(1, 2147483646);
  }
}
