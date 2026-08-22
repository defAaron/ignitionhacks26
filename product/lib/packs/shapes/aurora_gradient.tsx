import { aurora_gradient as webUiAuroraGradient } from "../web-ui/aurora_gradient";
import { legacyProps, type ShapeTemplate } from "./types";

/** aurora_gradient — blurred color-mesh glow (Stripe/Linear look); params: palette, blob_count, blur_radius, background, seed. */
export const aurora_gradient: ShapeTemplate = (props) => webUiAuroraGradient(legacyProps(props));
