# Strata on the Arc Pro B60

[Strata](https://github.com/Niko1221/Strata) runs Qwen3.8-Flash-Next with a local web app and OpenAI- and Anthropic-compatible APIs. Its [Intel Arc backend](https://github.com/Niko1221/Strata/blob/main/docs/INTEL_ARC.md) is experimental: on Linux, it builds a SYCL engine from source rather than using a release binary.

On this Ubuntu 26.04 server, the source is in `/models/Strata` and model data goes in `/models/Strata-data`. The Arc Pro B60 is detected as a 24 GB `xe` device. The engine was built in Docker for `bmg-g21`, and Strata's hardware check passed. The chosen model is Coder `IQ1_M`, which Strata says fits the host's 30 GB RAM; it downloads about 58 GB. Setup uses 128K context and no image input.

```bash
cd /models/Strata
./setup.sh --backend sycl --check
./setup.sh --backend sycl --yes --family coder --model IQ1_M \
  --data-dir /models/Strata-data --no-start
```

The second command resumes an interrupted download. The installed runner is `./run-coder-iq1_m.sh`. The [systemd unit](./scripts/strata.service) runs it after reboot. To select Strata on this host, copy the unit to `/tmp/strata.service`, then run:

```bash
sudo install -m 644 /tmp/strata.service /etc/systemd/system/strata.service
sudo systemctl disable --now llama-cpp.service
sudo systemctl daemon-reload
sudo systemctl enable --now strata.service
curl -fsS http://127.0.0.1:8080/health
```

Strata binds to the local network on port `8080` without API authentication; use it only on a trusted network. Llama.cpp and OpenVINO use the same host port when selected, so only one inference service runs at a time.

The installed `strata-coder-iq1_m.json` uses sampling defaults of `temperature=1.0`, `top_p=0.95`, `top_k=20`, `repeat_penalty=1.05`, and `repeat_last_n=256`, plus `reasoning_budget_tokens=4096` and `reasoning_loop_recovery="recover"`. These address repeated thinking and leave room for an answer. Explicit client sampling values override the defaults. See Strata's [sampling and loop recovery documentation](https://github.com/Niko1221/Strata/blob/main/docs/DETAILS.md); recovery is a safeguard, not a guarantee. The previous config is saved as `strata-coder-iq1_m.json.before-strata-service` on the host.

On October 12, 2026, `strata.service` was enabled and `llama-cpp.service` disabled. `/health` returned `loaded: true`; a medium-thinking chat completion answered `19 × 23` with `437` and stopped normally. See Strata's [Intel Arc instructions](https://github.com/Niko1221/Strata/blob/main/docs/INTEL_ARC.md) for build details and known limits.

For VS Code, use the [Strata IDE config](./Intel-Arc-B60-Server-Setup-Strata-IDE_configs.md).
Local token speed and prompt timings are in [Speed Test Results](./Intel-Arc-B60-Speed-Test-Results.md#local-strata-qwen38-flash-next-coder-iq1_m).
