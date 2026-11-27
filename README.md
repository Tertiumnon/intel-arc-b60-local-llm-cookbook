# Intel Arc B60 Local LLM Cookbook

Running local LLMs and image generation on a 24 GB Intel Arc B60 with Llama.cpp, Strata, OpenVINO, and ComfyUI.

Run local models on a 24 GB Intel Arc B60. Llama.cpp, Strata, and OpenVINO use
port `8080` on the local network, with one service active at a time.

## Use a model

1. Follow the [server setup](./content/setup.md) and the
   [one-time SSH setup](./scripts/README.md).
2. Copy `.env.example` to `.env` and set `AI_SSH_HOST` to your SSH alias.
3. From the repository root, run:

```bash
bun install
bun run switch:coding               # choose model, approach and context
```

The menu includes llama.cpp, Strata and arc-lab; llama settings are in
[scripts/model--switch/presets.json](./scripts/model--switch/presets.json). The
command downloads a missing model, switches services, checks health and one
short reply, then updates the VS Code provider for that service.

For timing tests and saved results, run `bun run test`. Results go under
`test-results/`, with a summary in `test-results/test-results.md`. Run
`bun run list` to see the model served by the API.

## Generate images

Fantasy art (goblins, elves, dragons) runs through ComfyUI on Intel XPU, one service at a time
like the language models. Setup and models are in [Image generation](./content/image_generation/INSTALL.md).

```bash
bun run image:download:qwen         # Qwen-Image 2.1 Turbo files to the server
bun run image:start                 # stops the language model, starts ComfyUI
bun run image "a goblin merchant in a lantern-lit cave market"
bun run image:test                  # timed run of eight fantasy prompts
```

Image generation is not yet tested end to end on the server.

Other scripts:
- `bun run quality` runs JS/TS and commit-message tasks with automatic checks.
- `bun run pi` points the Pi coding agent at the served model.
- `bun run delete` lists or removes model files on the server (dry run by default).

## Guides

- [Models and fit](./content/models.md)
- [Server setup and daily use](./content/setup.md)
- [VS Code and other clients](./content/clients.md)
- By task, each with INSTALL, TEST and USAGE:
  [text generation](./content/text_generation/INSTALL.md),
  [code generation](./content/code_generation/INSTALL.md),
  [image generation](./content/image_generation/INSTALL.md),
  [3D generation](./content/3d_generation/INSTALL.md),
  [text to speech](./content/text_to_speech/INSTALL.md)
- [Scripts](./scripts/README.md)
- [Recommendations](./content/recommendations.md)
- [Results](./content/results.md)

## Support

If this project is useful to you, you can support its development on [Ko-fi](https://ko-fi.com/tertiumnon).
