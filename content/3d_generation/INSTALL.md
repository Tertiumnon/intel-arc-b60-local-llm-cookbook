# 3D generation: install

Image to 3D mesh with **Hunyuan3D 2.1** (Tencent), the newest open-weight Hunyuan3D release (June 2025;
shape model 3.3B, PBR texture model 2B). Newer 3.x versions are hosted by Tencent only; no weights found.
It runs in ComfyUI inside Intel's `llm-scaler-omni:0.1.0-b8` image, which includes the Hunyuan3D 2.1 nodes
and a workflow. Shape generation works on this server; the paint workflow currently fails during model loading.

Files total about 15 GB. Reports say about 29 GB of memory for shape plus texture together, so run the
shape step first and the texture step after it; the card has 24 GB.

License: Hunyuan 3D 2.1 Community License, check it before commercial use.

## 1. Base setup

Do [text_generation/INSTALL.md](../text_generation/INSTALL.md) and
[image_generation/INSTALL.md](../image_generation/INSTALL.md) steps 2 and 3 first (Docker on `/models`,
root helper, `/models/comfyui` folders).

## 2. Install the service (once)

The 3D image is a different ComfyUI than the one for images, so it has its own unit:

```bash
scp scripts/model--switch/llama-model-switch.py ai-b60:/tmp/llama-model-switch.py
scp scripts/comfyui-3d.service ai-b60:/tmp/comfyui-3d.service
ssh -t ai-b60 'sudo install -m 755 /tmp/llama-model-switch.py /usr/local/sbin/llama-model-switch'
ssh -t ai-b60 'sudo install -m 644 /tmp/comfyui-3d.service /etc/systemd/system/comfyui-3d.service && sudo systemctl daemon-reload'
ssh ai-b60 'docker pull intel/llm-scaler-omni:0.1.0-b8'
```

The container `comfyui-3d` is created once and then only started, so changes made in ComfyUI Manager survive
restarts. Remove it with `docker rm comfyui-3d` to start clean.

## 3. Download the models

```bash
bun run 3d:download
bun run 3d:download:trellis2
```

The TRELLIS.2 command downloads the official ComfyUI BF16 and INT8 checkpoints, image encoder,
and shape and texture VAEs (MIT). The installed `0.1.0-b8` 3D container does not have TRELLIS.2
nodes; `0.2.0-b2` contains the native nodes but its end-to-end 3D workflow has not been tested
on this B60. TRELLIS.2 is not yet available in Kyra.

Files from `tencent/Hunyuan3D-2.1` go to `/models/comfyui/models/hunyuan3d/`:
`hunyuan3d-dit-v2-1` (shape, 7.4 GB), `hunyuan3d-vae-v2-1` (0.7 GB) and `hunyuan3d-paintpbr-v2-1` (texture, ~6.9 GB).
The paint directory also contains its model configuration, tokenizer and upstream custom-code files.
The workflow also loads `RealESRGAN_x4plus.pth`; put it in `/models/comfyui/models/upscale_models/`.

The Hunyuan nodes discover the shape and VAE files in ComfyUI's standard folders. After downloading, link them:

```bash
ln /models/comfyui/models/hunyuan3d/hunyuan3d-dit-v2-1/model.fp16.ckpt /models/comfyui/models/diffusion_models/hunyuan3d-dit-v2-1.ckpt
ln /models/comfyui/models/hunyuan3d/hunyuan3d-vae-v2-1/model.fp16.ckpt /models/comfyui/models/vae/hunyuan3d-vae-v2-1.ckpt
```

## 4. Options after install

1. `bun run 3d:start`, open `http://<server>:8080`.
2. Hunyuan3D nodes are disabled by default. In **Manager**, filter **Disabled**, enable the Hunyuan3D node
   pack, restart the service (`sudo systemctl restart comfyui-3d` on the server) and refresh the page.
3. Load the workflow
   [`3d_hunyuan3d.json`](https://github.com/intel/llm-scaler/blob/omni-0.1.0-b8/omni/workflows/3d_hunyuan3d.json)
   (Workflow menu, Open) and use any input image.

On the tested container, the Hunyuan node pack needed a CPU ONNX Runtime and a BasicSR compatibility fix before it could load:

```bash
docker exec comfyui-3d uv pip install --python /opt/venv/bin/python --reinstall-package onnxruntime onnxruntime
docker exec comfyui-3d sed -i s/torchvision.transforms.functional_tensor/torchvision.transforms.functional/ /opt/venv/lib/python3.12/site-packages/basicsr/data/degradations.py
sudo systemctl restart comfyui-3d
```

These changes live in the persistent container and must be repeated if it is recreated.

Next: [TEST.md](./TEST.md), [USAGE.md](./USAGE.md).
