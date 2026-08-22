import { wave_divider as webUiWaveDivider } from "../web-ui/wave_divider";
import { legacyProps, type ShapeTemplate } from "./types";

/** wave_divider — layered bezier waves (caller applies `snap: full_width`); params: amplitude, layers, flip, colors, seed. */
export const wave_divider: ShapeTemplate = (props) => webUiWaveDivider(legacyProps(props));
