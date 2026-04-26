# Pi reasoning-level coding benchmark

This benchmark runs the same coding tasks through `pi --mode json` at multiple reasoning/thinking levels and records:

- wall-clock time
- token usage and cost reported by provider responses
- tool-call counts
- test pass/fail
- code delta size (`git diff --numstat`)
- final assistant summary and full event stream artifacts
- for the session-inspector task, the generated analyzer is run against the Pi session that produced it

## Quick start

```bash
cd /Users/macthedan/pi-reasoning-bench
# edit bench.config.json first if your model id differs
npm run bench
```

Default config compares `off`, `minimal`, `low`, `medium`, and `high` for `openai-codex/gpt-5.5` on three small JS tasks plus three harder open-ended design tasks with smoke tests and human-review rubrics.

## First run results

The first completed run was:

- **Model:** `openai-codex/gpt-5.5`
- **Tasks:** 6
- **Reasoning levels:** `off`, `minimal`, `low`, `medium`, `high`
- **Repetitions:** 1
- **Total Pi sessions:** 30
- **Result directory:** `results/2026-04-26T06-22-22-910Z`

### Recommendation

| Rank | Thinking level | Recommendation | Why |
|---:|---|---|---|
| 🥇 1 | `low` | **Best default** | Fastest passing level on 5/6 tasks, 100% pass rate, strong on open-ended prompts. |
| 🥈 2 | `minimal` | **Best cost-sensitive option** | 100% pass rate, often lowest token use, only slightly slower than `low`. |
| 3 | `off` | **Works, but inefficient on hard tasks** | Passed all tasks, but became very slow and token-heavy on open-ended work. |
| 4 | `medium` | **Generally dominated** | Passed all tasks, but was much slower and usually more token-heavy than `low`/`minimal`. |
| 5 | `high` | **Avoid for this workflow** | Failed or timed out on all three open-ended tasks; only 50% pass rate overall. |

### Aggregate comparison

| Thinking | Pass rate | Median time | Total wall time | Median tokens | Total tokens | Notes |
|---|---:|---:|---:|---:|---:|---|
| `low` | **100%** | **40.2s** | **3.9 min** | 24.4k | 168k | Best overall balance. |
| `minimal` | **100%** | 46.8s | 4.9 min | **19.9k** | **165k** | Best efficiency competitor. |
| `off` | **100%** | 208.6s | 25.4 min | 52.3k | 368k | Correct but wandered on harder tasks. |
| `medium` | **100%** | 149.3s | 21.5 min | 49.6k | 332k | More expensive without clear benefit. |
| `high` | 50% | 258.9s | 49.2 min | 8.6k* | 87k* | Failed/timeout-heavy; token numbers are misleadingly low due to early failures. |

\* `high` token counts are not directly comparable because several runs failed or timed out early.

### Per-task comparison

Each cell shows `time / total tokens` for that level. Non-passing runs show their status.

| Task | `off` | `minimal` | `low` | `medium` | `high` | Fastest pass |
|---|---:|---:|---:|---:|---:|---|
| Date range bugfix | 15s / 11.4k | 25s / 11.4k | **11s / 10.2k** | 18s / 12.3k | 46s / 28.5k | `low` |
| LRU cache | 15s / 10.8k | **14s / 10.5k** | 17s / 12.0k | 16s / 12.0k | 19s / 11.6k | `minimal` |
| Markdown parser refactor | 39s / 31.3k | 31s / 20.0k | **27s / 16.6k** | 53s / 32.9k | 70s / 35.9k | `low` |
| Workflow orchestrator | 378s / 133.5k | 79s / 69.2k | **57s / 50.4k** | 245s / 140.3k | timeout | `low` |
| Data quality profiler | 520s / 108.1k | 84s / 33.9k | **69s / 46.2k** | 312s / 68.1k | pi_fail | `low` |
| Pi session inspector | 554s / 73.3k | 62s / 19.8k | **53s / 32.2k** | 645s / 66.4k | timeout | `low` |

### Open-ended task signal

The three open-ended tasks are the most useful part of the benchmark for comparing reasoning levels.

