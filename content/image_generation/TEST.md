# Image generation: test

## 1. Start

```bash
bun run image:start             # stops the language model, starts ComfyUI, waits for /system_stats
```

## 2. Check the graph without generating

Open `http://<server>:8080/object_info` or submit the workflow; ComfyUI validates every file name against
`/models/comfyui/models`. A `value_not_in_list` error means a model file is missing or misnamed:

| Error mentions | Missing file |
|---|---|
| `unet_name` | `diffusion_models/qwen_image_2.1_turbo_bf16.safetensors` |
| `clip_name` | `text_encoders/qwen3vl_8b_bf16.safetensors` |
| `vae_name` | `vae/qwen_image_2.1_vae_bf16.safetensors` |

## 3. Generate

```bash
bun run image:test --only=goblin       # one image, timed
bun run image:test                     # eight fantasy prompts
```

Prompts are in [scripts/image--test/prompts.json](../../scripts/image--test/prompts.json): goblin, elf, dwarf, orc,
dragon, wizard, a hands check (five fingers) and a signboard text check ("THE GRINNING GOBLIN").
Images land in `test-results/images/<run>/`; each run adds a line to `test-results/image-runs.jsonl`
(name, size, seconds, file).

## 4. Judge by eye

- Anatomy: hands, faces, ears of the elf and goblin.
- Text on the sign is spelled correctly.
- Style matches the prompt (oil painting, concept art).
- First 1024x1024 goblin image: 85.1 seconds on the server, including initial model loading (17 November 2026).

## Pass criteria

All eight images are produced without errors, and at least the goblin, elf and text prompts look right.
The 24 GB card must not run out of memory; if it does, use the int8 files or a smaller `--size`.

Status: the goblin image generated successfully and was inspected; the other seven prompts and full pass criteria have not yet been tested.
