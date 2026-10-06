# Intel Arc B60 OpenVINO Model Server

This guide covers OpenVINO INT4 exports and OpenVINO Model Server (OVMS) on the
24 GB Intel Arc Pro B60. OVMS is an **optional** service on port `8000`; the
current Ubuntu 26.04 coding service is llama.cpp with Intel SYCL on port `8001`.
Stop the active GPU inference service before starting the other one. Shared
host checks and Docker setup are in the [Server Setup guide](./Intel-Arc-B60-Server-Setup.md).
Model comparisons and GGUF alternatives are in the [Models guide](./Intel-Arc-B60-Models.md).

## Host and container

The older OVMS setup used Ubuntu 24.04 with an HWE kernel and Intel's GPU
compute runtime. The current host is Ubuntu 26.04; its OVMS model profiles
below have not been revalidated after the OS upgrade. Use the
[Intel graphics PPA instructions](https://dgpu-docs.intel.com/installation-guides/installing-packages-from-the-intel-ppa.html)
appropriate to your Ubuntu release if `/dev/dri` or GPU discovery is missing.
The GPU container needs `/dev/dri` and the host `render` group GID.

```bash
ls -l /dev/dri
getent group render
sudo docker pull openvino/model_server:latest-gpu
```

The `-gpu` image contains OpenVINO; a host OpenVINO installation is only for
host-side Python inference or model conversion. The container uses Intel's
compute runtime through Level Zero/OpenCL. Its API is under `/v3` for clients.

## OVMS systemd service

The root `.env.example` targets port `8000` and `/v3`. Set `AI_API_KEY` in your
shell, or run the commands from a repository checkout on the server that has a
real `.env`. The render GID on
the current host is `109`; replace that number if `getent group render` differs.
This unit selects a single OpenVINO model and stores downloaded files under
`/models`.

```bash
if [[ -f .env ]]; then set -a; source .env; set +a; fi
: "${AI_API_KEY:?Set AI_API_KEY in .env before creating the service}"
sudo install -d -m 700 /etc/ovms
printf 'API_KEY=%s\n' "$AI_API_KEY" | sudo tee /etc/ovms/ovms.env >/dev/null
sudo chmod 600 /etc/ovms/ovms.env
sudo tee /etc/systemd/system/openvino-model-server.service >/dev/null <<'EOF'
[Unit]
Description=OpenVINO Model Server (Arc B60)
After=docker.service network-online.target
Requires=docker.service

[Service]
Restart=on-failure
RestartSec=5
EnvironmentFile=/etc/ovms/ovms.env
ExecStartPre=-/usr/bin/docker rm -f ovms
ExecStart=/usr/bin/docker run --rm --name ovms \
  --device /dev/dri --group-add=109 \
  -e API_KEY -p 8000:8000 -v /models:/models:rw \
  openvino/model_server:latest-gpu \
  --source_model OpenVINO/Qwen3.8-27B-int4-ov \
  --model_repository_path /models --task text_generation \
  --target_device GPU --rest_port 8000
ExecStop=/usr/bin/docker stop ovms

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl stop llama-cpp.service
sudo systemctl enable --now openvino-model-server.service
sudo systemctl status openvino-model-server.service --no-pager
```

This unit is a setup recipe, not a claim that OVMS is running now. For a
shared network, configure an API key as above. To inspect loading and GPU
selection, use `sudo docker logs --tail 100 ovms`. To switch back to the
current llama.cpp service, stop OVMS and start `llama-cpp.service`.

## B60 OpenVINO model profiles

| Model | Hugging Face OpenVINO export | Approx. model files | Initial context target | VS Code input | VS Code output | Evidence |
|---|---|---:|---:|---:|---:|---|
| Qwen3.8-27B | `OpenVINO/Qwen3.8-27B-int4-ov` | ~15–16 GB | 49,152 | **40,000** | **8,192** | B60 candidate; check the live OVMS model and long-prompt memory after switching servers. |
| Qwen3.6-35B-A3B | `OpenVINO/Qwen3.6-35B-A3B-int4-ov` | ~19.7 GB | 49,152 | **40,000** | **8,192** | OVMS candidate; the separate GGUF deployment has a recorded 42K-token prompt. |
| Qwen3-Coder-30B-A3B Instruct | `OpenVINO/Qwen3-Coder-30B-A3B-Instruct-int4-ov` | ~16.3 GB | 49,152 | **40,000** | **8,192** | Legacy OVMS candidate; verify the loaded export and cache use. |
| Gemma 4 26B-A4B Instruct | `OpenVINO/gemma-4-26b-a4b-it-int4-ov` | ~15.3 GB | 8,192 | **5,632** | **2,048** | Cautious initial target; unverified on this B60. |

These are **initial targets**, not measured OVMS context limits or model-native maximums.
Check that the export loads and a long prompt completes before advertising the profile
to VS Code. Keep a single active model and one sequence while checking memory.
The Qwen3.8 GGUF guide starts at 4,096 tokens only to confirm a first load; its
49,152-token VS Code target also needs a B60 test. The table does not establish
an OpenVINO context advantage over llama.cpp.
Image inputs also consume context. Reduce input limits if you send large or multiple
images. The client configuration and token accounting details are in
[Clients: choosing input/output limits](./Intel-Arc-B60-Clients.md#choosing-maxinputtokens--maxoutputtokens).

The Qwen3.8 and Gemma 4 26B OpenVINO exports require OpenVINO 2026.4 or newer. The OVMS
GPU Docker image includes its OpenVINO runtime; host OpenVINO installation is needed only
for host-side conversion, Python inference, or benchmarking.

## Download behavior

OVMS downloads a Hugging Face model automatically the first time the service starts with
its repository ID in `--source_model`. The model is cached under the configured
`--model_repository_path`, which the service above maps to `/models`. Confirm free
space first:

```bash
df -h /models
```

You can pre-download a repository with Hugging Face CLI if it is installed:

```bash
huggingface-cli download OpenVINO/Qwen3.8-27B-int4-ov \
  --local-dir /models/OpenVINO/Qwen3.8-27B-int4-ov
```

OVMS may still fetch files into its own cache when started by repo ID. For most installs,
letting OVMS download on first start is the simplest path.

## Start or switch the OVMS model

The service above creates `openvino-model-server.service` and exposes its API on
port `8000`. To switch models, edit the `--source_model` argument in that service file.
The command below is the model's exact repository ID. After editing, reload systemd and
start the service; OVMS downloads the selected export if it is not cached.

```bash
sudo systemctl stop openvino-model-server.service
sudoedit /etc/systemd/system/openvino-model-server.service
# Replace the current --source_model value with the model ID in the selected recipe.
sudo systemctl daemon-reload
sudo systemctl start openvino-model-server.service
sudo systemctl status openvino-model-server.service --no-pager
curl -s http://localhost:8000/v1/models
```

### Qwen3.8-27B INT4

Use `OpenVINO/Qwen3.8-27B-int4-ov` as `--source_model`. After the service loads,
start the VS Code profile at **40,000 input / 8,192 output** and verify a long prompt.
For long reasoning replies, **40,000 input / 16,384 output** needs at least 56,384
tokens of usable context; treat 57,344 as a server-capacity target to verify.
An **80,000 input / 16,384 output** profile is a later memory and latency experiment,
not a measured B60 limit. Its hybrid attention can reduce KV use relative to a
standard dense transformer. Prior local short-prompt and concurrency
measurements are in the [Speed Test Results](./Intel-Arc-B60-Speed-Test-Results.md#local-openvino-model-server-qwen38-27b-int4).
Use one sequence for the conservative single-user profile.


### Qwen3.6-35B-A3B INT4

Use `OpenVINO/Qwen3.6-35B-A3B-int4-ov`. Begin with **40,000 input / 8,192 output**
after checking that this export loads on the B60. The former 114,688 / 16,384
profile was a memory estimate and has no recorded long-prompt B60 result. The
previous GGUF build was tested at 49,152 total context; see its recipe in
the [Vulkan model recipes](./Intel-Arc-B60-Server-Setup-Vulkan.md#per-model-gguf-download-and-start-recipes).


### Qwen3-Coder-30B-A3B Instruct INT4

Use `OpenVINO/Qwen3-Coder-30B-A3B-Instruct-int4-ov`. This is a legacy coding option.
Start at **40,000 input / 8,192 output** after checking the export loads. The former
49,152 / 8,192 profile was a configuration estimate, not a measured B60 result.


### Gemma 4 26B-A4B Instruct INT4

Use `OpenVINO/gemma-4-26b-a4b-it-int4-ov`. Its B60 context has not been measured.
Start with an 8,192-token total context and **5,632 input / 2,048 output** in VS Code;
use a lower input cap when sending images. The 8K setting is a cautious initial
profile, not a published maximum.


## Model maintenance

- Check the [OpenVINO LLM collection](https://huggingface.co/collections/OpenVINO/llm) for new exports.
- Confirm the export is compatible with the runtime version in the server container.
- Check disk space and B60 memory before switching to a new model.
- Keep the previous model cached until the replacement passes real coding, chat, or image tasks.
- Re-run the repository's [speed-test tools](./scripts/speed-test/README.md) after changing the model or runtime, and record results in the [Speed Test Results](./Intel-Arc-B60-Speed-Test-Results.md).

To roll back, edit `--source_model` to the previous repository ID, then reload and restart
`openvino-model-server.service` using the commands above.

For OVMS logs and service recovery:

```bash
sudo docker logs --tail 100 ovms
sudo systemctl status openvino-model-server.service --no-pager
sudo journalctl -u openvino-model-server.service -n 100 --no-pager
curl -s http://localhost:8000/v1/models
```

For host and Docker checks, see [Server Setup](./Intel-Arc-B60-Server-Setup.md).
