# Intel Arc B60 Speed Test and Benchmark Results

One Intel Arc Pro B60, 24 GB VRAM. Local rows are October 2026 measurements;
published model and community rows use other machines or test methods. Values
from different prompts, caches, and runtimes are not head-to-head rankings.
For current commands and saved results, see the [model test README](../scripts/README.md).

## Hard tasks: Strata IQ1_M vs Qwen3.8 UD-Q4_K_M

October 17, 2026. Five hard tasks (TTL cache, expression parser, merge intervals, topological
sort, nested get), one run each, output cap 8,192 tokens. Qwen3.8 Unsloth UD-Q4_K_M ran on llama.cpp
at 131,072 context (loaded without problems), no MTP. Rows in `runs.jsonl` (`group` complex).

| Test | Strata IQ1_M | Qwen3.8 Q4_K_M |
|---|---:|---:|
| Hard tasks, low reasoning | 4/5 | 5/5 |
| Hard tasks, medium reasoning | 4/5 | not run (first request timed out after ~5 min) |
| Basic 10 tasks, low | 10/10 (24 s avg) | 10/10 (49 s avg) |
| Long 27K tokens, depth 0.5, low | 4/4 (2 repeats; ~39 s per request) | 1/2 (174–212 s per request) |

Findings:
- The TTL cache task failed on Strata at every level and in every run (0 of 5 across runs), and passed
  on Qwen3.8 Q4_K_M once. This is the only task that separated the two models.
- Both models failed the long discount task by using `CURRENT_PRICING` without defining it.
- Qwen was about twice as slow on short tasks and about five times slower on a 27K prompt.
- One run per task. The TTL cache result needs repeats before it counts as a quant effect.
- The harness stops at the first client-side timeout (about 5 minutes), so the Qwen medium pass has no results.

## Long-context matrix: prompt size, depth, and model

October 16, 2026. Two long tasks (discount, shipping), low reasoning, planted files at depth
0.1, 0.5, or 0.9 of the prompt. Strata: 2 repeats at 3 sizes. Signal Q4_K_M at 131K context:
1 repeat at 2 sizes. Prompt sizes are real tokens from the server. Per-run rows are in
`runs.jsonl` (`group` long, with `contextTokens`, `depth`, `rep`, `promptTokens`).

| Model | Prompt tokens | Pass | Avg seconds per request |
|---|---:|---:|---:|
| Strata IQ1_M | ~27K | 10/12 | 39 |
| Strata IQ1_M | ~55K | 10/12 | 59 |
| Strata IQ1_M | ~110K | 10/12 | 113 |
| Signal Q4_K_M | ~27K | 4/6 | 139 |
| Signal Q4_K_M | ~55K | 2/3 | 289 |

Strata by depth: 0.1 gave 9/12, 0.5 gave 11/12, and 0.9 gave 10/12. By task: shipping 18/18, discount 12/18.
All six Strata failures were the discount task: four were a `ReferenceError` (the reply used
`CURRENT_PRICING` without defining it) and two were logic errors.

Findings:
- Prompt size did not change accuracy on Strata from 27K to 110K tokens. Depth did not matter much.
- Signal needs about five times longer than Strata for the same prompt. At 55K tokens a
  request took about 290 s, and the second request (shipping) timed out after about 5 minutes in all three depth runs. The script allows 15 minutes, so the 5-minute limit comes from the client library.
  The 110K size was not run on Signal.
- Accuracy on the shared sizes was similar (Strata 5/6 at each size; Signal 4/6 and 2/3), but
  Signal's sample is small and incomplete.
- For large VS Code requests, Strata's prefill speed matters more than model differences here.

## Complex and long-context tasks: Strata Coder IQ1_M

October 16, 2026. Two complex tasks (no context) and two long tasks. Each long task asks
for code that must follow the current rules in a file, with deprecated rules in other
files. The file is buried in filler code at about 40% depth. Tasks are in
[tasks.json](../scripts/model--quality/tasks.json), files in
[context/](../scripts/model--quality/context/). Sampling and context as in the Strata
config. Runs in `runs.jsonl` have `group`, `contextTokens`, and `promptTokens`.

