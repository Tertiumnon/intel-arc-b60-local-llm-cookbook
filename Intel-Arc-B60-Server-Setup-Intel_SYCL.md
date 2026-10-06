# Intel Arc B60 llama.cpp Server Setup: Intel SYCL

This guide documents the **current** Ubuntu 26.04 llama.cpp service on the
Intel Arc Pro B60 (24 GB VRAM). It serves a GGUF model through Intel's SYCL
backend at `http://<server-ip>:8001/v1`. Models live on the host in
`/models/gguf` and are mounted read-only at `/models` in Docker. The
[Vulkan guide](./Intel-Arc-B60-Server-Setup-Vulkan.md) covers the alternative
backend; [speed measurements](./Intel-Arc-B60-Speed-Test-Results.md) stay in
the separate results file.

The current host was Ubuntu 26.04.1 with kernel 7.0.0-38. The llama.cpp image
is the official `ghcr.io/ggml-org/llama.cpp:server-intel`, which the
[upstream Docker guide](https://github.com/ggml-org/llama.cpp/blob/master/docs/docker.md#docker-with-sycl)
describes as its SYCL server build. Docker passes the Intel GPU through
`/dev/dri` and the host's `render` group.

## Prepare and verify the GPU

Run on the Ubuntu server. Docker and a working Intel GPU compute runtime
must already be installed; the [general server guide](./Intel-Arc-B60-Server-Setup.md)
covers host GPU access and Docker.

```bash
ls -l /dev/dri
getent group render
sudo mkdir -p /models/gguf
sudo docker pull ghcr.io/ggml-org/llama.cpp:server-intel
sudo docker run --rm --device /dev/dri \
  --group-add "$(getent group render | cut -d: -f3)" \
  ghcr.io/ggml-org/llama.cpp:server-intel --list-devices
```

On this host, the container listed `Intel(R) Arc(TM) Pro B60 Graphics` with
24,480 MiB total memory. The render group GID was `109`; recheck it after an
OS reinstall rather than assuming that number elsewhere.

### Optional host oneAPI toolkit for local builds

The prebuilt Docker image contains its own SYCL userspace, so the host does
not need the full oneAPI Base Toolkit just to run this service. Install the
toolkit if you build or run SYCL programs directly on the host. The prior
Ubuntu 24.04 host setup used Intel's oneAPI repository:

```bash
wget https://apt.repos.intel.com/intel-gpg-keys/GPG-PUB-KEY-INTEL-SW-PRODUCTS.PUB
sudo gpg --dearmor -o /usr/share/keyrings/oneapi-archive-keyring.gpg \
  GPG-PUB-KEY-INTEL-SW-PRODUCTS.PUB
echo 'deb [signed-by=/usr/share/keyrings/oneapi-archive-keyring.gpg] https://apt.repos.intel.com/oneapi all main' \
  | sudo tee /etc/apt/sources.list.d/oneapi.list
sudo apt update
sudo apt install intel-oneapi-basekit
source /opt/intel/oneapi/setvars.sh
sycl-ls
```

For Ubuntu 26.04, check Intel's supported distro/package instructions before
installing host oneAPI packages. OpenVINO Model Server uses the Intel compute
runtime through Level Zero/OpenCL and does not need `setvars.sh`.

## Current model: Qwen3.8-27B imatrix IQ3_M

The active model is
[`pearsonkyle/Qwen3.8-27B-imatrix-MTP-GGUF`](https://huggingface.co/pearsonkyle/Qwen3.8-27B-imatrix-MTP-GGUF),
served from `/models/Qwen3.8-27B-IQ3_M.gguf`. The GGUF includes its MTP draft
head; the separate `/models/mmproj-Qwen3.8-27B-Q8_0.gguf` projector enables
image and video input. The model was calibrated at 32,768 tokens and the B60
service uses that context. The publisher's IQ3_M entry is 12.14 GiB; the
reported quantization and coding evaluations are publisher measurements, not
a matched B60 comparison.

The live API model ID is exactly `/models/Qwen3.8-27B-IQ3_M.gguf`. The API
reported the model at a 32,768 context with text, image, and video input
capabilities. A short request confirmed generation and MTP draft acceptance;
long-context capacity and image request quality have not been measured on this
B60. See the [Models Guide](./Intel-Arc-B60-Models.md) and
[Clients Guide](./Intel-Arc-B60-Clients.md) for the active profile.

## Systemd service

The following unit reproduces the live Docker arguments. Stop any other
server using the B60 before starting it. The current host's render GID is
`109`; substitute your own value from `getent group render` when needed.

```bash
sudo tee /etc/systemd/system/llama-cpp.service >/dev/null <<'EOF'
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
  -p 8001:8000 -v /models/gguf:/models:ro \
  ghcr.io/ggml-org/llama.cpp:server-intel \
  -m /models/Qwen3.8-27B-IQ3_M.gguf --host 0.0.0.0 --port 8000 \
  --n-gpu-layers 999 --ctx-size 32768 \
  --cache-type-k q8_0 --cache-type-v q8_0 \
  --parallel 1 --batch-size 512 --ubatch-size 128 \
  --temp 1.0 --top-p 0.95 --top-k 20 --min-p 0.0 \
  --spec-type draft-mtp --spec-draft-n-max 1 --jinja \
  --mmproj /models/mmproj-Qwen3.8-27B-Q8_0.gguf
ExecStop=/usr/bin/docker stop llama-cpp

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable llama-cpp.service
sudo systemctl restart llama-cpp.service
```

Pulling a newer image does not replace a running container; restart the service
after an image update.

## Select another GGUF

The service loads one model at a time. Download the desired GGUF into
`/models/gguf`, stop any other GPU inference workload, and edit the unit's
`-m /models/<file>.gguf` argument. Set `--ctx-size` to that model's starting
value in the [Models Guide context table](./Intel-Arc-B60-Models.md#recommended-b60-input-and-output-limits).
For an image-capable model, add its matching `--mmproj` path and include image
tokens in the input budget. The [Vulkan guide's model recipes](./Intel-Arc-B60-Server-Setup-Vulkan.md#per-model-gguf-download-and-start-recipes)
list download URLs and projector filenames; use the SYCL image in this unit
when evaluating those files on SYCL. Other GGUFs are not automatically
verified on this B60 merely because this IQ3_M quant loaded successfully.

```bash
sudo systemctl daemon-reload
sudo systemctl restart llama-cpp.service
sudo systemctl status llama-cpp.service --no-pager
curl -s http://localhost:8001/v1/models
```

## Verify and monitor

```bash
curl -s http://localhost:8001/v1/models
curl -s http://localhost:8001/slots
curl http://localhost:8001/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"/models/Qwen3.8-27B-IQ3_M.gguf","messages":[{"role":"user","content":"Reply with READY"}],"max_tokens":512}'

sudo docker logs -f llama-cpp
sudo docker stats llama-cpp
sudo systemctl status llama-cpp.service --no-pager
sudo journalctl -u llama-cpp.service -f
```

The API's `/v1/models` endpoint reports the loaded ID and context. `/slots`
shows slot activity and prompt progress. `docker stats` reports host/container
memory, not reliable per-process B60 VRAM. For an idle-device snapshot, rerun
`server-intel --list-devices` from the first section. `intel_gpu_top` can show
GPU engine activity when installed. On this host, `xpu-smi stats -d 0` returned
`device not found` even while SYCL detected the B60; `intel_gpu_top` was not
installed at the time of the switch.

## Memory and context tuning

When model loading or inference fails because of memory pressure, stop other
GPU workloads and keep `--parallel 1`. Lower `--ctx-size`, then reduce
`--batch-size` if prompt-processing buffers are the issue. Keep Q8 KV cache
unless testing a smaller supported cache type. Reduce `--n-gpu-layers` only
when the model cannot otherwise load; CPU offload can slow generation sharply.
Test a prompt close to the intended VS Code input size after each change.

For an uncached 40K-token prompt, allow several minutes of client timeout.
Actual timings and prompt-cache conditions are in the
[Speed Test Results](./Intel-Arc-B60-Speed-Test-Results.md#local-llamacpp-unsloth-qwen38-27b-ud-q4_k_m).

## Troubleshooting

- **No SYCL device:** inspect `/dev/dri`, the render-group GID, host Intel
  compute runtime, and the container's `--device`/`--group-add` options.
- **Service does not load:** inspect `sudo docker logs llama-cpp` and
  `sudo journalctl -u llama-cpp.service -n 100 --no-pager`; confirm the GGUF
  exists and the image supports its architecture.
- **Port 8001 is in use:** stop the previous standalone container or service
  before restarting the systemd unit.
- **Model not found in client:** send the exact `id` from `/v1/models` and use
  `http://<server-ip>:8001/v1` as the OpenAI-compatible base URL.

For upstream image names and SYCL device mapping, see the
[official llama.cpp Docker documentation](https://github.com/ggml-org/llama.cpp/blob/master/docs/docker.md).
