# Code generation: usage

## Choose a model

| Task | Model | Command |
|---|---|---|
| Everyday coding, long repos (default) | Strata Coder IQ1_M, 131K | `bun run switch:strata` |
| Hard algorithmic task, short prompt | Qwen3.8-27B UD-Q4_K_M, 49K | `bun run switch:qwen38-27b-unsloth:ctx49k` |
| Backup, short prompts | Signal + Terse-Coder Q4_K_M, 32K | `bun run switch:terse:ctx32k` |
| Pi coding agent tuned | Qwen3.8-27B-pi (untested on B60) | `bun run switch:qwen38-pi:ctx32k` |

Qwen3.8 UD-Q4_K_M is about twice as slow on short tasks and about five times slower on a 27K prompt,
so switch to it for one hard task and back. See [models.md](../models.md) for the other candidates.

## Switch

```bash
bun run switch:list             # all presets
bun run switch:strata
bun run switch:qwen38-27b-unsloth:ctx49k
```

After a switch the VS Code provider and `data/pi.json` match the served model. Run `bun run pi` to
copy the Pi config. Reload the VS Code model picker if it still shows the old one.

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
