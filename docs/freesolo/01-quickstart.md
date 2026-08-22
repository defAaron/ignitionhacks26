# 01 — Quickstart: zero to deployed model

The full loop. Steps 1–7 are free; step 8 (`flash train` without flags) is the first command that spends money.

## 1. Install the CLI

Requires Python 3.11 or 3.12. The PyPI package is **`freesolo-flash`** (not `flash` — that name belongs to another project).

```bash
uv tool install freesolo-flash     # preferred
# or: pipx install freesolo-flash
# or: pip install freesolo-flash
```

If `flash: command not found` afterwards: `uv tool update-shell` and restart the shell.

## 2. Authenticate

Create an API key in the freesolo.co dashboard, then:

```bash
flash login --api-key <your-freesolo-key>
flash whoami          # verify
```

Or set `FREESOLO_API_KEY` in the environment. Default API endpoint is `https://api.freesolo.co` (override with `--freesolo-url` or `FREESOLO_BASE_URL`).

## 3. Check the model catalog

```bash
flash models    # supported base model IDs — the only valid values for `model` in configs
flash gpus      # GPU classes, VRAM, pricing
```

## 4. Scaffold a project

From the training project directory (keep it separate from app code — e.g. `freesolo/` in the repo root):

```bash
flash env setup
# flags: --single-turn | --multi-turn, --reasoning | --no-reasoning, -y
```

Creates:

```text
environment.py        # task-as-code: dataset loading, prompts, scoring — the one part you write
dataset/train.jsonl   # input/output training pairs
configs/sft.toml      # SFT config
configs/rl.toml       # GRPO config
configs/opd.toml      # OPD config
TRAINING.md           # agent playbook (travels with the published environment)
```

Rerunning `flash env setup` preserves existing files.

## 5. Write the dataset and environment

See [04-environments-and-datasets.md](04-environments-and-datasets.md). Minimum: JSONL rows of `{"input": ..., "output": ...}` plus an `environment.py` with a `load_environment()` factory.

## 6. Publish the environment

```bash
flash env push --name <env-name> .
# → returns an ID like  your-org/<env-name>
```

Put that exact ID in the config's `[environment] id`. Local file paths are not valid there — publish first.

## 7. Validate and price the run (free)

```bash
flash train configs/sft.toml --dry-run   # server-side validation, no GPU, no charge
flash train configs/sft.toml --cost      # local deterministic cost quote (also the billing baseline)
```

Do both, every time, before any real run.

## 8. Train

```bash
flash train configs/sft.toml
```

The CLI follows logs. **Ctrl-C detaches; it does not cancel** — the run continues server-side.

```bash
flash runs                 # list runs, state, cost
flash status <run-id> -f   # poll status
flash log <run-id> -f      # follow logs
flash cancel <run-id>      # actually cancel (repriced to steps reached; can take minutes)
```

## 9. Deploy and test

```bash
flash deploy <run-id>                # resolves immutable revision, smoke-tests, activates alias
flash chat <run-id> -m "test input"  # flags: --system, --max-tokens (512), --temperature (0.0)
flash deployments --json             # ← contains openai_base_url for app integration
flash undeploy <run-id>              # disable when done (serving bills per token)
```

If deploy fails with "run has no adapter" (cancelled/preempted run): `flash checkpoints <run-id>` then `flash deploy <run-id>/step-<N>`.

## 10. Integrate

See [06-integration.md](06-integration.md) — standard OpenAI client pointed at `openai_base_url`, `model` = run ID, `api_key` = FreeSolo key, backend-only.

## First-run discipline

Prove the pipeline before optimizing anything: smallest plausible model, ≤100 examples, 1 epoch, short outputs, one clear task. Change one major variable per run.
