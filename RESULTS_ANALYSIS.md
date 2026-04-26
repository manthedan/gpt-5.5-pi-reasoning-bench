# GPT-5.5 Pi reasoning-level benchmark results

Run directory: `results/2026-04-26T06-22-22-910Z`

Model: `openai-codex/gpt-5.5`

Reasoning levels: `off`, `minimal`, `low`, `medium`, `high`

Tasks: 6 total, 1 repetition each, 30 sessions total.

## Executive summary

This run strongly favored `low` and `minimal` reasoning. `low` was the fastest passing level on 5 of 6 tasks and passed all tasks. `minimal` was close and often used fewer tokens. `off` passed all tasks but became very slow/token-heavy on the open-ended prompts. `medium` passed but was generally dominated by `low`/`minimal`. `high` performed poorly, failing or timing out on all three open-ended tasks.

Recommended default from this run:

- General coding: `low`
- Cost-sensitive coding: `minimal`
- Avoid for this workflow: `high`

## Aggregate results

| thinking | runs | pass rate | total wall time | median time | total tokens | median tokens |
|---|---:|---:|---:|---:|---:|---:|
| off | 6 | 100% | 25.4 min | 208.6s | 368k | 52.3k |
| minimal | 6 | 100% | 4.9 min | 46.8s | 165k | 19.9k |
| low | 6 | 100% | 3.9 min | 40.2s | 168k | 24.4k |
| medium | 6 | 100% | 21.5 min | 149.3s | 332k | 49.6k |
| high | 6 | 50% | 49.2 min | 258.9s | 87k* | 8.6k* |

\* High token numbers are misleadingly low because several high-reasoning runs failed or timed out early.

## Per-task summary

| task | off | minimal | low | medium | high | fastest pass |
|---|---:|---:|---:|---:|---:|---|
| date-range-bugfix | 15s / 11.4k | 25s / 11.4k | 11s / 10.2k | 18s / 12.3k | 46s / 28.5k | low |
| lru-feature | 15s / 10.8k | 14s / 10.5k | 17s / 12.0k | 16s / 12.0k | 19s / 11.6k | minimal |
| markdown-refactor | 39s / 31.3k | 31s / 20.0k | 27s / 16.6k | 53s / 32.9k | 70s / 35.9k | low |
| workflow-orchestrator-open-ended | 378s / 133.5k | 79s / 69.2k | 57s / 50.4k | 245s / 140.3k | timeout | low |
| data-quality-profiler-open-ended | 520s / 108.1k | 84s / 33.9k | 69s / 46.2k | 312s / 68.1k | pi_fail | low |
| agent-session-inspector-open-ended | 554s / 73.3k | 62s / 19.8k | 53s / 32.2k | 645s / 66.4k | timeout | low |

## Open-ended tasks only

| thinking | open-ended runs | pass rate | total time | median time | total tokens | median tokens |
|---|---:|---:|---:|---:|---:|---:|
| off | 3 | 100% | 24.2 min | 519.6s | 315k | 108.1k |
| minimal | 3 | 100% | 3.8 min | 79.3s | 123k | 33.9k |
| low | 3 | 100% | 3.0 min | 56.7s | 129k | 46.2k |
| medium | 3 | 100% | 20.0 min | 312.3s | 275k | 68.1k |
| high | 3 | 0% | 47.0 min | 908.7s | 11k* | 2.8k* |

## Failures

- `js-workflow-orchestrator-open-ended__high__r1`: timeout after 908.7s, tests failing.
- `js-data-quality-profiler-open-ended__high__r1`: `pi_fail` after 448.1s, tests failing.
- `js-agent-session-inspector-open-ended__high__r1`: timeout after 1462.3s, tests passing but Pi did not finish cleanly before timeout.

## Notes on packaged artifacts

This package intentionally excludes the raw `*.events.jsonl` streams and full saved sessions because they were approximately 2.5GB. Included artifacts are enough to review benchmark setup, task prompts, aggregate metrics, produced patches, test logs, and session-inspector self-analysis reruns.

Raw full results remain on the original machine under:

`/Users/macthedan/pi-reasoning-bench/results/2026-04-26T06-22-22-910Z`
