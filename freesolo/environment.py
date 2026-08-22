"""baio FreeSolo environment — shapes WAVE 3.1 (containment + the `composite`
hint; 22-op whitelist, no coordinates).

Task-as-code for the wave-3.1 builder: normalized shape-detection JSON with
the `parent` containment field AND the optional-nullable `composite` diagram
hint (input, shapeBuilderInputV31Schema — shared/schemas/README.md §1.7:
serialized after `parent`, null when absent) -> shape command JSON (output,
shared/schemas/shapes-v3.json, UNCHANGED — byte-identical to v2's 22-op
grammar; schema_version stays "shapes-1.0").

Wave 3.1 note: `composite` is INPUT-side only — the whitelist and scoring are
unchanged (rule zero: output grammar identical). The hint's mapping
(scribble + composite: X -> op X; non-scribble composite ignored; hint-absent
or low-confidence scribble -> wait) is scored through the existing op/wait
components, because the GOLD already encodes it; style-descriptor routing
(color/theme words -> fill/gradient params) is likewise covered by the params
component, whose gold values carry the descriptor-derived hexes.

Wave-3 semantics scored here:

  * exactly ONE command per TOP-LEVEL detection (parent == null) — coverage
    counts top-level detections only;
  * CHILD detections emit nothing: a command answering a child id is penalized
    exactly like a hallucination (and earns no credit);
  * detail-routing credit: child words / color marks route into the parent
    command's label / fill / gradient in the gold, so the params component
    (weight raised to 0.20) directly scores whether routed values landed on
    the right command.

The composite grader in `score_payload` is pure Python with no repo imports —
it re-encodes the validator pipeline (schema shape -> coverage -> per-command
comparison) so it doubles as the GRPO reward later. SFT ignores it for
gradients but uses it as the eval grader.

Self-test (no SDK needed):  python3 freesolo/environment.py
"""
from __future__ import annotations

import json
from pathlib import Path

# The freesolo SDK is preinstalled on training workers; locally it may be
# absent (`uv pip install freesolo`). Guard so the self-test always runs.
try:
    from freesolo.datasets import TaskExample  # noqa: F401
    from freesolo.datasets.records import load_task_examples
    from freesolo.environments import EnvironmentSingleTurn, RewardResult
    _HAVE_SDK = True
except ImportError:
    _HAVE_SDK = False

    class EnvironmentSingleTurn:  # minimal stand-ins for local scoring tests
        pass

    class RewardResult:
        def __init__(self, score: float, threshold: float) -> None:
            self.score, self.threshold = score, threshold

ROOT = Path(__file__).parent

# --- Shapes-v3 contract, hardcoded from shared/schemas/shapes-v3.json (the op
# enum is byte-identical to v2's 22). RULE ZERO: if that file changes, update
# these constants in the same commit.
OPS_SHAPES = {
    # base shapes (6)
    "rect", "ellipse", "line", "arrow", "text", "smooth_path",
    # glyph components (6)
    "image", "form", "button", "navbar", "video", "placeholder",
    # decorative (4)
    "wave_divider", "night_sky", "sparkles", "aurora_gradient",
    # diagrams (6, wave 1.5)
    "bar_chart", "pie_chart", "venn_diagram", "timeline",
    "periodic_table", "atomic_structure",
}
SNAP_POLICIES = {
    "none", "full_width_top", "full_width_bottom", "full_width",
    "straighten_h", "straighten_v", "square", "center_in_region",
}
OP_REQUIRED = {"op", "from"}
OP_ALLOWED = OP_REQUIRED | {"params", "snap"}
WAIT_REQUIRED = {"op", "from", "reason"}
# Geometry is unrepresentable in the output; belt-and-braces reject if it leaks.
GEOMETRY_KEYS = {"x", "y", "width", "height", "bbox"}
# The only params keys the grader value-checks (loose string compare); all
# other params (seed, decorative knobs) are free values the renderer owns.
CHECKED_PARAM_KEYS = ("fill", "text", "label", "gradient")

