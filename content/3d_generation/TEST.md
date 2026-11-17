# 3D generation: test

There is no automated 3D test yet; use this checklist. Nothing here has been run on the server.

## 1. Service and files

```bash
bun run 3d:start
ssh ai-b60 'find /models/comfyui/models/hunyuan3d -type f | sort'
```

Expect the six files from [INSTALL.md](./INSTALL.md). Opening `http://<server>:8080` should show the
`Hy3D21*` nodes in the node search after you enabled them in Manager.

## 2. First mesh

1. Make an input: `bun run image:start`, then `bun run image "a stout dwarf warrior, full body, plain background"`
   (see [USAGE.md](./USAGE.md) for a transparent cut-out). Copy it into `/models/comfyui/input/` on the server
   or upload it in ComfyUI.
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
