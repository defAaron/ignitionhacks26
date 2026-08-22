---
name: freesolo
description: Use when training, deploying, or integrating a FreeSolo Flash model (flash CLI, LoRA fine-tuning, SFT/GRPO/OPD, environment.py, training TOML configs, OpenAI-compatible serving). Loads the repo's FreeSolo agent kit.
---

# FreeSolo Flash

This repo has a full agent kit at `docs/freesolo/`. Read `docs/freesolo/README.md` first — it indexes the kit and states the 10 non-negotiable rules.

Routing:

- Deciding whether/what to train → `docs/freesolo/00-overview.md`
- First train/deploy loop → `docs/freesolo/01-quickstart.md`
- Exact `flash` command or flag → `docs/freesolo/02-cli-reference.md`
- Training TOML fields → `docs/freesolo/03-config-reference.md`
- `environment.py`, datasets, structured outputs → `docs/freesolo/04-environments-and-datasets.md`
- Model choice / pricing → `docs/freesolo/05-models-and-pricing.md`
- Calling the deployed model from app code → `docs/freesolo/06-integration.md`
- Errors → `docs/freesolo/07-troubleshooting.md`
- baio-specific training plan → `docs/freesolo/08-baio-playbook.md`

Hard rules that override anything else:

1. `flash models` before choosing a model; never invent CLI flags or config keys.
2. SFT first; `--dry-run` and `--cost` before every paid `flash train`.
3. Dataset rows are `input`/`output`/`metadata` only — other top-level keys are silently dropped.
4. FreeSolo API key stays on the backend; every model output is schema-validated before execution.
5. Live docs win over the kit: https://freesolo.co/docs/llms.txt indexes every page as fetchable markdown.
