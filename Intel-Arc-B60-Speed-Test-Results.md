# Intel Arc B60 Speed Test and Benchmark Results

This page collects measured results from this server and published model
benchmarks. The local server results were recorded in October 2026 on one
Intel Arc Pro B60 with 24 GB VRAM. Published model scores use different
harnesses and runtimes; they are not measurements of the GGUF files on this B60.
For commands and tools, see the [speed-test README](./scripts/speed-test/README.md).

## Local llama.cpp: Swift 1.5 Qwen3.8-27B

The [Intel SYCL setup](./Intel-Arc-B60-Server-Setup-Intel_SYCL.md) is the
current service; the [Vulkan setup](./Intel-Arc-B60-Server-Setup-Vulkan.md)
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

## Other local context checks

The previous Qwen3.6-35B-A3B Q4_K_M llama.cpp service used a 49,152-token
server context and Q8 key/value cache. A 42,041-token input succeeded on the
B60. This did not test a full 8,192-token reply after a 40K input, and it does
not establish the context capacity of any other model.

## Local OpenVINO Model Server: Qwen3.8-27B INT4

These are prior measurements of `OpenVINO/Qwen3.8-27B-int4-ov` on the same B60,
using OVMS on port 8000. They are a different model/runtime configuration from
the current Swift GGUF service. Reasoning tokens were counted in generation.

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
  capacity. The live Swift service completed a 40K-input request, but a full
  40K-input plus 8K-output exchange remains unmeasured.
- The Bun quick check, AIPerf check, and direct Swift API requests used
  different prompt sizes and runtime settings. Compare within each test first.
- Model quality and the 1–5 practical ratings remain in the
  [Models Guide](./Intel-Arc-B60-Models.md); the tables there are recommendations,
  not controlled B60 benchmarks.
