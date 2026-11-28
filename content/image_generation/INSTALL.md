# Image generation: install

Fantasy art (goblins, elves, creatures) through ComfyUI in Intel's
[`llm-scaler-omni`](https://github.com/intel/llm-scaler/tree/main/omni) image, built for Arc Pro B60/B70.
It shares port `8080` with the language models, so only one service runs at a time.

## Models

| Model | Size | Steps | License | Why |
|---|---|---|---|---|
| [Qwen-Image 2.1 Turbo](https://huggingface.co/Comfy-Org/Qwen-Image-2.1) | ~32 GB (bf16 model + Qwen3-VL 8B encoder + VAE) | 8 | Qwen research (non-commercial) | Best open-weight prompt following; 2K output, readable text, transparent PNG |
| [Z-Image Turbo](https://huggingface.co/Comfy-Org/Z-Image-Turbo) | ~21 GB | 8 | Apache-2.0 | Fast; commercial use allowed |

Qwen-Image 2.1 also ships int8 files (`*_int8_convrot`, about half the size) in the same repo; try them if
memory is tight (the server has 32 GB RAM). `FLUX.2 [dev]` is too large for 24 GB without heavy quantization.

## 1. Base setup

Do [text_generation/INSTALL.md](../text_generation/INSTALL.md) first (server, `.env`, SSH alias, root helper).

## 2. Put Docker storage on /models (once)

Images are large (27 GB for this one). On this host the root disk is 98 GB, so the Docker image store
(`/var/lib/containerd`) is bind-mounted from `/models/containerd`:

```bash
ssh -t ai-b60 'sudo systemctl stop docker.socket docker.service containerd.service'
ssh -t ai-b60 'sudo rsync -aHAXx /var/lib/containerd/ /models/containerd/ && sudo mv /var/lib/containerd /var/lib/containerd.old && sudo mkdir /var/lib/containerd'
ssh -t ai-b60 'echo "/models/containerd /var/lib/containerd none bind,x-systemd.requires-mounts-for=/models 0 0" | sudo tee -a /etc/fstab'
ssh -t ai-b60 'sudo mount /var/lib/containerd && sudo systemctl start containerd docker && docker images'
```

Delete `/var/lib/containerd.old` only after Docker and your services work. Stopping Docker also stops
the running model service; restart it with a `switch:*` command.

## 3. Install the service (once)

```bash
scp scripts/model--switch/llama-model-switch.py ai-b60:/tmp/llama-model-switch.py
scp scripts/comfyui.service ai-b60:/tmp/comfyui.service
ssh -t ai-b60 'sudo install -m 755 /tmp/llama-model-switch.py /usr/local/sbin/llama-model-switch'
ssh -t ai-b60 'sudo install -m 644 /tmp/comfyui.service /etc/systemd/system/comfyui.service && sudo systemctl daemon-reload'
ssh -t ai-b60 'sudo mkdir -p /models/comfyui/models /models/comfyui/input /models/comfyui/output /models/comfyui/user && sudo chown -R "$USER" /models/comfyui'
ssh ai-b60 'docker pull intel/llm-scaler-omni:0.2.0-b2'
```

The unit uses render GID `109` as in [setup.md](../setup.md); change `--group-add` if yours differs.
The pull is large; on a slow link it takes hours and keeps running on the server after you close the shell.

## 4. Download models

```bash
bun run image:download:qwen         # Qwen-Image 2.1 Turbo
bun run image:download:z-image      # Z-Image Turbo
```

Files go to `/models/comfyui/models/{diffusion_models,text_encoders,vae}`. Existing files are reused.

Vintage Fantasy Illustration is a FLUX.1-dev LoRA, installed on the server at
`/models/comfyui/models/loras/vintage-fantasy-illustration.safetensors` from
[Muapi's model repository](https://huggingface.co/Muapi/vintage-fantasy-illustration)
(OpenRAIL++). Its trigger is `Vintage Fantasy illustration`. It needs a
compatible FLUX.1-dev base: the server download of ComfyUI's
`flux1-dev-fp8.safetensors` checkpoint is recorded in
`/models/strata-update-logs/flux1-dev-download.log`. That checkpoint includes
its text encoders and uses the [FLUX.1-dev non-commercial license](https://huggingface.co/Comfy-Org/Flux-1-Dev).
Load the checkpoint and LoRA in ComfyUI; the existing Qwen and Z-Image scripts
do not apply this FLUX LoRA. FLUX generation on this B60 is untested.

## 5. Options after install

- ComfyUI is at `http://<server>:8080` after `bun run image:start`. Its template browser has ready workflows.
- If a node such as `TextEncodeQwenImage21` is unknown, update ComfyUI in the container
  (`/llm/tools/update_comfyui.sh`) or use a newer `llm-scaler-omni` image.
- The image ships ComfyUI 0.39.0 with all nodes used by `scripts/image--generate/workflow.json`.

Next: [TEST.md](./TEST.md), [USAGE.md](./USAGE.md).