# Composite weights (sum to 1.0) + hallucination penalty. Tuned so a perfect
# answer scores 1.0 and a plausible-but-sloppy one lands well under the 0.8
# threshold. Wave 3: W_PARAMS raised 0.15 -> 0.20 (detail-routing credit —
# gold params carry child-routed label/fill/gradient values) and W_OP trimmed
# to compensate. Test against known-good/known-bad before training (below).
W_SHAPE, W_COVER, W_OP, W_SNAP, W_PARAMS, W_WAIT = 0.15, 0.20, 0.25, 0.10, 0.20, 0.10
# Scaled by the fraction of bad commands: unknown `from`, DUPLICATE `from`, or
# a command answering a CHILD detection (children emit nothing in wave 3).
HALLUCINATION_PENALTY = 0.25


def _as_dict(value):
    """Dataset fields may arrive as JSON strings or dicts; accept both."""
    if isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(str(value))
    except (json.JSONDecodeError, TypeError):
        return None


def _shape_ok(cmd) -> bool:
    """Mirror of the schema's two command variants (shape_command | wait_command)."""
    if not isinstance(cmd, dict):
        return False
    if cmd.get("op") == "wait":
        return set(cmd) == WAIT_REQUIRED and isinstance(cmd.get("reason"), str) \
            and isinstance(cmd.get("from"), str)
    if cmd.get("op") not in OPS_SHAPES:
        return False
    if not (OP_REQUIRED <= set(cmd) <= OP_ALLOWED) or not isinstance(cmd.get("from"), str):
        return False
    if "snap" in cmd and cmd["snap"] not in SNAP_POLICIES:
        return False
    if "params" in cmd:
        if not isinstance(cmd["params"], dict):
            return False
        if GEOMETRY_KEYS & set(cmd["params"]):
            return False  # no coordinates, anywhere
    return True


def _loose_eq(a, b) -> bool:
    return str(a).strip().casefold() == str(b).strip().casefold()


def _gradient_match(resp_grad, gold_grad) -> bool:
    if not isinstance(resp_grad, dict) or not isinstance(gold_grad, dict):
        return False
    if not _loose_eq(resp_grad.get("direction", ""), gold_grad.get("direction", "")):
        return False
    resp_colors = resp_grad.get("colors")
    gold_colors = gold_grad.get("colors")
    if not isinstance(resp_colors, list) or not isinstance(gold_colors, list):
        return False
    norm = lambda cs: sorted(str(c).strip().casefold() for c in cs)  # noqa: E731
    return norm(resp_colors) == norm(gold_colors)


def _params_score(resp_cmd, gold_cmd):
    """(hits, checked) over the gold command's checkable param keys."""
    gold_params = gold_cmd.get("params") or {}
    checked = [k for k in CHECKED_PARAM_KEYS if k in gold_params]
    if not checked:
        return 0, 0
    resp_params = resp_cmd.get("params") if isinstance(resp_cmd, dict) else None
    resp_params = resp_params if isinstance(resp_params, dict) else {}
    hits = 0
    for key in checked:
        if key not in resp_params:
            continue
        if key == "gradient":
            hits += _gradient_match(resp_params[key], gold_params[key])
        else:
            hits += _loose_eq(resp_params[key], gold_params[key])
    return hits, len(checked)


