# FreeSolo Flash — Agent Kit

A self-contained context kit for AI coding agents building with **FreeSolo Flash**, the managed LoRA post-training and serving platform. Everything here was verified against the live docs at https://freesolo.co/docs (fetched 2026-07-18). When in doubt, the platform is the source of truth: run `flash models`, `flash gpus`, or check `https://freesolo.co/docs/llms.txt`.

## What FreeSolo is, in one sentence

FreeSolo lets you fine-tune a small open-source model (0.8B–35B) on one narrow task using SFT, GRPO, or on-policy distillation, then serves the resulting LoRA adapter behind an OpenAI-compatible API.

## Kit contents

| File | Read it when |
|---|---|
| [00-overview.md](00-overview.md) | Deciding **whether** to use FreeSolo, and which algorithm |
| [01-quickstart.md](01-quickstart.md) | Doing the install → train → deploy loop for the first time |
| [02-cli-reference.md](02-cli-reference.md) | You need an exact `flash` command or flag |
| [03-config-reference.md](03-config-reference.md) | Writing or debugging a training TOML |
| [04-environments-and-datasets.md](04-environments-and-datasets.md) | Writing `environment.py`, building datasets, constraining outputs to JSON |
| [05-models-and-pricing.md](05-models-and-pricing.md) | Picking a base model, estimating cost |
| [06-integration.md](06-integration.md) | Calling the deployed model from application code |
| [07-troubleshooting.md](07-troubleshooting.md) | Anything fails |
| [08-baio-playbook.md](08-baio-playbook.md) | The concrete training plan for **this repo** (baio sketch→component autocomplete) |

## The 10 rules an agent must not break

1. **`flash models` before choosing a model** — never hard-code assumptions about the catalog.
2. **SFT first.** GRPO only after a deterministic reward exists; OPD only after the teacher is proven better than the student on held-out data.
3. **Define the versioned output schema and validator before training anything.**
4. **Dataset records are `input` / `output` / `metadata` only.** Every other top-level key is *silently dropped*. Anything the reward needs goes under `metadata`.
5. **`--dry-run` and `--cost` before every real `flash train`.** `flash train <config>` is the first command that spends money.
6. **Never train and evaluate on the same records.** Keep `train` / `eval` / `test` splits.
7. **Build a prompted baseline first** — fine-tuning must beat it on a measurable metric or it isn't justified.
8. **The FreeSolo API key never reaches the browser.** All inference goes through your backend.
9. **Never execute model output without schema validation.** The renderer/executor is deterministic code, not the model.
10. **Don't invent CLI flags or config fields.** Everything valid is in files 02 and 03; unknown keys are rejected at parse time.

## Mental model

```text
Base model + environment.py (task-as-code) + dataset/reward/teacher
        → flash train → LoRA adapter
        → flash deploy → OpenAI-compatible endpoint
        → your backend → validate → render/execute
```

FreeSolo is the model layer only. Frontend, backend, auth, storage, retrieval, validation, and rendering are your problem — by design.
