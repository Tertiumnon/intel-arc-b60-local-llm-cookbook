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
scp scripts/model--download-and-test/llama-model-switch.py ai-b60:/tmp/llama-model-switch.py
ssh -t ai-b60 'sudo install -o root -g root -m 755 /tmp/llama-model-switch.py /usr/local/sbin/llama-model-switch'
ssh -t ai-b60 'printf "%s ALL=(root) NOPASSWD: /usr/local/sbin/llama-model-switch\n" "$USER" | sudo tee /etc/sudoers.d/llama-model-switch >/dev/null && sudo chmod 440 /etc/sudoers.d/llama-model-switch && sudo visudo -cf /etc/sudoers.d/llama-model-switch'
ssh -o BatchMode=yes ai-b60 id -un
```

Put the alias in `AI_SSH_HOST` in root `.env`. Set `HF_MODEL_REPO`,
`HF_MODEL_FILE`, and `MODEL_CONTEXT_TOKENS` to the target model. Run from the
repository root:

```powershell
bun install
bun run model
```

`MODEL_MTP=1` enables MTP for a GGUF with a draft head. Set both
`HF_MMPROJ_REPO` and `HF_MMPROJ_FILE` for a vision projector; leave them empty
for text. Private or gated repositories need `hf auth login` on the server.
The command reuses downloaded files, and records each speed check in the
gitignored `Intel-Arc-B60-Models-Log.md`.
