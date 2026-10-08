# Intel Arc B60 OpenVINO Archive

The host keeps `openvino-model-server.service` and its model cache, but the unit
is disabled on port `8000`. Use the [Intel SYCL llama.cpp API](./Intel-Arc-B60-Server-Setup-Intel_SYCL.md)
on port `8001` for current GGUF models and coding clients. The saved OVMS setup
covers a narrower set of prepared models; the [OVMS GGUF support guide](https://docs.openvino.ai/2025/model-server/ovms_demos_gguf.html)
lists its supported GGUF paths.

The saved unit uses `openvino/model_server:2026.4.0-gpu`, mounts `/models`, and
selects `OpenVINO/Qwen3-Coder-30B-A3B-Instruct-int4-ov`. Its unit and files are
preserved. Inspect the actual host configuration with:

```bash
systemctl cat openvino-model-server.service
systemctl is-enabled openvino-model-server.service
systemctl is-active openvino-model-server.service
```

The expected status is `disabled` and `inactive`. Historical OpenVINO model
profiles and measurements are in [Speed Test Results](./Intel-Arc-B60-Speed-Test-Results.md#local-openvino-model-server-qwen38-27b-int4).
For routine downloads and model switches, use the
[SYCL Usage guide](./Intel-Arc-B60-Server-Usage.md).
