# Scripts

Run everything from the repository root with `bun run <name>`. Settings come from
the root `.env` (copy `.env.example`).

| Command | What it does |
|---|---|
| `switch:list` | List llama presets |
| `switch:coding` | Choose a coding model, approach, and context |
| `switch --service=strata --model=coder:IQ1_M` | Switch to Strata |
| `switch --service=strata --model=inkling-2-mini:SQ-20` | Switch to installed Inkling SQ-20 on Strata (57K default) |
| `test` | Speed test on the served model |
| `quality` | Quality tasks at low and medium reasoning |
| `image:download:qwen`, `image:download:z-image` | Download image models to the server |
| `image:start` | Start ComfyUI for image generation (stops the language model) |
| `3d:download`, `3d:start` | Download Hunyuan3D 2.1 and start its ComfyUI |
| `switch:tts`, `tts "text"` | Serve the Qwen3-TTS speech model, then speak text into `audio/` |
| `image "prompt"` | Generate an image into `images/` |
| `image:test` | One timed image per fantasy prompt, logged to `test-results/image-runs.jsonl` |
| `pi` | Point the Pi coding agent at the served model |
| `delete` | List or delete model files on the server (dry run by default) |

Every run logs to `test-results/runs.jsonl`, one line per test, with the endpoint,
model, context, output cap, and reasoning level.

## Switch setup (once)

Run in Windows PowerShell, replacing the host and user with yours:

```powershell
ssh-keygen -t ed25519 -f "$HOME\.ssh\ai-b60" -N ''
Get-Content "$HOME\.ssh\ai-b60.pub" | ssh user@server 'umask 077; mkdir -p ~/.ssh; cat >> ~/.ssh/authorized_keys'
```

Add to `$HOME\.ssh\config`:

```sshconfig
Host ai-b60
    HostName your-server-host
    User your-server-user
    IdentityFile ~/.ssh/ai-b60
    IdentitiesOnly yes
```

Install the helper and allow only that command without a password:

```powershell
scp scripts/model--switch/llama-model-switch.py ai-b60:/tmp/llama-model-switch.py
ssh -t ai-b60 'sudo install -o root -g root -m 755 /tmp/llama-model-switch.py /usr/local/sbin/llama-model-switch'
ssh -t ai-b60 'printf "%s ALL=(root) NOPASSWD: /usr/local/sbin/llama-model-switch\n" "$USER" | sudo tee /etc/sudoers.d/llama-model-switch >/dev/null && sudo chmod 440 /etc/sudoers.d/llama-model-switch && sudo visudo -cf /etc/sudoers.d/llama-model-switch'
ssh -o BatchMode=yes ai-b60 id -un
```

Set `AI_SSH_HOST=ai-b60` in `.env`.

## switch

Presets are in [model--switch/presets.json](./model--switch/presets.json): model file,
context, MTP on or off, and whether the exact setting was tested.

```bash
bun run switch --preset=NAME             # run a llama preset by name
bun run switch --service=strata --model=coder:IQ1_M
bun run switch --service=openvino --model=OpenVINO/Qwen3-Coder-30B-A3B-Instruct-int4-ov
```

A preset sets only context, MTP, and the model. KV cache type and sampling stay
as the server's unit file has them. For a new model, add an entry to `presets.json`.

Each switch also writes `data/vscode.json` (the VS Code provider) and `data/pi.json`
(for the Pi coding agent). Both have a placeholder key.

## pi

```bash
bun run pi                               # writes ~/.pi/agent/models.json from the live server
pi --provider arc-b60
```

Reads `AI_API_URL` and `AI_API_KEY` from `.env`, takes the loaded model and context
from `/models`, and keeps the previous file as `models.json.previous`.

The switch also writes one VS Code provider per service (`Arc B60 (llama)`,
`Arc B60 (strata)`, `Arc B60 (openvino)`), so entries do not build up.

## test

```bash
bun run test                             # uses SPEED_TEST_* from .env
SPEED_TEST_ITERATIONS=5 SPEED_TEST_MAX_TOKENS=2048 bun run test
bun run test -- --no-reasoning
```

| Variable | Default | Meaning |
|---|---|---|
| `SPEED_TEST_ITERATIONS` | 3 | measured runs |
| `SPEED_TEST_MAX_TOKENS` | 256 | output cap |
| `SPEED_TEST_TEMPERATURE` | 0.7 | temperature |
| `SPEED_TEST_PROMPT` | sort function | prompt |
| `SPEED_TEST_TIMEOUT_MS` | 120000 | per-request timeout |

Output: `test-results/<model>/<timestamp>.json`, a row in `test-results/test-results.md`,
and a line in `runs.jsonl`. If every run hits the output cap, the reply was cut off.

## quality

The [quality tasks](./model--quality/tasks.json) check JavaScript and commit messages.
Code answers run on the AI server in a network-disabled, resource-limited Docker
container with no host mounts. Install the pinned image on the server before running:

