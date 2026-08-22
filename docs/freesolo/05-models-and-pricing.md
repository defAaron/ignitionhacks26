# 05 — Supported Models, Pricing, and Cost Control

Snapshot from https://freesolo.co/docs/reference/models.md (2026-07-18). **Always confirm with `flash models` before configuring a run** — the catalog is curated and changes.

## Base model catalog

| Model ID | Size | Context | Max LoRA rank | Algorithms | Reasoning | Served on |
|---|---|---|---|---|---|---|
| `Qwen/Qwen3.5-0.8B` | 0.8B | 32,768 | 128 | SFT, GRPO, OPD | Hybrid | L4 |
| `openbmb/MiniCPM5-1B` | 1B | 32,768 | 128 | SFT, GRPO, OPD | Hybrid | L4 |
| `Qwen/Qwen3.5-2B` | 2B | 32,768 | 128 | SFT, GRPO, OPD | Hybrid | L4 |
| `Qwen/Qwen3.5-4B` | 4B | 32,768 | 64 | SFT, GRPO, OPD | Hybrid | L4 |
| `Qwen/Qwen3.5-9B` | 9B | 32,768 | 64 | SFT, GRPO, OPD | Hybrid | H100 |
| `Qwen/Qwen3.6-35B-A3B` | 35B | **4,096** | 64 | SFT, GRPO, OPD | Hybrid | H200 |

Note the 35B model's 4,096 serving context — training context above the serving context is rejected.

## Serving prices (per 1M tokens)

| Model size | Prompt | Completion | Cached prompt |
|---|---|---|---|
| 0.8B / 1B | $0.012 | $0.060 | $0.0024 |
| 2B | $0.024 | $0.120 | $0.0048 |
| 4B | $0.036 | $0.180 | $0.0072 |
| 9B | $0.120 | $0.180 | $0.0240 |
| 35B | $0.180 | $1.200 | $0.0600 |

Serving formula: `(prompt − cached) × input_rate + completion × output_rate + cached × cached_rate`. **Prefix caching is always on** — a stable system prompt + schema prefix gets the ~5× cheaper cached rate automatically. Sub-cent usage carries forward.

## Training cost model

`total = billable training hours × GPU $/hr`. Only the training loop bills — container boot and model loading don't. `flash train config.toml --cost` gives a local deterministic quote (per-step time, billable hours, wall-clock, USD); submit unchanged and that quote is what you're billed. Cancel before training starts → no charge; cancel mid-run → repriced to steps reached.

What drives cost (in your control):

1. **Base model size** — smallest that plausibly works, always, for smoke tests.
2. **Algorithm** — SFT cheapest; GRPO/OPD sample completions per step (cost scales with `group_size`).
3. **Sequence length** — `max_context_tokens`, `max_completion_tokens`.
4. **Dataset/epochs/batch** — SFT scales with examples trained.
5. **Checkpoint saves** — synchronous uploads add time.

## Model selection strategy

Start with the smallest model likely to do the task (for structured command generation: `Qwen/Qwen3.5-0.8B` or `2B`). When results disappoint, fix in this order — **dataset → schema → validator → prompt → retrain** — and only test a larger model when evaluation shows capacity is the limit. A larger model does not fix inconsistent labels, weak rewards, invalid examples, or unstable schemas.

## Pre-run checklist

```bash
flash models                          # confirm the ID exists
flash train configs/sft.toml --dry-run
flash train configs/sft.toml --cost
# balance check: submit fails with "insufficient balance" if prepaid org balance < estimate
```

Fastest ways to shrink an estimate: smaller base model, fewer GRPO/OPD epochs, lower `group_size`, shorter `max_completion_tokens`, SFT instead of RL.
