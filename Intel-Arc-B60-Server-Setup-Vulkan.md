# Intel Arc B60 llama.cpp Server Setup: Vulkan

This guide records earlier Vulkan Docker trials for `llama-server` on Ubuntu 26.04.
Use the [Intel SYCL service](./Intel-Arc-B60-Server-Setup-Intel_SYCL.md) for
current models and VS Code settings; context values below are historical trials
or unverified starting points.

- Ubuntu 26.04.1, kernel 7.0.0-38
- Intel Arc Pro B60 with 24 GB VRAM
- llama.cpp API on `http://<server-ip>:8001/v1`
- OpenVINO Model Server (OVMS) remains installed but disabled on port `8000`
- Models are stored under `/models`; GGUF files are under `/models/gguf`

The setup uses the official llama.cpp Vulkan container. llama.cpp needs GGUF weights;
it cannot load the OpenVINO IR files already used by OVMS. Keep the two servers and
their ports separate.
The [Intel SYCL guide](./Intel-Arc-B60-Server-Setup-Intel_SYCL.md) documents the
current coding service. Vulkan performance observations remain in the
[Speed Test Results](./Intel-Arc-B60-Speed-Test-Results.md).

## Select a model

Model comparisons and ratings are in the [Intel Arc B60 Models Guide](./Intel-Arc-B60-Models.md).
Per-model GGUF download and start recipes are in this guide's
[model-by-model section](#per-model-gguf-download-and-start-recipes). OpenVINO model
exports and OVMS selection are documented in the [OpenVINO guide](./Intel-Arc-B60-OpenVINO.md).
Model files need room for the KV cache and runtime buffers in addition to weights; begin
with the listed contexts and monitor memory before increasing them.

## Check the host and container

Run on the Ubuntu server:

```bash
vulkaninfo --summary
getent group render
ls -l /dev/dri
sudo docker run --rm --device /dev/dri --group-add "$(getent group render | cut -d: -f3)" \
  ghcr.io/ggml-org/llama.cpp:server-vulkan --list-devices
```

The server's render group ID is currently `109`. Use the value from `getent group
render` in the service if it changes. The Docker image and prerequisites can be set up
with:

```bash
sudo apt update
sudo apt install -y mesa-vulkan-drivers libvulkan1 vulkan-tools intel-gpu-tools
sudo docker pull ghcr.io/ggml-org/llama.cpp:server-vulkan
sudo mkdir -p /models/gguf
```

## Download models

Choose from the rated candidates in the [Models Guide](./Intel-Arc-B60-Models.md), then
use that model's recipe in the [per-model section](#per-model-gguf-download-and-start-recipes).
Download into
`/models/gguf`, check free space first with `df -h /models`, and use `curl -C -` to
resume interrupted downloads. The server mounts this directory read-only at `/models`.

## Per-model GGUF download and start recipes

Run these on the Ubuntu server after completing the one-time Docker setup above.
Each recipe downloads a model into `/models/gguf` and calls the helper below
to start it on port `8001`. Paste the helper once in each new Bash SSH shell
before trying a recipe. It stops the active llama.cpp service, replaces the
standalone container, and reports the loaded API model. A standalone trial
does not replace the boot-time systemd service; use the [service unit](#create-or-update-the-llamacpp-service)
when you choose to keep a Vulkan model. `curl -C -` resumes downloads.

```bash
mkdir -p /models/gguf
cd /models/gguf
df -h /models
```

```bash
start_vulkan() {
  local model_file="$1" context="$2" batch="${3:-512}" ubatch="${4:-128}"
  local projector="${5:-}"
  local projector_args=()
  if [[ -n "$projector" ]]; then
    projector_args=(--mmproj "/models/$projector")
  fi
  sudo systemctl stop llama-cpp.service
  sudo docker rm -f llama-cpp 2>/dev/null || true
  sudo docker run -d --rm --name llama-cpp \
    --device /dev/dri --group-add="$(getent group render | cut -d: -f3)" \
    -p 8001:8000 -v /models/gguf:/models:ro \
    ghcr.io/ggml-org/llama.cpp:server-vulkan \
    -m "/models/$model_file" --host 0.0.0.0 --port 8000 \
    --n-gpu-layers 999 --ctx-size "$context" \
    --cache-type-k q8_0 --cache-type-v q8_0 \
    --parallel 1 --batch-size "$batch" --ubatch-size "$ubatch" \
    "${projector_args[@]}"
  curl -s http://localhost:8001/v1/models
}
```

The image-capable recipes pass a projector file as the fifth argument. Omit it
for a first text-only load if memory is tight. The helper's initial `curl` can
return a startup response while a large model loads; retry `/v1/models` and
inspect `sudo docker logs --tail 80 llama-cpp` if needed.

#### Swift 1.5 Qwen3.8-27B (Vulkan comparison)

The current service uses [Intel SYCL](./Intel-Arc-B60-Server-Setup-Intel_SYCL.md)
with Signal + Terse-Coder. To reproduce the Vulkan backend used in the
[backend comparison](./Intel-Arc-B60-Speed-Test-Results.md#local-llamacpp-swift-15-qwen38-27b),
download the Q4_K_M GGUF and run it with the same context and cache settings:

```bash
cd /models/gguf
curl -fL --retry 5 -C - -o Swift-1.5-Qwen3.8-27B-Q4_K_M.gguf \
  'https://huggingface.co/ukisai/Swift-1.5-Qwen3.8-27B-GGUF/resolve/main/Swift-1.5-Qwen3.8-27B-Q4_K_M.gguf'

start_vulkan Swift-1.5-Qwen3.8-27B-Q4_K_M.gguf 49152
```

#### Qwen3.8-27B

This is the recent coding and image-capable model. The Q8_0 projector is needed for image
input; the Q4_K_M weights alone are for text-only requests. The 4,096-token launch below
is a **first-load check**, not a measured B60 maximum. The earlier 49,152-token
target was not verified for this GGUF. This GGUF is larger than the OpenVINO INT4 export
(~19 GB versus ~16 GB of published files), but that alone does not establish the
largest usable context in either runtime.

```bash
cd /models/gguf
curl -fL --retry 5 -C - -o Qwen3.8-27B-Q4_K_M.gguf \
  'https://huggingface.co/ggml-org/Qwen3.8-27B-GGUF/resolve/main/Qwen3.8-27B-Q4_K_M.gguf'
curl -fL --retry 5 -C - -o mmproj-Qwen3.8-27B-Q8_0.gguf \
  'https://huggingface.co/ggml-org/Qwen3.8-27B-GGUF/resolve/main/mmproj-Qwen3.8-27B-Q8_0.gguf'

```

To run the downloaded GGUF with llama.cpp Vulkan:

```bash
start_vulkan Qwen3.8-27B-Q4_K_M.gguf 4096 512 128 mmproj-Qwen3.8-27B-Q8_0.gguf
```

This was a first-load check, not a current VS Code profile. Verify a long prompt
and VRAM use before raising context on a new model.


#### Qwen3.8-27B (Unsloth Dynamic GGUF)

The [Unsloth repository](https://huggingface.co/unsloth/Qwen3.8-27B-GGUF)
quantizes the original Qwen3.8-27B weights; it is **not a separately fine-tuned
model**. Its `UD-Q4_K_M` file is about **16.5 GB**, compared with about 19 GB for
the ggml-org Q4_K_M file above. The smaller file may leave more B60 memory for
context, but no 49,152-token B60 result has been recorded for this quantization.
The optional F16 projector is about 928 MB and is needed for image input.

```bash
cd /models/gguf
curl -fL --retry 5 -C - -o Qwen3.8-27B-UD-Q4_K_M.gguf \
  'https://huggingface.co/unsloth/Qwen3.8-27B-GGUF/resolve/main/Qwen3.8-27B-UD-Q4_K_M.gguf'
# Optional for image requests; give the generic upstream filename a unique local name.
curl -fL --retry 5 -C - -o mmproj-Qwen3.8-27B-Unsloth-F16.gguf \
  'https://huggingface.co/unsloth/Qwen3.8-27B-GGUF/resolve/main/mmproj-F16.gguf'

start_vulkan Qwen3.8-27B-UD-Q4_K_M.gguf 4096
```

The 4K context is a first-load check, not a current VS Code profile. For image requests,
pass `mmproj-Qwen3.8-27B-Unsloth-F16.gguf` as the fifth helper argument and
account for image tokens within the input budget. If comparing quality with the ggml-org quant above, keep
the same prompt, context, sampling settings, and runtime build.

#### Cloudflare/clef-flash (decision model)

[Clef-Flash](https://huggingface.co/Cloudflare/clef-flash) returns probabilities for
typed questions through `/v1/systemone`; it does not generate chat replies or code.
The [ggml-org Q8_0 GGUF](https://huggingface.co/ggml-org/Clef-Flash-GGUF/tree/main)
is about 9.66 GB and fits one B60 by weight size. Its optional Q8_0 vision projector
is about 624 MB. llama.cpp's [Clef support](https://github.com/ggml-org/llama.cpp/pull/29831)
and [vision support](https://github.com/ggml-org/llama.cpp/pull/29969) were merged
in October 2026, so pull a current server image before loading it.

```bash
cd /models/gguf
curl -fL --retry 5 -C - -o Clef-Flash-Q8_0.gguf \
  'https://huggingface.co/ggml-org/Clef-Flash-GGUF/resolve/main/Clef-Flash-Q8_0.gguf'
# Optional, for image decisions after text-only requests work:
curl -fL --retry 5 -C - -o mmproj-Clef-Flash-Q8_0.gguf \
  'https://huggingface.co/ggml-org/Clef-Flash-GGUF/resolve/main/mmproj-Clef-Flash-Q8_0.gguf'

sudo docker pull ghcr.io/ggml-org/llama.cpp:server-vulkan
start_vulkan Clef-Flash-Q8_0.gguf 4096 4096 4096
```

llama.cpp requires the **whole encoded decision request** to fit within
`--ubatch-size`; begin below 4K input tokens to leave room for question and option
formatting. Its output is probabilities, so there is no output-token allowance.
The published 262,144-position model limit and 16,384-token default encoder limit
are not measured B60 settings. Increase both context and batch sizes only after
monitoring VRAM and completing longer decision requests. To enable image input,
pass `mmproj-Clef-Flash-Q8_0.gguf` as the fifth `start_vulkan` argument.

Example text-only request:

```bash
curl -sS http://localhost:8001/v1/systemone \
  -H 'Content-Type: application/json' \
  -d '{"state":"Customer says their invoice was charged twice.","questions":{"route":{"type":"choice","instructions":"Which team should handle this?","criteria":{"billing":"Payment or invoice issue","technical":"Application issue"}},"urgent":{"type":"noul","instructions":"Does this require immediate action?"}}}'
```

Use the returned `answers` object. This endpoint cannot be configured as a VS Code
chat or coding model. See the [decision API reference](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md#post-v1systemone-typesafe-compatible-system-one-api).

#### JEV-27B (AutoTrust, text-only GGUF)

This [third-party Q4_K_M GGUF](https://huggingface.co/prithivMLmods/JEV-27B-GGUF/tree/main)
is about 16.5 GB and provides JEV-27B's frozen Qwen3.8-27B **System 2 text** path.
AutoTrust's specialized **System 1** typed decisions require the separate LoRA adapter,
decision head, and custom serving code from the
[original model](https://huggingface.co/autotrust/JEV-27B); this single-file llama.cpp
recipe does not expose `/v1/decide`. The original BF16 text weights are 53.8 GB,
so they do not fit in one 24 GB B60. No B60 performance or long-context result is
recorded for this GGUF yet.

```bash
cd /models/gguf
curl -fL --retry 5 -C - -o JEV-27B.Q4_K_M.gguf \
  'https://huggingface.co/prithivMLmods/JEV-27B-GGUF/resolve/main/JEV-27B.Q4_K_M.gguf'

start_vulkan JEV-27B.Q4_K_M.gguf 4096
```

The 4K setting is an initial load check, not a current VS Code profile. Its
published 262,144-token context is a model maximum, not a measured B60 setting.

#### Qwen3.6-35B-A3B

The B60 previously ran the Q4_K_M GGUF at 49,152 context. Download it and its
projector only when using images:

```bash
cd /models/gguf
curl -fL --retry 5 -C - -o Qwen3.6-35B-A3B-Q4_K_M.gguf \
  'https://huggingface.co/ggml-org/Qwen3.6-35B-A3B-GGUF/resolve/main/Qwen3.6-35B-A3B-Q4_K_M.gguf'
curl -fL --retry 5 -C - -o mmproj-Qwen3.6-35B-A3B-Q8_0.gguf \
  'https://huggingface.co/ggml-org/Qwen3.6-35B-A3B-GGUF/resolve/main/mmproj-Qwen3.6-35B-A3B-Q8_0.gguf'

# Start the GGUF at the locally verified context.
start_vulkan Qwen3.6-35B-A3B-Q4_K_M.gguf 49152
```


#### KAT-Coder-V2.5-Dev

Use the Q3_K_L quantization (~18.1 GB) to leave more room for runtime memory on the B60.
The Q4 quantizations leave too little headroom for a useful context on this card.

```bash
cd /models/gguf
curl -fL --retry 5 -C - -o KAT-Coder-V2.5-Dev.Q3_K_L.gguf \
  'https://huggingface.co/mradermacher/KAT-Coder-V2.5-Dev-GGUF/resolve/main/KAT-Coder-V2.5-Dev.Q3_K_L.gguf'

start_vulkan KAT-Coder-V2.5-Dev.Q3_K_L.gguf 4096
```


#### DeepSeek-Coder-V2-Lite-Instruct

The 16B/2.4B-active model has a compact GGUF. Start with Q4_K_M (~10.4 GB);
Q5_K_M (~11.9 GB) is an optional quality comparison. The 16K starting context is
conservative. A 48K total context for VS Code needs a successful B60 memory and
long-prompt run before increasing the client limits.

```bash
cd /models/gguf
curl -fL --retry 5 -C - -o DeepSeek-Coder-V2-Lite-Instruct-Q4_K_M.gguf \
  'https://huggingface.co/cminja/deepseek-coder-v2-lite-instruct-GGUF/resolve/main/DeepSeek-Coder-V2-Lite-Instruct-Q4_K_M.gguf'

start_vulkan DeepSeek-Coder-V2-Lite-Instruct-Q4_K_M.gguf 16384
```


#### Kimi-VL-A3B-Thinking-2506

Use the [ggml-org GGUF](https://huggingface.co/ggml-org/Kimi-VL-A3B-Thinking-2506-GGUF/tree/main)
Q4_K_M text weights (~10.5 GB) and Q8_0 vision projector (~0.62 GB). The publisher's
text configuration allows up to 131K positions, but this starting recipe uses 16K
until Vulkan image input and output formatting are checked on the B60. For text-only
requests, omit the helper's fifth projector argument to save projector memory.

```bash
cd /models/gguf
curl -fL --retry 5 -C - -o Kimi-VL-A3B-Thinking-2506-Q4_K_M.gguf \
  'https://huggingface.co/ggml-org/Kimi-VL-A3B-Thinking-2506-GGUF/resolve/main/Kimi-VL-A3B-Thinking-2506-Q4_K_M.gguf'
curl -fL --retry 5 -C - -o mmproj-Kimi-VL-A3B-Thinking-2506-Q8_0.gguf \
  'https://huggingface.co/ggml-org/Kimi-VL-A3B-Thinking-2506-GGUF/resolve/main/mmproj-Kimi-VL-A3B-Thinking-2506-Q8_0.gguf'

start_vulkan Kimi-VL-A3B-Thinking-2506-Q4_K_M.gguf 16384 512 128 mmproj-Kimi-VL-A3B-Thinking-2506-Q8_0.gguf
```


#### Kimi-Linear-48B-A3B-Instruct

Use the importance-matrix `IQ3_XS` GGUF (~20.2 GB). Q4 and MXFP4 files exceed the
B60's 24 GB before cache and buffers. This is an experimental Intel Vulkan recipe:
start at 4K context to confirm it loads, then check GPU memory and long-prompt behavior
before trying a long VS Code input allowance.

```bash
cd /models/gguf
curl -fL --retry 5 -C - -o Kimi-Linear-48B-A3B-Instruct.i1-IQ3_XS.gguf \
  'https://huggingface.co/mradermacher/Kimi-Linear-48B-A3B-Instruct-i1-GGUF/resolve/main/Kimi-Linear-48B-A3B-Instruct.i1-IQ3_XS.gguf'

start_vulkan Kimi-Linear-48B-A3B-Instruct.i1-IQ3_XS.gguf 4096
```


#### Qwen3-VL 30B-A3B Instruct

Download the Q8_0 vision projector only if you plan to send images; pass its
filename as the helper's fifth argument.

```bash
cd /models/gguf
curl -fL --retry 5 -C - -o Qwen3VL-30B-A3B-Instruct-Q4_K_M.gguf \
  'https://huggingface.co/Qwen/Qwen3-VL-30B-A3B-Instruct-GGUF/resolve/main/Qwen3VL-30B-A3B-Instruct-Q4_K_M.gguf'
curl -fL --retry 5 -C - -o mmproj-Qwen3VL-30B-A3B-Instruct-Q8_0.gguf \
  'https://huggingface.co/Qwen/Qwen3-VL-30B-A3B-Instruct-GGUF/resolve/main/mmproj-Qwen3VL-30B-A3B-Instruct-Q8_0.gguf'

start_vulkan Qwen3VL-30B-A3B-Instruct-Q4_K_M.gguf 4096 512 128 mmproj-Qwen3VL-30B-A3B-Instruct-Q8_0.gguf
```

#### Qwen3.5 9B

The projector is optional for text-only inference.

```bash
cd /models/gguf
curl -fL --retry 5 -C - -o Qwen3.5-9B-Q4_K_M.gguf \
  'https://huggingface.co/lmstudio-community/Qwen3.5-9B-GGUF/resolve/main/Qwen3.5-9B-Q4_K_M.gguf'
curl -fL --retry 5 -C - -o mmproj-Qwen3.5-9B-BF16.gguf \
  'https://huggingface.co/lmstudio-community/Qwen3.5-9B-GGUF/resolve/main/mmproj-Qwen3.5-9B-BF16.gguf'

start_vulkan Qwen3.5-9B-Q4_K_M.gguf 16384 512 128 mmproj-Qwen3.5-9B-BF16.gguf
```

#### Gemma 4 26B-A4B Instruct

Use the `it` (instruction-tuned) repository. The current official GGUF offers Q4_0
(14.6 GB); its BF16 vision projector is optional for text-only inference.

```bash
cd /models/gguf
curl -fL --retry 5 -C - -o gemma-4-26B-A4B-it-Q4_0.gguf \
  'https://huggingface.co/ggml-org/gemma-4-26B-A4B-it-GGUF/resolve/main/gemma-4-26B-A4B-it-Q4_0.gguf'
curl -fL --retry 5 -C - -o mmproj-gemma-4-26B-A4B-it-BF16.gguf \
  'https://huggingface.co/ggml-org/gemma-4-26B-A4B-it-GGUF/resolve/main/mmproj-gemma-4-26B-A4B-it-BF16.gguf'

```

To run the GGUF build:

```bash
start_vulkan gemma-4-26B-A4B-it-Q4_0.gguf 8192 512 128 mmproj-gemma-4-26B-A4B-it-BF16.gguf
```

#### GLM-4.7-Flash

The official `ggml-org` Q4_K GGUF is 18.2 GB. Start with 4K context and one parallel
slot; raise the context only after monitoring memory.

```bash
cd /models/gguf
curl -fL --retry 5 -C - -o GLM-4.7-Flash-Q4_K.gguf \
  'https://huggingface.co/ggml-org/GLM-4.7-Flash-GGUF/resolve/main/GLM-4.7-Flash-Q4_K.gguf'

start_vulkan GLM-4.7-Flash-Q4_K.gguf 4096
```

#### NVIDIA Nemotron 3.5 Lightning 30B-A3B

This recent coding-capable model's official GGUF Q4_0 file is about 18.9 GB. Its model
license is OpenMDW-1.1; review the terms before using it.

```bash
cd /models/gguf
curl -fL --retry 5 -C - -o NVIDIA-Nemotron-3.5-Lightning-30B-A3B-Q4_0.gguf \
  'https://huggingface.co/ggml-org/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-GGUF/resolve/main/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-Q4_0.gguf'

start_vulkan NVIDIA-Nemotron-3.5-Lightning-30B-A3B-Q4_0.gguf 4096
```

## Create or update the llama.cpp service

The service runs one model at a time. Edit its `ExecStart` model path and context when
switching models, then restart it. The examples below assume the selected model is
already in `/models/gguf`.

```bash
sudo tee /etc/systemd/system/llama-cpp.service >/dev/null <<'EOF'
[Unit]
Description=llama.cpp Vulkan server (Arc B60)
After=docker.service network-online.target
Requires=docker.service

[Service]
Restart=on-failure
RestartSec=5
TimeoutStartSec=0
ExecStartPre=-/usr/bin/docker rm -f llama-cpp
ExecStart=/usr/bin/docker run --rm --name llama-cpp \
  --device /dev/dri --group-add=109 \
  -p 8001:8000 -v /models/gguf:/models:ro \
  ghcr.io/ggml-org/llama.cpp:server-vulkan \
  -m /models/SELECTED_MODEL.gguf --host 0.0.0.0 --port 8000 \
  --n-gpu-layers 999 --ctx-size 8192 \
  --cache-type-k q8_0 --cache-type-v q8_0 \
  --parallel 1 --batch-size 512 --ubatch-size 128
ExecStop=/usr/bin/docker stop llama-cpp

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable llama-cpp.service
sudo systemctl restart llama-cpp.service
```

For a machine where the render GID is not `109`, replace `--group-add=109` with the
numeric value from `getent group render`. Ensure `/models/gguf` is readable by Docker.
Add `sudo ufw allow 8001/tcp` only when LAN clients need access and UFW is enabled.
For a shared or untrusted network, add an API key to the server arguments and configure
clients to send it as a bearer token.

### Select the model in the service

Change `-m` to the downloaded GGUF path, set `--ctx-size` to the starting value in the
[Models Guide context table](./Intel-Arc-B60-Models.md#recommended-b60-input-and-output-limits),
and add `--mmproj /models/<projector-file>.gguf` only when enabling that model's vision
projector. The model recipes above contain matching filenames. Restart
the service after editing the unit.

For example, after editing the unit:

```bash
sudo systemctl daemon-reload
sudo systemctl restart llama-cpp.service
sudo systemctl status llama-cpp.service --no-pager
curl -s http://localhost:8001/v1/models
```

Confirm that your llama.cpp image supports the model architecture and options if a
model is newly released. Pull a newer image when needed, then restart:

```bash
sudo docker pull ghcr.io/ggml-org/llama.cpp:server-vulkan
sudo systemctl restart llama-cpp.service
```

## API smoke test

The model `id` returned by `/v1/models` is what OpenAI-compatible clients should send
as the request's `model` value. Use that returned ID, rather than assuming it equals
the local GGUF filename.

```bash
curl -s http://localhost:8001/v1/models
curl http://localhost:8001/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"MODEL_ID_FROM_V1_MODELS","messages":[{"role":"user","content":"Reply with: llama.cpp is ready"}],"max_tokens":64}'
```

For vision, the server must be started with `--mmproj` and the request must use the
OpenAI image content format supported by that model. Start with a small image and
short context because image tokens also consume context and memory.

## Monitor the server and B60

Install Intel's GPU tools if needed, then run these in separate SSH sessions while
generating a response:

```bash
# GPU engines and busy percentages (may need sudo on a headless server)
sudo intel_gpu_top

# Container CPU and memory usage
sudo docker stats llama-cpp

# llama.cpp startup, backend selection, allocation and request logs
sudo docker logs -f llama-cpp

# Vulkan device name; run when the model is idle
sudo docker run --rm --device /dev/dri --group-add "$(getent group render | cut -d: -f3)" \
  ghcr.io/ggml-org/llama.cpp:server-vulkan --list-devices

# Service state and recent systemd logs
sudo systemctl status llama-cpp.service --no-pager
sudo journalctl -u llama-cpp.service -f
```

The llama.cpp server also exposes slot state and the OpenAI model list locally:

```bash
curl -s http://localhost:8001/slots
curl -s http://localhost:8001/v1/models
free -h
df -h /models
```

In `/slots`, check whether a slot is processing and the prompt token count. Use
`docker logs` to confirm Vulkan was selected and to inspect allocation failures and
the model's effective context. `docker stats` reports host/container memory, not a
reliable per-process B60 VRAM measurement. `intel_gpu_top` shows GPU engine activity;
which memory counters are available depends on the kernel and driver. If installed,
`nvtop` may also display Intel GPU activity, but use the kernel tool and server logs
as the primary checks on this headless setup. On this host, `intel_gpu_top`
was not installed at the time of the backend comparison.

For a basic request measurement, use the repository speed-test script and point it at
llama.cpp's API. Use a controlled prompt size and one request first; run long-context
tests separately for each model.

```bash
cd scripts/speed-test
AI_API_URL='http://<server-ip>:8001/v1' bun run bench
```

## Memory and context tuning

Use the following order when memory allocation fails or the server exits:

1. Stop other GPU workloads and use `--parallel 1`.
2. Reduce `--ctx-size` (for example, from 16384 to 8192).
3. Keep Q8 KV cache, or try a smaller cache type supported by the model/build if more
   context is required and quality trade-offs are acceptable.
4. Reduce `--batch-size` (for example, 512 to 256) to lower prompt-processing memory.
5. If weights still do not fit, lower `--n-gpu-layers` gradually to offload some layers
   to system RAM. This can reduce speed substantially.

Raise context in steps and test a prompt close to the intended size. `--ctx-size` is a
maximum allocation, and long prompt processing may need additional temporary buffers.
Avoid copying the old 111K context / parallel 8 example: it was not validated for the
models listed in the Models guide on this 24 GB Linux setup.

## Troubleshooting

- **No Vulkan device listed:** check `vulkaninfo --summary`, `/dev/dri`, render group
  membership, and the container's `--device /dev/dri --group-add` options.
- **Out of memory or failed allocation:** inspect `sudo docker logs llama-cpp`; stop
  other GPU jobs, lower context and batch size, or reduce GPU layers.
- **API does not respond during startup:** follow `sudo journalctl -u llama-cpp.service
  -f`; large model files can take time to load. Check port 8001 and `docker ps`.
- **404 or model not found:** confirm `/v1/models` and use the returned model ID in API
  requests. The server is configured for a single GGUF at a time.
- **Vision request fails:** confirm the service command includes the matching `--mmproj`
  file and that the request uses an image-capable chat format.
- **Model architecture unsupported:** pull the latest official Vulkan image and check
  its startup logs; newly released model families may need a newer llama.cpp build.
- **GPU disappears under load:** record the kernel log with `sudo journalctl -k -f`,
  stop/restart the service, and check the Intel driver/kernel before raising load again.

## References

- [llama.cpp server documentation](https://github.com/ggml-org/llama.cpp/tree/master/examples/server)
- [llama.cpp Docker images](https://github.com/ggml-org/llama.cpp/pkgs/container/llama.cpp)
- [Intel Arc B60 Models Guide](./Intel-Arc-B60-Models.md)
- [Intel Arc B60 Server Setup Guide](./Intel-Arc-B60-Server-Setup.md)
- [Speed test instructions](./scripts/speed-test/README.md)
- [Speed Test Results](./Intel-Arc-B60-Speed-Test-Results.md)
