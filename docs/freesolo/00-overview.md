# 00 — Overview: what FreeSolo is and when to use it

## The platform

FreeSolo Flash is **managed post-training + serving**:

1. Pick a supported base model (`flash models` — currently six Qwen/OpenBMB models, 0.8B–35B).
2. Define the task as code (an *environment*: dataset loading, prompt construction, scoring).
3. Supply a training signal: labeled examples (SFT), a reward function (GRPO), or a teacher model (OPD).
4. `flash train` produces a **LoRA adapter** on managed GPUs — you never touch infrastructure.
5. `flash deploy` serves the adapter behind an **OpenAI-compatible API**, billed per token.

FreeSolo does **not** train foundation models from scratch, and it is not an app platform. It's one trainable component inside a deterministic architecture.

## When FreeSolo is the right tool

The task is **narrow, repeated, measurable, and stable**:

- structured extraction, classification, routing
- SQL generation for a fixed schema; code transformations
- domain command generation (diagram commands, editor operations, tool-call selection)
- consistent product-specific text transformation
- anything where a frontier model works but is too slow/expensive/inconsistent at scale

## When it is the wrong tool

- **Changing facts** (news, prices, inventory, user data) → use retrieval / APIs / a database
- **Broad open-ended reasoning** → use a frontier model
- **Exact computation** → use deterministic code
- **No measurable success criterion or training signal** → don't train yet

> Train stable behavior. Retrieve changing facts. Execute exact rules in code.

## The three algorithms

| Algorithm | Signal | How it works | Use when |
|---|---|---|---|
| **SFT** (default) | Correct input→output examples | Learns from prompt/answer pairs in your dataset | You can write or generate gold outputs. **Always start here.** |
| **GRPO** | A reward function | Samples the model's own completions, scores them with your environment's reward, updates toward higher scores | Outputs are automatically checkable (schema-valid, tests pass, renders correctly) and many answers are valid |
| **OPD** | A stronger teacher model | A managed teacher (default `glm-5.2`) grades the student's own completions token-by-token | A big model does the task well and you want that behavior in a small one. Warm-start from an SFT adapter. OPD does **not** support tool-calling. |

### Selection table

| Available signal | Algorithm |
|---|---|
| Correct input-output examples | SFT |
| Deterministic/reliable scoring function | GRPO |
| Strong teacher, no labels or reward | OPD |
| Small dataset + reliable validator | SFT, then GRPO |
| No examples, no teacher, no reward | **Do not train yet** |

## Decision checklist before any training run

1. **Is the task narrow?** "Convert detected shapes into component commands" ✅. "Understand any drawing" ❌.
2. **Can success be measured?** Parse rate, schema-valid rate, task success, latency, cost, acceptance rate.
3. **Does prompting already solve it?** Build the prompted baseline (base model + best practical prompt) first. Fine-tune only if it improves a metric that matters.
4. **Is there a training signal?** Examples, a reward, a teacher, tests, or reviewed production corrections.

## Reward-design warning (GRPO)

The model optimizes the reward that *exists*, not the intent you imagined. A reward of "+1 if all requested labels appear" gets you all labels crammed into one invalid text field. Score components separately: schema validity, execution success, required-content coverage, geometry, forbidden operations — and test the reward against known-good and known-bad outputs before training on it.

## The production loop

```text
Deploy → observe → collect failures → write corrected examples
      → human review (never auto-train on raw production data)
      → retrain → evaluate vs. previous model on held-out test set
      → promote only if metrics improve
```