| Group | Context (target) | Actual prompt tokens | Low | Medium | High |
|---|---|---:|---:|---:|---:|
| complex (TTL cache, expression parser) | none | ~120 | 1/2 | 1/2 | 1/2 |
| long | 30K | ~54K | 3/4 (2/2 rerun) | 2/4 (2/2 rerun) | 2/4 (1/2 rerun) |
| long | 60K | ~110K | 2/2 | 2/2 | 0/2 |

Findings:
- **Expression parser** passed at every level. **TTL cache** failed at every level: wrong
  logic, or the reply hit the 4,096-token cap.
- **Long tasks:** the 30K results differ between the first run and the rerun. The same
  settings gave 1/2 and then 2/2 at low reasoning. Use the rerun for the table; treat one
  run per level as a rough guide.
- **High reasoning at 60K:** the reply used the context's constant (`CURRENT_PRICING`,
  `CURRENT_SHIPPING`) without defining it, so the code failed with `ReferenceError`. At
  30K the same mistake happened once.
- **Looping flag:** the detector marks any line repeated 8 times as a loop. Several
  correct answers were flagged, so the flag is noisy.

Context size question: at 60K, low and medium passed both tasks. This is too small a
sample to say that bigger context helps, but it does not show that it hurts.

## Signal + Terse-Coder Q4_K_M: 32K vs 128K context

October 16, 2026. llama.cpp SYCL, Q8 KV cache, one slot, MTP on (one draft token),
no vision projector. Presets `terse:ctx32k` and `terse` (131,072) in
[presets.json](../scripts/model--switch/presets.json). Both switched and passed their health checks.

| Context | Speed: TTFT | Speed: gen tok/s | Speed: prefill tok/s | Quality (low) | Avg tokens | Avg seconds |
|---|---:|---:|---:|---|---:|---:|
| 32,768 | 484 ms | 28.6 | 186 | 10/10 | 551 | 19.5 |
| 131,072 | 483 ms | 28.7 | 186 | 9/10 | 529 | 18.8 |

The 128K failure was `parse-query`: the reply built an invalid regular expression
(`nothing to repeat`). Single runs vary, so one failure is not a context effect on its own.

Caveats:
- Reasoning level was sent as `low`, but llama.cpp may ignore it. These rows do not
  show a reasoning effect.
- Only one run per task. Speed numbers are from a single warm-up and three measured runs.
- The 128K load was not checked for VRAM headroom beyond the health check.

## Quality: Strata Coder IQ1_M by reasoning level

October 16, 2026. 10 tasks, one run each, run alone on the server. Server settings:
Strata, 131,072 context, sampling from its config (temperature 1.0, top_p 0.95,
top_k 20, repeat penalty 1.05), reasoning effort set per request, 4,096 output cap.
Tasks and tests are in [scripts/model--quality/tasks.json](../scripts/model--quality/tasks.json).

| Reasoning | Pass | Loops | Avg tokens | Avg seconds |
|---|---:|---:|---:|---:|
| low (server default) | 10/10 | 0 | 724 | 24 |
| medium | 10/10 | 0 | 1,154 | 39 |
| high | 10/10 | 0 | 1,792 | 70 |

Recommended vs used: the model card suggests medium as the balance point; Strata's
default is high, and this server uses low on purpose. All three levels passed,
so low is the fastest with no measured quality loss on these tasks. One earlier
run had a high-reasoning failure (`deep-clone`, shared nested objects); the clean
rerun passed. Single runs can vary, so treat this as a first pass.

## Local Strata: Qwen3.8-Flash-Next Coder IQ1_M

October 11, 2026; Strata 0.1.43, SYCL on one Arc Pro B60, 30.2 GiB host RAM,
131,072 context, one slot, 8-bit KV, thinking off, temperature 0. Strata's
`bench.sh` used the already loaded model; startup time is excluded. One warm-up
chat and a 1K prompt were discarded. Prompt and decode rates come from engine
timings; TTFT is measured by the HTTP client.

