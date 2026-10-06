# Intel Arc B60 Speed Test and Benchmark Results

This page collects measured results from this server and published model
benchmarks. The local server results were recorded in October 2026 on one
Intel Arc Pro B60 with 24 GB VRAM. Published model scores use different
harnesses and runtimes; they are not measurements of the GGUF files on this B60.
For commands and tools, see the [speed-test README](./scripts/speed-test/README.md).

## Local llama.cpp: Qwen3.8-27B imatrix IQ3_M

Measured October 6, 2026 against the active Intel SYCL service at
`192.168.0.29:8001`. The model was
`/models/Qwen3.8-27B-IQ3_M.gguf` (13,032,195,616 bytes), with the bundled MTP
head enabled, the Q8_0 vision projector loaded, one slot, and a 32,768 context.
The container used `ghcr.io/ggml-org/llama.cpp:server-intel`, build
`b11434-5e03bdd87`, all model layers on the B60, Q8 key/value cache, batch 512,
microbatch 128, and `draft-mtp` with one draft token. Requests used temperature
0.2. Times include the Windows client and LAN unless the server timing is named.

| Request | Prompt / completion tokens | Result | Time and throughput |
|---|---:|---|---|
| Streaming short generation; “Explain what a GPU does in four concise bullet points”; 3 measured runs after one warm-up, `max_tokens=256` | 117–156 completion tokens per run | All completed. Reasoning and answer tokens are both counted. The repeated prompt and warm-up make TTFT a warm-cache result. | TTFT **890 ms average** (888–892 ms); generation **7.39 tok/s average** (7.14–7.55); overall **7.04 tok/s average** (6.86–7.17); 16.51–22.75 s per request. |
| **Long-context synthetic code prompt; `max_tokens=512`** | **23,860 / 38** | **Returned `READY`, `finish_reason=stop`; 42 prompt tokens cached.** | **195.02 s end to end; server measured 189.39 s prefill at 125.76 tok/s and generation at 7.01 tok/s.** MTP proposed 20 tokens and 17 were accepted. |

The long request repeated `function add(a, b) { return a + b; }` 1,700 times,
then asked for `READY`. Its 23,860-token prompt plus 38 completion tokens fit
within the configured 32,768 context. This is a synthetic near-client-limit
capacity and speed check, not a coding-quality or multimodal-image test. The
short streaming runs reused the same prompt after a warm-up, so their TTFT is
not a cold-start measurement. The long request had only 42 cached prompt tokens
and is the better measure of prefill at this input length.

## Current developer profile: 65,536 context

On October 6, 2026, the active SYCL service was raised to a 65,536 context.
The `/v1/models` API reported `n_ctx=65536` and `n_ctx_train=262144`, and
`/slots` reported the same runtime context. A 42,063-token synthetic prompt
(repeated code plus the chat template) was accepted with no prompt tokens
cached. Its prefill took **385.93 seconds**. A first smoke request with only
64 output tokens ended with `finish_reason=length` before visible answer text;
this was an output-cap issue, not a context failure.

The same prompt was then retried with the intended **8,192-token output cap**.
It returned `READY` with `finish_reason=stop`, 42,063 prompt tokens, and 89
completion tokens in 14.88 seconds. This retry reused the prompt prefix, so its
elapsed time is a warm-cache result. Together these checks verify the 40K-input
developer profile fits the configured service, but the uncached prefill time is
about **6 minutes 26 seconds** on this IQ3_M model. The request was synthetic;
real VS Code agent prompts, multimodal requests, and quality beyond the GGUF's
32,768 calibration length still need separate evaluation.

## 49K developer input check

With the 65,536 context still active, a unique synthetic code prompt was sent
with `max_tokens=8192`. The server counted **49,106 prompt tokens**, including
chat formatting, and only 42 prompt tokens were reused from cache. It returned
`READY` with `finish_reason=stop` and 88 completion tokens in **455.63 seconds**.
The 8,192-token output cap was accepted; the response ended naturally before
using it. This verifies a 49,152-input / 8,192-output client budget fits this
server context, leaving 8,192 tokens of margin. The prompt was synthetic, so
real VS Code agent behavior and quality beyond the GGUF's 32,768 calibration
length still need evaluation. Cold prefill at this size took about **7 minutes
36 seconds**.

## Local llama.cpp: Swift 1.5 Qwen3.8-27B

These are earlier runs with the Swift 1.5 GGUF. The current Intel SYCL model
is covered above; the [Vulkan setup](./Intel-Arc-B60-Server-Setup-Vulkan.md)
documents the alternative backend. The file was
`Swift-1.5-Qwen3.8-27B-Q4_K_M.gguf` (17,442,399,936 bytes) on
Ubuntu 26.04 with Docker. Both backends used one slot, 49,152 server context,
Q8 key/value cache, batch size 512, microbatch size 128, and all layers on the
B60. The long inputs were repetitive synthetic text. They establish capacity
and speed, not coding quality on a repository.

