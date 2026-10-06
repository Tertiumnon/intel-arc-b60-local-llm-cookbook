# llama.cpp on Intel Arc Pro B60

The Ubuntu server runs a single GGUF model through llama.cpp at
`http://<server-ip>:8001/v1`. Model files live under `/models/gguf`; the
OpenVINO exports under `/models` use the separate OVMS service on port `8000`.

## Choose the backend

| Guide | Use |
|---|---|
| [Intel SYCL server setup](./Intel-Arc-B60-Server-Setup-Intel_SYCL.md) | **Current service:** Unsloth Qwen3.8-27B UD-Q4_K_M on the 24 GB B60, systemd unit, monitoring, and model switching. |
| [Vulkan server setup](./Intel-Arc-B60-Server-Setup-Vulkan.md) | Alternative backend, GPU checks, per-model GGUF download and start recipes, service setup, and troubleshooting. |

The [Models Guide](./Intel-Arc-B60-Models.md) compares model fit, context
profiles, and practical ratings. [Speed Test Results](./Intel-Arc-B60-Speed-Test-Results.md)
contain the local backend measurements and published benchmark scores.
Use the [Clients Guide](./Intel-Arc-B60-Clients.md) for the exact API model ID
and VS Code Custom Endpoint settings.

When switching models or backends, run only one inference server on the B60
at a time. Read `/v1/models` after each restart to confirm the loaded model
and configured context.
