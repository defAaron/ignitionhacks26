import { sparkles as webUiSparkles } from "../web-ui/sparkles";
import { legacyProps, type ShapeTemplate } from "./types";

/** sparkles — seeded 4-point "AI shimmer" star cluster; params: count, size_range, spread, colors, seed. */
export const sparkles: ShapeTemplate = (props) => webUiSparkles(legacyProps(props));
