# Intel Arc B60 Server Usage

The Ubuntu host runs one inference service at a time. **llama.cpp** is enabled
on port `8001`; **OpenVINO Model Server** is installed but disabled on port
`8000`. Both systemd units and their model files are kept. For first-time
backend setup, see [Server Setup](./Intel-Arc-B60-Server-Setup.md).

Use the [one-time SSH and helper setup](./scripts/model--download-and-test/README.md)
first. Then run model changes from the repository root on your computer.

## Download, switch, and test

Set `HF_MODEL_REPO`, `HF_MODEL_FILE`, and `MODEL_CONTEXT_TOKENS` in local
`.env` (see [.env.example](./.env.example)). Set `MODEL_MTP=1` only if the
GGUF contains an MTP draft head. For images, also set `HF_MMPROJ_REPO` and
`HF_MMPROJ_FILE` to a matching projector.

```bash
bun scripts/model--download-and-test/model--download-and-test.ts
```

`bun run model` is the shorter equivalent after the one-time `bun install`.

The command downloads through `hf`, names the server file
`<repo-owner>__<filename>`, switches the single SYCL service, waits for the
new model, runs the speed test, and appends the output to the gitignored local
`Intel-Arc-B60-Models-Log.md`. It updates `.env` and the VS Code Custom
Endpoint entry, then prints that entry. Existing model files stay available.
The service helper restores the previous unit if the replacement cannot load.

## Downloaded model results

Measured October 10, 2026 with three runs after one warm-up, a 256-token output
limit, and the same JavaScript prompt. RAM is the remote `llama-server` process
RSS; GPU memory is not included.

| Model | Context | Average TTFT | Generation | Peak test RAM | Process RAM HWM |
|---|---:|---:|---:|---:|---:|
| Signal + Terse-Coder i1-Q4_K_M | 57,344 | 543 ms | **28.53 tok/s** | 2,921 MiB | 16,650 MiB |
| Unsloth Qwen3.6-27B IQ4_XS | 57,344 | **504 ms** | 19.32 tok/s | **2,451 MiB** | 15,748 MiB |
| Pearson Qwen3.8-27B IQ3_M + projector | 65,536 | 919 ms | 7.75 tok/s | 3,327 MiB | **13,186 MiB** |

Pearson and Unsloth used all 256 output tokens in every measured run. Signal
finished normally with 74–202 tokens, so generation speed is more comparable
than total request time. Signal remains selected after the tests. Full command
output is in the local `Intel-Arc-B60-Models-Log.md`.

## Check the service

```bash
ssh your-ssh-alias 'systemctl is-active llama-cpp.service openvino-model-server.service'
bun run list
```

If a model fails to load, inspect `ssh your-ssh-alias 'journalctl -u
llama-cpp.service -n 100 --no-pager'`. Large models can return HTTP 503 while
loading. The [Clients Guide](./Intel-Arc-B60-Clients.md) explains the VS Code
limits calculated from the configured context.

## Service state

The expected state is `active / inactive` for llama.cpp and OVMS, in that order.

The preserved [OpenVINO service](./Intel-Arc-B60-OpenVINO.md) is for historical
reference. Use the SYCL API on port `8001` for current model work.
