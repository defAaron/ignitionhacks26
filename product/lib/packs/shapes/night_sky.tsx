import { night_sky as webUiNightSky } from "../web-ui/night_sky";
import { legacyProps, type ShapeTemplate } from "./types";

/** night_sky — gradient sky + seeded starfield; params: density, size_range, cluster_bias, seed. */
export const night_sky: ShapeTemplate = (props) => webUiNightSky(legacyProps(props));
