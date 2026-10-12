# Intel Arc B60 Local LLM Cookbook

Run local models on a 24 GB Intel Arc B60. Llama.cpp, Strata, and OpenVINO use
port `8080` on the local network, with one service active at a time.

## Use a model

1. Follow the [server setup](./pages/Intel-Arc-B60-Server-Setup.md) and the
   [one-time SSH setup](./scripts/model--switch/README.md).
2. Copy `.env.example` to `.env`. Set `HF_MODEL_REPO`, `HF_MODEL_FILE`, and
   `MODEL_CONTEXT_TOKENS` for the GGUF you want.
3. From the repository root, run:

```bash
bun install
bun run switch
```

The command downloads a missing model, switches services, checks health and one
short reply, then updates the local VS Code model entry. Use `--service=strata`
or `--service=openvino` for those backends.

For timing tests and saved results, run `bun run test`. Results go under
`test-results/`, with a summary in `test-results/test-results.md`. Run
`bun run list` to see the model served by the API.

## Guides

- [Models and fit](./pages/Intel-Arc-B60-Models.md)
- [Daily server usage](./pages/Intel-Arc-B60-Server-Usage.md)
- [Experimental Strata setup](./pages/Intel-Arc-B60-Server-Setup-Strata.md)
- [VS Code and other clients](./pages/Intel-Arc-B60-Clients.md)
- [Model test usage](./scripts/model--test/README.md) and
  [historical results](./pages/Intel-Arc-B60-Speed-Test-Results.md)
