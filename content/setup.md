# Server setup and daily use

The Ubuntu 26.04 host runs one model service at a time on port `8080`:

| Service | API path | Status |
|---|---|---|
| llama.cpp (Intel SYCL) | `/v1` | Main service |
| Strata | `/v1` | Experimental |
| OpenVINO (OVMS) | `/v3` | Archived, disabled |
| ComfyUI (Intel XPU) | ComfyUI API | Image generation, see [image_generation](./image_generation/INSTALL.md) |

Models are in [models.md](./models.md). Measurements are in [results.md](./results.md).
VS Code and other clients are in [clients.md](./clients.md).

## 1. Host checks

```bash
cat /etc/os-release | head -2
ls -l /dev/dri
getent group render        # GID used in the unit below (109 on this host)
sudo docker version
df -h /models
```

The B60 needs a recent kernel and the Intel GPU driver. Enable Resizable BAR
and Above 4G Decoding in the BIOS. Intel's install path is at
[dgpu-docs.intel.com](https://dgpu-docs.intel.com/installation-guides/index.html).

Check GPU visibility inside Docker:

```bash
sudo docker run --rm --device /dev/dri \
  --group-add "$(getent group render | cut -d: -f3)" \
  ghcr.io/ggml-org/llama.cpp:server-intel --list-devices
```

This host shows `Intel(R) Arc(TM) Pro B60 Graphics`, 24,480 MiB.

## 2. llama.cpp service (SYCL)

Create `/etc/systemd/system/llama-cpp.service` (new host only; on this host
the switch command rewrites it):

```ini
[Unit]
Description=llama.cpp SYCL server (Arc B60)
After=docker.service network-online.target
Requires=docker.service

[Service]
Restart=on-failure
RestartSec=10
TimeoutStartSec=0
ExecStartPre=-/usr/bin/docker rm -f llama-cpp
ExecStart=/usr/bin/docker run --rm --name llama-cpp \
  --device /dev/dri --group-add=109 \
  --health-cmd="curl -fsS http://localhost:8000/health" --health-start-period=90s \
  -p 8080:8000 -v /models/gguf:/models:ro \
  ghcr.io/ggml-org/llama.cpp:server-intel \
  -m /models/MODEL.gguf --host 0.0.0.0 --port 8000 \
  --n-gpu-layers 999 --ctx-size CONTEXT_TOKENS \
  --cache-type-k q8_0 --cache-type-v q8_0 \
  --parallel 1 --batch-size 512 --ubatch-size 128 --jinja
ExecStop=/usr/bin/docker stop llama-cpp

[Install]
WantedBy=multi-user.target
```

Then `sudo systemctl daemon-reload && sudo systemctl enable --now llama-cpp.service`.
After pulling a new image, restart the service; a running container keeps the old image.

GGUF files live in `/models/gguf` on the host and are mounted read-only at `/models`.

## 3. Switch models

Run from the repository root on your computer. One-time SSH and helper setup is
in [scripts/README.md](../scripts/README.md#switch-setup-once).

```bash
bun run switch:list               # all llama presets, tested or not
bun run switch --preset=terse              # run a preset
bun run switch --service=strata --model=coder:IQ1_M             # switch to Strata
```

The switch stops the other services, starts the chosen one, waits for the model,
checks health and one reply, and updates `.env` and the VS Code provider.
If the new model fails to load, the previous unit is restored.

Presets are in [scripts/model--switch/presets.json](../scripts/model--switch/presets.json).

## 4. Check the service

```bash
bun run list                                     # model IDs on the API
ssh your-ssh-alias 'systemctl is-active llama-cpp.service strata.service'
ssh your-ssh-alias 'sudo docker logs llama-cpp --tail 50'
```

Large models can return HTTP 503 while loading. Wait for `/health` to return 200.

## 5. Context and memory

- Keep `--parallel 1`. Stop other GPU workloads when a load fails.
- Lower `--ctx-size` first if a model does not load. Reduce `--batch-size` if
  prompt buffers are the problem.
- Keep the q8_0 KV cache unless a smaller cache is tested.
- Lower `--n-gpu-layers` only as a last resort: CPU offload slows generation sharply.
- Client input and output limits must sit below the loaded context. See
  [clients.md](./clients.md#input-and-output-limits).

## 6. Strata (experimental)

[Strata](https://github.com/Niko1221/Strata) runs Qwen3.8-Flash-Next Coder
IQ1_M with an OpenAI-compatible API. Source is in `/models/Strata`, model data in
`/models/Strata-data`. It uses 128K context and no images.

- Config: `/models/Strata/strata-coder-iq1_m.json`. Backups are named `*.before-*`.
- Defaults: sampling `temperature` 1.0, `top_p` 0.95, `top_k` 20, `repeat_penalty` 1.05;
  `reasoning_effort` **low**; thinking budget 4,096 tokens; loop recovery on.
- A request's own values override the defaults.
- `bun run switch --service=strata --model=coder:IQ1_M` enables `strata.service` and disables llama.cpp.

Strata's [Intel Arc notes](https://github.com/Niko1221/Strata/blob/main/docs/INTEL_ARC.md)
cover build details.

### November 28 Strata update on the single B60

The server checkout is now Strata 0.2.23 (`4560d0379`); its SYCL engine
0.1.70 was built with AOT target `bmg-g21`. This server has **one 24 GB B60
and 32 GB system RAM**, not the 32 GB B70 used in many upstream measurements.
Configs and runners from before the update are backed up under
`/models/Strata-backup-20261128T082035Z`.

Upstream moved Python, configs, and runners into `/models/Strata/terminal`,
and SYCL code into `/models/Strata/engine/sycl`. Root config/runner symlinks
preserve the existing service helper. The Docker wrapper at
`/models/Strata-data/runtime/strata-sycl.sh` mounts `/models` at `/work` and
runs the new binary from `/work/Strata/engine/build-sycl-aot/strata`.
Existing expert-profile arguments now point into `terminal/data`.

Inkling SQ-20 is the upstream 24 GB choice (19.4 GB of weights, Apache-2.0).
Its dedicated, signature-checked SYCL engine 0.1.70 is installed separately
from the Qwen engine. Initial installation uses the Intel-aware installer:

```bash
cd /models/Strata
STRATA_CONTROL_INSTALL=1 ./setup.sh --setup --backend sycl --yes \
  --family inkling-2-mini --model SQ-20 --context 57344 --vision no \
  --data-dir /models/Strata-data --host 0.0.0.0 --no-start
```

After installation, link `terminal/strata-inkling-2-mini-sq-20.json` and
`terminal/run-inkling-2-mini-sq-20.sh` into `/models/Strata` for the helper.
Choose it through `bun run switch:coding`, or
`bun run switch --service=strata --model=inkling-2-mini:SQ-20`.
Other context sizes remain untested until recorded in [results](./results.md).

## 7. OpenVINO (archived)

`openvino-model-server.service` and its model files are kept but disabled.
Its unit uses `openvino/model_server:2026.4.0-gpu` and `/v3`. Expected state:

```bash
systemctl is-enabled openvino-model-server.service   # disabled
systemctl is-active openvino-model-server.service    # inactive
```

Switch to it only for comparison: `bun run switch --service=openvino --model=OpenVINO/Qwen3-Coder-30B-A3B-Instruct-int4-ov`.

## Troubleshooting

- **No SYCL device:** check `/dev/dri`, the render GID, and `--device`/`--group-add` in the unit.
- **Service does not start:** `sudo journalctl -u llama-cpp.service -n 100 --no-pager`.
- **Port 8080 busy:** stop the other container or service first.
- **Model missing in client:** use the exact ID from `/v1/models`.
