# Text generation: usage

## Choose a model

| Situation | Use |
|---|---|
| Hard reasoning, careful answers | `switch:coding:llama-qwen38-27b-unsloth:ctx49k` (UD-Q4_K_M, about 16-19 GB) |
| Long documents | `switch:coding:llama-qwen38-27b-iq3m:ctx64k` or `switch:coding:llama-terse` (131K, MTP) |
| Quick everyday chat | Qwen3.5 9B (smallest, fastest) |
| Images in the prompt | Gemma 4 26B-A4B or Qwen3.8-27B with a vision projector |

See [models.md](../models.md) for the full shortlist and [recommendations.md](../recommendations.md)
for what was measured. Prefer the newest model that fits; check its Hugging Face card and list
the repo files before adding it.

## Switch between models

```bash
bun run switch:list                          # presets: context, MTP, tested or not
bun run switch:coding:llama-qwen38-27b-iq3m:ctx64k        # run a preset
bun run switch:coding:strata-qwen38-flash-next-coder-iq1m                        # code model, see ../code_generation
```

Each switch stops the other services, downloads a missing file to `/models/gguf`, checks health,
and updates `.env`, the VS Code provider and `data/pi.json`.

## Add a model that has no preset

```bash
MODEL_CONTEXT_TOKENS=16384 bun run switch --service=llama --model=OWNER/REPO/FILE.gguf
```

For a vision model also set `HF_MMPROJ_REPO` and `HF_MMPROJ_FILE` (the projector GGUF). To keep it,
add an entry to [presets.json](../../scripts/model--switch/presets.json) with `"tested": false`
until you ran `bun run test` on it.

## Use it

- API: `AI_API_URL` and `AI_API_KEY` from `.env` (OpenAI-compatible, see [clients.md](../clients.md)).
- VS Code Chat, Open WebUI and the OpenAI SDK are covered in [clients.md](../clients.md).
- Pi agent: `bun run pi`, then `pi --provider arc-b60`.

## Clean up

```bash
bun run delete                       # list model files on the server (read-only)
bun run delete -- --gguf=FILE.gguf   # dry run; add --yes to remove
```

Image generation, 3D and speech share the GPU; starting one stops the others. Come back with any
`switch:*` command.
