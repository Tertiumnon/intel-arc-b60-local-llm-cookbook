# Image generation: usage

## Choose a model

| Goal | Model | Why |
|---|---|---|
| Detailed fantasy scenes, readable text | Qwen-Image 2.1 Turbo | Best prompt adherence; 8 steps |
| Fast drafts, commercial use | Z-Image Turbo | Apache-2.0, smaller |
| Image for 3D | Qwen-Image 2.1 with a transparent background | See [3d_generation](../3d_generation/USAGE.md) |

## Start and generate

```bash
bun run image:start
bun run image "a goblin merchant haggling in a lantern-lit cave market, oil painting"
bun run image "an elf archer on a moonlit cliff" --size=768x1344
```

Images are saved in `images/` (git-ignored). `--size` is `WIDTHxHEIGHT`, both multiples of 32; the model
supports up to 2048x2048. `bun run image` uses Qwen-Image 2.1 Turbo; Z-Image has no script yet, so open
the ComfyUI template `image_z_image_turbo` in the web UI.

## Fantasy style LoRAs in ComfyUI

Start ComfyUI with `bun run image:start`. In a text-to-image workflow, choose
the matching checkpoint in **Load Checkpoint** and connect its MODEL and CLIP
outputs through **Load LoRA**. Choose one LoRA and connect its MODEL and CLIP
outputs to the sampler and text encoders; start with strength 1.0. Change the
LoRA in that node to switch styles. The `bun run image` command uses its own
Qwen workflow and does not select these LoRAs.

| Style | LoRA file | Checkpoint | Prompt cue |
|---|---|---|---|
| Vintage Fantasy Illustration | `vintage-fantasy-illustration.safetensors` | FLUX.1-dev FP8 | `Vintage Fantasy illustration` |
| Dungeons & Dragons Art Style Capture | `dungeons-dragons-art-style-capture-fantasy-lora-xl.safetensors` | SDXL 1.0 base | `dungeons and dragons` |
| Dark Fantasy Digital Art Style | `dark-fantasy-digital-art-style.safetensors` | FLUX.1-dev FP8 | `df_style` |
| Dungeons & Dragons painting alternative | `dungeon-dragons.safetensors` | FLUX.1-dev FP8 | `a painting of, in the style of jeff-easley` |
| Frank Frazetta oil painting alternative | `flux-frank-frazetta-style-oil-painting.safetensors` | FLUX.1-dev FP8 | `Frank Frazetta fantasy oil painting` |
| Boris Vallejo Fantasy Art Style-GMR | `boris-vallejo-fantasy-art-style-gmr.safetensors` | FLUX.1-dev FP8 | `Boris Vallejo` |

The painting and Frazetta entries are accessible alternatives; they have not
been identified as the exact named models requested. LoRA downloads and the
SDXL and FLUX checkpoint downloads may still be in progress: inspect
`/models/strata-update-logs/fantasy-loras.log`, `sdxl-download.log`, and
`flux1-dev-download.log` on the server before use. These workflows and their
memory use on the B60 are untested. FLUX.1-dev is non-commercial; SDXL and
the listed LoRA repositories declare OpenRAIL++.

## Prompt tips

- Name the subject, setting, light and medium: "scarred orc warchief, black plate armor, snowy dawn, oil painting".
- For a cut-out (for 3D), wrap the prompt as in the Qwen-Image template: "This is an RGBA format image with
  transparency. [description]. The image has an alpha channel and a transparent background." Save as PNG.
- Put exact text in double quotes.

## Switch services

Image generation stops the language model. Go back with any `switch:*` command:

```bash
bun run switch --service=strata --model=coder:IQ1_M
```

Download more models by adding an entry to [scripts/image--download/models.json](../../scripts/image--download/models.json)
(`repo` and `file` as listed in the Hugging Face repo; add `dir` only to change the target path), then a
`package.json` script. Check the model card and license first.

Remove model files on the server with `ssh ai-b60 rm /models/comfyui/models/<folder>/<file>`; the Hugging Face cache
is in `/models/.hf-cache`.
