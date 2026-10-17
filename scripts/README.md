# Scripts

Run everything from the repository root with `bun run <name>`. Settings come from
the root `.env` (copy `.env.example`).

| Command | What it does |
|---|---|
| `switch:list` | List llama presets |
| `switch:<preset>` | Switch the server to a preset, e.g. `switch:terse` |
| `switch:strata` | Switch to Strata |
| `test` | Speed test on the served model |
| `quality` | Quality tasks at low, medium, high reasoning |
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
bun run switch -- --preset=NAME          # same as bun run switch:NAME
bun run switch --service=strata --model=coder:IQ1_M
bun run switch --service=openvino --model=OpenVINO/Qwen3-Coder-30B-A3B-Instruct-int4-ov
```

A preset sets only context, MTP, and the model. KV cache type and sampling stay
as the server's unit file has them. For a new model, add an entry to `presets.json`.

Each switch also writes `pages/vscode.json` (the VS Code provider) and `pages/pi.json`
(for the Pi coding agent, copy it to `~/.pi/agent/models.json`). Both have a placeholder key.

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

Tasks are in [model--quality/tasks.json](./model--quality/tasks.json): JavaScript
functions with tests, and commit messages with a format check.

```bash
bun run quality                          # low, medium, high
bun run quality -- --efforts=medium,high
```

Each test records pass or fail, finish reason, loop flag, token count, and time.
The reply text is not saved.

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
| Results summary and conclusions | `pages/results.md`, `pages/models.md` | Yes |
| Raw run logs and replies | `test-results/` (`runs.jsonl`, JSON per run, `work/`) | No, ignored |
| Server secrets and private notes | `.env`, `local-notes.md` | No, ignored |

Scripts log everything to `test-results/`. Copy the numbers you want to keep into
`pages/results.md` by hand, with the settings used.
