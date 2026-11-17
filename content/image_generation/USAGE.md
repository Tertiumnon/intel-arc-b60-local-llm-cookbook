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

## Prompt tips

- Name the subject, setting, light and medium: "scarred orc warchief, black plate armor, snowy dawn, oil painting".
- For a cut-out (for 3D), wrap the prompt as in the Qwen-Image template: "This is an RGBA format image with
  transparency. [description]. The image has an alpha channel and a transparent background." Save as PNG.
- Put exact text in double quotes.

## Switch services

Image generation stops the language model. Go back with any `switch:*` command:

```bash
bun run switch:strata
```

Download more models by adding an entry to [scripts/image--download/models.json](../../scripts/image--download/models.json)
(`repo` and `file` as listed in the Hugging Face repo; add `dir` only to change the target path), then a
`package.json` script. Check the model card and license first.

Remove model files on the server with `ssh ai-b60 rm /models/comfyui/models/<folder>/<file>`; the Hugging Face cache
is in `/models/.hf-cache`.
