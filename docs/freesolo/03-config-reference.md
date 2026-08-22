# 03 — Training Config Reference (TOML)

Verified against https://freesolo.co/docs/reference/configuration.md. Flash **rejects unknown sections and keys at parse time** — only fields listed here are valid. Validate with `flash train config.toml --dry-run`.

## Minimal working config

```toml
model = "Qwen/Qwen3.5-4B"
algorithm = "sft"

[environment]
id = "your-org/your-env"

[train]
max_examples = 1000
```

## Top level

| Field | Type | Default | Notes |
|---|---|---|---|
| `model` | string | **required** | Must be in `flash models` catalog |
| `model_revision` | string | `""` | HF branch/tag/commit |
| `algorithm` | string | `sft` | `sft` \| `grpo` \| `opd` |
| `seed` | int | `42` | |
| `thinking` | bool | `false` | Hybrid reasoning. See [gotchas](#thinking-gotchas) |

## `[environment]`

| Field | Type | Default | Notes |
|---|---|---|---|
| `id` | string | **required** | Published env ID (`your-org/name`). Local paths invalid. |
| `params` | table | `{}` | Kwargs forwarded to `load_environment()` — e.g. `params = { split = "train" }` |
| `pip` | list[str] | `[]` | Runtime deps your env imports. **Never pin Flash's stack** (torch, trl, vllm, peft, bitsandbytes) — it conflicts with tested recipes. |
| `secrets` | list[str] | `[]` | Env var names to forward to the worker |

## `[train]` — all algorithms

| Field | Type | Default | Notes |
|---|---|---|---|
| `lora_rank` | int | `32` | **Omit** when using `init_from_adapter` (source values are authoritative) |
| `lora_alpha` | int | `64` | Same — omit on warm-start |
| `learning_rate` | float | recipe default | |
| `batch_size` | int | recipe default | |
| `max_context_tokens` | int | recipe default | Must not exceed the model's serving context (32768 for most; **4096** for Qwen3.6-35B-A3B) |
| `max_steps` | int | derived | Positive value overrides derived count |
| `save_at_steps` | list[int] | `[]` | Strictly increasing checkpoint steps |
| `save_every` | int | recipe default | Periodic save cadence (saves add cost) |
| `init_from_adapter` | string | — | Warm-start from `RUN_ID` or `RUN_ID/step-N`. Pinned `model_revision` must match source. |

## `[train]` — SFT-specific

| Field | Type | Required |
|---|---|---|
| `epochs` | int | no |
| `max_examples` | int | **yes** (positive) |

## `[train]` — GRPO-specific

| Field | Type | Default |
|---|---|---|
| `group_size` | int | **required, ≥2** — completions sampled per prompt (major cost driver) |
| `epochs` | int | — |
| `max_examples` | int | `0` = no cap |
| `temperature` | float | — |
| `max_completion_tokens` | int | — |
| `kl_penalty_coef` | float | — |
| `advantage_clip` | float | — |
| `thinking_length_penalty_coef` | float | — (penalizes long reasoning) |
| `stop_sequences` | list[str] | — |
| `structured_outputs` | string/table | — see [04](04-environments-and-datasets.md#structured-outputs) |

## `[train]` — OPD-specific

| Field | Type | Default |
|---|---|---|
| `teacher_model` | string | `glm-5.2` (managed) |
| `epochs` | int | recipe default |
| `max_examples` | int | `0` |
| `group_size` | int | `1` |
| `temperature` | float | `1.0` |
| `max_completion_tokens` | int | `512` (`1536` with thinking) |
| `kl_penalty_coef` | float | `1.0` — **must be > 0** |
| `stop_sequences` | list[str] | — |
| `structured_outputs` | string/table | — |

OPD notes: no tool-calling support; warm-start from a finished SFT adapter (`init_from_adapter = "<sft-run-id>"`, omit rank/alpha); verify the teacher beats the student on held-out examples first.

## `[gpu]` (optional — selection is automatic)

| Field | Type | Default | Options |
|---|---|---|---|
| `provider` | string | `""` | `runpod`, `lambda`, `vast` |
| `exact_type` | string | `""` | A validated class from `flash gpus` |
| `max_retries` | int | `5` | ≥0 |
| `max_wall_seconds` | int | `86400` | ≥60 |

## `[worker_env]` (optional)

Non-secret string key/values (feature flags, labels). Reserved keys you cannot set: `SEED`, `RUN_ID`, `HF_REPO`, `FLASH_ARM`.

## `[wandb]` (optional)

| Field | Purpose |
|---|---|
| `project` | W&B project name |
| `run_name` | W&B run identifier |

## Overrides & composition

```bash
flash train configs/sft.toml --set train.epochs=2 --set model=Qwen/Qwen3.5-0.8B
flash train configs/sft.toml --config overlay.toml    # deep merge
```

## Thinking gotchas

- With `thinking = true`, reasoning and the answer **share** `max_completion_tokens` — a ~200-token answer may need `max_completion_tokens = 2048`. Symptom of getting this wrong: GRPO reward collapses because answers are truncated.
- SFT on a thinking model expects each gold `output` to literally contain a `<think>...</think>` block (`warn_missing_think_tags()` checks locally).
- Qwen3.5 multi-turn SFT: put `<think>...</think>` + final answer **only in the final assistant turn**; keep intermediate assistant turns as plain action/tool text — the chat template strips think blocks from history and pre-opens `<think>` on generation.
