# Data manifest

This repository/package contains a lightweight publication subset of the Pi reasoning benchmark.

## Included

- Benchmark runner and summarizer scripts: `scripts/`
- Task definitions/prompts/scaffolds: `tasks/`
- Main config: `bench.config.json`
- Smoke config: `smoke.config.json`
- Human review template: `REVIEW_TEMPLATE.md`
- Result analysis: `RESULTS_ANALYSIS.md`
- Aggregate result files:
  - `results/2026-04-26T06-22-22-910Z/results.json`
  - `results/2026-04-26T06-22-22-910Z/results.csv`
  - `results/2026-04-26T06-22-22-910Z/README.md`
- Produced patches: `results/2026-04-26T06-22-22-910Z/*.diff.patch`
- Post-run test logs: `results/2026-04-26T06-22-22-910Z/*.test.*.log`
- Session-inspector self-analysis rerun logs: `results/2026-04-26T06-22-22-910Z/*.self-analysis.rerun.*.log`

## Excluded

The raw Pi event streams and saved sessions are excluded from this lightweight package because the full result directory is approximately 2.5GB.

Excluded patterns:

- `results/**/*.events.jsonl`
- `results/**/sessions/`
- `results/**/workspaces/`

## Original full result path

On the benchmark machine, the full raw run is available at:

`/Users/macthedan/pi-reasoning-bench/results/2026-04-26T06-22-22-910Z`
