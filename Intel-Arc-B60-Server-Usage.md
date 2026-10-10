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
