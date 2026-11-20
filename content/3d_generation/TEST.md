# 3D generation: test

There is no automated 3D test yet; use this checklist.

On 18 November 2026, a 30-step shape-only test of a background-removed golem image produced a watertight GLB with 108,534 vertices and 217,064 faces in 70.61 seconds. The first run with an opaque background produced a non-watertight mesh. The output was checked programmatically, not visually; texture generation and the full pass criteria remain untested.

On 19 November 2026, a paint test with the MAM-4 reference and GLB failed before generating
textures: the supplied Diffusers loader requires approval to execute the model package's custom
code. An isolated test using the node pack's XPU implementation instead failed because
`UNet2DConditionModel` has no `enable_model_cpu_offload` method. The experimental loader change
was reverted. TRELLIS.2 has not yet been tested on this server.

## 1. Service and files

```bash
bun run 3d:start
ssh ai-b60 'find /models/comfyui/models/hunyuan3d -type f | sort'
```

Expect the weights and paint configuration from [INSTALL.md](./INSTALL.md). Opening `http://<server>:8080` should show the
`Hy3D21*` nodes in the node search after you enabled them in Manager.

## 2. First mesh

1. Make an input: `bun run image:start`, then `bun run image "a stout dwarf warrior, full body, plain background"`
   (see [USAGE.md](./USAGE.md) for a transparent cut-out). Upload it in the 3D ComfyUI interface; the 3D container does not mount `/models/comfyui/input/`.
2. `bun run 3d:start`, load `3d_hunyuan3d.json`, pick the image in the `Hy3D21LoadImageWithTransparency` node.
3. Run. The workflow writes a GLB (`Hy21_Mesh.glb`) to `/models/comfyui/output/3D/Hy3D/` and shows it in `Preview3D`.

## 3. Check

- Shape: the mesh is closed, has the right silhouette from all sides, and does not have holes.
- Texture: the paint step produces a colour map consistent with the picture.
- Memory: no out-of-memory error. If the run fails at the texture step, lower the face count (`INTConstant`, default
  200,000) and the multi-view resolution (768) in the workflow.
- Time: record shape and texture times here once measured.

## Pass criteria

One GLB opens in a viewer (Blender, or the ComfyUI preview) and looks like the input image.
