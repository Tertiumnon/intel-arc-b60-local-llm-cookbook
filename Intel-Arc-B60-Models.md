# Intel Arc B60 Models Guide

## Overview
This guide compares models for Intel Arc Pro B60 GPUs, with recommendations for coding, chat, and image tasks. The primary workload is **refactoring and implementing large JS/Node.js projects**. For that work, quality matters more than raw speed.

> **Last updated:** October 6, 2026

For runtime-specific serving steps, see the [OpenVINO guide](./Intel-Arc-B60-OpenVINO.md) and [llama.cpp Setup guide](./Intel-Arc-B60-llama.cpp-Setup.md). For connecting clients, see [Intel Arc B60 Clients Guide](./Intel-Arc-B60-Clients.md). Local speed measurements, published coding scores, and Arena ratings are in the [Speed Test Results](./Intel-Arc-B60-Speed-Test-Results.md).

## Fit and quantization

### Weight-size estimates (int4)

| Model Size | Simple weight estimate | B60 implication |
|---|---:|---|
| 7–8B | ~4 GB | Usually ample room for cache; verify the model's actual GGUF size. |
| 14–15B | ~8 GB | Context depends on its attention design and KV format. |
| 27B dense | ~15 GB | A GGUF can be larger; Qwen3.8 ranges from ~16.5 GB for Unsloth UD-Q4_K_M to ~19 GB for ggml-org Q4_K_M. |
| 30–35B MoE | ~18 GB | All experts occupy memory; Qwen3.6 Q4_K_M is ~20.4 GB. |
| 80B MoE | ~42 GB | Requires more than one 24GB B60 at this quantization. |

> **Rule of thumb:** use the actual GGUF file size, not parameter count alone. Quantized
> embeddings and other tensors can make a Q4 file larger than a simple 0.5-byte-per-weight
> estimate. Leave room for the KV cache, compute buffers, and any vision projector.

### Quantization choices on one B60

