# Intel Arc B60 Local LLM Cookbook

Run local models on a 24 GB Intel Arc B60. Llama.cpp, Strata, and OpenVINO use
port `8080` on the local network, with one service active at a time.

## Use a model

1. Follow the [server setup](./pages/setup.md) and the
   [one-time SSH setup](./scripts/README.md).
2. Copy `.env.example` to `.env` and set `AI_SSH_HOST` to your SSH alias.
3. From the repository root, run:

```bash
bun install
bun run switch:list                 # all llama presets: context, MTP, tested or not
bun run switch:qwen38-27b-iq3m:ctx64k
bun run switch:strata               # Strata coder IQ1_M
```

Each `switch:*` script is a preset from
[scripts/model--switch/presets.json](./scripts/model--switch/presets.json). The
command downloads a missing model, switches services, checks health and one
short reply, then updates the VS Code provider for that service.

For timing tests and saved results, run `bun run test`. Results go under
`test-results/`, with a summary in `test-results/test-results.md`. Run
`bun run list` to see the model served by the API.

Other scripts:
- `bun run quality` runs JS/TS and commit-message tasks with automatic checks.
- `bun run delete` lists or removes model files on the server (dry run by default).

## Guides

- [Models and fit](./pages/models.md)
- [Server setup and daily use](./pages/setup.md)
- [VS Code and other clients](./pages/clients.md)
- [Scripts](./scripts/README.md)
- [Recommendations](./pages/recommendations.md)
- [Results](./pages/results.md)

## Support

If this project is useful to you, you can support its development on [Ko-fi](https://ko-fi.com/tertiumnon).