| Thinking | Open-ended pass rate | Median time | Total time | Median tokens | Interpretation |
|---|---:|---:|---:|---:|---|
| `low` | **100%** | **56.7s** | **3.0 min** | 46.2k | Best practical performance. |
| `minimal` | **100%** | 79.3s | 3.8 min | **33.9k** | Slightly slower, often cheaper. |
| `off` | **100%** | 519.6s | 24.2 min | 108.1k | Passed, but inefficient. |
| `medium` | **100%** | 312.3s | 20.0 min | 68.1k | Correct but slow. |
| `high` | 0% | 908.7s | 47.0 min | 2.8k* | Failed/timed out on all open-ended tasks. |

## Configuration

Edit `bench.config.json`:

```json
{
  "model": "openai-codex/gpt-5.5",
  "thinkingLevels": ["off", "minimal", "low", "medium", "high"],
  "repetitions": 1,
  "timeoutSeconds": 900,
  "tasks": [
    "js-date-range-bugfix",
    "js-lru-feature",
    "js-markdown-refactor",
    "js-workflow-orchestrator-open-ended",
    "js-data-quality-profiler-open-ended",
    "js-agent-session-inspector-open-ended"
  ]
}
```

If pi lists GPT-5.5 under a different model id, find it with:

```bash
pi --list-models gpt-5.5
```

Then update `model`. You can also add provider args directly in `piArgs` or use a provider/model pair supported by your pi auth.

## Outputs

Each run creates a timestamped directory under `results/` containing:

- `results.json` — complete machine-readable metrics
- `results.csv` — spreadsheet-friendly summary
- `README.md` — per-run markdown table
- `*.events.jsonl` — raw pi JSON event stream
- `*.stderr.log` — pi stderr
- `*.diff.patch` — produced code patch
- `*.test.stdout.log` / `*.test.stderr.log` — post-run test output
- `*.self-analysis.stdout.log` / `*.self-analysis.stderr.log` — only for `js-agent-session-inspector-open-ended`; output from running the generated analyzer on its own Pi session
- `workspaces/<task>__<thinking>__r<n>/` — final code for inspection
- `sessions/` — pi session files

Summarize an existing result directory:

```bash
node scripts/summarize-results.mjs results/<timestamp>
```

## Interpreting results

A good first-pass comparison is:

1. **Pass rate**: did the code satisfy deterministic tests?
2. **Median time**: how long until pi stopped?
3. **Median total/output tokens and cost**: how expensive was the run?
4. **Patch size**: did the model make a minimal focused change or broad rewrites?
5. **Manual code review**: inspect `*.diff.patch` and each workspace's `EVALUATION_RUBRIC.md` for readability, maintainability, unnecessary complexity, and robustness beyond tests.

The open-ended tasks intentionally have incomplete smoke tests. Treat test pass/fail as a baseline sanity check, then score the output subjectively against the rubric. This is where differences between thinking levels should show up more clearly than in one-shot bugfix tasks. A reusable scoring sheet is included at `REVIEW_TEMPLATE.md`.

For better statistics, set `repetitions` to at least `3` and randomize run order if rate limits or time-of-day effects matter to you. The current runner keeps order deterministic for reproducibility.

## Adding tasks

Add a JSON file in `tasks/<id>.json`:

```json
{
  "id": "my-task",
  "title": "Human readable title",
  "prompt": "What pi should do",
  "testCommand": "node --test",
  "evaluationRubric": ["What a human reviewer should look for"],
  "files": {
    "package.json": "...",
    "src.js": "...",
    "src.test.js": "..."
  }
}
```

Then add the id to `bench.config.json`.

## Notes

- The runner disables context files, extensions, skills, and prompt templates by default to reduce confounds.
- It stores sessions in the result directory via `--session-dir`.
- For `js-agent-session-inspector-open-ended`, after Pi finishes and tests run, the harness locates the matching saved session by workspace `cwd` and invokes the produced `session-inspector.js` against that session. This is deliberately recursive/metacircular, but useful: it tests whether the analyzer handles a real session rather than only the tiny fixture.
- It relies on pi's JSON events and assistant `usage` fields for token/cost accounting.
- Deterministic tests measure correctness, but code quality still needs either manual review or a separate judge rubric.