| Backend and request | Prompt / output tokens | Result | Time and throughput |
|---|---:|---|---|
| Vulkan, long prompt | 40,022 / 32 | Completed without truncation on retry; 31,274 prompt tokens were cached. The first attempt exceeded a 300 s client timeout. | Retry took 157.91 s; remaining prompt processing measured 58.7 tok/s and generation measured 3.55 tok/s near 40K context. |
| SYCL, short coding prompt | 74 / 117 | Completed, with reasoning and code in the answer. | 7.09 s end to end. |
| **SYCL, long prompt** | **40,009 / 32** | **Completed without truncation; 42 prompt tokens were cached.** | **199.91 s end to end; server logs measured 203.30 prompt tok/s and 10.62 generation tok/s near 40K context.** |
| SYCL, systemd restart check | 56 / 22 | Returned `READY` through the service on port 8001. | About 3.5 s end to end. |

The Vulkan retry and nearly uncached SYCL run used different prompt-cache
conditions, so their total times are not directly comparable. Deep-context
generation in these runs was 3.55 tok/s on Vulkan and 10.62 tok/s on SYCL.
The live SYCL API reported model ID
`/models/Swift-1.5-Qwen3.8-27B-Q4_K_M.gguf`, context 49,152, and trained
context 262,144. The proposed VS Code allowance is **40,000 input plus 8,192
output**; a complete exchange at both limits has not been measured.

## Local llama.cpp: Unsloth Qwen3.8-27B UD-Q4_K_M

On October 6, 2026, I tested the live LAN API at `192.168.0.29:8001` after
the model switch. `/v1/models` reported
`/models/Unsloth-Qwen3.8-27B-UD-Q4_K_M.gguf`, a 49,152-token context, and
Q4_K medium quantization. Requests used the OpenAI-compatible chat endpoint,
temperature 0.2, and non-streaming responses. Wall time is measured from the
Windows client and includes network and server overhead.

| Request | Prompt / completion tokens | Result | End-to-end time |
|---|---:|---|---:|
| Explain a GPU in four bullets; `max_tokens=256` (3 runs) | 26 / 256 each | All hit `finish_reason=length`; the API returned empty final `content` because the reasoning consumed the output budget. | 4.41–5.47 s |
| Reply exactly `READY`; `max_tokens=512` (3 runs) | 15 / 136–232 | All returned `READY` with `finish_reason=stop`. Completion counts include reasoning tokens. | 2.41–4.02 s; mean 3.40 s |
| **Long-context check; `max_tokens=8192`** | **39,931 / 288** | **Completed with `finish_reason=stop`; returned `READY`. Zero prompt tokens were cached.** | **63.31 s end to end** |

The short checks are not a controlled throughput benchmark: prompts were tiny,
warm-cache conditions varied, and responses were not streamed. The 256-token
trial shows that a small output cap can be exhausted by this
model's reasoning before it emits visible final text. In the long-context
check, the user message contained 39,901 tokenizer-counted synthetic filler
tokens; the full chat request was 39,931 prompt tokens, followed by the
instruction to answer `READY`. The 8,192-token output allowance was available,
but the model used 288 completion tokens including reasoning. This confirms a
single uncached ~40K request fits and completes on the server. It does not
establish why VS Code occasionally reports “Sorry, no response was returned”;
the test used a non-streaming direct API request rather than VS Code's streaming
path and agent/tool schemas.

## Other local context checks

The previous Qwen3.6-35B-A3B Q4_K_M llama.cpp service used a 49,152-token
server context and Q8 key/value cache. A 42,041-token input succeeded on the
B60. This did not test a full 8,192-token reply after a 40K input, and it does
not establish the context capacity of any other model.

## Local OpenVINO Model Server: Qwen3.8-27B INT4

These are prior measurements of `OpenVINO/Qwen3.8-27B-int4-ov` on the same B60,
using OVMS on port 8000. They are a different model/runtime configuration from
the current Qwen3.8 IQ3_M GGUF service. Reasoning tokens were counted in generation.

### Bun speed-test quick check

Two measured runs, 256 output tokens each, temperature 0.7:

| Run | TTFT | Generation | Overall | Time |
|---|---:|---:|---:|---:|
| 1 | 287 ms | 25.02 tok/s | 24.33 tok/s | 10,521 ms |
| 2 | 279 ms | 25.03 tok/s | 24.36 tok/s | 10,509 ms |

