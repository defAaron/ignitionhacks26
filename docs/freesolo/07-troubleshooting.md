# 07 — Troubleshooting

Condensed from https://freesolo.co/docs/reference/troubleshooting.md. Add `--debug` to any command for full tracebacks; for support include the run ID from `flash runs`.

## Install & auth

| Symptom | Fix |
|---|---|
| `flash: command not found` | `uv tool update-shell`, restart shell; verify `flash version` |
| Wrong package installed | PyPI name is **`freesolo-flash`** (`flash` is a different project) |
| 401 / invalid key | Key from freesolo.co dashboard → `flash login --api-key <key>` or `FREESOLO_API_KEY`; verify `flash whoami` |
| Custom deployment | Default is `https://api.freesolo.co`; override with `--freesolo-url` / `FREESOLO_BASE_URL` |

## Environments

| Symptom | Fix |
|---|---|
| `env push` fails | Folder must contain `environment.py` with `load_environment()` |
| `ModuleNotFoundError: freesolo` locally | `uv pip install freesolo` (workers include the SDK; your machine doesn't) |
| Worker import failure at train time | `--dry-run` doesn't execute the GPU worker — add missing packages to `[environment].pip`, republish, resubmit. Only list what your env actually imports. |
| `[environment].pip` breaks training | Remove pins of Flash's managed stack (torch, trl, vllm, peft, bitsandbytes) — they conflict with tested recipes |
| Archive too large on pull | Pull single files: `flash env pull org/env environment.py -o environment.py`; keep envs free of venvs/caches |
| Config rejects env id | Must be a **published** ID (`your-org/name`), never a local path |
| Import shadowing | Keep helper module names distinct from installed packages |

## Config

| Symptom | Fix |
|---|---|
| "unsupported model" | Use an ID from `flash models` |
| Unknown key/section rejected | Only fields in [03-config-reference.md](03-config-reference.md) exist; `--dry-run` validates server-side |
| "unsupported algorithm" | `sft` \| `grpo` \| `opd` |
| Training context > serving context | Lower `max_context_tokens` (and `max_completion_tokens` for GRPO/OPD). Most models serve 32768; Qwen3.6-35B-A3B serves **4096**. |
| Warm-start rank/alpha mismatch | With `init_from_adapter`, **remove** `lora_rank` and `lora_alpha` (source is authoritative); `model_revision` must match source |
| Run too large in pre-flight | Reduce `max_context_tokens` / `max_completion_tokens` / `group_size`, or use a smaller model. `thinking = true` makes reasoning share the completion budget. |
| "insufficient balance" | Top up, or shrink the estimate: smaller model, fewer epochs, lower `group_size`, shorter completions, SFT instead of RL |

## Training runs

| Symptom | Fix |
|---|---|
| Ctrl-C "cancelled" my run | It didn't — Ctrl-C detaches. `flash runs` / `flash log <id> -f` to reattach, `flash cancel <id>` to actually stop (takes minutes; repriced to steps reached). |
| GRPO reward stuck at **0** | Task too hard for the model — nothing scores. Stronger base model, easier task, or verify the reward returns positive values for known-good answers. |
| Reward stuck at **1** / flat | Reward isn't discriminative — make it separate better from worse answers |
| Reward collapses with `thinking = true` | Reasoning eats `max_completion_tokens` and truncates the answer. Raise the budget (~200-token answers may need 2048), ensure `max_context_tokens` covers prompt + budget, optionally set `thinking_length_penalty_coef`, score via `response_text.completion`. |
| LLM-judge scores everything 0 | Give the judge call enough `max_tokens` — an empty judge reply scores 0 |
| Doubled/missing `<think>` tags (Qwen3.5 multi-turn SFT) | Put `<think>…</think>` + answer only in the **final** assistant target; intermediate turns are plain action text; don't add an opener for the template's pre-opened tag |
| OPD underperforms SFT / rollouts never terminate | Warm-start from the SFT adapter (omit rank/alpha); verify teacher > student on held-out data; give the teacher a hard answer budget in its system prompt; add `stop_sequences`; watch `truncated_rollouts`. OPD has no tool-calling; `kl_penalty_coef > 0` required. |
| Capacity interruptions | Flash retries with bounded attempts and resumes from validated checkpoints; reduce context/completions/`group_size` if it recurs |

## Serving

| Symptom | Fix |
|---|---|
| Deploy: "run has no adapter" | Run ended before finalizing — `flash checkpoints <id>` then `flash deploy <id>/step-<N>` |
| Deploy / first request slow | Expected: immutable-revision resolution + smoke test; large models warm for minutes. Failed smoke leaves the old alias active. |
| Endpoint rejects calls | Use `openai_base_url` from `flash deployments --json`, `model` = run alias or immutable revision, pass the FreeSolo key. 401 bad key · 402 no balance · 403 wrong org · 503 retry with backoff. |
| Ongoing serving charges | `flash undeploy <run-id>` |
