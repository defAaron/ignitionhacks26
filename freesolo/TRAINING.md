# baio FreeSolo run book — wave 1 SFT

Exact commands, in order. Steps 1–5 are free; step 6 is the first command that
spends money. All commands verified against the installed `flash` 1.0.1 CLI.
Companion docs: `docs/freesolo/01-quickstart.md`, `08-baio-playbook.md`,
`docs/architecture/ai-pipeline.md` §4–5.

## 0. Prerequisites

- `flash` installed (`uv tool install freesolo-flash`) and logged in
  (`flash login --api-key <key>` or `FREESOLO_API_KEY` in the environment;
  verify with `flash whoami`).
- `freesolo/dataset/{train,eval,test}.jsonl` generated and reviewed
  (~80/10/10; ~25% of examples containing at least one `wait`).
- Sanity: `python3 freesolo/environment.py` prints three self-test scores
  (good ≈ 1.0, sloppy well under 0.8, broken = 0.0).
- Confirm the base model ids are still in the catalog: `flash models`.

## 1. Publish the environment

```bash
cd freesolo/
flash env push --name baio-shapes .
```

This prints the published id (`<org>/baio-shapes`). Paste that exact id
into `[environment] id` in `configs/sft.toml`. Local paths are not valid there.
Re-push after ANY change to `environment.py` or `dataset/` — workers use the
published copy, not your working tree.

## 2. Validate (free)

```bash
flash train configs/sft.toml --dry-run    # server-side validation, no GPU, no charge
```

Flash rejects unknown config keys at parse time — if `--dry-run` complains
about `structured_outputs` under SFT, see the note in `configs/sft.toml`.

## 3. Price (free)

```bash
flash train configs/sft.toml --cost       # deterministic quote; also the billing baseline
```

Do both 2 and 3 every time, before any real run.

## 4. Train (PAID — first paid command)

```bash
flash train configs/sft.toml
```

Sweep variants (one knob each, deep-merged over the base):

```bash
flash train configs/sft.toml --config configs/sweep/sft-150.toml     # 150 examples
flash train configs/sft.toml --config configs/sweep/sft-500.toml     # 500 examples
flash train configs/sft.toml --config configs/sweep/sft-2epoch.toml  # 2 epochs
flash train configs/sft.toml --config configs/sweep/sft-2b.toml      # Qwen3.5-2B capacity probe
```

Use `--background` to submit without following logs (useful when launching the
whole sweep). Ad-hoc single-knob probes: `--set train.epochs=2` etc.

## 5. Monitor

```bash
flash runs                  # list runs, state, cost
flash status <run-id> -f    # poll one run
flash log <run-id> -f       # follow logs (includes worker console/error artifacts)
```

**Ctrl-C DETACHES from log-following; it does NOT cancel the run** — the run
keeps burning server-side. To actually stop it:

```bash
flash cancel <run-id>       # repriced to steps reached; can take minutes
```

## 6. Deploy + smoke test

```bash
flash deploy <run-id>       # resolves immutable revision, smoke-tests, activates
flash chat <run-id> -m '{"task":"substitute_components","canvas":{"width":1440,"height":900},"detections":[{"id":"det_1","kind":"rect","bbox":[0,0,1440,80],"features":["wide","top"]},{"id":"det_2","kind":"rounded","bbox":[620,400,200,56],"text":"Login"}]}'
```

Expected: a `{"schema_version":"1.0","components":[...]}` document with one
command per detection (`navbar` at y=0 full-width, `button` with label
"Login"). If deploy fails with "run has no adapter" (cancelled/preempted run):
`flash checkpoints <run-id>` then `flash deploy <run-id>/step-<N>`.

## 7. Wire into the app

```bash
flash deployments --json    # contains openai_base_url per deployment
```

Set in `.env` (backend-only — never expose the key client-side):

```bash
FREESOLO_BASE_URL=<openai_base_url from deployments --json>
FREESOLO_MODEL=<run-id>
# FREESOLO_API_KEY should already be set
```

Then evaluate the adapter vs. the prompted baseline on the held-out split:

```bash
npx tsx scripts/eval-harness.ts --model baseline --split eval
npx tsx scripts/eval-harness.ts --model freesolo --split eval
```

Promote only if the adapter beats baseline; the untouched `test` split is for
the final promote decision only.

## 8. Tear down when idle

```bash
flash undeploy <run-id>     # serving bills per token — undeploy between demo sessions
```

## Gotchas (all bitten someone; respect every one)

1. **Ctrl-C detaches, never cancels.** `flash cancel <run-id>` is the only
   off-switch.
2. **Silent-drop rule:** dataset rows keep only `input` / `output` /
   `metadata` — every other top-level key is silently discarded before workers
   see the data. Gold bboxes, noise params, source-page info go under
   `metadata` or they are gone without warning.
3. **Never train on `eval`/`test` splits.** `[environment.params] split` stays
   `"train"`; test stays untouched until the promote decision.
4. **Check `finish_reason` before parsing** any completion — truncated JSON
   parses as garbage. Keep `max_tokens` above the largest command list.
5. **Re-push after edits.** `flash env push` again after any environment.py or
   dataset change, then re-run `--dry-run`/`--cost`.
6. **One variable per run.** The sweep overlays exist so results stay
   attributable.
7. **`flash undeploy` when idle** — deployments bill per token served.
8. **Schema sync:** `structured_outputs` in `configs/sft.toml` is a verbatim
   copy of `shared/schemas/components-v1.json`; re-copy on any schema change
   (rule zero), and keep the hardcoded whitelist in `environment.py` in sync.