TTFT averaged 283 ms (279–287 ms). Generation averaged 25.02 tok/s;
overall throughput averaged 24.35 tok/s.

### AIPerf load check

Synthetic 512-token input and 256-token output, with one warmup request:

| Concurrency | Average TTFT | Average inter-token latency | Tok/s per request | Aggregate tok/s |
|---:|---:|---:|---:|---:|
| 1 | 616 ms | 40.4 ms | 24.7 | 23.4 |
| 4 | 1,260 ms | 45.9 ms | 21.8 | **78.2** |

Four parallel requests yielded about 3.3 times the aggregate throughput of
one request; per-request throughput was about 12% lower. A separate reported
512-token prompt-prefill rate was about 830 tok/s. Neither this short-prompt
rate nor the concurrency check establishes 40K–80K prompt latency or memory fit.

## Published coding benchmark scores

These scores came from model cards and use different evaluation harnesses,
inference settings, and sometimes different benchmark versions. They are
**not controlled head-to-head B60 tests**. Swift's scores were reported for
BF16 vLLM, not the local Q4_K_M GGUF.

| Model | SWE-bench Pro | Terminal-Bench | Other published coding evidence |
|---|---:|---:|---|
| [Swift 1.5 Qwen3.8-27B](https://huggingface.co/ukisai/Swift-1.5-Qwen3.8-27B-GGUF) | Not published | 72.13 (v2.1, publisher BF16 vLLM evaluation) | Publisher reports LiveCodeBench v6 81.71% versus base 76.76%; its matched Terminal-Bench base score was 69.21%. |
| [Qwen3.8-27B](https://huggingface.co/Qwen/Qwen3.8-27B) | 61.7 | 73.0 (v2.1, publisher evaluation) | Base model of Swift 1.5. |
| [Qwen3.6-35B-A3B](https://huggingface.co/Qwen/Qwen3.6-35B-A3B) | 49.5 | 51.5 (v2.0) | Different Terminal-Bench version. |
| [KAT-Coder-V2.5-Dev](https://huggingface.co/Kwaipilot/KAT-Coder-V2.5-Dev) | 46.0 | 41.0 (v2.1) | Publisher result. |
| [Qwen3-Coder-30B-A3B-Instruct](https://huggingface.co/Qwen/Qwen3-Coder-30B-A3B-Instruct) | ~20 | 13.5 | Older baseline; source/harness details should be checked before comparison. |

JEV-27B's GGUF text path uses the frozen Qwen3.8 backbone; no independent
JEV coding benchmark was reported for that path.

## Community Windows LM Studio results

The [community report by u/AmericanRiskCouncil](https://www.reddit.com/r/IntelArc/comments/1veyi1z/dual_intel_arc_b60_lm_studio_best_drivers_settings/)
used Windows, LM Studio with Vulkan llama.cpp, Qwen3.6-35B-A3B, and one or two
Arc Pro B60 cards. These are another user's observations on an i9-14900K,
not measurements from the Ubuntu server in this repository. Windows runtime
and driver settings are in the [Windows LM Studio guide](./Intel-Arc-B60-Windows-LM-Studio.md).

| Workload | Single B60 | Dual B60 |
|---|---:|---:|
| Simple prompt (“what can you do?”) | 82–91 tok/s | 72–78 tok/s |
| Long prompt with extensive thinking | 50–62 tok/s | 33–44 tok/s |
| Claude Code (local) | 24–42 tok/s | 16–28 tok/s |

In that report, splitting this one-card model across two B60s was slower.
Dual cards can still help when a model or context requires their combined VRAM.

## Published Arena user ratings

The October 6, 2026 text-leaderboard snapshot listed
[Qwen3.8-27B at 1438 Elo from 6,913 votes](https://modelmarkets.ai/benchmarks/lmarena-text?model=Qwen/Qwen3.8-27B)
and [Gemma 4 26B-A4B Instruct at 1435 Elo from 5,813 votes](https://modelmarkets.ai/benchmarks/lmarena-text?model=google/gemma-4-26B-A4B-it).
These are crowd-preference ratings for the listed models, not evaluations of
their quantized GGUF files on this B60. No directly comparable Arena entry was
found for the other models in the guide at that snapshot.

## Interpreting the numbers

- A model's published context length is a model limit, not a measured B60
  capacity. The earlier Swift service completed a 40K-input request, but a full
  40K-input plus 8K-output exchange remains unmeasured.
- The Bun quick check, AIPerf check, and direct Swift API requests used
  different prompt sizes and runtime settings. Compare within each test first.
- Model quality and the 1–5 practical ratings remain in the
  [Models Guide](./Intel-Arc-B60-Models.md); the tables there are recommendations,
  not controlled B60 benchmarks.
