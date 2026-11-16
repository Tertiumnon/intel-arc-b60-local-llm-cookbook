# Image generation

Fantasy art (goblins, elves, creatures) runs on the B60 through ComfyUI in Intel's
[`llm-scaler-omni`](https://github.com/intel/llm-scaler/tree/main/omni) image, which is built
for Arc Pro B60/B70. It shares port `8080` with the language models, so only one runs at a time.

## Models

| Model | Size on disk | Steps | License | Why |
|---|---|---|---|---|
| [Qwen-Image 2.1 Turbo](https://huggingface.co/Comfy-Org/Qwen-Image-2.1) | ~32 GB (bf16 + Qwen3-VL 8B encoder) | 8 | Qwen research (non-commercial) | Best open-weight prompt following; 2K output, readable text |
| [Z-Image Turbo](https://huggingface.co/Comfy-Org/Z-Image-Turbo) | ~21 GB | 8 | Apache-2.0 | Fast, commercial use allowed |

Qwen-Image 2.1 has int8 files (`*_int8_convrot`, about half the size) in the same repo; try them
if memory is tight. `FLUX.2 [dev]` is too large for 24 GB without heavy quantization.

## Setup (once)

Copy the helper and the unit to the server, then install them:

```bash
scp scripts/model--switch/llama-model-switch.py ai-b60:/tmp/llama-model-switch.py
scp scripts/comfyui.service ai-b60:/tmp/comfyui.service
ssh -t ai-b60 'sudo install -m 755 /tmp/llama-model-switch.py /usr/local/sbin/llama-model-switch'
ssh -t ai-b60 'sudo install -m 644 /tmp/comfyui.service /etc/systemd/system/comfyui.service && sudo systemctl daemon-reload'
ssh -t ai-b60 'sudo mkdir -p /models/comfyui/models /models/comfyui/input /models/comfyui/output /models/comfyui/user && sudo chown -R "$USER" /models/comfyui'
ssh -t ai-b60 'sudo docker pull intel/llm-scaler-omni:0.2.0-b2'
```

The unit uses render GID `109`, as in [setup.md](./setup.md). Change `--group-add` if yours differs.

## Use

```bash
bun run image:download:qwen      # or image:download:z-image
bun run image:start              # stops the language model, starts ComfyUI
bun run image "a goblin merchant haggling in a lantern-lit cave market, oil painting"
bun run image "an elf archer on a moonlit cliff" --size=768x1344
```

Images are saved in `images/`. `bun run image:test` renders eight fantasy prompts (goblin, elf, dwarf, orc, dragon, wizard, plus a hands and a signboard-text check), times each, and logs to `test-results/image-runs.jsonl`; judge the pictures by eye. ComfyUI itself is at `http://<server>:8080`; its template browser
has ready workflows for both models. Return to language models with `bun run switch:strata`.

## Status

Untested on the server: the download, the unit, and `scripts/image--generate/workflow.json`
(converted by hand from ComfyUI's `image_qwen_image_2_1_turbo_t2i` template).

- If ComfyUI reports an unknown node `TextEncodeQwenImage21`, the image's ComfyUI predates
  Qwen-Image 2.1. Update it inside the container (`/llm/tools/update_comfyui.sh`) or build the
  newer image from the `omni` source.
- Z-Image has no workflow script yet; use the ComfyUI template `image_z_image_turbo`.
