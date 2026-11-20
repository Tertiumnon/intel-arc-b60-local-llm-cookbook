# 3D generation: usage

## Pipeline

Text to 3D works best in two steps: make a clean picture, then lift it to a mesh.

1. `bun run image:start`, then `bun run image "<prompt>"` with a single subject, plain background, full body.
   For a transparent cut-out, use the Qwen-Image template wording in [image_generation/USAGE.md](../image_generation/USAGE.md#prompt-tips).
2. `bun run 3d:start` (stops image generation) and run the Hunyuan3D 2.1 workflow on that image.
3. Take the GLB from `/models/comfyui/output/` (see `scp` below).

```bash
scp "ai-b60:/models/comfyui/output/3D/Hy3D/*.glb" ./models-3d/
```

## Choose a model

Hunyuan3D 2.1 shape generation is the only working 3D workflow set up here. TRELLIS.2 weights can be downloaded with `bun run 3d:download:trellis2`, but the workflow is not yet integrated or tested. Hunyuan3D 2.1 is the newest Hunyuan3D with open weights; the hosted 3.x versions
cannot run locally. If you need a lighter shape-only run, the same repo family has smaller releases
(`Hunyuan3D-2mini`); they need their own nodes and are not set up.

## Switch services

The 3D service replaces whichever service is running on port `8080`:

```bash
bun run 3d:start            # Hunyuan3D ComfyUI (b8 image)
bun run image:start         # image ComfyUI (b2 image)
bun run switch:coding:strata-qwen38-flash-next-coder-iq1m       # a language model again
```

## Tips

- One subject per image, centred, lit evenly, no text; this gives the cleanest geometry.
- Thin parts (wings, weapons) usually lose detail in image-to-3D meshes; a simple pose such as an A-pose helps (general advice, not measured here).
- Reduce the face count in `Hy3D21PostprocessMesh` for game use.
- Add other 3D models by adding a `models.json` entry in [scripts/image--download](../../scripts/image--download/models.json)
  and a package script, after checking the license.
