# 02 — CLI Reference (`flash`)

Verified against https://freesolo.co/docs/reference/cli.md. Do not invent flags beyond this list — unknown ones are rejected.

## Global flags

| Flag | Meaning |
|---|---|
| `-V`, `--version` | Print version and exit |
| `--debug` | Full tracebacks on error |
| `-v`, `-vv` | Info / debug log verbosity |

## Auth & identity

```bash
flash login [--api-key KEY] [--freesolo-url URL] [--api-url URL]
flash whoami       # resolved identity from stored key
flash version
```

## Discovery

```bash
flash models       # supported base model IDs — source of truth for `model` in configs
flash gpus         # active GPU classes: VRAM, provider, pricing
```

## Environments

```bash
flash env setup [--single-turn|--multi-turn] [--reasoning|--no-reasoning] [-y|--yes]
                                        # scaffold project; preserves existing files on rerun
flash env push --name NAME [PATH]       # publish to Hub → returns your-org/NAME
flash env pull ENV_ID [PATH] [-o OUTPUT] [-f]
                                        # download env, or a single file:
                                        #   flash env pull your-org/env dataset/train.jsonl -o train.jsonl
flash env list                          # local environment sources
flash env delete ENV_ID [-y]            # remove from Hub
```

Push requirements: folder must contain `environment.py` exposing `load_environment()`. Upload caps: **64 MB compressed / 256 MB uncompressed** — exclude venvs and caches; keep large corpora external and pass identifiers via `[environment.params]`.

## Training

```bash
flash train CONFIG.toml [--dry-run] [--cost] [--background] [--set KEY=VALUE] [--config OVERLAY.toml]
```

| Flag | Effect |
|---|---|
| `--dry-run` | Server-side validation. No GPU, no charge. Catches schema/config errors, resolves warm-starts. |
| `--cost` | Local deterministic quote: per-step time, billable hours, wall-clock, USD. The quote is the billing baseline if submitted unchanged. Doesn't submit data or import the environment. |
| `--set key=value` | Override any config field (repeatable, dotted notation, e.g. `--set train.epochs=2`) |
| `--config overlay.toml` | Deep-merge another config on top |
| `--background` | Submit without following logs |

## Run management

```bash
flash runs                  # all runs: state, algorithm, cost, model
flash status RUN_ID [-f]    # status + cost record (-f polls)
flash log RUN_ID [-f]       # full logs incl. artifacts (-f follows)
flash cancel RUN_ID         # cancel (waits for worker cleanup — can take minutes)
```

Ctrl-C during `flash train` **detaches**; the run continues. Cancelled runs are repriced to steps reached.

## Serving

```bash
flash deploy RUN_ID [--dry-run]     # resolve immutable HF commit → smoke test → activate alias
flash deploy RUN_ID/step-N          # deploy a mid-training checkpoint
flash checkpoints RUN_ID            # list deployable checkpoints
flash chat TARGET -m MSG [--system S] [--max-tokens N] [--temperature T]
                                    # defaults: max-tokens 512, temperature 0.0
flash deployments [--json]          # active aliases; --json includes openai_base_url
flash undeploy RUN_ID               # disable alias (stops serving charges)
```

Adapter naming: final = `RUN_ID@final.<40-char-sha>`, checkpoint = `RUN_ID@step-N.<40-char-sha>`. In API calls use the run alias or the full immutable revision.

## Export

```bash
flash export --adapter-id ID --repository OWNER/NAME [--api-key HF_KEY] [--public]
# exports the LoRA adapter to HuggingFace; --api-key defaults to $HF_TOKEN
```

## Command → money map

| Never charges | Charges |
|---|---|
| `models`, `gpus`, `env *`, `runs`, `status`, `log`, `checkpoints`, `deployments`, `train --dry-run`, `train --cost`, `deploy --dry-run` | `flash train CONFIG` (quoted training cost), any deployed endpoint traffic incl. `flash chat` (per token) |
