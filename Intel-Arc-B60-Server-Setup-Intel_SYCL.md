# Intel Arc B60 llama.cpp Server Setup: Intel SYCL

This guide documents an Ubuntu 26.04 llama.cpp service on the
Intel Arc Pro B60 (24 GB VRAM). It serves a GGUF model through Intel's SYCL
backend at `http://<server-ip>:8001/v1`. Models live on the host in
`/models/gguf` and are mounted read-only at `/models` in Docker. The
[speed measurements](./Intel-Arc-B60-Speed-Test-Results.md) stay in
the separate results file. For model downloads, switches, and restarts, use the
[Usage guide](./Intel-Arc-B60-Server-Usage.md).

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

## Systemd service

This is a new-host recipe. Replace `MODEL.gguf` and `CONTEXT_TOKENS` with the
selected file and a context that fits in VRAM. On an existing host, edit the
saved unit through the [Usage guide](./Intel-Arc-B60-Server-Usage.md).
The render GID here is `109`; check `getent group render` on your host.

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
  --health-cmd="curl -fsS http://localhost:8000/health" --health-start-period=90s \
  -p 8001:8000 -v /models/gguf:/models:ro \
  ghcr.io/ggml-org/llama.cpp:server-intel \
  -m /models/MODEL.gguf --host 0.0.0.0 --port 8000 \
  --n-gpu-layers 999 --ctx-size CONTEXT_TOKENS \
  --cache-type-k q8_0 --cache-type-v q8_0 \
  --parallel 1 --batch-size 512 --ubatch-size 128 \
  --jinja
ExecStop=/usr/bin/docker stop llama-cpp

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable llama-cpp.service
sudo systemctl restart llama-cpp.service
```

Pulling a newer image does not replace a running container; restart the service
after an image update. The [Usage guide](./Intel-Arc-B60-Server-Usage.md) covers
verification and logs.

## Memory and context tuning

When model loading or inference fails because of memory pressure, stop other
GPU workloads and keep `--parallel 1`. Lower `--ctx-size` if the model cannot
load. Reduce `--batch-size` if prompt-processing buffers are the
issue. Keep Q8 KV cache unless testing a smaller supported cache type. Reduce
`--n-gpu-layers` only when the model cannot otherwise load; CPU offload can
slow generation sharply.
Set client input and output limits below the loaded context, with room for chat
formatting. See the [Clients Guide](./Intel-Arc-B60-Clients.md#choosing-maxinputtokens--maxoutputtokens).

For an uncached long prompt, allow several minutes of client timeout.
Historical timings are in [Speed Test Results](./Intel-Arc-B60-Speed-Test-Results.md).

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
