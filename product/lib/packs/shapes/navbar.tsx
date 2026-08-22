import { navbar as webUiNavbar } from "../web-ui/navbar";
import { legacyProps, type ShapeTemplate } from "./types";

/** navbar — glyph `box + n` → the web-ui top bar (caller applies `snap: full_width_top`); params.label = brand. */
export const navbar: ShapeTemplate = (props) => webUiNavbar(legacyProps(props));
