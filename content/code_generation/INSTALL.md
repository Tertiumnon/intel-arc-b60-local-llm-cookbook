# Code generation: install

Coding assistant for VS Code, the Pi agent and other OpenAI-compatible clients. Default model:
**Strata Flash-Next Coder IQ1_M** at 131K context. Evidence and limitations:
[recommendations.md](../recommendations.md).

## 1. Base setup

Do [text_generation/INSTALL.md](../text_generation/INSTALL.md) first: server, `.env`, SSH alias and the
root helper. Strata needs `strata.service` as well:

```bash
scp scripts/strata.service ai-b60:/tmp/strata.service
ssh -t ai-b60 'sudo install -m 644 /tmp/strata.service /etc/systemd/system/strata.service && sudo systemctl daemon-reload'
```

## 2. Install the model

```bash
bun run switch:coding:strata-qwen38-flash-next-coder-iq1m
bun run pi
```

The first Strata switch clones and builds [Strata](https://github.com/Niko1221/Strata) in `/models/Strata` and writes its config.

## 3. Options after install

Strata config is `/models/Strata/strata-coder-iq1_m.json` (backups `*.before-*`). The switch sets:

| Setting | Value |
|---|---|
| Sampling | temperature 1.0, top_p 0.95, top_k 20, repeat_penalty 1.05 |
| Reasoning | `reasoning_effort` low; budget 4,096 tokens; loop recovery on |
| VS Code limits | 110,000 input, 8,192 output |

A request's own values override these defaults. Avoid `high` on long prompts.

## 4. Connect a client

- **VS Code Chat:** the switch writes the `Arc B60 (strata)` provider; manual steps are in [clients.md](../clients.md).
- **Pi agent:** `bun run pi`, then `pi`. Repeat setup after switching the served model.
- **Pi on the AI server:** the `ai` user's Pi profile points to Strata Flash-Next Coder IQ1_M. Its model ID and context are a snapshot; update `~/.pi/agent/models.json` and `settings.json` after changing the served model. This interactive profile is separate from the unprivileged Kyra worker account.
- **Other:** `AI_API_URL` and `AI_API_KEY` from `.env`.

Next: [TEST.md](./TEST.md), [USAGE.md](./USAGE.md).
