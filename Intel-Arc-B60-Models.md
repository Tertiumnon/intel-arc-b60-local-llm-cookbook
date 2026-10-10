# Intel Arc B60 Models Guide

## Overview
This guide compares models for Intel Arc Pro B60 GPUs, with recommendations for coding, chat, and image tasks. The primary workload is **refactoring and implementing large JS/Node.js projects**. For that work, quality matters more than raw speed.

> **Last updated:** October 8, 2026

For current serving steps, see the [Intel SYCL Usage guide](./Intel-Arc-B60-Server-Usage.md).
For connecting clients, see the [Clients Guide](./Intel-Arc-B60-Clients.md).
Local speed measurements and published scores are in
[Speed Test Results](./Intel-Arc-B60-Speed-Test-Results.md).

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
The GGUF file size is only the weight budget; the current 45,056-input plus
8,192-output client profile needs at least 53,248 tokens of context and
additional runtime memory. MoE active parameters can improve
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
offers these useful single-B60 choices. The B60 previously ran the
`UD-Q4_K_M` variant; a 39,931-token uncached request completed at a 49,152
server context. This validates that specific text-only request on this host,
not every GGUF from the repository or a full developer exchange.

- `UD-Q4_K_M` **16.5 GB**: first choice for a long-input trial because it leaves
  more room for KV cache and buffers than the larger files.
- `UD-Q4_K_XL` **17.6 GB**: larger alternative to compare after the first
  context test; its practical B60 quality and headroom remain unmeasured.
- `UD-Q5_K_S` **18.7 GB** or `UD-Q5_K_M` **19.8 GB**: quality-focused trials with
  less space for a large context. Avoid assuming a long input will fit.

The optional `mmproj-F16.gguf` is another **928 MB** for image input. Quantization
does not change the model's published **262,144-token native context**. For a
genuine Unsloth fine-tune, check that its model card identifies extra training
or a fine-tuned parent; an `unsloth/` prefix alone does not establish that.
The [Vulkan archive](./Intel-Arc-B60-Server-Setup-Vulkan.md#qwen38-27b-unsloth-dynamic-gguf)
records an earlier download recipe; use the SYCL service for current trials.

## Base Model: Qwen3.8-27B
Qwen3.8-27B is the base of the previously served Swift 1.5 coding fine-tune. Its OpenVINO
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
compare answer quality, latency, and how much context you need. The [Usage
guide](./Intel-Arc-B60-Server-Usage.md) covers download and selection on SYCL.

### Better for coding

| Model | B60 option | Fit and starting point | Assessment | Quality /5 | Speed /5 | Balance /5 | Arena user rating* |
|---|---|---|---|---:|---:|---:|---|
| [Swift 1.5 Qwen3.8-27B](https://huggingface.co/ukisai/Swift-1.5-Qwen3.8-27B-GGUF) | Q4_K_M GGUF (~17.4 GB) | Previously served at 49,152 context; long input verified ([results](./Intel-Arc-B60-Speed-Test-Results.md#local-llamacpp-swift-15-qwen38-27b)) | Coding fine-tune of Qwen3.8-27B. Publisher coding scores are in the [results](./Intel-Arc-B60-Speed-Test-Results.md#published-coding-benchmark-scores); local GGUF coding quality is unmeasured. | **5** | **2** | **3** | Not listed |
| [Signal + Terse-Coder](https://huggingface.co/mradermacher/Signal-3.8-27B-Terse-Coder-i1-GGUF) | i1-Q4_K_M GGUF (16.8 GB) | 57,344 served; 44,856-token prompt completed | Coding fine-tune with shorter reasoning; led local variants in one [469-question user comparison](https://www.reddit.com/r/LocalLLaMA/comments/1x0gaqv/comparing_qwen3827b_finetunes_and_baselining_vs/). | — | — | — | Not listed |
| [Qwen3.8-27B-pi](https://huggingface.co/bytkim/Qwen3.8-27B-pi-GGUF) | Q4_K_M GGUF (~16.5 GB); optional MTP draft ~2.0 GB | Start at 4K without draft; B60 untested | Fine-tuned on Pi coding-agent sessions; publisher reports fewer output tokens at matched task success. | — | — | — | Not listed |
| [ThinkingCap Qwen3.8-27B](https://huggingface.co/bottlecapai/ThinkingCap-Qwen3.8-27B-GGUF) | IQ4_XS GGUF (~15.5 GB) | Start at 4K; B60 untested | Publisher reports 37% fewer reasoning tokens with a small accuracy loss; [commercial use is restricted](https://huggingface.co/bottlecapai/ThinkingCap-Qwen3.8-27B-GGUF#license). | — | — | — | Not listed |
| **[Qwen3.8-27B imatrix IQ3_M](https://huggingface.co/pearsonkyle/Qwen3.8-27B-imatrix-MTP-GGUF)** | IQ3_M GGUF (~12.1 GiB) + Q8_0 projector (629 MB) | Previously served at 65,536; synthetic 42K input fit | Good coding quality, but slow responses (user report). Publisher rates this quant 2/5; no controlled local quality comparison. | — | — | — | [Base-model rating](./Intel-Arc-B60-Speed-Test-Results.md#published-arena-user-ratings) |
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

For coding work, choose client limits from the context that the selected GGUF
actually loads on the Intel SYCL service. This is one tested example:

| Server context | VS Code `maxInputTokens` | VS Code `maxOutputTokens` | Client total | Server headroom |
|---:|---:|---:|---:|---:|
| **57,344** | **45,056** | **8,192** | 53,248 | 4,096 |

[VS Code defines](https://code.visualstudio.com/docs/agent-customization/language-models#model-configuration-reference)
its client context window as input plus output. The input includes agent
instructions, tools, history, and repository content; thinking consumes the
output allowance. The server's `--ctx-size` must cover both, with room for
chat-template and tokenizer differences. See the
[llama.cpp server reference](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md).
This example used one server slot. Check a new model on SYCL before reusing
these limits. Historical context tests are in
[Speed Test Results](./Intel-Arc-B60-Speed-Test-Results.md).

### llama.cpp model launch settings

Use the [Usage guide](./Intel-Arc-B60-Server-Usage.md) to download and select a GGUF
on the current Intel SYCL service. Model cards publish native context lengths;
those are not verified B60 server settings.
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
45K-input VS Code target. It remains a code-completion option rather than a recommended
agent/chat model here.
