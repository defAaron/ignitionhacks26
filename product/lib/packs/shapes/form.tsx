import { form as webUiForm } from "../web-ui/form";
import { legacyProps, type ShapeTemplate } from "./types";

/** form — glyph `box + f` → the web-ui stacked labeled inputs + accent submit (params.label = submit text). */
export const form: ShapeTemplate = (props) => webUiForm(legacyProps(props));
