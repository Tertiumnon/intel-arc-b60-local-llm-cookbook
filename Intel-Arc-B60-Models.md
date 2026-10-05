# Intel Arc B60 Models Guide

## Overview
This guide is the single source of truth for selecting, downloading, and managing LLM models for deployment on Intel Arc Pro B60 GPUs with OpenVINO optimization. The workload it targets is **refactoring and implementing large JS/Node.js projects**. For that work, quality matters more than raw speed.

> **Last updated:** October 2, 2026

For how the model is served (OVMS service, Docker, GPU access), see [Intel Arc B60 Server Setup Guide](./Intel-Arc-B60-Server-Setup.md). For connecting clients to the running server, see [Intel Arc B60 Clients Guide](./Intel-Arc-B60-Clients.md).

## Quick Reference

### Model Selection at a Glance

| Model | VRAM (int4) | Speed (tok/s) | SWE-bench Pro | Best For |
|---|---|---|---|---|
| **Qwen3.8-27B** (primary) | ~15 GB | 25 | **61.7** | Large refactors, complex codebases |
| Qwen3.6-35B-A3B | ~18 GB | 50–90 | 49.5 | Quick edits, routine tasks |
| KAT-Coder-V2.5-Dev | ~18 GB | 50–90 | 46.0 | llama.cpp / GGUF workflows |
| Qwen3-Coder-30B-A3B | ~15 GB | 40–60 | ~20 | Legacy / fallback |

### VRAM Estimation (int4 quantization)

| Model Size | Approx. VRAM | Max Context (single B60) |
|---|---|---|
| 7–8B | ~4 GB | 128K+ |
| 14–15B | ~8 GB | 100K+ |
| 27B (dense) | ~15 GB | ~100K |
| 30–35B (MoE) | ~18 GB | ~60K |
| 80B (MoE) | ~42 GB | Needs 2× B60 |

> **Rule of thumb:** int4 ≈ 0.55 GB per billion parameters. Leave 6–8 GB free for KV cache on a 24GB card.

### When to Use What

| Task Type | Recommended Model | Reasoning Effort |
|---|---|---|
| Multi-file refactor, architecture changes | Qwen3.8-27B | `xhigh` |
| Bug fix, single-file edit | Qwen3.6-35B-A3B | `medium` |
| Quick code generation / boilerplate | Qwen3.6-35B-A3B | `low` |
| Code review / explanation | Qwen3.8-27B | `medium` |
| Fast one-shot answer (no reasoning) | Qwen3.8-27B (instruct mode) | N/A |

## Primary Model: Qwen3.8-27B (int4)
**`OpenVINO/Qwen3.8-27B-int4-ov`** is the primary model. As of October 2026 it is the newest
OpenVINO LLM (released Aug 2026) and the strongest coding model that fits on a single 24GB B60.

