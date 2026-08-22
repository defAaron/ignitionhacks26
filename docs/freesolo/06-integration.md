# 06 — Application Integration (OpenAI-compatible API)

## Endpoint discovery

Never guess the URL. After `flash deploy <run-id>`:

```bash
flash deployments --json   # → each deployment includes "openai_base_url"
```

`model` in API calls = the run-ID alias (tracks the deployment) or the immutable revision `RUN_ID@final.<sha>` / `RUN_ID@step-N.<sha>` (pinned forever).

## Python

```python
import os
from openai import OpenAI

client = OpenAI(
    base_url=os.environ["FREESOLO_BASE_URL"],   # openai_base_url from `flash deployments --json`
    api_key=os.environ["FREESOLO_API_KEY"],
    timeout=30,
)

resp = client.chat.completions.create(
    model=os.environ["FREESOLO_MODEL_ID"],      # the run id / alias
    messages=[
        {"role": "system", "content": "Return only a valid command object matching schema v1."},
        {"role": "user", "content": user_input},
    ],
    temperature=0,
    max_tokens=1024,
    # Optional per-request override of the training-time constraint:
    response_format={"type": "json_schema", "json_schema": {"schema": COMMAND_SCHEMA}},
)

choice = resp.choices[0]
if choice.finish_reason != "stop":      # truncated → don't parse
    raise TruncatedOutput(choice.finish_reason)
data = json.loads(choice.message.content)
```

JavaScript: the official `openai` npm package with the same `baseURL` / `apiKey` / `model` configuration.

## Non-negotiables

- `FREESOLO_API_KEY`, `FREESOLO_BASE_URL`, `FREESOLO_MODEL_ID` live in backend env vars / a secret manager. **The browser never calls FreeSolo directly.**
- Every response is parsed → schema-validated → checked against deterministic safety rules **before** it is executed or rendered. Invalid output fails safely (retry once at temperature 0, else return an error state to the client).
- Check `finish_reason` before parsing; check `usage` for cost telemetry (cached tokens appear in `usage.prompt_tokens_details.cached_tokens`).

## Backend request pipeline

```text
Receive request → authenticate user → rate-limit → validate size/type
    → build normalized model input → call FreeSolo endpoint
    → parse → schema-validate → deterministic safety rules
    → execute/render → respond → log outcome + corrections (structured)
```

Logged accept/reject/correction events become the reviewed retraining dataset — that's the improvement loop.

## API error codes

| Code | Meaning | Action |
|---|---|---|
| 401 | Missing/invalid API key | Fix key |
| 402 | Insufficient org balance | Top up |
| 403 | Key's org doesn't own the adapter | Wrong key/org |
| 503 | Backend temporarily unavailable | Retry with exponential backoff |

## Latency & cost notes

- First request after deploy can be slow — deploy runs a smoke test and large models take minutes to warm. A failed smoke leaves the previous alias untouched.
- Keep the system prompt + schema preamble byte-stable across requests: prefix caching is automatic and cached prompt tokens cost ~5× less.
- `flash undeploy <run-id>` when a deployment is no longer needed.

## Run manifest (reproducibility)

Store one per experiment, next to the config:

```json
{
  "experiment_id": "baio-sft-001",
  "date": "2026-07-18",
  "environment_id": "your-org/baio-components",
  "environment_version": "<git-sha>",
  "dataset_version": "v1",
  "algorithm": "sft",
  "base_model": "Qwen/Qwen3.5-0.8B",
  "seed": 42,
  "training_examples": 100,
  "epochs": 1,
  "run_id": "<freesolo-run-id>",
  "baseline_metrics": {},
  "trained_metrics": {},
  "notes": ""
}
```

Promote a new adapter only when its held-out metrics beat the currently deployed one.