| Workload | Prompt tokens | Requests | Prompt speed, median (range) | Decode speed, median (range) | TTFT, median (range) |
|---|---:|---:|---:|---:|---:|
| Short chat, up to 100 output tokens | 46 (43–51) | 9 | — | **28.2 tok/s** (19.4–34.2) | 0.94 s (0.91–0.97) |
| Fresh 4K prompt, 24 output token cap | 4,019 | 3 | **1,070.5 tok/s** (296.1–1,070.8) | — | 3.80 s (3.80–13.62) |
| Fresh 16K prompt, 24 output token cap | 16,058 | 3 | **1,064.1 tok/s** (848.9–1,064.3) | — | 15.14 s (15.14–18.97) |
| Agent follow-up turns, up to 64 output tokens | ~14,397 at last turn | 15 turns in 3 sessions | — | **39.1 tok/s** (28.6–49.6) | 3.72 s (2.47–19.35) |

| Agent session metric | Median (range) |
|---|---:|
| Follow-up prompt cache hit | 68.68% (68.52–68.68%) |
| Earlier-turn tokens read again per session | 4 (3–74) |
| First turn TTFT, no cache | 1.58 s (1.58–3.41) |

The agent workload used four tools and six turns per session. The benchmark
measured speed only, not answer correctness; the first 4K run was much slower
than the next two. Its report remains on the server at
`/models/Strata/bench/results/2026-10-11-community-arc-gpu-qwen3-8-flash-next-coder-iq1-m/`.

## Local short-request speed

October 10, 2026: three measured runs after one warm-up, the same JavaScript
prompt and a 256-token output cap. RAM is the remote `llama-server` process RSS,
excluding GPU memory.

| Backend and model | Context | Average TTFT | Generation | Peak test RAM | Process RAM HWM |
|---|---:|---:|---:|---:|---:|
| SYCL · Signal + Terse-Coder i1-Q4_K_M | 57,344 | 543 ms | **28.53 tok/s** | 2,921 MiB | 16,650 MiB |
| SYCL · Unsloth Qwen3.6-27B IQ4_XS | 57,344 | **504 ms** | 19.32 tok/s | **2,451 MiB** | 15,748 MiB |
| SYCL · Pearson Qwen3.8-27B IQ3_M + projector | 65,536 | 919 ms | 7.75 tok/s | 3,327 MiB | **13,186 MiB** |

Unsloth and Pearson used all 256 output tokens. Signal stopped after 74–202;
compare generation speed more readily than total request time. Raw output is
in the gitignored
`local-notes.md` (private, not in git).

## Local llama.cpp profiles

