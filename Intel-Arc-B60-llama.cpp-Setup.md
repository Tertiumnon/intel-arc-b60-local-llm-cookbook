# llama.cpp on Intel Arc Pro B60

The Ubuntu server runs a single GGUF model through llama.cpp at
`http://<server-ip>:8001/v1`. Model files live under `/models/gguf`; the
OpenVINO exports under `/models` use the separate OVMS service on port `8000`.

## Choose the backend

| Guide | Use |
|---|---|
| [Intel SYCL server setup](./Intel-Arc-B60-Server-Setup-Intel_SYCL.md) | GGUF service on the 24 GB B60. |

The [Models Guide](./Intel-Arc-B60-Models.md) compares model fit, context
profiles, and practical ratings. [Speed Test Results](./Intel-Arc-B60-Speed-Test-Results.md)
contain the local backend measurements and published benchmark scores.
Use the [Clients Guide](./Intel-Arc-B60-Clients.md) for the exact API model ID
and VS Code Custom Endpoint settings.

Use the [Usage guide](./Intel-Arc-B60-Server-Usage.md) to download a GGUF, update
the service, and verify the loaded model.
The [Vulkan guide](./Intel-Arc-B60-Server-Setup-Vulkan.md) records earlier
experiments; use the Intel SYCL service for current models.
