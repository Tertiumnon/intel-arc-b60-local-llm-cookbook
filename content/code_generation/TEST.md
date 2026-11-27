# Code generation: test

On November 26, 2026, the 49,152-token switches for arc-lab Qwen3.8, Strata Flash-Next Coder IQ1_M, and llama Signal Terse Coder started on the B60 and passed their response checks. This is a startup check, not a quality benchmark. Other newly added context variants are untested unless listed in the presets or results.

## Experimental arc-llm-lab engine

On November 26, 2026, the patched Vulkan build and DFlash2 loaded at 65,536 context on this B60. A short Python request completed at 23.94 generated tokens/s with 209 of 312 draft tokens accepted. The project speed test, three short JavaScript requests after warm-up, averaged 23.86 generated tokens/s and measured 330.65 prefill tokens/s for a 1,333-token prompt.

A later speed run and manual review of basic, complex, and approximately 54.5K-input tasks are recorded in [results.md](../results.md#arc-llm-lab-qwen38-dflash2-november-26-2026). Generated code was not executed; the pricing answer omitted a required definition and the TTL cache mishandled expired entries.

One uncached 30,021-token prompt returned `READY` in both configurations: the experimental 64K f16-cache configuration processed it at 338.37 tokens/s (89.15 seconds total), versus 178.13 tokens/s (168.85 seconds) for the existing SYCL service at 49K with Q8 cache and no drafter. These are single runs of complete configurations, not a kernel-only comparison. Full 64K inputs and sustained agent sessions remain untested. The normal switch back to llama.cpp was verified.

## 1. Switch and check

```bash
bun run switch --service=strata --model=coder:IQ1_M
bun run list                    # expect qwen3.8-flash-next-coder-iq1_m, n_ctx 131072
```

## 2. Speed

```bash
bun run test                    # first-token time, tokens/s, RAM
```

Reference: Strata handled a 110K-token prompt in about 2 minutes ([results.md](../results.md)).

## 3. Quality

```bash
bun run quality                 # JS/TS and commit-message tasks, low/medium/high reasoning
```

Tasks are in [scripts/model--quality/tasks.json](../../scripts/model--quality/tasks.json); each has an
automatic check. Compare with the table in [recommendations.md](../recommendations.md) (Strata
4/5 on hard tasks, Qwen3.8 UD-Q4_K_M 5/5). One run per task is weak evidence; repeat before deciding.

## 4. Client check

1. Pi: `bun run pi`, then `pi --provider arc-b60 -p "Reply with the single word: ok"`.
2. VS Code: pick the `Arc B60 (strata)` model in Chat and ask for a small function.

If VS Code says "Sorry, no response was returned", reduce `maxInputTokens`, then check the server log
(see Troubleshooting in [clients.md](../clients.md)).

## Pass criteria

- `bun run quality` passes the tasks listed as passing for this model in [results.md](../results.md).
- A 30K-token prompt returns in under 2 minutes.
