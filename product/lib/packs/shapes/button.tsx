import { button as webUiButton } from "../web-ui/button";
import { legacyProps, type ShapeTemplate } from "./types";

/** button — glyph `box + b` → the web-ui styled button; routed handwriting arrives as params.label. */
export const button: ShapeTemplate = (props) => webUiButton(legacyProps(props));