def score_payload(input_obj, gold_obj, response_text: str) -> float:
    """Composite 0-1 score for one response. Pure function of (input, gold, text)."""
    parsed = _as_dict(response_text)
    if not isinstance(parsed, dict) or not isinstance(parsed.get("components"), list):
        return 0.0  # unparseable / wrong top-level shape: nothing to salvage
    if parsed.get("schema_version") != "shapes-1.0":
        return 0.0
    cmds = parsed["components"]

    detections = (input_obj or {}).get("detections", []) or []
    det_ids = [d.get("id") for d in detections if isinstance(d, dict)]
    # Wave-3 containment: only TOP-LEVEL detections (parent == null / absent)
    # get commands; children are details routed into the parent's params.
    top_ids = [d.get("id") for d in detections
               if isinstance(d, dict) and d.get("parent") is None]
    child_ids = set(det_ids) - set(top_ids)
    gold_cmds = (gold_obj or {}).get("components", []) or []
    gold_by_from = {c.get("from"): c for c in gold_cmds if isinstance(c, dict)}

    # Index response commands by `from`; penalize hallucinations (unknown
    # `from`), duplicates, and CHILD-ANSWERING commands (wave 3: a child never
    # gets a command — answering one is the failure mode this wave kills, so
    # it is penalized exactly like a hallucination and earns no credit).
    resp_by_from, hallucinated = {}, 0
    for c in cmds:
        src = c.get("from") if isinstance(c, dict) else None
        if src not in det_ids or src in child_ids or src in resp_by_from:
            hallucinated += 1
        else:
            resp_by_from[src] = c

    # Component scores. Vacuous categories (no gold ops / waits / checkable
    # params) score 1.0 so their weight never punishes unrelated examples.
    # Coverage counts TOP-LEVEL detections only.
    shape = sum(_shape_ok(c) for c in cmds) / len(cmds) if cmds else 0.0
    cover = sum(t in resp_by_from for t in top_ids) / len(top_ids) if top_ids else 1.0

    op_hits, op_n = 0, 0          # gold shape-command detections: op match
    snap_hits, snap_n = 0, 0      # same detections: snap policy (missing = "none")
    par_hits, par_n = 0, 0        # gold fill/gradient/text/label values, loose
                                  # (wave-3 detail-routing credit lives here:
                                  # gold params carry the child-routed values)
    wait_hits, wait_n = 0, 0      # gold wait detections: did the model abstain?
    for src, gold in gold_by_from.items():
        resp = resp_by_from.get(src)
        if gold.get("op") == "wait":
            wait_n += 1
            wait_hits += isinstance(resp, dict) and resp.get("op") == "wait"
            continue
        op_n += 1
        snap_n += 1
        if isinstance(resp, dict) and resp.get("op") != "wait":
            op_hits += resp.get("op") == gold.get("op")
            snap_hits += resp.get("snap", "none") == gold.get("snap", "none")
        h, c = _params_score(resp, gold)
        par_hits += h
        par_n += c

    score = (
        W_SHAPE * shape
        + W_COVER * cover
        + W_OP * (op_hits / op_n if op_n else 1.0)
        + W_SNAP * (snap_hits / snap_n if snap_n else 1.0)
        + W_PARAMS * (par_hits / par_n if par_n else 1.0)
        + W_WAIT * (wait_hits / wait_n if wait_n else 1.0)
        - HALLUCINATION_PENALTY * (hallucinated / len(cmds) if cmds else 1.0)
    )
    # round() kills float epsilon from the weight sum so a perfect answer is 1.0.
    return max(0.0, min(1.0, round(score, 6)))


class BaioShapesEnv(EnvironmentSingleTurn):
    """Single-turn: one detection payload in, one shape-command document out."""

    def __init__(self, *, split: str = "train") -> None:
        if not _HAVE_SDK:
            raise ImportError("freesolo SDK required: uv pip install freesolo")
        self.dataset = load_task_examples(ROOT / "dataset" / f"{split}.jsonl")

    def build_prompt_messages(self, example, prompt_text):
        # The SDK's default start_episode prepends the run's prompt text as a
        # system message automatically; the example input is the whole turn.
        return [{"role": "user", "content": example.input}]

    def score_response(self, example, response_text) -> RewardResult:
        score = score_payload(_as_dict(example.input), _as_dict(example.output), str(response_text))
        return RewardResult(score=score, threshold=0.8)


def load_environment(split: str = "train", **kwargs) -> BaioShapesEnv:
    """Required factory; [environment.params] in the config becomes kwargs."""
    return BaioShapesEnv(split=split)


