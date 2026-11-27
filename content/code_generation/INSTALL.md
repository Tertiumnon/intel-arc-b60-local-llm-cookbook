# Code generation: install

Coding assistant for VS Code, the Pi agent and other OpenAI-compatible clients. Default model:
**Strata Flash-Next Coder IQ1_M** at 131K context. Evidence and limitations:
[recommendations.md](../recommendations.md).

## 1. Base setup

Do [text_generation/INSTALL.md](../text_generation/INSTALL.md) first: server, `.env`, SSH alias and the
root helper. Strata needs `strata.service` as well:

```bash
scp scripts/strata.service ai-b60:/tmp/strata.service
ssh -t ai-b60 'sudo install -m 644 /tmp/strata.service /etc/systemd/system/strata.service && sudo systemctl daemon-reload'
```

## 2. Install the model

```bash
bun run switch --service=strata --model=coder:IQ1_M
bun run pi
```

The first Strata switch clones and builds [Strata](https://github.com/Niko1221/Strata) in `/models/Strata` and writes its config.

## 3. Options after install

Strata config is `/models/Strata/strata-coder-iq1_m.json` (backups `*.before-*`). The switch sets:

| Setting | Value |
|---|---|
| Sampling | temperature 1.0, top_p 0.95, top_k 20, repeat_penalty 1.05 |
| Reasoning | `reasoning_effort` low; budget 4,096 tokens; loop recovery on |
| VS Code limits | 110,000 input, 8,192 output |

A request's own values override these defaults. Avoid `high` on long prompts.

## 4. Connect a client

- **VS Code Chat:** the switch writes the `Arc B60 (strata)` provider; manual steps are in [clients.md](../clients.md).
- **Pi agent:** `bun run pi`, then `pi`. Repeat setup after switching the served model.
- **Pi on the AI server:** the `ai` user's Pi profile points to Strata Flash-Next Coder IQ1_M. Its model ID and context are a snapshot; update `~/.pi/agent/models.json` and `settings.json` after changing the served model. This interactive profile is separate from the unprivileged Kyra worker account.
- **Other:** `AI_API_URL` and `AI_API_KEY` from `.env`.

Next: [TEST.md](./TEST.md), [USAGE.md](./USAGE.md).

## Experimental arc-llm-lab setup

The current server has the experimental engine and service installed. To rebuild it on another server, copy `scripts/arc-llm-lab.Dockerfile` to the server and run the following there as the `ai` user. This uses the pinned [arc-llm-lab](https://github.com/edagher92-coder/arc-llm-lab) patches and llama.cpp b11524; the container includes the Vulkan build and runtime dependencies.

```bash
mkdir -p /models/arc-llm-lab-experiment/build
cd /models/arc-llm-lab-experiment
git clone https://github.com/edagher92-coder/arc-llm-lab.git source
git -C source checkout --detach 6d26bb1980854b7dfde77817653f0e10b123818a
git clone --filter=blob:none https://github.com/ggml-org/llama.cpp.git build/llama.cpp
git -C build/llama.cpp checkout --detach b11524
(cd source/engine/patches && sha256sum -c SHA256SUMS)
(cd build/llama.cpp && git -c user.name=arc-llm-lab -c user.email=arc-llm-lab@localhost am --3way ../../source/engine/patches/0*.patch)
docker build -f /path/to/arc-llm-lab.Dockerfile -t arc-llm-lab-experiment:local .
docker run --rm -v /models/arc-llm-lab-experiment/build/llama.cpp:/work -w /work arc-llm-lab-experiment:local bash -c 'git config --global --add safe.directory /work && cmake -S . -B build-experiment -G Ninja -DGGML_VULKAN=ON -DLLAMA_CURL=OFF -DLLAMA_BUILD_TESTS=OFF -DLLAMA_BUILD_NUMBER=11524 -DCMAKE_BUILD_TYPE=Release && cmake --build build-experiment -j 4 --target llama-server llama-bench'
```

Place the [target GGUF](https://huggingface.co/unsloth/Qwen3.8-27B-GGUF/tree/main) and [DFlash2 GGUF](https://huggingface.co/incoai/Qwen3.8-27B-DFlash2-GGUF/tree/main) in `/models/gguf` as `unsloth__Qwen3.8-27B-UD-Q4_K_M.gguf` and `incoai__Qwen3.8-27B-DFlash2-Q4_K_M.gguf`. Install `scripts/arc-llm-lab.service` in `/etc/systemd/system/` and update `/usr/local/sbin/llama-model-switch` from this repository, then run `sudo systemctl daemon-reload`. The regular switcher starts the new service and stops it when switching to another service.
