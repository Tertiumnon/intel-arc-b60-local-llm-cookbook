# Intel Arc B60 Server Usage

The Ubuntu host runs one inference service at a time on port `8080`: Strata,
llama.cpp, or OpenVINO Model Server. The units and model
files are kept when switching. For Strata installation details, see
[Strata setup](./Intel-Arc-B60-Server-Setup-Strata.md).
For first-time backend setup, see [Server Setup](./Intel-Arc-B60-Server-Setup.md).

Use the [one-time SSH and helper setup](./scripts/model--switch/README.md)
first. Then run model changes from the repository root on your computer.

## Download and switch

For llama.cpp, set `HF_MODEL_REPO`, `HF_MODEL_FILE`, and `MODEL_CONTEXT_TOKENS` in local
`.env` (see [.env.example](./.env.example)). Set `MODEL_MTP=1` only if the
GGUF contains an MTP draft head. For images, also set `HF_MMPROJ_REPO` and
`HF_MMPROJ_FILE` to a matching projector.

```bash
bun scripts/model--switch/model--switch.ts
```

`bun run switch` is the shorter equivalent after the one-time `bun install`.
Use `bun run switch --service=strata --model=coder:IQ1_M` for Strata or
`bun run switch --service=openvino --model=OpenVINO/Qwen3-Coder-30B-A3B-Instruct-int4-ov`
for OVMS. The helper stops and disables the other services before starting the
selected model. See the [command options](./scripts/model--switch/README.md)
for model formats and downloads.

For llama.cpp, the command downloads through `hf`, names the server file
`<repo-owner>__<filename>`, switches the single SYCL service, waits for the
new model, checks health and one reply. It updates `.env` and the VS Code Custom
Endpoint entry, then prints that entry. Existing model files stay available.
The service helper restores the previous unit if the replacement cannot load.

## Model test results

The October 10, 2026 TTFT, token speed, and RAM comparison is in
[Speed Test Results](./Intel-Arc-B60-Speed-Test-Results.md#local-short-request-speed).
Run `bun run test` to measure the selected model. Generated files are in
`test-results/{model}/`; the timestamped summary table is
`test-results/test-results.md`.

## Check the service

```bash
ssh your-ssh-alias 'systemctl is-active llama-cpp.service strata.service openvino-model-server.service'
bun run list
```

If a model fails to load, inspect `ssh your-ssh-alias 'journalctl -u
llama-cpp.service -n 100 --no-pager'`. Large models can return HTTP 503 while
loading. The [Clients Guide](./Intel-Arc-B60-Clients.md) explains the VS Code
limits calculated from the configured context.

## Service state

When llama.cpp is selected, the expected state is `active / inactive` for
llama.cpp and OVMS, in that order. With Strata selected, `strata.service` is
active and `llama-cpp.service` is disabled. To switch back, run
`sudo systemctl disable --now strata.service` and
`sudo systemctl enable --now llama-cpp.service`.

The preserved [OpenVINO service](./Intel-Arc-B60-OpenVINO.md) is for historical
reference. The selected service uses port `8080`; OpenVINO uses `/v3`, while
Strata and llama.cpp use `/v1`.
