# Strata on the Arc Pro B60

[Strata](https://github.com/Niko1221/Strata) runs Qwen3.8-Flash-Next with a local web app and OpenAI- and Anthropic-compatible APIs. Its [Intel Arc backend](https://github.com/Niko1221/Strata/blob/main/docs/INTEL_ARC.md) is experimental: on Linux, it builds a SYCL engine from source rather than using a release binary.

On this Ubuntu 26.04 server, the source is in `/models/Strata` and model data goes in `/models/Strata-data`. The Arc Pro B60 is detected as a 24 GB `xe` device. The engine was built in Docker for `bmg-g21`, and Strata's hardware check passed. The chosen model is Coder `IQ1_M`, which Strata says fits the host's 30 GB RAM; it downloads about 58 GB. Setup uses 128K context and no image input.

```bash
cd /models/Strata
./setup.sh --backend sycl --check
./setup.sh --backend sycl --yes --family coder --model IQ1_M \
  --data-dir /models/Strata-data --no-start
```

The second command resumes an interrupted download. To start the installed model, run `./run-coder-iq1_m.sh`. Check `http://127.0.0.1:8080/health` on the server. This installation binds to the local network on port `8080` without API authentication; Strata's default is local-only. The llama.cpp service uses port `8001`. Stop llama.cpp before loading Strata's model because this host runs one inference model at a time.

On October 11, 2026, setup completed and the model loaded. `/health` returned `loaded: true`, and a chat completion succeeded. The server was started in the background; it is not configured to start after a reboot. See Strata's [Intel Arc instructions](https://github.com/Niko1221/Strata/blob/main/docs/INTEL_ARC.md) for build details and known limits.

For VS Code, use the [Strata IDE config](./Intel-Arc-B60-Server-Setup-Strata-IDE_configs.md).
Local token speed and prompt timings are in [Speed Test Results](./Intel-Arc-B60-Speed-Test-Results.md#local-strata-qwen38-flash-next-coder-iq1_m).