| Property | Value |
|---|---|
| Parameters | 27B dense (all weights active per token) |
| Architecture | Hybrid attention: 16 × (3 × Gated DeltaNet linear attention → 1 × Gated Attention) |
| Context | 262,144 tokens native (extensible to 1M) |
| Thinking | On by default; depth via `reasoning_effort` (`xhigh` default / `medium` / `low`) |
| OpenVINO builds | `int4-ov` (fits 24GB) · `int8-ov` (~28GB, needs 2× B60) |
| License | Apache-2.0 |
| Measured on our B60 | 25.0 tok/s generation (exact token counts); TTFT ~285 ms (short prompt) / ~620 ms (512-token prompt); prefill ~830 tok/s; **78 tok/s total at 4 parallel requests** ([benchmarks](./scripts/speed-test/README.md#full-benchmarks-aiperf)) |

### Recommended Settings for Large JS/Node Refactors
| Setting | Value | Why |
|---|---|---|
| `temperature` | **1.0** | Official thinking-mode setting (not 0.7) |
| `top_p` / `top_k` / `min_p` | 0.95 / 20 / 0.0 | Official thinking-mode setting |
| `presence_penalty` / `repetition_penalty` | 0.0 / 1.0 | Official thinking-mode setting |
| Max output tokens (`maxOutputTokens`) | **16384** | The model reasons before answering. Smaller limits (2K–8K) cut refactors off mid-thought. |
| Max input tokens (`maxInputTokens`) | **81920** (or 49152 for a faster first response) | Only 1 in 4 layers keeps a full KV cache (64 KiB/token), so ~7GB of free VRAM holds ~100K tokens. 128K+ needs 2× B60 or a compressed KV cache. See [VS Code limits](./Intel-Arc-B60-Clients.md#choosing-maxinputtokens--maxoutputtokens). |
| `reasoning_effort` | `xhigh` (default) | Keep for hard refactors; `medium` for routine edits |

Non-thinking (instruct) mode, if you need fast one-shot answers: `temperature=0.7`, `top_p=0.80`,
`top_k=20`, `presence_penalty=1.5`.

## Coding Model Comparison (October 2026)
SWE-bench Pro (fixing real issues in real repos) is the closest benchmark to refactoring work.

| Model | Size | Fits 1× B60 (24GB) | SWE-bench Pro | Terminal-Bench | Best For |
|---|---|---|---|---|---|
| **Qwen3.8-27B** (Aug 2026) | 27B dense | ✅ int4 | **61.7** | **73.0** (v2.1) | Large refactors |
| Qwen3.6-35B-A3B | 35B MoE, 3B active | ✅ int4 | 49.5 | 51.5 (v2.0) | Quick edits |
| KAT-Coder-V2.5-Dev (Jul 2026) | 35B MoE, 3B active | ✅ int4 (GGUF only, no OV build) | 46.0 | 41.0 (v2.1) | llama.cpp workflows |
| Qwen3-Coder-30B-A3B | 30B MoE, 3B active | ✅ int4 | ~20 | 13.5 | Baseline MoE (superseded) |
| Qwen3-Coder-Next | 80B MoE, 3B active | ❌ ~42GB int4, needs 2× B60 | — | — | 2× B60 setups |
| Qwen3.8-Flash-Next / GLM-5.3-Flash | 180B / 321B MoE | ❌ | — | — | Multi-GPU research |

> Scores are vendor-reported from each model card and use different agent harnesses, so
> compare across rows loosely. The ranking is consistent within each vendor's own table:
> Qwen3.8-27B leads by 12+ points.
> Sources: [Qwen3.8-27B](https://huggingface.co/Qwen/Qwen3.8-27B),
> [Qwen3.6-35B-A3B](https://huggingface.co/Qwen/Qwen3.6-35B-A3B),
> [KAT-Coder-V2.5-Dev](https://huggingface.co/Kwaipilot/KAT-Coder-V2.5-Dev),
> [Qwen3-Coder-Next](https://huggingface.co/Qwen/Qwen3-Coder-Next).

### Speed vs Quality
- **Dense 27B (Qwen3.8):** reads all ~14–15GB of weights per token. The B60's ~456 GB/s
  memory bandwidth caps it near 30 tok/s; we measure ~25 tok/s. Best quality.
- **MoE 35B-A3B (Qwen3.6, KAT-Coder):** only ~3B active per token, so it runs 2–4× faster
  (50–90 t/s) but scores ~12 points lower on SWE-bench Pro. It's a good fit for quick,
  routine edits, but not the main model for large refactors.
- **MoE 30B-A3B (Qwen3-Coder-30B):** the older MoE architecture. ~2× faster than dense
  but ~40 points behind Qwen3.8-27B on SWE-bench Pro. Still fits on one B60 and useful
  as a speed benchmark — newer MoE models (35B-A3B) have closed much of the quality gap.

### Which Engine?
Serve OpenVINO builds with OVMS (our default). Use llama.cpp only for GGUF-only models or
Windows/LM Studio. See [OVMS vs llama.cpp](./Intel-Arc-B60-llama.cpp-Setup.md#openvino-ovms-vs-llamacpp-on-the-b60).

### Upgrade Path (2× B60, 48GB)
A second card adds **memory, not speed** (see the dual-GPU numbers below). With 48GB:
1. `OpenVINO/Qwen3.8-27B-int8-ov`: same model with less quantization loss. This is the
   first step for higher quality.
2. Qwen3-Coder-Next (80B-A3B) at int4: a coding-specialist alternative worth evaluating.

## Qwen3.6-35B-A3B (Fast Alternative)
`OpenVINO/Qwen3.6-35B-A3B-int4-ov` (OVMS) or GGUF (LM Studio / llama.cpp Vulkan). Fits on a
single 24GB B60 with ~111K context.

Dual-GPU benchmarks and Windows + LM Studio settings:
[Windows + LM Studio Guide §Expected Performance](./Intel-Arc-B60-Windows-LM-Studio.md#expected-performance).

Runs **faster on one card than split across two**. Only use dual B60 for models or contexts
that don't fit in 24GB.

## Switching Models
Change `--source_model` in the OVMS service (see
[Server Setup §5](./Intel-Arc-B60-Server-Setup.md#5-openvino-model-server-ovms)), restart
it, then benchmark and test on real tasks:

```bash
sudo systemctl restart openvino-model-server.service
cd scripts/speed-test && bun run list && bun run bench
```

> See [speed-test README](./scripts/speed-test/README.md) for benchmark commands and full results.

Judge quality on 3–4 real tasks from your own repos (a bug fix, a multi-file refactor, a new
feature), not only on benchmarks.

## Finding New Models

### Search Strategies
1. Check the newest LLMs in the OpenVINO org first. These run on OVMS without conversion.
2. Compare **SWE-bench Pro / Verified** and **Terminal-Bench** on the model card.
3. Check that it fits: int4 ≈ 0.55 GB per billion params. 24GB holds up to ~30B dense or
   ~35B MoE, with room left for KV cache.
4. Prefer official lab releases. Avoid "abliterated", "uncensored" and merged community
   fine-tunes for production coding work.

### Hugging Face Resources
1. **OpenVINO LLM Collection**: https://huggingface.co/collections/OpenVINO/llm
2. **Newest OpenVINO models**: https://huggingface.co/OpenVINO?sort_models=created
3. **Model Zoo**: https://github.com/openvinotoolkit/openvino/tree/main/model_zoo

## Downloading Models
```bash
# Create models directory
mkdir -p /models

# Download model using Hugging Face CLI (if installed)
# huggingface-cli download OpenVINO/Qwen3.8-27B-int4-ov --local-dir /models/OpenVINO/Qwen3.8-27B-int4-ov

# Or using git clone for model repositories
# git clone https://huggingface.co/OpenVINO/Qwen3.8-27B-int4-ov
```

OVMS also downloads the model automatically on first start when `--source_model` points to a
Hugging Face repo id.

## Model Update Workflow

When new OpenVINO models are released or you want to try a newer version:

1. **Check for new releases:** [OpenVINO LLM Collection](https://huggingface.co/collections/OpenVINO/llm)
2. **Verify fit:** Use the VRAM estimation table above. int4 ≈ 0.55 GB/B.
3. **Download & benchmark:** Run `bun run bench` before deploying to production.
4. **Test on real tasks:** Pick 2–3 tasks from your actual repos.
5. **Compare side-by-side:** Run old and new models in parallel if possible.
6. **Rollback plan:** Keep the previous model downloaded. OVMS switches instantly via `--source_model`.

```bash
# Rollback to previous model
sudo systemctl stop openvino-model-server.service
# Edit /etc/openvino/model-server/config.json → change --source_model
sudo systemctl start openvino-model-server.service
```

## Other Models (legacy list, not re-verified)
Kept for reference. These are older or smaller and are superseded for coding by the
models above.

- **Code:** Qwen3-Coder-30B-A3B-Instruct-int4-ov, Qwen3.5-35B-A3B (GGUF), StarCoder2-15B, CodeQwen1.5-7B-Chat
- **General chat:** Qwen3 7B/8B/14B, Phi-3.5-mini-instruct, Llama-3.2-1B
- **Multimodal:** Qwen3-VL-4B/7B, Qwen-VL-Chat, LLaVA-1.6

## Best Practices

### Prompt Engineering for JS/Node.js Refactoring
- **Be explicit about scope:** Specify which files/directories to touch and which to leave alone.
- **Provide context files:** Include relevant imports, type definitions, and config files in the prompt.
- **One refactor per prompt:** Don't combine multiple unrelated changes. The model handles focused tasks better.
- **Use file paths as anchors:** Reference exact file paths and line ranges for precision.
- **Iterate, don't dump:** Start with a small proof-of-concept refactor, then scale up.

### Model Versioning & Updates
- **Pin model versions:** Use specific revision hashes or tagged releases, not `main`/`latest`.
  ```bash
  # Good: pinned revision
  huggingface-cli download OpenVINO/Qwen3.8-27B-int4-ov --revision abc1234

  # Bad: always pulls latest
  huggingface-cli download OpenVINO/Qwen3.8-27B-int4-ov
  ```
- **Re-benchmark after model updates:** Even minor weight changes can affect speed/quality.
- **Test on real tasks first:** Benchmarks don't capture your codebase's specifics.
- **Keep a model changelog:** Track which model version was used for which project phase.

### Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| OOM errors | Context too long for VRAM | Reduce `maxInputTokens`; use KV cache compression |
| Slow first response (TTFT > 5s) | Model loading / long prompt | Pre-warm the model; reduce prompt length |
| Incoherent / hallucinated code | Temperature too high for task | Lower `temperature` to 0.7; use instruct mode |
| Model crashes on large files | VRAM fragmentation | Restart OVMS; reduce parallel requests |
| Slow generation after warmup | GPU thermal throttling | Check GPU temps; ensure adequate cooling |
| Quantization artifacts (nonsense code) | int4 too aggressive for task | Try int8 (needs 2× B60) or a larger model |

## Hardware Considerations
- **Arc B60**: 24GB VRAM per card, 20 Xe2 cores (dual-GPU boards: 2× 24GB = 48GB)
- **Memory bandwidth** sets the speed ceiling for dense models. Divide bandwidth by the
  weight size for an upper bound on tok/s.
- Leave VRAM headroom for the KV cache when running long contexts.
