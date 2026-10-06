# Intel Arc Pro B60 Setup

This is the entry point for the 24 GB B60 guides. The current machine runs
Ubuntu 26.04 and serves **Qwen3.8-27B imatrix IQ3_M** through llama.cpp with Intel
SYCL on port `8001`. OpenVINO Model Server (OVMS) is an optional service on
port `8000`. Only one inference service should use the B60 at a time.

## Pick your setup

| OS and app | Backend | Guide |
|---|---|---|
| **Ubuntu 26.04, llama.cpp** (current) | Intel SYCL | [Intel SYCL server setup](./Intel-Arc-B60-Server-Setup-Intel_SYCL.md) |
| Ubuntu 26.04, llama.cpp alternative | Vulkan | [Vulkan server setup](./Intel-Arc-B60-Server-Setup-Vulkan.md) |
| Ubuntu, OpenVINO Model Server | OpenVINO GPU | [OpenVINO setup and model switching](./Intel-Arc-B60-OpenVINO.md) |
| Windows, LM Studio | Vulkan llama.cpp | [Windows LM Studio setup](./Intel-Arc-B60-Windows-LM-Studio.md) |

Choose a model in the [Models Guide](./Intel-Arc-B60-Models.md), configure VS
Code in the [Clients Guide](./Intel-Arc-B60-Clients.md), and compare measured
performance in [Speed Test Results](./Intel-Arc-B60-Speed-Test-Results.md).

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
for that release. The earlier Ubuntu 24.04 OVMS path used an HWE kernel and
Intel's graphics PPA; the [OpenVINO guide](./Intel-Arc-B60-OpenVINO.md#host-and-container)
links to the current Intel package instructions. Enable Resizable BAR and
Above 4G Decoding in BIOS for the B60.

Docker exposes the GPU to these containers through `/dev/dri` and the host's
`render` group. Read its numeric GID with `getent group render`; on the current
host it was `109`. The prebuilt llama.cpp images and OVMS GPU image contain
their respective serving runtimes. The optional host oneAPI toolkit is covered
only in the [SYCL guide](./Intel-Arc-B60-Server-Setup-Intel_SYCL.md#optional-host-oneapi-toolkit-for-local-builds).

## Files and ports

| Item | Location |
|---|---|
| GGUF files | `/models/gguf` on host, `/models` in llama.cpp container |
| OpenVINO exports/cache | `/models` on host and in OVMS container |
| llama.cpp API | `http://<server-ip>:8001/v1` |
| OVMS API | `http://<server-ip>:8000/v3` |
| Local connection template | [.env.example](./.env.example) |

The `.env.example` API defaults target OVMS; the llama.cpp service has separate
`LLAMA_API_*` values. Check `/v1/models` on llama.cpp or the model endpoint in
the selected guide after switching. Use the returned model ID in clients.

## Switch the active service

```bash
# Run the current Qwen3.8 IQ3_M model on the Intel SYCL service:
sudo systemctl stop openvino-model-server.service
sudo systemctl restart llama-cpp.service

# Or use OVMS after configuring it in the OpenVINO guide:
sudo systemctl stop llama-cpp.service
sudo systemctl start openvino-model-server.service
```

The Vulkan guide uses a standalone container for model trials and gives a
separate systemd unit if you select Vulkan permanently. Stop that container
before restarting the Intel SYCL unit. Backend-specific monitoring and
troubleshooting stay with the corresponding setup guide.
