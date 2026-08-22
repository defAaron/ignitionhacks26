import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { z } from "zod";
import { LABELS } from "@/lib/labeler/labels";
import {
  EMPTY_COUNTS,
  isNonBlack,
  type LabelCounts,
  type LabelsGetResponse,
} from "@/lib/labeler/types";

export const runtime = "nodejs";

const DATA_DIR = path.join(process.cwd(), "data", "labels");
const PNG_DIR = path.join(DATA_DIR, "png");
const JSONL_PATH = path.join(DATA_DIR, "labels.jsonl");

const VALID_OPS = new Set(LABELS.map((l) => l.op));

const bboxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
});

const strokeSchema = z.object({
  id: z.string(),
  points: z
    .array(z.object({ x: z.number(), y: z.number(), t: z.number() }))
    .min(1),
  color: z.string(),
  width: z.number().positive(),
});

const postSchema = z.object({
  id: z.string().uuid(),
  label: z.string().refine((op) => VALID_OPS.has(op), { message: "unknown label op" }),
  phase: z.union([z.literal(1), z.literal(2)]),
  split: z.enum(["calibration", "golden"]),
  guide_bbox: bboxSchema,
  canvas: z.object({ width: z.number().positive(), height: z.number().positive() }),
  strokes: z.array(strokeSchema).min(1),
  colors_used: z.array(z.string()).min(1),
  style_prompt: z.enum(["sloppy", "neat", "free"]),
  png_path: z.string(),
  created_at: z.string(),
  png_base64: z.string().min(1),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { png_base64, ...record } = parsed.data;

  await fs.mkdir(PNG_DIR, { recursive: true });

  const pngPath = path.join(PNG_DIR, `${record.id}.png`);
  await fs.writeFile(pngPath, Buffer.from(png_base64, "base64"));
  await fs.appendFile(JSONL_PATH, JSON.stringify(record) + "\n", "utf8");

  return NextResponse.json({ ok: true, id: record.id });
}

export async function GET() {
  const counts: Record<string, LabelCounts> = {};

  let raw: string;
  try {
    raw = await fs.readFile(JSONL_PATH, "utf8");
  } catch {
    return NextResponse.json({ counts } satisfies LabelsGetResponse);
  }

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let rec: {
      label?: string;
      style_prompt?: string;
      colors_used?: string[];
      split?: string;
    };
    try {
      rec = JSON.parse(trimmed);
    } catch {
      continue; // skip corrupt lines
    }
    if (!rec.label) continue;

    const c = (counts[rec.label] ??= { ...EMPTY_COUNTS });
    c.saves += 1;
    if (rec.style_prompt === "sloppy") c.sloppy += 1;
    else if (rec.style_prompt === "neat") c.neat += 1;
    else if (rec.style_prompt === "free") c.free += 1;
    if (Array.isArray(rec.colors_used) && rec.colors_used.some(isNonBlack)) {
      c.nonBlack += 1;
    }
    if (rec.split === "calibration") c.calibration += 1;
    else if (rec.split === "golden") c.golden += 1;
  }

  return NextResponse.json({ counts } satisfies LabelsGetResponse);
}
