# llama.cpp on Ubuntu 26.04 with Intel Arc Pro B60

This guide covers a Docker/Vulkan `llama-server` setup on Ubuntu 26.04:

- Ubuntu 26.04.1, kernel 7.0.0-38
- Intel Arc Pro B60 with 24 GB VRAM
- llama.cpp API on `http://<server-ip>:8001/v1`
- Existing OpenVINO Model Server (OVMS) remains on port `8000`
- Models are stored under `/models`; GGUF files are under `/models/gguf`

The setup uses the official llama.cpp Vulkan container. llama.cpp needs GGUF weights;
it cannot load the OpenVINO IR files already used by OVMS. Keep the two servers and
their ports separate.

## What fits in 24 GB

24 GB is the GPU's memory capacity, not a safe model-file-size target. Runtime also
needs memory for the KV cache (conversation context), compute buffers, and any vision
projector. Longer context and parallel requests use more memory. Start with one request
at a time (`--parallel 1`) and raise context only after checking memory and testing the
actual model.

| Model | GGUF to start with | Approx. weight size | Vision file | Suggested first context |
|---|---|---:|---|---:|
| Qwen3-VL 30B-A3B Instruct | Q4_K_M | 18.6 GB | mmproj Q8_0 ~712 MB, or F16 ~1.08 GB | 8K; try 16K after measuring |
| Qwen3.5 9B | Q4_K_M | 5.63 GB | mmproj BF16 ~922 MB, optional for text-only use | 16K; then test longer contexts |
| Gemma 4 26B-A4B Instruct | Q4_K_M | 16.8 GB | mmproj Q8_0 ~806 MB or BF16 ~1.19 GB | 8K; try 16K after measuring |

These are approximate file sizes, not promised VRAM usage. Qwen3-VL and Gemma 4 leave
less room for KV cache at Q4 than Qwen3.5 9B. Vision requests can need additional
memory. Start at the suggested context, watch for allocation failures, then increase
gradually. Quantization variants such as Q5/Q6/Q8 use more memory; Q8 weights for the
26B model do not fit in 24 GB by themselves.

The existing Qwen3.6-35B-A3B Q4_K_M service has been tested at context size 49,152
with Q8 KV cache, including a 42,041-token prompt. This result applies to that model
and configuration; it does not mean all three models above can run at that context.

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

## Download the three models

Check free disk space before downloading. The three Q4 weight files total about 41 GB;
the vision projectors add another 2–3 GB. Download one model at a time and remove files
you do not need. `curl -C -` resumes an interrupted transfer.

```bash
df -h /models
cd /models/gguf
```

### Qwen3-VL 30B-A3B Instruct

The official Qwen GGUF repository provides the Q4_K_M weights and vision projector.
Download the projector if you will send images; use its exact path with `--mmproj`.

```bash
curl -fL --retry 5 -C - -o Qwen3VL-30B-A3B-Instruct-Q4_K_M.gguf \
  'https://huggingface.co/Qwen/Qwen3-VL-30B-A3B-Instruct-GGUF/resolve/main/Qwen3VL-30B-A3B-Instruct-Q4_K_M.gguf'
curl -fL --retry 5 -C - -o mmproj-Qwen3VL-30B-A3B-Instruct-Q8_0.gguf \
  'https://huggingface.co/Qwen/Qwen3-VL-30B-A3B-Instruct-GGUF/resolve/main/mmproj-Qwen3VL-30B-A3B-Instruct-Q8_0.gguf'
```

### Qwen3.5 9B

This GGUF repository has a Q4_K_M file and a separate BF16 vision projector. The
projector is only needed for image input.

```bash
curl -fL --retry 5 -C - -o Qwen3.5-9B-Q4_K_M.gguf \
  'https://huggingface.co/lmstudio-community/Qwen3.5-9B-GGUF/resolve/main/Qwen3.5-9B-Q4_K_M.gguf'
curl -fL --retry 5 -C - -o mmproj-Qwen3.5-9B-BF16.gguf \
  'https://huggingface.co/lmstudio-community/Qwen3.5-9B-GGUF/resolve/main/mmproj-Qwen3.5-9B-BF16.gguf'
```

