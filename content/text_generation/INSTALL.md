# Text generation: install

General chat and writing with llama.cpp (Intel SYCL) on the B60. One model runs at a time on
port `8080` (`/v1`, OpenAI-compatible).

## Pick

| Need | Model | Command |
|---|---|---|
| Best answers | Qwen3.8-27B UD-Q4_K_M, 49K context | `bun run switch:qwen38-27b-unsloth:ctx49k` |
| Longer context, smaller file | Qwen3.8-27B IQ3_M, 64K context | `bun run switch:qwen38-27b-iq3m:ctx64k` |
| Fast and light | Qwen3.5 9B Q4_K_M (~5.6 GB), 16K | `bun run switch --service=llama --model=OWNER/REPO/FILE.gguf` (see [USAGE](./USAGE.md)) |
| Chat with images | Gemma 4 26B-A4B Q4_0 + mmproj | same, set `HF_MMPROJ_REPO` and `HF_MMPROJ_FILE` |

Model details and fit are in [models.md](../models.md). Presets come from
[presets.json](../../scripts/model--switch/presets.json).

## 1. Server (once)

Follow [setup.md](../setup.md) sections 1 and 2: check `/dev/dri`, the render group ID, Docker,
then create the `llama-cpp.service` unit. The image is `ghcr.io/ggml-org/llama.cpp:server-intel`.

## 2. This computer (once)

```bash
bun install
cp .env.example .env        # set AI_SERVER_HOST, AI_SSH_HOST, AI_API_KEY
```

Set up the SSH alias and the root helper as in [scripts/README.md](../../scripts/README.md#switch-setup-once).
The helper (`/usr/local/sbin/llama-model-switch`) must be re-copied whenever the repo changes it.

## 3. Options after install

- Keep `--parallel 1` and the `q8_0` KV cache (set by the unit; the switch keeps them).
- Context is chosen by the preset. If a model does not load, use a smaller `ctx` preset first.
- Docker images live on `/models` (bind mount `/var/lib/containerd` to `/models/containerd`),
  so the 98 GB root disk does not fill up.
- Pull a newer llama.cpp image only on purpose (`docker pull ghcr.io/ggml-org/llama.cpp:server-intel`),
  then restart the service. A running container keeps the old image.

Next: [TEST.md](./TEST.md), [USAGE.md](./USAGE.md).
