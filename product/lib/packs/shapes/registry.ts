import type { ShapeTemplate } from "./types";
import { rect } from "./rect";
import { ellipse } from "./ellipse";
import { line } from "./line";
import { arrow } from "./arrow";
import { text } from "./text";
import { smooth_path } from "./smooth_path";
import { image } from "./image";
import { form } from "./form";
import { button } from "./button";
import { navbar } from "./navbar";
import { video } from "./video";
import { placeholder } from "./placeholder";
import { page } from "./page";
import { wave_divider } from "./wave_divider";
import { night_sky } from "./night_sky";
import { sparkles } from "./sparkles";
import { aurora_gradient } from "./aurora_gradient";

/** Shapes-v1 pack: all 16 ops from vocabulary.md §1, keyed by op id. */
export const shapesPack: Record<string, ShapeTemplate> = {
  // base shapes (6)
  rect,
  ellipse,
  line,
  arrow,
  text,
  smooth_path,
  // glyph components (6)
  image,
  form,
  button,
  navbar,
  video,
  placeholder,
  // page (box + p): preview ghost of a page spawn — never a committed element
  // (committing a `page` op spawns a page object; see Studio / space.addPage).
  page,
  // decorative (4)
  wave_divider,
  night_sky,
  sparkles,
  aurora_gradient,
};

export const SHAPES_OPS = Object.keys(shapesPack);