Start with `Q4_K_M` for a model that needs most of the 24 GB. For a 10–12 GB model,
`Q5_K_M` can be a useful quality comparison while leaving substantial room for context.
Kimi-Linear-48B-A3B is an exception: its Q4 files are too large, while the
importance-matrix `IQ3_XS` file is about 20.2 GB and warrants a cautious B60 trial.
The GGUF file size is only the weight budget; a 40K input plus 8K output requires a
48K total context and additional runtime memory. MoE active parameters can improve
generation speed, but **all experts still contribute to the stored weight size**.
These are starting choices, not measured quality rankings for every model. See the
[llama.cpp quantization options](https://github.com/ggml-org/llama.cpp/blob/master/tools/quantize/quantize.cpp).

#### Unsloth Dynamic GGUFs versus fine-tunes

[unsloth/Qwen3.8-27B-GGUF](https://huggingface.co/unsloth/Qwen3.8-27B-GGUF)
is a **quantization of Qwen/Qwen3.8-27B**, not a separately fine-tuned model.
The Hugging Face model tree labels the original Qwen weights as its base and this
repository as “Quantized.” Unsloth's `UD-` files use its Dynamic quantization
recipe and importance matrix. Its claimed quality gains are
[publisher-reported](https://huggingface.co/unsloth/Qwen3.8-27B-GGUF#read-our-how-to-run-qwen38-27b-guide);
we have no same-host B60 quality or speed comparison with ggml-org's GGUF. Use the
**same Qwen3.8 model ratings** in this guide, while treating quantization quality
and achievable context as separate measurements.

The [published file list](https://huggingface.co/unsloth/Qwen3.8-27B-GGUF/tree/main)
offers these useful single-B60 choices:

- `UD-Q4_K_M` **16.5 GB**: first choice for a 40K-input trial because it leaves
  more room for KV cache and buffers than the larger files.
- `UD-Q4_K_XL` **17.6 GB**: larger alternative to compare after the first
  context test; its practical B60 quality and headroom remain unmeasured.
- `UD-Q5_K_S` **18.7 GB** or `UD-Q5_K_M` **19.8 GB**: quality-focused trials with
  less space for a large context. Avoid assuming 40K input will fit.

The optional `mmproj-F16.gguf` is another **928 MB** for image input. Quantization
does not change the model's published **262,144-token native context**. For a
genuine Unsloth fine-tune, check that its model card identifies extra training
or a fine-tuned parent; an `unsloth/` prefix alone does not establish that.
The [Vulkan guide](./Intel-Arc-B60-Server-Setup-Vulkan.md#qwen38-27b-unsloth-dynamic-gguf)
has the download and launch recipe.

## Base Model: Qwen3.8-27B
Qwen3.8-27B is the base of the current Swift 1.5 coding fine-tune. Its OpenVINO
measurements below describe the base model and a different runtime.

| Property | Value |
|---|---|
| Parameters | 27B dense (all weights active per token) |
| Architecture | Hybrid attention: 16 × (3 × Gated DeltaNet linear attention → 1 × Gated Attention) |
| Context | 262,144 tokens native (extensible to 1M) |
| Thinking | On by default; depth via `reasoning_effort` (`xhigh` default / `medium` / `low`) |
| License | Apache-2.0 |
| B60 measurements | [OpenVINO speed results](./Intel-Arc-B60-Speed-Test-Results.md#local-openvino-model-server-qwen38-27b-int4) |

### Recommended Settings for Large JS/Node Refactors
| Setting | Value | Why |
|---|---|---|
| `temperature` | **1.0** | Official thinking-mode setting (not 0.7) |
| `top_p` / `top_k` / `min_p` | 0.95 / 20 / 0.0 | Official thinking-mode setting |
| `presence_penalty` / `repetition_penalty` | 0.0 / 1.0 | Official thinking-mode setting |
| `reasoning_effort` | `xhigh` (default) | Keep for hard refactors; `medium` for routine edits |

Non-thinking (instruct) mode, if you need fast one-shot answers: `temperature=0.7`, `top_p=0.80`,
`top_k=20`, `presence_penalty=1.5`.

## Recent Model Shortlists: Chatting, Coding, Images, and Decisions

I checked current model cards and GGUF listings on October 6, 2026. These tables include
models with a plausible single-B60 path. They are candidates, not a claim that every entry
has been benchmarked on this server. Weight size is not total runtime VRAM: context, KV cache, vision encoders, and
compute buffers also need space. Use one request at a time and begin with the listed
context; monitor before increasing it. **Quality** rates expected task capability;
**speed** rates expected generation speed on the B60; **balance** rates the combined
quality, speed, and memory/context tradeoff. These are practical 1–5 estimates, not
controlled same-host measurements for every model. Speed estimates use architecture,
weight size, and available local results. Every model in these shortlists has a single-B60
configuration; use the conservative starting context shown in each row.

**Arena user rating** links to the published leaderboard snapshot in the
[Speed Test Results](./Intel-Arc-B60-Speed-Test-Results.md#published-arena-user-ratings)
when an exact entry was found. “Not listed” is not a zero score.

### Better for chatting

| Model | B60 option | Fit and starting point | Chat profile | Quality /5 | Speed /5 | Balance /5 | Arena user rating* |
|---|---|---|---|---:|---:|---:|---|
| **[Qwen3.5 9B](https://huggingface.co/Qwen/Qwen3.5-9B)** | GGUF Q4_K_M (~5.63 GB); add the vision projector only if using images | Comfortable fit; start at 16K | Lightweight everyday assistant with multimodal support and room for a longer context. | **3** | **5** | **5** | Not listed |
| **[Gemma 4 26B-A4B Instruct](https://huggingface.co/google/gemma-4-26B-A4B-it)** | GGUF Q4_0 (~14.6 GB) | Start at 8K | Well-rounded assistant with image input and practical B60 fit. | **4** | **4** | **4** | [See results](./Intel-Arc-B60-Speed-Test-Results.md#published-arena-user-ratings) |
| **[Qwen3.8-27B](https://huggingface.co/Qwen/Qwen3.8-27B)** | GGUF Q4_K_M (~19 GB) | 4K load check; 49K context is an untested target | Deliberate responses and broad image/video support; measure B60 context headroom before setting VS Code limits. | **5** | **3** | **4** | [See results](./Intel-Arc-B60-Speed-Test-Results.md#published-arena-user-ratings) |
| [JEV-27B](https://huggingface.co/autotrust/JEV-27B) (text path) | [GGUF Q4_K_M](https://huggingface.co/prithivMLmods/JEV-27B-GGUF/tree/main) (~16.5 GB) | Start at 4K; 49K context is an untested target | Same Qwen3.8 text-generation backbone; its specialized typed-decision mode is unavailable in the GGUF chat API. | **5** | **3** | **4** | Not listed |
| **Qwen3-VL 30B-A3B Instruct** | GGUF Q4_K_M (~18.6 GB) | Tight; start at 4K | Chat-capable vision specialist; best suited when images are part of the conversation. | **4** | **3** | **3** | Not listed |
| **GLM-4.7-Flash** | GGUF Q4_K (~18.2 GB) | Tight; start at 4K; not tested on this B60 | Reasoning-oriented chat alternative; compare tone and answer quality on your own prompts. | **4** | **4** | **4** | Not listed |
| [Kimi-VL-A3B-Thinking-2506](https://huggingface.co/moonshotai/Kimi-VL-A3B-Thinking-2506) | [GGUF Q4_K_M](https://huggingface.co/ggml-org/Kimi-VL-A3B-Thinking-2506-GGUF) (~10.5 GB); Q8_0 projector ~0.62 GB for images | Comfortable weight fit; start at 16K; B60 Vulkan untested | Efficient MoE chat with image reasoning. Its thinking markers need a client check before use as a VS Code agent. | **3** | **4** | **4** | Not listed |
| [Kimi-Linear-48B-A3B-Instruct](https://huggingface.co/moonshotai/Kimi-Linear-48B-A3B-Instruct) | [IQ3_XS imatrix GGUF](https://huggingface.co/mradermacher/Kimi-Linear-48B-A3B-Instruct-i1-GGUF/tree/main) ~20.2 GB | Tight; start at 4K; B60 Vulkan untested | Long-context linear-attention MoE experiment. Lower-bit weights and limited headroom make quality and fit checks essential. | **4** | **4** | **3** | Not listed |

For a quick personal comparison, send the same ordinary chat prompt to each model and
compare answer quality, latency, and how much context you need. The [llama.cpp setup
guide](./Intel-Arc-B60-Server-Setup-Vulkan.md) includes model download and launch commands.

### Better for coding

| Model | B60 option | Fit and starting point | Assessment | Quality /5 | Speed /5 | Balance /5 | Arena user rating* |
|---|---|---|---|---:|---:|---:|---|
| **[Swift 1.5 Qwen3.8-27B](https://huggingface.co/ukisai/Swift-1.5-Qwen3.8-27B-GGUF)** (current) | Q4_K_M GGUF (~17.4 GB) | **49,152 context configured** with Q8 KV and one slot; long input verified ([results](./Intel-Arc-B60-Speed-Test-Results.md#local-llamacpp-swift-15-qwen38-27b)) | Coding fine-tune of Qwen3.8-27B. Publisher coding scores are in the [results](./Intel-Arc-B60-Speed-Test-Results.md#published-coding-benchmark-scores); local GGUF coding quality is unmeasured. | **5** | **2** | **3** | Not listed |
| **[Qwen3.8-27B](https://huggingface.co/Qwen/Qwen3.8-27B)** | GGUF Q4_K_M (~19 GB) | 4K load check; 49K context untested on this B60 | Strong coding/agent model in this size class; published coding results are in the [benchmark table](./Intel-Arc-B60-Speed-Test-Results.md#published-coding-benchmark-scores). | **5** | **3** | **4** | [See results](./Intel-Arc-B60-Speed-Test-Results.md#published-arena-user-ratings) |
| [JEV-27B](https://huggingface.co/autotrust/JEV-27B) (text path) | [GGUF Q4_K_M](https://huggingface.co/prithivMLmods/JEV-27B-GGUF/tree/main) (~16.5 GB) | Start at 4K; 49K context untested on this B60 | Frozen Qwen3.8 backbone, so no published coding advantage over Qwen3.8; the decision adapter/head is absent from this GGUF path. | **5** | **3** | **4** | Not listed |
| **Qwen3.6-35B-A3B** | GGUF Q4_K_M (~20.4 GB) | Previously verified on this B60 at 49,152 context | Fast MoE option; prior long-input result is in the [results](./Intel-Arc-B60-Speed-Test-Results.md#other-local-context-checks). | **4** | **5** | **4** | Not listed |
| [KAT-Coder-V2.5-Dev](https://huggingface.co/Kwaipilot/KAT-Coder-V2.5-Dev) | GGUF Q3_K_L (~18.1 GB) | Start at 4K; larger context untested on this B60 | Coding-focused MoE fallback. | **4** | **5** | **4** | Not listed |
| [Qwen3-Coder-30B-A3B Instruct](https://huggingface.co/Qwen/Qwen3-Coder-30B-A3B-Instruct) | INT4 OpenVINO export (~16.3 GB) | 49K context target; OVMS not running now | Older coding MoE option. | **3** | **4** | **3** | Not listed |
| [NVIDIA Nemotron 3.5 Lightning 30B-A3B](https://huggingface.co/nvidia/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-NVFP4) | GGUF Q4_0 (~18.9 GB) | Tight; start at 4K, not tested on this B60 | Recent general/reasoning model trained for coding languages. Review its OpenMDW license before use. | **4** | **4** | **4** | Not listed |
| **GLM-4.7-Flash** | GGUF Q4_K (~18.2 GB) | Tight; start at 4K, not tested on this B60 | Practical GLM-family alternative; compare on your coding tasks. | **4** | **4** | **4** | Not listed |
| [DeepSeek-Coder-V2-Lite-Instruct](https://huggingface.co/deepseek-ai/DeepSeek-Coder-V2-Lite-Instruct) | [GGUF Q4_K_M](https://huggingface.co/cminja/deepseek-coder-v2-lite-instruct-GGUF/tree/main) ~10.4 GB; Q5_K_M ~11.9 GB | Comfortable weight fit; start at 16K; B60 Vulkan untested | Efficient 16B/2.4B-active code model. A useful low-memory comparison, although newer Qwen coding models remain the primary choices. | **3** | **5** | **4** | Not listed |

Nemotron and GLM-4.7 are local candidates without measurements on this machine.
JEV-27B's GGUF text path uses the frozen Qwen3.8 backbone; its separate
decision adapter and head are unavailable in that single-file chat setup.
See the [publisher model card](https://huggingface.co/autotrust/JEV-27B).

### Better for images

| Model | Format and weight size | Image/video use | B60 starting point | Quality /5 | Speed /5 | Balance /5 | Arena user rating* |
|---|---|---|---|---:|---:|---:|---|
| **[Qwen3.8-27B](https://huggingface.co/Qwen/Qwen3.8-27B)** | GGUF Q4_K_M ~19 GB + Q8_0 mmproj ~629 MB | Native image and video understanding; strong all-round choice | 4K load check; test higher context separately with image tokens included | **5** | **3** | **4** | [See results](./Intel-Arc-B60-Speed-Test-Results.md#published-arena-user-ratings) |
| **[Gemma 4 26B-A4B Instruct](https://huggingface.co/google/gemma-4-26B-A4B-it)** | GGUF Q4_0 ~14.6 GB + BF16 mmproj ~1.19 GB | Vision-language chat | Better headroom than the 27–30B Q4 models; start at 8K | **4** | **4** | **4** | [See results](./Intel-Arc-B60-Speed-Test-Results.md#published-arena-user-ratings) |
| **Qwen3-VL 30B-A3B Instruct** | GGUF Q4_K_M ~18.6 GB + Q8_0 mmproj ~712 MB | Vision-specialist MoE | Tight; start at 4K | **5** | **3** | **4** | Not listed |
| **Qwen3.5 9B** | GGUF Q4_K_M ~5.63 GB + BF16 mmproj ~922 MB | Smaller vision-language model, more context headroom | Start at 16K | **4** | **5** | **5** | Not listed |
| [Kimi-VL-A3B-Thinking-2506](https://huggingface.co/moonshotai/Kimi-VL-A3B-Thinking-2506) | [GGUF Q4_K_M](https://huggingface.co/ggml-org/Kimi-VL-A3B-Thinking-2506-GGUF/tree/main) ~10.5 GB + Q8_0 mmproj ~0.62 GB | Image reasoning with a 16B/3B-active MoE | Start at 16K; increase only after a B60 image request succeeds | **4** | **4** | **4** | Not listed |

The Kimi text model config specifies **131,072 positions**. Its image processor's
`in_token_limit=16384` limits image preprocessing; it is **not** a 16K maximum for
the complete text conversation. The [publisher config](https://huggingface.co/moonshotai/Kimi-VL-A3B-Thinking-2506/blob/main/config.json)
and [processor config](https://huggingface.co/moonshotai/Kimi-VL-A3B-Thinking-2506/blob/main/preprocessor_config.json)
describe different limits. The [ggml-org GGUF files](https://huggingface.co/ggml-org/Kimi-VL-A3B-Thinking-2506-GGUF/tree/main)
provide a practical llama.cpp download path; the model has not been tested on this B60.

### Better for typed decisions

| Model | B60 option | Output and use | B60 starting point | Decision quality /5 | Decision speed /5 | Balance /5 | Arena user rating* |
|---|---|---|---|---:|---:|---:|---|
| [Cloudflare/clef-flash](https://huggingface.co/Cloudflare/clef-flash) | [ggml-org Q8_0 GGUF](https://huggingface.co/ggml-org/Clef-Flash-GGUF/tree/main) ~9.66 GB; optional Q8_0 vision projector ~624 MB | `noul`, `choice`, and `score` probabilities through `/v1/systemone`; routing, classification, and structured decisions | 4,096 server context and `--ubatch-size 4096`; keep the complete request below 4K input tokens; output tokens: 0. B60 Vulkan untested | **4** | **5** | **5** | Not listed |

Clef-Flash is a **9B decision model** derived from Qwen3.5-9B. It does not generate
chat or code, so VS Code's OpenAI chat endpoint, `maxOutputTokens`, and token/s
generation ratings do not apply. The 1–5 scores above are practical **decision-task**
estimates, not comparable with the chat and coding ratings. Cloudflare's published
decision evaluations are [vendor-reported](https://huggingface.co/Cloudflare/clef-flash#results);
no result on this B60 has been recorded. The base config lists 262,144 positions,
while Cloudflare's example encoder defaults to 16,384 input tokens; neither establishes
a tested B60 maximum. llama.cpp evaluates a Clef request in one batch, so its
`--ubatch-size` must cover the complete encoded input. See the
[model config](https://huggingface.co/Cloudflare/clef-flash/blob/main/config.json),
[llama.cpp decision API](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md#post-v1systemone-typesafe-compatible-system-one-api),
and [launch recipe](./Intel-Arc-B60-Server-Setup-Vulkan.md#cloudflareclef-flash-decision-model).

### Recommended B60 input and output limits

Model cards publish a **maximum total context**, not a tested VS Code input allowance
on a 24 GB B60. VS Code's `maxInputTokens` covers the entire serialized request,
including instructions, tools, history, and repository context; `maxOutputTokens`
caps the response, including thinking tokens when the model generates them. VS Code
also supports `contextWindow`, defined as input plus output. The configured limits
must fit the *running server's* context, with a little room for template tokens and
differences in token counting. See the
[VS Code Custom Endpoint reference](https://code.visualstudio.com/docs/agent-customization/language-models#custom-endpoint-configuration-reference)
and [llama.cpp server options](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md).

The numbers below match either the **live Swift 1.5 server** or each model's initial
launch recipe. They are practical client settings for *that context*, not promises
that every model can use its published maximum. One parallel llama.cpp slot is assumed.
For a 49,152-token server, **40,000 input + 8,192 output = 48,192**, leaving 960 tokens
of margin. The [local context checks](./Intel-Arc-B60-Speed-Test-Results.md#other-local-context-checks)
show input capacity, but do not prove a full 8,192-token response can follow a
40K prompt.

| Model / runtime | Published context | Server context | VS Code input | VS Code output | Status |
|---|---:|---:|---:|---:|---|
| [Swift 1.5 Qwen3.8-27B](https://huggingface.co/ukisai/Swift-1.5-Qwen3.8-27B-GGUF) GGUF | 262,144 base model | **49,152** | **40,000** | **8,192** | Live B60/SYCL long-input check succeeded; see the [results](./Intel-Arc-B60-Speed-Test-Results.md#local-llamacpp-swift-15-qwen38-27b). A full exchange at both client limits remains unmeasured. |
| [Qwen3.6-35B-A3B](https://huggingface.co/Qwen/Qwen3.6-35B-A3B) GGUF | 262,144 | 49,152 previously | 40,000 previously | 8,192 previously | Previous B60 long-input check succeeded; see the [results](./Intel-Arc-B60-Speed-Test-Results.md#other-local-context-checks). Full 40K + 8K use remains unmeasured. |
| [Qwen3.8-27B](https://huggingface.co/Qwen/Qwen3.8-27B) OpenVINO INT4 | 262,144 | **49,152 target** | **40,000** | **8,192** | B60 profile to verify after switching to OVMS. The service is not currently running, so no live context reading is available. |
| Qwen3.8-27B OpenVINO INT4, longer reasoning | 262,144 | **57,344 target** | **40,000** | **16,384** | Preferred output allowance for long refactors if a 56K-total OVMS request succeeds; 960-token margin. Untested on this B60. |
| Qwen3.8-27B GGUF, initial | 262,144 | 4,096 | 2,560 | 1,024 | **Load check only**, not a measured context ceiling. The Q4 GGUF is larger than the OpenVINO export. |
| Qwen3.8-27B GGUF, VS Code target | 262,144 | **49,152 to test** | **40,000** | **8,192** | Same target as OpenVINO, but unverified on this B60. Try text-only first, then images with the projector; monitor VRAM and confirm a long prompt completes. |
| [Qwen3.8-27B Unsloth UD-Q4_K_M](https://huggingface.co/unsloth/Qwen3.8-27B-GGUF) GGUF, initial | 262,144 | 4,096 | 2,560 | 1,024 | 16.5 GB GGUF first-load check; B60 Vulkan load untested. Same Qwen3.8 base model. |
| Qwen3.8-27B Unsloth UD-Q4_K_M GGUF, VS Code target | 262,144 | **49,152 to test** | **40,000** | **8,192** | More weight headroom than ggml-org Q4_K_M, but a complete 40K + 8K request and VRAM fit remain unverified. |
| [JEV-27B](https://huggingface.co/autotrust/JEV-27B) GGUF text path, initial | 262,144 | 4,096 | 2,560 | 1,024 | Load check only; the Q4_K_M file is 16.5 GB, but B60 Vulkan load and context are untested. |
| JEV-27B GGUF text path, VS Code target | 262,144 | **49,152 to test** | **40,000** | **8,192** | Candidate only; verify VRAM and a long prompt before using these VS Code limits. This profile does not expose System 1 typed decisions. |
| [Qwen3-Coder-30B-A3B Instruct](https://huggingface.co/Qwen/Qwen3-Coder-30B-A3B-Instruct) OpenVINO INT4 | 262,144 | **49,152 target** | **40,000** | **8,192** | Legacy OVMS candidate; verify the loaded model and memory before using this client profile. |
| [Qwen3.5 9B](https://huggingface.co/Qwen/Qwen3.5-9B) GGUF | 262,144 | 16,384 | 11,776 | 4,096 | Initial recipe; a 49,152 / 40,000 / 8,192 profile is plausible but untested on this B60. |
| [KAT-Coder-V2.5-Dev](https://huggingface.co/Kwaipilot/KAT-Coder-V2.5-Dev) GGUF | 262,144 | 4,096 | 2,560 | 1,024 | Initial recipe; 40K input is not established for its Q3_K_L GGUF on this card. |
| [Gemma 4 26B-A4B Instruct](https://huggingface.co/google/gemma-4-26B-A4B-it) GGUF | 262,144 | 8,192 | 5,632 | 2,048 | Initial recipe. Its OpenVINO export needs a separate measured profile. |
| [Qwen3-VL 30B-A3B Instruct](https://huggingface.co/Qwen/Qwen3-VL-30B-A3B-Instruct) GGUF | 262,144 | 4,096 | 2,560 | 1,024 | Initial vision recipe; image tokens share the input budget. |
| [GLM-4.7-Flash](https://huggingface.co/zai-org/GLM-4.7-Flash) GGUF | 202,752 | 4,096 | 2,560 | 1,024 | Initial recipe; 20K context was only a candidate, not a verified B60 setting. |
| [NVIDIA Nemotron 3.5 Lightning 30B-A3B](https://huggingface.co/nvidia/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-NVFP4) GGUF | Up to 1M claimed | 4,096 | 2,560 | 1,024 | Initial recipe; Intel Vulkan compatibility is unverified. |
| [DeepSeek-Coder-V2-Lite-Instruct](https://huggingface.co/deepseek-ai/DeepSeek-Coder-V2-Lite-Instruct) GGUF | 128K published | 16,384 | 11,776 | 4,096 | Initial recipe; 49,152 / 40,000 / 8,192 is an untested upgrade. |
| [Kimi-VL-A3B-Thinking-2506](https://huggingface.co/moonshotai/Kimi-VL-A3B-Thinking-2506) GGUF | 131,072 text positions | 16,384 | 11,776 | 4,096 | Initial recipe; 49,152 / 40,000 / 8,192 is an untested upgrade. Image tokens share the budget. |
| [Kimi-Linear-48B-A3B-Instruct](https://huggingface.co/moonshotai/Kimi-Linear-48B-A3B-Instruct) GGUF | 1,048,576 | 4,096 | 2,560 | 1,024 | Initial IQ3_XS recipe; verify Vulkan load before testing longer contexts. |

**Qwen3.8 format comparison:** the [OpenVINO INT4 repository](https://huggingface.co/OpenVINO/Qwen3.8-27B-int4-ov/tree/main)
is about 16 GB, while [ggml-org's Q4_K_M GGUF](https://huggingface.co/ggml-org/Qwen3.8-27B-GGUF/tree/main)
is about 19 GB, plus a 629 MB vision projector when used. Unsloth's
[`UD-Q4_K_M` GGUF](https://huggingface.co/unsloth/Qwen3.8-27B-GGUF/tree/main)
is about 16.5 GB, plus a 928 MB F16 projector when used. These are different
quantizations of the same model; file size is not an exact measurement of GPU use.
The 4,096-token GGUF recipe was chosen as a low-risk **first load**, while 49,152
for OpenVINO was an **untested target**. There is no evidence here that OpenVINO
supports a higher maximum context than GGUF for this model on the B60. Both need
a long-prompt and VRAM check at the intended VS Code settings.

The **96K OVMS profile** previously shown for Qwen3.8 (81,920 input + 16,384 output)
and the **128K OVMS profile** for Qwen3.6 (114,688 + 16,384) are estimates based on
model architecture and VRAM. There is no reproducible long-prompt result for either
profile in this repository, and OVMS is not running now. Do not advertise them as
measured limits in VS Code. For a reasoning model, keep 8K or more output when
practical because thinking consumes the same output allowance.

Published-context sources: [Qwen3.8 config](https://huggingface.co/Qwen/Qwen3.8-27B/blob/main/config.json),
[Qwen3.6 config](https://huggingface.co/Qwen/Qwen3.6-35B-A3B/blob/main/config.json),
[Qwen3-Coder config](https://huggingface.co/Qwen/Qwen3-Coder-30B-A3B-Instruct/blob/main/config.json),
[Qwen3.5 9B config](https://huggingface.co/Qwen/Qwen3.5-9B/blob/main/config.json),
[Qwen3-VL config](https://huggingface.co/Qwen/Qwen3-VL-30B-A3B-Instruct/blob/main/config.json),
[KAT-Coder model card](https://huggingface.co/Kwaipilot/KAT-Coder-V2.5-Dev),
[Gemma 4 config](https://huggingface.co/google/gemma-4-26B-A4B-it/blob/main/config.json),
[GLM-4.7 config](https://huggingface.co/zai-org/GLM-4.7-Flash/blob/main/config.json),
[NVIDIA's Nemotron local recipes](https://huggingface.co/nvidia/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-NVFP4#local-ai-rtx-5090-dgx-spark-and-rtx-6000-pro),
[DeepSeek-Coder-V2-Lite model card](https://huggingface.co/deepseek-ai/DeepSeek-Coder-V2-Lite-Instruct),
and [Kimi-VL config](https://huggingface.co/moonshotai/Kimi-VL-A3B-Thinking-2506/blob/main/config.json).
For Kimi-Linear, see the [publisher config](https://huggingface.co/moonshotai/Kimi-Linear-48B-A3B-Instruct/blob/main/config.json)
and [IQ3_XS quantization listing](https://huggingface.co/mradermacher/Kimi-Linear-48B-A3B-Instruct-i1-GGUF/tree/main).

For about 40K input today, choose the **running Swift 1.5 GGUF** profile. Its configured
context and [completed long-input check](./Intel-Arc-B60-Speed-Test-Results.md#local-llamacpp-swift-15-qwen38-27b) establish a usable input size, though the
complete 8K-output budget remains unmeasured. Qwen3.8 OpenVINO
is the next profile to check after switching servers. Qwen3.5, DeepSeek-Coder-V2-Lite,
and Kimi-VL have lighter GGUF weights and are candidates for a 49,152-token test;
Kimi-Linear IQ3_XS is a tighter experiment. The [OpenVINO guide](./Intel-Arc-B60-OpenVINO.md)
and [backend guides](./Intel-Arc-B60-llama.cpp-Setup.md) contain runtime settings.

The [Swift results](./Intel-Arc-B60-Speed-Test-Results.md#local-llamacpp-swift-15-qwen38-27b)
also show the earlier Vulkan run and a short coding prompt.

### llama.cpp model launch settings

For each model, use the starting context and input/output limits in the table above.
The [Vulkan model recipes](./Intel-Arc-B60-Server-Setup-Vulkan.md#per-model-gguf-download-and-start-recipes)
contain GGUF filenames, download commands, and projector paths; the
[current Intel SYCL service](./Intel-Arc-B60-Server-Setup-Intel_SYCL.md) loads Swift 1.5.

### Why other famous families are absent

Quantization does not make every current flagship a single-B60 model. DeepSeek's
[V4 Flash](https://huggingface.co/deepseek-ai/DeepSeek-V4-Flash-DSpark) has 284B total
parameters; its 13B active parameters do not reduce the size of all resident experts.
The latest [Kimi publisher list](https://huggingface.co/moonshotai/models) includes
1T+ flagship models. Kimi-Linear-48B-A3B is included only at IQ3_XS: its
[Q4/MXFP4 GGUF files](https://huggingface.co/ymcki/Kimi-Linear-48B-A3B-Instruct-GGUF)
are over 26 GB before cache and buffers. The flagship models are outside the one-card shortlist.
[StarCoder2-15B](https://huggingface.co/bigcode/starcoder2-15b) does fit at
[Q4_K_M (~9.86 GB)](https://huggingface.co/QuantFactory/starcoder2-15b-GGUF/tree/main),
but its 16,384-token context with 4,096-token sliding attention cannot meet the
40K-input VS Code target. It remains a code-completion option rather than a recommended
agent/chat model here.
