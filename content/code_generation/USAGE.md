# Code generation: usage

## Choose a model

| Task | Model | Command |
|---|---|---|
| Kyra and interactive Pi coding (default) | Strata Flash-Next Coder IQ1_M, 131K | `bun run switch:coding:strata-qwen38-flash-next-coder-iq1m` |
| Faster long-repository work | Strata Coder IQ1_M, 131K | `bun run switch:coding:strata-qwen38-flash-next-coder-iq1m` |
| Full-expert Flash-Next | Strata Qwen IQ2_XS, 131K | `bun run switch:coding:strata-qwen38-flash-next-iq2xs` |
| Hard algorithmic task | Qwen3.8-27B UD-Q4_K_M, 131K | `bun run switch:coding:llama-qwen38-27b-unsloth` |
| Backup | Signal + Terse-Coder Q4_K_M, 131K | `bun run switch:coding:llama-terse` |
| Pi coding agent tuned | Qwen3.8-27B-pi, 64K | `bun run switch:coding:llama-qwen38-27b-pi` |

Qwen3.8 UD-Q4_K_M is about twice as slow on short tasks and about five times slower on a 27K prompt,
so switch to it for one hard task and back. See [models.md](../models.md) for the other candidates.

## Switch

```bash
bun run switch:list             # all presets
bun run switch:coding:strata-qwen38-flash-next-coder-iq1m
bun run switch:coding:llama-qwen38-27b-unsloth
```

The default contexts are 131,072 tokens for both Strata models, Signal and Qwen3.8 UD-Q4_K_M;
65,536 for Qwen3.8 IQ3_M, Q4_K_XL, Dirk, Pi and ThinkingCap; 57,344 for Qwen3.6 27B
and Tiel-Coder; and 49,152 for Swift 1.5. `bun run switch:list` shows which exact llama
settings were tested. Q4_K_XL, Dirk and ThinkingCap are untested at 64K. IQ2_XS has
started at 131K and passed two ~27K-input checks. Context includes input and output;
the VS Code input limit reserves room for output and headroom. Signal was slow on long prompts.
The `:ctx32k`, `:ctx49k` and `:ctx57k` commands remain available for smaller contexts.

After a switch the VS Code provider and `data/pi.json` match the served model. Run `bun run pi` to
update Pi's model and default selection while preserving its thinking level and other settings.
Reload the VS Code model picker if it still shows the old one.

## Add a new coding model

1. Read its Hugging Face card, license and file list; do not guess file names.
2. Try it: `MODEL_CONTEXT_TOKENS=32768 bun run switch --service=llama --model=OWNER/REPO/FILE.gguf`.
3. Run `bun run test` and `bun run quality`.
4. Add a preset to [presets.json](../../scripts/model--switch/presets.json) and a package script, mark `"tested": true`
   only for the exact context you ran, and record the decision at the top of [recommendations.md](../recommendations.md).

## Tips

- Keep client input below the server context minus output and headroom (see [clients.md](../clients.md#input-and-output-limits)).
- Low reasoning passed everything higher levels passed in about a third of the time.
- Keep one request at a time on the server (`--parallel 1`).
- Remove unused model files with `bun run delete`.
