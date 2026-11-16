# AGENTS.md

Cookbook and tooling for running local AI models on one 24 GB Intel Arc Pro B60
server (Ubuntu 26.04, Docker, systemd). Nothing here runs on the dev machine: scripts
drive the server over SSH and call its API on port `8080`.

## Layout

- `content/` — the published docs (`setup.md` is the entry point, then `models`, `clients`,
  `recommendations`, `results`, `images`). Change docs together with the code they describe.
- `scripts/` — Bun + TypeScript commands, one directory each, named `area--action/area--action.ts`
  (`model--switch`, `model--test`, `image--start`, ...). Run them through `package.json` scripts.
- `scripts/model--switch/llama-model-switch.py` — the only root helper on the server. It is
  installed once to `/usr/local/sbin/llama-model-switch` and allowed through sudoers. Any new
  service must be added to its `SERVICES` map, and the file must be re-copied to the server.
- `scripts/*.service` — systemd units that are installed by hand once (`strata.service`,
  `comfyui.service`). The llama and OpenVINO units are rewritten by the helper.
- `data/`, `images/`, `test-results/`, `.env` — generated or private, git-ignored. Never commit them.

## Server model

One service owns port `8080` at a time: `llama-cpp` (`/v1`), `strata` (`/v1`),
`openvino-model-server` (`/v3`, archived), `comfyui` (images, ComfyUI API). Starting one
disables the others, so image generation and the language models are mutually exclusive.
Run a `switch:*` command to get a language model back after `image:start`.
Models live in `/models` on the server (`/models/gguf`, `/models/comfyui/models`).

## Commands

Copy `.env.example` to `.env` first (`AI_SSH_HOST`, `AI_SERVER_HOST`, `AI_API_KEY`, ...).

| Command | What it does |
|---|---|
| `bun run switch:<preset>` / `switch:strata` / `switch:list` | Serve a language model |
| `bun run test`, `list`, `quality` | Speed test, list served model, quality tasks |
| `bun run delete` | List or remove model files on the server (dry run by default) |
| `bun run pi` | Point the Pi coding agent at the served model |
| `bun run image:download:qwen` / `image:download:z-image` | Download image models to the server |
| `bun run image:start` | Start ComfyUI (Intel `llm-scaler-omni`) on port 8080 |
| `bun run image "prompt" [--size=WxH]` | Generate a fantasy image into `images/` |
| `bun run image:test [--only=a,b] [--size=WxH]` | One timed image per fantasy prompt (`scripts/image--test/prompts.json`) into `test-results/` |
| `bun run typecheck` | `tsc --noEmit` (run `bun install` first) |

## Rules for changes

- Follow the global coding rules (strict TypeScript, const arrow functions with return types, no
  `any`, fail fast with an error that says how to fix it, no fallbacks for missing env, no debug logs).
- Prefer the newest projects built for Intel Arc (Strata, Intel `llm-scaler`, current models) over
  older generic stacks. Check a model's Hugging Face repo and license before adding it; do not
  invent file names — list the repo tree first.
- Servers are reached only through the SSH alias in `AI_SSH_HOST`. Do not hardcode hosts, keys or
  tokens; the API key in `data/*.json` is a placeholder.
- Mark anything not run on the real server as untested in the docs.
- Use Conventional Commits. Stay on the checked-out branch; do not push unless asked.
- Update `CHANGELOG.md` (`[Unreleased]`) for user-visible changes.
