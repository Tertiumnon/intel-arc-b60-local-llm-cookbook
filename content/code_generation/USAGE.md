# Code generation: usage

## Experimental arc-llm-lab engine

Run `bun run switch:coding` and select Qwen3.8-27B with the arc-lab approach to use DFlash2 and the patched Vulkan engine. This is a separate, text-only service. See [INSTALL.md](./INSTALL.md) for setup and [TEST.md](./TEST.md) for the measured limitations.

## Choose a model

| Task | Model | Command |
|---|---|---|
| Kyra and interactive Pi coding (default) | Strata Flash-Next Coder IQ1_M, 131K | `bun run switch --service=strata --model=coder:IQ1_M` |
| Faster long-repository work | Strata Coder IQ1_M, 131K | `bun run switch --service=strata --model=coder:IQ1_M` |
| Full-expert Flash-Next | Strata Qwen IQ2_XS, 131K | `bun run switch --service=strata --model=qwen:IQ2_XS` |
| Hard algorithmic task | Qwen3.8-27B UD-Q4_K_M, 131K | `bun run switch --preset=qwen38-27b-unsloth` |
| Backup | Signal + Terse-Coder Q4_K_M, 131K | `bun run switch --preset=terse` |
| Pi coding agent tuned | Qwen3.8-27B-pi, 64K | `bun run switch --preset=qwen38-pi` |

The existing Qwen3.8 UD-Q4_K_M SYCL configuration was about twice as slow on short tasks and about five times slower on a 27K prompt in an earlier comparison. The experimental Vulkan configuration is faster on one matched 30K prefill check; see [results.md](../results.md#arc-llm-lab-qwen38-dflash2-november-26-2026). See [models.md](../models.md) for the other candidates.

## Switch

```bash
bun run switch:coding           # choose model and approach, then context
bun run switch:list             # all llama presets and their test status
```

The default contexts are 131,072 tokens for both Strata models, Signal and Qwen3.8 UD-Q4_K_M;
65,536 for Qwen3.8 IQ3_M, Q4_K_XL, Dirk, Pi and ThinkingCap; 57,344 for Qwen3.6 27B
and Tiel-Coder; and 49,152 for Swift 1.5. `bun run switch:list` shows which exact llama
settings were tested. Dirk and ThinkingCap are untested at 64K. IQ2_XS has
started at 131K and passed two ~27K-input checks. Context includes input and output;
the VS Code input limit reserves room for output and headroom. Signal was slow on long prompts.
The menu offers 32,768, 49,152, 57,344, and 65,536 tokens, plus the existing default where different. Strata context variants use separate config and runner files. Except for previously recorded settings and the 49K service checks, context variants are untested on the B60 and may not fit in VRAM. For coding evaluation, use at least 49K allocated context.

After a switch the VS Code provider and `data/pi.json` match the served model. Run `bun run pi` to
update Pi's model and default selection while preserving its thinking level and other settings.
Reload the VS Code model picker if it still shows the old one.

## Add a new coding model

1. Read its Hugging Face card, license and file list; do not guess file names.
2. Try it: `MODEL_CONTEXT_TOKENS=49152 bun run switch --service=llama --model=OWNER/REPO/FILE.gguf`.
3. Run `bun run test` and `bun run quality`.
4. Add a preset to [presets.json](../../scripts/model--switch/presets.json), mark `"tested": true`
   only for the exact context you ran, and record the decision at the top of [recommendations.md](../recommendations.md).

## Tips

- Keep client input below the server context minus output and headroom (see [clients.md](../clients.md#input-and-output-limits)).
- Low reasoning passed everything higher levels passed in about a third of the time.
- Keep one request at a time on the server (`--parallel 1`).
- Remove unused model files with `bun run delete`.
