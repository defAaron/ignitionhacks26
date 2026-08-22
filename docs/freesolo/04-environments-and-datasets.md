# 04 — Environments, Datasets, and Structured Outputs

## The environment is the task-as-code

`environment.py` is "the single source of truth for what the model practices on and how it's graded." It defines dataset loading, prompt construction, and scoring. Flash reads it at `flash env push` (packaging) and at training time when workers call `load_environment(**params)`.

## Single-turn environment API (verified)

```python
from pathlib import Path

from freesolo.datasets import TaskExample
from freesolo.datasets.records import load_task_examples
from freesolo.environments import EnvironmentSingleTurn, RewardResult

ROOT = Path(__file__).parent


class MyEnv(EnvironmentSingleTurn):
    def __init__(self, *, split: str = "train") -> None:
        self.dataset = load_task_examples(ROOT / "dataset" / f"{split}.jsonl")

    def build_prompt_messages(self, example: TaskExample, prompt_text: str):
        # The SDK's default start_episode prepends the run's prompt text
        # as a `system` message automatically.
        return [{"role": "user", "content": example.input}]

    def score_response(self, example: TaskExample, response_text: str) -> RewardResult:
        expected = str(example.output or "").strip()
        score = 1.0 if expected and expected in response_text else 0.0
        return RewardResult(score=score, threshold=1.0)


def load_environment(split: str = "train", **kwargs) -> MyEnv:
    return MyEnv(split=split)
```

Key facts:

- `load_environment()` is the **required** factory; `[environment.params]` in the config becomes its kwargs.
- `load_task_examples(path)` resolves paths relative to `environment.py` — works both locally and on workers.
- `RewardResult` has `score` (0–1) and `threshold`.
- On thinking-enabled runs, `response_text` also exposes `.thinking`, `.completion`, and `.raw`.
- Local authoring needs the SDK: `uv pip install freesolo` (workers include it automatically).
- Single-turn covers most products. Only use `EnvironmentMultiTurn` (conversations, tool use, agent trajectories) when the product genuinely needs it — single-turn is easier to train, debug, evaluate, and constrain.

## Dataset record format

Accepted file types: `.jsonl` (preferred), `.json`, `.csv`, `.txt`, `.bson`.

```jsonl
{"input": "…prompt…", "output": "…gold answer…", "metadata": {"anything": "the reward needs"}}
```

| Field | Meaning |
|---|---|
| `input` | Prompt text. Required. Alternate key names are **not accepted**. |
| `output` | Gold target. Optional for GRPO/OPD. Scalar, `{"messages": [...]}`, or a bare chat-message list. |
| `metadata` | Optional dict, preserved on `example.metadata` for scoring. |

⚠️ **Silent-drop rule:** Flash keeps only `input`/`output`/`metadata` and silently discards every other top-level key before workers see the data. Test cases, rubrics, oracle IDs, board states — all of it goes under `metadata` or it's gone without warning. (The untouched original is available as `example.record` in the environment, but not in training records.)

### Message-shaped outputs (SFT)

For tool-calling or multi-turn SFT, set `output` to `{"messages": [...]}` — assistant, tool-call, tool-result, and reply messages are preserved. For a weekend MVP, prefer single-turn structured generation.

### Size limits

Environment uploads: **64 MB compressed / 256 MB uncompressed**. Larger corpora live externally; pass identifiers through `[environment.params]`.

## Dataset quality rules

- Quality beats volume. Every output must follow the same schema, conventions, coordinate system, naming, units, and abstraction level. Contradictory examples → unpredictable model.
- **Never train and evaluate on the same records.** `train.jsonl` / `eval.jsonl` / `test.jsonl`, roughly 80/10/10; for tiny datasets prioritize a meaningful held-out set.
- Size heuristics: 10–30 smoke test → 50–150 prototype → 300–1,000 credible MVP → 1,000–10,000+ strong specialization. Verify the first 50 examples represent the task correctly before generating thousands.
- Construction order: define task → define output schema → **build the validator** → 20–50 canonical hand-checked examples → prompted baseline → generate more → review → split → small training run → collect failures → add corrections → retrain.
- Never include secrets, keys, tokens, or unnecessary personal data in training data. Review provenance before upload.

## Structured outputs

Guided decoding forces the sampler to emit only text matching a constraint — during **training rollouts** (GRPO/OPD) and as the **deployed adapter's default** at serving time. This is the single highest-leverage feature for command-generation tasks: rollouts can't drift off-format, so `score_response` parses fields directly and rewards content.

In `[train]`, set `structured_outputs` to exactly one of:

```toml
# JSON Schema (most common) — pass the schema as a string
structured_outputs = '{"type": "object", "properties": {"answer": {"type": "string"}}, "required": ["answer"]}'

# Fixed choice set
structured_outputs = { choice = ["yes", "no", "maybe"] }

# Regex
structured_outputs = { regex = "\\d{4}-\\d{2}-\\d{2}" }

# Any valid JSON
structured_outputs = { json_object = true }
```

Tuning options: `disable_any_whitespace` (compact JSON), `disable_additional_properties` (reject undeclared keys), `whitespace_pattern`.

With `thinking = true`, reasoning stays free-form; the grammar engages after `</think>`. The constrained answer must still fit within `max_completion_tokens`.

At serving time the training constraint is the default; override per request with OpenAI-standard `response_format` (`json_schema`, `json_object`, or `text`) — no redeploy needed. Always check `finish_reason` for truncation before parsing.

## Prefer command JSON over raw markup

For generation targets like diagrams/UI, train the model to emit a **versioned domain command schema**, not raw SVG/HTML. A deterministic renderer handles exact syntax, escaping, bounds, collision correction, and undo. Command JSON gives you schema validation, safer execution, clearer rewards, and renderer independence.

Composite reward sketch for such tasks:

```python
reward = (
    1.0 * schema_valid
    + 1.5 * render_success
    + 2.0 * element_coverage
    + 2.0 * connection_accuracy
    + 1.0 * label_accuracy
    + 0.5 * layout_quality
    - 1.0 * overlap_penalty
    - 1.0 * clipping_penalty
    - 2.0 * invalid_command_penalty
)
```

Test any reward against known-good and known-bad outputs before training on it.
