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

## Configuration

Edit `bench.config.json`:

```json
{
  "model": "openai-codex/gpt-5.5",
  "thinkingLevels": ["off", "minimal", "low", "medium", "high"],
  "repetitions": 3,
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
