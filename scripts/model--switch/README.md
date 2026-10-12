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

Put the alias in `AI_SSH_HOST` in root `.env`. Set `HF_MODEL_REPO`,
`HF_MODEL_FILE`, and `MODEL_CONTEXT_TOKENS` to the target model. Run from the
repository root:

```powershell
bun install
bun run switch
bun run switch --service=strata --model=coder:IQ1_M
bun run switch --service=openvino --model=OpenVINO/Qwen3-Coder-30B-A3B-Instruct-int4-ov
```

The default service is `llama`; its optional `--model` is
`owner/repo/file.gguf`. Without it, `HF_MODEL_REPO` and `HF_MODEL_FILE` in `.env`
are used. Strata's `--model` is `family:quant` (for example `coder:IQ1_M` or
`qwen:IQ2_XS`). Its setup downloads and prepares missing models under
`/models/Strata-data`. OpenVINO's `--model` is an `OpenVINO/REPO` Hugging Face
model; OVMS downloads it to `/models` on first start. Both default to
the models already configured on this host. The helper stops and disables the
other two units, enables the selected one, waits for the model, and restores
the previous service if startup fails. Strata and OpenVINO downloads can take
time and disk space; existing files are reused.

All three services listen on host port `8080`. Strata and llama.cpp use `/v1`;
OpenVINO uses `/v3`. The command updates the local API URL when switching.

`MODEL_MTP=1` enables MTP for a GGUF with a draft head. Set both
`HF_MMPROJ_REPO` and `HF_MMPROJ_FILE` for a vision projector; leave them empty
for text. Private or gated repositories need `hf auth login` on the server.
The command reuses downloaded files, checks service health and one short reply,
then updates `.env` and the VS Code endpoint. Run `bun run test` separately for
timings and saved results in `test-results/`.
