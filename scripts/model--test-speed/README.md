# AI Speed Test

A small, dependency-free **quick check** for the active OpenAI-compatible API at
`AI_API_URL` (currently llama.cpp on port `8001`). Use it after restarts, model
switches or driver updates. For load tests, percentiles and concurrency,
use [AIPerf](#full-benchmarks-aiperf).
Recorded measurements are in the
[Speed Test Results](../../Intel-Arc-B60-Speed-Test-Results.md).

It measures, per run:

- **Time To First Token (TTFT)** — request latency
- **Peak llama-server RAM** — sampled over SSH during each request
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
bun install   # from repository root
```

## Usage

```bash
# Benchmark SPEED_TEST_MODEL (or the first model the server reports)
bun run bench

# Benchmark a specific model
bun run bench /models/YOUR_MODEL.gguf

# Just list the models the server exposes
bun run list
```

Run these from the repository root. Bun loads the root `.env` automatically.
For a full model change, use [`bun run model`](../model--download-and-test/README.md).

### Configuration

`AI_API_URL` and `AI_API_KEY` come from the repo-root `.env`. Speed settings
use the defaults below unless overridden there.

| Variable                  | Description                                   |
|---------------------------|-----------------------------------------------|
| `AI_API_URL`              | Base URL of the OpenAI-compatible API         |
| `AI_API_KEY`              | API key                                       |
| `AI_SSH_HOST`             | SSH alias used for optional RAM sampling      |
| `SPEED_TEST_MODEL`        | Model name (empty = first from `/models`)     |
| `SPEED_TEST_ITERATIONS`   | Measured runs                                 |
| `SPEED_TEST_MAX_TOKENS`   | Max output tokens                             |
| `SPEED_TEST_TEMPERATURE`  | Sampling temperature                          |
| `SPEED_TEST_PROMPT`       | Prompt text                                   |
| `SPEED_TEST_TIMEOUT_MS`   | Per-request timeout                           |

Any of them can be overridden for one run from the shell, e.g.
`SPEED_TEST_ITERATIONS=5 bun run bench`.

When `AI_SSH_HOST` is set, the benchmark samples the remote `llama-server`
process every 500 ms and reports peak RSS and its lifetime high-water mark.

### Flags

- `--list` — list available models and exit
- `--no-warmup` — skip the (uncounted) warm-up run
- `--no-reasoning` — request no thinking with `reasoning: { effort: "none" }`;
  support depends on the server and model

### Reasoning models

Reasoning models can stream thinking in a `reasoning_content` delta before
producing the final answer in `content`. This script counts both when reporting
throughput, and shows the reasoning token count separately when available.

Token counts are exact: the script requests `stream_options: { include_usage: true }`
and a compatible server returns `usage` in the final chunk. It falls back to a whitespace estimate,
marked `(est)`, only if a server ignores that option. Use `--no-reasoning` to
request final-answer-only speed; Qwen3.6's documented switch is
`chat_template_kwargs: {"enable_thinking": false}` and this flag has not been
validated against it. If every run shows exactly
`SPEED_TEST_MAX_TOKENS` tokens, the output hit the limit.

## Example

```bash
SPEED_TEST_ITERATIONS=2 bun run bench --no-warmup
```

See the [recorded Bun runs](../../Intel-Arc-B60-Speed-Test-Results.md#bun-speed-test-quick-check)
for real output and timings.

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

# OVMS-only example: enable OVMS in place of llama.cpp first.
# Load .env, then point this command at port 8000 (concurrency 1, then 4).
set -a; source .env; set +a
AI_API_URL="http://${AI_SERVER_HOST}:8000/v3"
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

Recorded single-request and concurrency measurements are in the
[OpenVINO results](../../Intel-Arc-B60-Speed-Test-Results.md#local-openvino-model-server-qwen38-27b-int4).

### Alternative: GuideLLM
[GuideLLM](https://github.com/vllm-project/guidellm) (vLLM project) is the other
well-maintained option. It offers rate sweeps (`--profile kind=sweep`) and HTML reports. Use
`--backend kind=openai_http,target=...,request_format=/v3/chat/completions,api_key=...`.

## Earlier llama.cpp Swift 1.5 results

Direct API measurements of Swift 1.5, including the Vulkan and
SYCL long-input trials, are in the
[Speed Test Results](../../Intel-Arc-B60-Speed-Test-Results.md#local-llamacpp-swift-15-qwen38-27b).

## Troubleshooting

- **Connection refused / timeout** — confirm the selected service is running and reachable:
  `curl -H "Authorization: Bearer $AI_API_KEY" "$AI_API_URL/models"`
- **Model not found** — run `bun run list` to see the exact model names the
  server exposes, then pass one of them as the argument to `bun run bench`.
- **HTTP 401**: if using OVMS, set `AI_API_KEY` in the root `.env` to match
  the key configured in its saved service.