```bash
ssh YOUR_SSH_ALIAS 'docker pull node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a'
bun run quality                         # low and medium; 8192 output tokens
bun run quality --group=complex --efforts=low
bun run quality --group=long --context=30000 --max-tokens=8192
```

Use a coding model with at least 49,152 allocated context tokens. `--context` is
the long prompt content target, measured with the selected backend tokenizer;
the runner reserves additional chat-template space and checks the output cap.
Choose only reasoning levels supported by the model's chat template. Pass, fail,
incomplete and request/sandbox error are reported separately. Responses and
reasoning are saved in a uniquely named, gitignored `test-results/quality/` file;
partial runs retain their current task. Avoid sharing these files without review.

Suite version 3 records explicit sampling settings and strengthens the checks and supplies long-task fixtures, so its
scores are not directly comparable to earlier results. Functional checks cannot
prove the TTL cache's required O(1) complexity. The tracked
[agent benchmark fixtures](./model--quality/model--quality.agent.json) contain
the earlier Pi batch and Kyra board prompts, starting files, and separate hidden
checks; keep hidden checks outside the agent workspace and execute generated code
only in an appropriately isolated environment.

## Comparing coding models

Run the same five complex checks across the coding choices (including Strata,
arc-lab, llama.cpp, and A3B choices):

```bash
bun run test:quality:ctx49k:complex:all-models
bun run test:quality:ctx57k:complex:all-models
bun run test:quality:ctx64k:complex:all-models
bun run test:quality:ctx64k:complex:all-models --limit=1 --models=arc-lab
bun run test:quality:ctx64k:complex:all-models --effort=medium --temperature=0.6
```

The allocation is the whole model window, not the input length. The input-content
targets are respectively 32,768, 40,960, and 49,152 tokens, leaving room for an
8,192-token answer and chat-template overhead. A model tokenizer measures each
prompt, and its actual request input count and a hash of the task fixtures are recorded. The prompt contains
small project excerpts and synthetic filler around each task: this tests a long
input, **not** an agent editing a real repository. The five tasks test cache,
expression parsing, interval merging, dependency ordering, and path lookup.

Each request explicitly asks for low reasoning, temperature 0.5, top-p 0.95,
top-k 20, min-p 0, repetition penalty 1, presence and frequency penalties 0,
and seed 42. Use `--effort`, `--temperature`, `--seed`, or `--max-tokens` to investigate a different
profile, and compare only matching profiles. The server may interpret or ignore
parameters differently; the saved values are requests, not proof of identical
samplers. Seed 42 does not guarantee identical output across backends. For
example, [Qwen3.8-27B recommends temperature 1.0 for thinking mode](https://huggingface.co/unsloth/Qwen3.8-27B),
while [Qwen3.5 recommends 0.6 for precise coding](https://huggingface.co/Qwen/Qwen3.5-9B).
Run a separate profile to compare those settings; none is proven best on this hardware.

`--limit=1..5` runs the first tasks, and `--models=text` filters model labels.
An unfiltered sweep may take many hours and download missing weights. The server
switches models, leaving the final attempted service active; client settings
are not updated. Run `bun run switch:coding` afterward to restore your model and
client settings. Individual answers and the comparison table (JSON and Markdown) are under ignored
`test-results/quality/`. After all selected models have been attempted, the run
replaces the latest comparison section in [results.md](../content/results.md),
including its settings, per-model table, and best completed result. A filtered
run replaces the same section and identifies its filter. Interrupted runs leave
the previous published comparison intact. Failed loads, request errors and truncated answers are
separate from failed quality checks. Historical results use other tasks and
settings. A single run is a screening result, not evidence of the best model;
repeat finalists with different seeds and include real multi-file agent work before choosing.

## delete

```bash
bun run delete                                  # list models on the server
bun run delete -- --gguf=FILE.gguf              # dry run
bun run delete -- --gguf=FILE.gguf --yes        # delete
bun run delete -- --openvino=DIR --yes
```

A model named in a live systemd unit or a Strata config is refused. The GGUF's
Hugging Face cache blob and its symlinks are removed with it.

## What goes in git

| Kind | Where | Git |
|---|---|---|
| Code, presets, quality tasks | `scripts/`, `presets.json`, `tasks.json` | Yes |
| Results summary and conclusions | `content/results.md`, `content/models.md` | Yes |
| Raw run logs and replies | `test-results/` (`runs.jsonl`, JSON per run, `work/`) | No, ignored |
| Server secrets and private notes | `.env`, `local-notes.md` | No, ignored |

Scripts save raw results to `test-results/`. The all-model quality comparison
updates its section of `content/results.md`; record other results there with their settings.

## image

Setup, models and tests are in [content/image_generation](../content/image_generation/INSTALL.md); 3D and speech are in [3d_generation](../content/3d_generation/INSTALL.md) and [text_to_speech](../content/text_to_speech/INSTALL.md).