if __name__ == "__main__":
    # SDK-free self-test on the WAVE-3.1 contract: a good response must score
    # high, a sloppy one low, garbage exactly 0. The example is v3.1-shaped:
    # every detection carries `parent` AND `composite` (README §1.7 key order);
    # det_2 is a glyph-function nest (box + child letter "b" + child word
    # "Login rainbow" -> ONE button with label "Login" + the rainbow theme
    # gradient, glyph convention), det_9 is a composite-hint scribble
    # (composite bar_chart, confident -> bar_chart), det_5 is a hinted-but-
    # low-confidence scribble (composite pie_chart -> still wait).
    # Run: python3 freesolo/environment.py
    example_input = {
        "artboard": {"width": 1440, "height": 900},
        "detections": [
            {"id": "det_1", "kind": "rect", "glyph": "n", "text": "baio", "colors": ["#1a1a2e"],
             "gradient_direction": None, "confidence": 0.91,
             "bbox": {"x": 4, "y": 6, "width": 1380, "height": 72}, "parent": None,
             "composite": None},
            {"id": "det_2", "kind": "rect", "glyph": None, "text": None, "colors": [],
             "gradient_direction": None, "confidence": 0.84,
             "bbox": {"x": 300, "y": 340, "width": 380, "height": 220}, "parent": None,
             "composite": None},
            {"id": "det_6", "kind": "text_writing", "glyph": None, "text": "b", "colors": [],
             "gradient_direction": None, "confidence": 0.72,
             "bbox": {"x": 350, "y": 390, "width": 34, "height": 34}, "parent": "det_2",
             "composite": None},
            {"id": "det_7", "kind": "text_writing", "glyph": None, "text": "Login rainbow",
             "colors": [], "gradient_direction": None, "confidence": 0.8,
             "bbox": {"x": 420, "y": 392, "width": 150, "height": 30}, "parent": "det_2",
             "composite": None},
            {"id": "det_3", "kind": "text_writing", "glyph": None, "text": "I love baio",
             "colors": [], "gradient_direction": None, "confidence": 0.77,
             "bbox": {"x": 420, "y": 200, "width": 260, "height": 44}, "parent": None,
             "composite": None},
            {"id": "det_4", "kind": "smooth_path", "glyph": None, "text": None,
             "colors": ["#e63946", "#f59e0b"], "gradient_direction": "down", "confidence": 0.7,
             "bbox": {"x": 900, "y": 500, "width": 240, "height": 220}, "parent": None,
             "composite": None},
            {"id": "det_9", "kind": "scribble", "glyph": None, "text": None, "colors": ["#2563eb"],
             "gradient_direction": None, "confidence": 0.68,
             "bbox": {"x": 120, "y": 300, "width": 320, "height": 260}, "parent": None,
             "composite": "bar_chart"},
            {"id": "det_5", "kind": "scribble", "glyph": None, "text": None, "colors": [],
             "gradient_direction": None, "confidence": 0.18,
             "bbox": {"x": 120, "y": 640, "width": 300, "height": 280}, "parent": None,
             "composite": "pie_chart"},
        ],
    }
    gold = {"schema_version": "shapes-1.0", "components": [
        {"op": "navbar", "from": "det_1",
         "params": {"fill": "#1a1a2e", "label": "baio"}, "snap": "full_width_top"},
        {"op": "button", "from": "det_2",
         "params": {"label": "Login", "fill": "gradient",
                    "colors": ["#ef4444", "#f59e0b", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6"]}},
        {"op": "text", "from": "det_3", "params": {"text": "I love baio"}},
        {"op": "smooth_path", "from": "det_4",
         "params": {"gradient": {"colors": ["#e63946", "#f59e0b"], "direction": "down"}}},
        {"op": "bar_chart", "from": "det_9", "params": {"values": [40, 70, 55], "seed": 7}},
        {"op": "wait", "from": "det_5", "reason": "low_confidence"},
    ]}
    cases = {
        "good  (gold echoed back)": json.dumps(gold),
        "sloppy(wrong ops, lost routing/hint, answered a CHILD + the hinted wait, hallucination)": json.dumps(
            {"schema_version": "shapes-1.0", "components": [
                {"op": "rect", "from": "det_1"},
                {"op": "rect", "from": "det_2", "snap": "square"},
                {"op": "text", "from": "det_6", "params": {"text": "b"}},
                {"op": "text", "from": "det_3", "params": {"text": "hello world"}},
                {"op": "wait", "from": "det_9", "reason": "ambiguous"},
                {"op": "pie_chart", "from": "det_5"},
                {"op": "sparkles", "from": "det_11"},
            ]}),
        "broken(not JSON)": "sure! here are your shapes:",
    }
    for name, resp in cases.items():
        print(f"{score_payload(example_input, gold, resp):.3f}  {name}")
