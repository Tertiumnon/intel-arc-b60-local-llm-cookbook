# Intel Arc Pro B60 Setup

This is the entry point for the 24 GB B60 guides. The Ubuntu 26.04 host serves
one GGUF model through llama.cpp with Intel SYCL on port `8001`.
OpenVINO Model Server (OVMS) is installed on port `8000` but disabled. Its
service and configuration remain available. Use the SYCL API for current GGUF
models; this repository has more successful B60 coding runs on SYCL than on the
saved OVMS setup. For daily model changes, use the
[short Usage guide](./Intel-Arc-B60-Server-Usage.md).

## Current setup

Ubuntu 26.04 runs llama.cpp with Intel SYCL. See the
[Intel SYCL server setup](./Intel-Arc-B60-Server-Setup-Intel_SYCL.md) for the
service unit and the [Usage guide](./Intel-Arc-B60-Server-Usage.md) for model changes.

Choose a model in the [Models Guide](./Intel-Arc-B60-Models.md), configure VS
Code in the [Clients Guide](./Intel-Arc-B60-Clients.md), and compare measured
performance in [Speed Test Results](./Intel-Arc-B60-Speed-Test-Results.md).
Earlier [Vulkan](./Intel-Arc-B60-Server-Setup-Vulkan.md),
[OpenVINO](./Intel-Arc-B60-OpenVINO.md), and
[Windows LM Studio](./Intel-Arc-B60-Windows-LM-Studio.md) guides remain for
reference.

## Shared Ubuntu host checks

Run these before following a backend guide:

```bash
cat /etc/os-release | head
uname -r
lspci | grep -i -E 'vga|display|intel'
ls -l /dev/dri
getent group render
sudo docker version
df -h /models
```

The B60 needs a working Intel GPU driver and a recent kernel. The current
Ubuntu 26.04 host was checked with kernel 7.0.0-38. For a new host or a
different Ubuntu release, follow [Intel's GPU installation path](https://dgpu-docs.intel.com/installation-guides/index.html)
and [Docker's Ubuntu installation guide](https://docs.docker.com/engine/install/ubuntu/)
for that release. Enable Resizable BAR and
Above 4G Decoding in BIOS for the B60.

Docker exposes the GPU to these containers through `/dev/dri` and the host's
`render` group. Read its numeric GID with `getent group render`; on the current
host it was `109`. The prebuilt llama.cpp and OVMS images contain their serving
runtimes.

## Files and ports

| Item | Location |
|---|---|
| GGUF files | `/models/gguf` on host, `/models` in llama.cpp container |
| OpenVINO exports/cache | `/models` on host and in OVMS container |
| llama.cpp API | `http://<server-ip>:8001/v1` |
| OVMS API | `http://<server-ip>:8000/v3` |
| Local connection template | [.env.example](./.env.example) |

The `.env.example` API defaults target the active llama.cpp service. Use the
model ID returned by `/v1/models` in clients. The
[Usage guide](./Intel-Arc-B60-Server-Usage.md) has service switching and restart
commands; backend details stay in their setup guides.
