import type { Metadata } from "next";
import Labeler from "./Labeler";

export const metadata: Metadata = {
  title: "baio — Labeler",
  description: "Data-labeling blitz tool: hold-to-draw sketches for the 66-op label tree",
};

export default function LabelerPage() {
  return <Labeler />;
}