| Model | Backend | Context | Key settings |
|---|---|---:|---|
| [Unsloth Qwen3.6-27B MTP IQ4_XS](https://huggingface.co/unsloth/Qwen3.6-27B-MTP-GGUF) | SYCL | 57,344 | Q8 KV, one slot, one MTP draft token, no projector; October 9 |
| [Signal + Terse-Coder i1-Q4_K_M](https://huggingface.co/mradermacher/Signal-3.8-27B-Terse-Coder-i1-GGUF) | SYCL | 49,152 then 57,344 | Q8 KV, one slot, one MTP draft token, no projector; October 8 |
| Qwen3.8-27B IQ3_M | SYCL | 32,768 then 65,536 | Q8 KV, one slot, Q8_0 vision projector, one MTP draft token; October 6 |
| Swift 1.5 Qwen3.8-27B Q4_K_M | Vulkan / SYCL | 49,152 | Q8 KV, one slot, batch 512, microbatch 128, all layers on GPU |
| Unsloth Qwen3.8-27B UD-Q4_K_M | SYCL | 49,152 | Temperature 0.2, non-streaming; October 6 |
| Qwen3.6-35B-A3B Q4_K_M | llama.cpp | 49,152 | Q8 KV; earlier capacity check |

### Short requests and functionality

| Model | Request | Prompt / completion | Result | Time or speed |
|---|---|---:|---|---:|
| Qwen3.6 MTP IQ4_XS | Reply `READY`, thinking on | 15 / 95 | Stopped normally | ~7 s including model lookup |
| Qwen3.6 MTP IQ4_XS | JavaScript function, thinking on, cap 512 | 28 / 512 | Hit cap during thinking; no final code | 27.05 s |
| Qwen3.6 MTP IQ4_XS | Same function, thinking off, cap 512 | 30 / 43 | Returned code | 2.86 s |
| Qwen3.6 MTP IQ4_XS | `get_time` tool request | 284 / 189 | Valid call | 15.55 s |
| Signal + Terse-Coder | JavaScript function, cap 1,024 | 80 / 266 | Correct function and example | 11.28 s |
| Signal + Terse-Coder | `get_time` tool request | — | Valid call | 5.3 s |
| Qwen3.8 IQ3_M | Four GPU bullet points, 3 runs after warm-up, cap 256 | 117–156 output per run | All completed; warm cache | TTFT 890 ms; generation **7.39 tok/s**; overall 7.04 tok/s; 16.51–22.75 s |
| Swift 1.5 SYCL | Short coding prompt | 74 / 117 | Completed | 7.09 s |
| Swift 1.5 SYCL | Service restart smoke test | 56 / 22 | Returned `READY` | ~3.5 s |
| [Greatjedi Qwen3.8 Intel Arc tuned IQ3_S MTP](https://huggingface.co/Greatjedi/Qwen3.8-27B-Intel-Arc-Tuned-GGUF) | "commit changes", 3 runs after warm-up, cap 2,048, thinking on | 12 / 183–248 each | Completed; answer is git add/commit commands after thinking; **verdict: rejected**, too weak (failed "make conventional commits") | TTFT 467–482 ms; generation **27.8 tok/s** (27.0–28.9); 6.8–9.7 s; warm-up 327 tokens, 14.3 s |
| [Tiel-Coder 35B-A3B UD-Q4_K_XL MTP](https://huggingface.co/peculiar-ragdoll/Tiel-Coder-35B-A3B-GGUF-MTP) | "commit changes", 3 runs after warm-up, cap 2,048, thinking on, 57,344 context | 12 / 150–595 each | Completed | TTFT 120–265 ms; generation **49.3 tok/s** (48.5–50.3); 3.2–12.2 s; process RAM HWM 22,329 MiB |
| Unsloth Qwen3.8 UD-Q4_K_M | Four GPU bullet points, 3 runs, cap 256 | 26 / 256 each | All hit cap during thinking | 4.41–5.47 s |
| Unsloth Qwen3.8 UD-Q4_K_M | Reply `READY`, 3 runs, cap 512 | 15 / 136–232 | All stopped normally | 2.41–4.02 s; mean 3.40 s |

### Long input and prefill

| Model / backend | Prompt / completion | Cached prompt | Result | End to end | Prefill | Generation |
|---|---:|---:|---|---:|---:|---:|
| Qwen3.6 MTP IQ4_XS / SYCL | 44,821 / 104 | 0 | `READY` | 326.38 s | — | — |
| Signal + Terse-Coder / SYCL | 37,856 / 37 | 42 | `READY` | 185.1 s | — | — |
| Signal + Terse-Coder / SYCL, 57K context | 44,856 / 39 | 0 | `READY` | 222.67 s | — | — |
| Qwen3.8 IQ3_M / SYCL, 32K context | 23,860 / 38 | 42 | `READY` | 195.02 s | 189.39 s; 125.76 tok/s | 7.01 tok/s |
| Qwen3.8 IQ3_M / SYCL, 65K context | 42,063 / 89 | 0 on first request | `READY` on warm retry, cap 8,192 | 14.88 s retry | 385.93 s uncached | — |
| Qwen3.8 IQ3_M / SYCL, 65K context | 49,106 / 88 | 42 | `READY`, cap 8,192 | 455.63 s | ~7 min 36 s | — |
| Swift 1.5 / Vulkan | 40,022 / 32 | 31,274 on retry | Completed on retry; first request timed out at 300 s | 157.91 s retry | 58.7 tok/s for remainder | 3.55 tok/s |
| Swift 1.5 / SYCL | 40,009 / 32 | 42 | Completed | 199.91 s | 203.30 tok/s | 10.62 tok/s |
| Unsloth Qwen3.8 UD-Q4_K_M / SYCL | 39,931 / 288 | 0 | `READY`, cap 8,192 | 63.31 s | — | — |
| Qwen3.6-35B-A3B Q4_K_M | 42,041 / — | — | Input accepted | — | — | — |

Long inputs were repeated synthetic code or filler, not repository tasks. A cap
of 8,192 was accepted where shown; none of those replies actually used all
8,192 tokens. Warm retries and uncached runs should not be compared by elapsed
time. The Qwen3.8 IQ3_M 32K run proposed 20 MTP tokens and accepted 17.

## Local OpenVINO Model Server: Qwen3.8-27B INT4

These are prior measurements of `OpenVINO/Qwen3.8-27B-int4-ov` on the same B60,
using OVMS on port 8000. They are a different model/runtime configuration from
the GGUF results above. Reasoning tokens were counted in generation.

### Bun speed-test quick check

Two measured runs, 256 output tokens each, temperature 0.7:

| Run | TTFT | Generation | Overall | Time |
|---|---:|---:|---:|---:|
| 1 | 287 ms | 25.02 tok/s | 24.33 tok/s | 10,521 ms |
| 2 | 279 ms | 25.03 tok/s | 24.36 tok/s | 10,509 ms |

| **Average** | **283 ms** | **25.02 tok/s** | **24.35 tok/s** | — |

### AIPerf load check

Synthetic 512-token input and 256-token output, with one warmup request:

| Concurrency | Average TTFT | Average inter-token latency | Tok/s per request | Aggregate tok/s |
|---:|---:|---:|---:|---:|
| 1 | 616 ms | 40.4 ms | 24.7 | 23.4 |
| 4 | 1,260 ms | 45.9 ms | 21.8 | **78.2** |

The four-request run delivered about 3.3× aggregate throughput; a separate
512-token prefill check measured about 830 tok/s. Neither checks long prompts.

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
not measurements from the Ubuntu server in this repository.

| Workload | Single B60 | Dual B60 |
|---|---:|---:|
| Simple prompt (“what can you do?”) | 82–91 tok/s | 72–78 tok/s |
| Long prompt with extensive thinking | 50–62 tok/s | 33–44 tok/s |
| Claude Code (local) | 24–42 tok/s | 16–28 tok/s |

In that report, splitting this one-card model across two B60s was slower.
Dual cards can still help when a model or context requires their combined VRAM.

## Published Arena user ratings

October 6, 2026 text-leaderboard snapshot; crowd ratings, not B60 tests:

| Model | Elo | Votes |
|---|---:|---:|
| [Qwen3.8-27B](https://modelmarkets.ai/benchmarks/lmarena-text?model=Qwen/Qwen3.8-27B) | 1,438 | 6,913 |
| [Gemma 4 26B-A4B Instruct](https://modelmarkets.ai/benchmarks/lmarena-text?model=google/gemma-4-26B-A4B-it) | 1,435 | 5,813 |

## Interpreting the numbers

- A model's published context length is a model limit, not a measured B60
  capacity. The earlier Swift service completed a long-input request, but a
  full client-budget exchange remains unmeasured.
- Strata, Bun, AIPerf, and direct API checks used different prompts and runtime
  settings. Compare runs within the same test first.
- Model quality and the 1–5 practical ratings remain in the
  [Models Guide](./models.md); the tables there are recommendations,
  not controlled B60 benchmarks.
