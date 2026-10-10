# Intel Arc B60 Local LLM Cookbook

Run one GGUF model on a 24 GB Intel Arc B60 with llama.cpp and Intel SYCL.
The active API uses port `8001`; the saved OpenVINO service on `8000` stays disabled.

## Use a model

1. Follow the [server setup](./Intel-Arc-B60-Server-Setup.md) and the
   [one-time SSH setup](./scripts/model--download-and-test/README.md).
2. Copy `.env.example` to `.env`. Set `HF_MODEL_REPO`, `HF_MODEL_FILE`, and
   `MODEL_CONTEXT_TOKENS` for the GGUF you want.
3. From the repository root, run:

```bash
bun install
bun run model
```

The command downloads through Hugging Face, switches the SYCL service, checks
the API, runs a speed test, and updates the local VS Code model entry. It prints
the result and saves it in the gitignored `Intel-Arc-B60-Models-Log.md`.

For a speed check without changing models, run `bun run bench`. Run
`bun run list` to see the model served by the API.

## Guides

- [Models and fit](./Intel-Arc-B60-Models.md)
- [Daily server usage](./Intel-Arc-B60-Server-Usage.md)
- [VS Code and other clients](./Intel-Arc-B60-Clients.md)
- [Speed test usage](./scripts/model--test-speed/README.md) and
  [historical results](./Intel-Arc-B60-Speed-Test-Results.md)
