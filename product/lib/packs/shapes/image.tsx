import { image as webUiImage } from "../web-ui/image";
import { legacyProps, type ShapeTemplate } from "./types";

/** image — glyph `box + i` → the web-ui image placeholder frame (sun + mountains, or "x" variant). */
export const image: ShapeTemplate = (props) => webUiImage(legacyProps(props));
