# AI Speed Test

A small, dependency-free **quick check** for the Intel Arc B60 OpenVINO Model
Server (OVMS), which exposes an OpenAI-compatible API at `AI_API_URL`. Use it after
restarts, model switches or driver updates. For load tests, percentiles and concurrency,
use [AIPerf](#full-benchmarks-aiperf).

It measures, per run:

- **Time To First Token (TTFT)** — request latency
- **Token generation throughput** — tokens/sec after the first token
- **Overall throughput** — tokens/sec across the whole request
- **Prompt / completion token counts**: exact, from the server `usage` field
  (requested via `stream_options.include_usage`)

The script runs on [Bun](https://bun.sh) and uses its built-in `fetch` + streaming
to parse the SSE response, so there are no runtime dependencies.

## Requirements

- Bun 1.1+
- A filled-in repo-root `.env` (copy `.env.example`)

## Install

```bash
cd scripts/speed-test
bun install   # dev-only: TypeScript types
```

## Usage

```bash
# Benchmark SPEED_TEST_MODEL (or the first model the server reports)
bun run bench

# Benchmark a specific model
bun run bench OpenVINO/Qwen3.8-27B-int4-ov

# Just list the models the server exposes
bun run list
```

Both scripts load `../../.env` via `bun --env-file`.

### Configuration

Every setting comes from the repo-root `.env`; the script has no built-in
defaults and stops with a clear error if a required variable is missing.

| Variable                  | Description                                   |
|---------------------------|-----------------------------------------------|
| `AI_API_URL`              | Base URL of the OpenAI-compatible API         |
| `AI_API_KEY`              | API key                                       |
| `SPEED_TEST_MODEL`        | Model name (empty = first from `/models`)     |
| `SPEED_TEST_ITERATIONS`   | Measured runs                                 |
| `SPEED_TEST_MAX_TOKENS`   | Max output tokens                             |
| `SPEED_TEST_TEMPERATURE`  | Sampling temperature                          |
| `SPEED_TEST_PROMPT`       | Prompt text                                   |
| `SPEED_TEST_TIMEOUT_MS`   | Per-request timeout                           |

Any of them can be overridden for one run from the shell, e.g.
`SPEED_TEST_ITERATIONS=5 bun run bench`.

### Flags

- `--list` — list available models and exit
- `--no-warmup` — skip the (uncounted) warm-up run
- `--no-reasoning` — ask the server to skip the model's chain-of-thought
  (sends `reasoning: { effort: "none" }`), so throughput reflects only the
  final answer

### Reasoning models

The default model (`OpenVINO/Qwen3.8-27B-int4-ov`) is a **reasoning model**: it
streams its thinking in a `reasoning_content` delta before producing the final
answer in `content`. This script counts **both** when reporting throughput, and
shows the reasoning token count separately (e.g. `512 tok +128 reasoning`).

Token counts are exact: the script requests `stream_options: { include_usage: true }`
and OVMS returns `usage` in the final chunk. It falls back to a whitespace estimate,
marked `(est)`, only if a server ignores that option. Use `--no-reasoning` to
measure only the final-answer speed. If every run shows exactly
`SPEED_TEST_MAX_TOKENS` tokens, the output hit the limit.

## Example

```bash
SPEED_TEST_ITERATIONS=2 bun run bench --no-warmup
```

Real output (Oct 2026, Qwen3.8-27B int4 on one B60):

```
=== AI Speed Test ===
Endpoint   : <AI_API_URL>
Model      : OpenVINO/Qwen3.8-27B-int4-ov
Iterations : 2
Max tokens : 256   Temperature: 0.7
Reasoning  : on (counted in throughput)
----------------------------
  [measured] run 1: TTFT 287ms | 25.02 tok/s (gen) | 24.33 tok/s (total) | 256 tok | 10,521ms
  [measured] run 2: TTFT 279ms | 25.03 tok/s (gen) | 24.36 tok/s (total) | 256 tok | 10,509ms
----------------------------
Summary (measured runs):
  TTFT            : min 279ms | avg 283ms | max 287ms
  Gen throughput  : min 25.02 | avg 25.02 | max 25.03 tok/s
  Overall tok/s   : min 24.33 | avg 24.35 | max 24.36 tok/s
```

## Full Benchmarks: AIPerf

This script is a **quick smoke test**: one request at a time, no Python, settings from
`.env`. For real measurements use an established tool. **AIPerf** (NVIDIA, Apache-2.0,
actively maintained) works with OVMS's `/v3` API and adds what this script can't measure:

- **Concurrency / load:** shows how throughput scales when agents send parallel requests
- **Inter-token latency (ITL)** and p50/p90/p99 percentiles
- **Controlled input/output lengths** with synthetic prompts (e.g. 512 in / 256 out)
- **Prefill throughput** and exports (JSON/CSV) for comparing runs

```bash
# One-time install (any OS with Python 3.10+)
python -m venv ~/aiperf-venv && ~/aiperf-venv/bin/pip install aiperf   # Windows: aiperf-venv\Scripts\pip

# Load .env, then benchmark (concurrency 1, then 4)
set -a; source ../../.env; set +a
for c in 1 4; do
  aiperf profile \
    --model OpenVINO/Qwen3.8-27B-int4-ov --tokenizer Qwen/Qwen3.8-27B \
    --url "${AI_API_URL%/v3}" --endpoint /v3/chat/completions \
    --endpoint-type chat --streaming --api-key "$AI_API_KEY" \
    --synthetic-input-tokens-mean 512 --output-tokens-mean 256 \
    --extra-inputs ignore_eos:true --use-server-token-count \
    --concurrency "$c" --request-count $((c * 2 + 1)) --warmup-request-count 1 \
    --artifact-dir "aiperf-c$c"
done
```

Notes:
- `--endpoint /v3/chat/completions` is needed because OVMS serves `/v3`, not `/v1`.
- `ignore_eos:true` forces exactly `--output-tokens-mean` tokens, so runs are comparable.
- `--use-server-token-count` uses OVMS's exact counts, which avoids tokenizer-mismatch
  warnings.
- **Windows (Git Bash):** prefix with `MSYS_NO_PATHCONV=1 PYTHONUTF8=1`. Otherwise Git
  Bash rewrites `/v3/...` into a file path, and the result table crashes the console
  encoding.

### Measured on our B60 (Oct 2026, Qwen3.8-27B int4, 512 in / 256 out)

| Concurrency | TTFT avg | ITL avg | Tok/s per request | **Tok/s total** |
|---|---|---|---|---|
| 1 | 616 ms | 40.4 ms | 24.7 | 23.4 |
| 4 | 1,260 ms | 45.9 ms | 21.8 | **78.2** |

OVMS batches parallel requests well: **4 parallel requests give 3.3× the total
throughput**, and each one only slows by ~12%. Agent clients that run sub-tasks in
parallel benefit directly. Prefill runs at ~830 tok/s, so a 50K-token prompt takes about
1 minute before the first output token.

### Alternative: GuideLLM
[GuideLLM](https://github.com/vllm-project/guidellm) (vLLM project) is the other
well-maintained option. It offers rate sweeps (`--profile kind=sweep`) and HTML reports. Use
`--backend kind=openai_http,target=...,request_format=/v3/chat/completions,api_key=...`.

## Troubleshooting

- **Connection refused / timeout** — confirm OVMS is running and reachable:
  `curl -H "Authorization: Bearer $AI_API_KEY" "$AI_API_URL/models"`
- **Model not found** — run `bun run list` to see the exact model names the
  server exposes, then pass one of them as the argument to `bun run bench`.
- **HTTP 401**: set `AI_API_KEY` in the root `.env` to match `API_KEY` in the
  server's `/etc/ovms/ovms.env`.
