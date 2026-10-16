# One-time model command setup

Run these once from Windows PowerShell, replacing the host and user with yours:

```powershell
ssh-keygen -t ed25519 -f "$HOME\.ssh\ai-b60" -N ''
Get-Content "$HOME\.ssh\ai-b60.pub" | ssh user@server 'umask 077; mkdir -p ~/.ssh; cat >> ~/.ssh/authorized_keys'
```

Add an SSH alias to `$HOME\.ssh\config`:

```sshconfig
Host ai-b60
    HostName your-server-host
    User your-server-user
    IdentityFile ~/.ssh/ai-b60
    IdentitiesOnly yes
```

Install the switch helper and permit only that root command without a sudo
password. The second SSH command asks for your sudo password once:

```powershell
scp scripts/model--switch/llama-model-switch.py ai-b60:/tmp/llama-model-switch.py
ssh -t ai-b60 'sudo install -o root -g root -m 755 /tmp/llama-model-switch.py /usr/local/sbin/llama-model-switch'
ssh -t ai-b60 'printf "%s ALL=(root) NOPASSWD: /usr/local/sbin/llama-model-switch\n" "$USER" | sudo tee /etc/sudoers.d/llama-model-switch >/dev/null && sudo chmod 440 /etc/sudoers.d/llama-model-switch && sudo visudo -cf /etc/sudoers.d/llama-model-switch'
ssh -o BatchMode=yes ai-b60 id -un
```

Put the alias in `AI_SSH_HOST` in the root `.env`. Run commands from the
repository root.

## Presets (llama.cpp)

Each llama model setting is a named preset in [presets.json](./presets.json):
GGUF path, context in tokens, MTP on or off, and whether the exact setting has
been tested on the B60.

```bash
bun run switch:list                          # all presets, tested or not
bun run switch:qwen38-27b-iq3m:ctx64k        # run one preset
bun run switch -- --preset=terse:ctx32k      # same thing, by preset name
```

Every `switch:<name>` script in `package.json` is a one-line call to a preset.
To add a setting, add an entry to `presets.json` and a matching script. Preset
names are `model` for the default, then `:variant` for a change of context or
MTP (`ctx32k`, `ctx64k`, `ctx128k`, `no-mtp`).

Presets set only context, MTP, and the model. The helper rewrites only those
flags in the llama unit, so the KV cache type and sampling flags stay as they
were in the unit file. Reasoning effort and presence penalty are not switch
parameters.

## Other services and direct model paths

```bash
bun run switch --service=strata --model=coder:IQ1_M
bun run switch --service=openvino --model=OpenVINO/Qwen3-Coder-30B-A3B-Instruct-int4-ov
bun run switch --service=llama --model=owner/repo/file.gguf   # needs MODEL_CONTEXT_TOKENS in .env
```

Without `--model`, llama uses `HF_MODEL_REPO`, `HF_MODEL_FILE`, and
`MODEL_CONTEXT_TOKENS` from `.env`. Strata's `--model` is `family:quant`
(for example `coder:IQ1_M`, `qwen:IQ2_XS`). OpenVINO's `--model` is an
`OpenVINO/REPO` Hugging Face model. Strata and OpenVINO downloads can take time
and disk space; existing files are reused.

All three services listen on host port `8080`. Strata and llama.cpp use `/v1`;
OpenVINO uses `/v3`. The command updates the local API URL when switching.

The helper stops and disables the other units, enables the selected one, waits
for the model, and restores the previous service if startup fails. Private or
gated repositories need `hf auth login` on the server.

`MODEL_MTP=1` enables MTP for a GGUF with a draft head. Set both
`HF_MMPROJ_REPO` and `HF_MMPROJ_FILE` for a vision projector; leave them empty
for text.

## VS Code

After each switch, the command updates `chatLanguageModels.json` on the Windows
PC. There is one provider per service, named `Arc B60 (llama)`,
`Arc B60 (strata)`, or `Arc B60 (openvino)`. Each provider holds only the model
that is currently served, so stale entries do not build up. A switch replaces
the entry for its own service only.

The command then checks health and one short reply, and updates `.env`.
Run `bun run test` separately for timings and saved results in `test-results/`.