### Gemma 4 26B-A4B Instruct

Use the `it` (instruction-tuned) repository for the Q4_K_M file. Download the
projector only if you need image input.

```bash
curl -fL --retry 5 -C - -o gemma-4-26B-A4B-it-Q4_K_M.gguf \
  'https://huggingface.co/ggml-org/gemma-4-26B-A4B-it-GGUF/resolve/main/gemma-4-26B-A4B-it-Q4_K_M.gguf'
curl -fL --retry 5 -C - -o mmproj-gemma-4-26B-A4B-it-Q8_0.gguf \
  'https://huggingface.co/ggml-org/gemma-4-26B-A4B-it-GGUF/resolve/main/mmproj-gemma-4-26B-A4B-it-mmproj-Q8_0.gguf'
```

Inspect the downloaded filenames before starting the service:

```bash
ls -lh /models/gguf
```

If a Hugging Face repository updates its filenames, check the repository's Files and
versions page and adjust the URL and local filename together.

## Create or update the llama.cpp service

The service runs one model at a time. Edit its `ExecStart` model path and context when
switching models, then restart it. The examples below assume the selected model is
already in `/models/gguf`.

```bash
sudo tee /etc/systemd/system/llama-cpp.service >/dev/null <<'EOF'
[Unit]
Description=llama.cpp Vulkan server
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
  -m /models/Qwen3.5-9B-Q4_K_M.gguf --host 0.0.0.0 --port 8000 \
  --n-gpu-layers 999 --ctx-size 16384 \
  --cache-type-k q8_0 --cache-type-v q8_0 \
  --parallel 1 --batch-size 512 --ubatch-size 128
ExecStop=/usr/bin/docker stop llama-cpp

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now llama-cpp.service
```

For a machine where the render GID is not `109`, replace `--group-add=109` with the
numeric value from `getent group render`. Ensure `/models/gguf` is readable by Docker.
Add `sudo ufw allow 8001/tcp` only when LAN clients need access and UFW is enabled.
For a shared or untrusted network, add an API key to the server arguments and configure
clients to send it as a bearer token.

### Per-model launch settings

Change the `-m` path and `--ctx-size` in `ExecStart` to select a model. Add the indicated
`--mmproj` argument only when using that model's vision projector. Restart the service
after the edit:

| Model | `-m` file | Initial `--ctx-size` | Optional vision argument |
|---|---|---:|---|
| Qwen3-VL 30B-A3B | `/models/Qwen3VL-30B-A3B-Instruct-Q4_K_M.gguf` | `8192` | `--mmproj /models/mmproj-Qwen3VL-30B-A3B-Instruct-Q8_0.gguf` |
| Qwen3.5 9B | `/models/Qwen3.5-9B-Q4_K_M.gguf` | `16384` | `--mmproj /models/mmproj-Qwen3.5-9B-BF16.gguf` |
| Gemma 4 26B-A4B Instruct | `/models/gemma-4-26B-A4B-it-Q4_K_M.gguf` | `8192` | `--mmproj /models/mmproj-gemma-4-26B-A4B-it-Q8_0.gguf` |

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
as the primary checks on this headless setup.

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
Avoid copying the old 111K context / parallel 8 example: it was not validated for these
three models on the current 24 GB Linux setup.

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
- [Qwen3-VL 30B-A3B Instruct GGUF](https://huggingface.co/Qwen/Qwen3-VL-30B-A3B-Instruct-GGUF)
- [Qwen3.5 9B GGUF](https://huggingface.co/lmstudio-community/Qwen3.5-9B-GGUF)
- [Gemma 4 26B-A4B Instruct GGUF](https://huggingface.co/ggml-org/gemma-4-26B-A4B-it-GGUF)
- [Intel Arc B60 Models Guide](./Intel-Arc-B60-Models.md)
- [Intel Arc B60 Server Setup Guide](./Intel-Arc-B60-Server-Setup.md)
- [Speed test instructions](./scripts/speed-test/README.md)
