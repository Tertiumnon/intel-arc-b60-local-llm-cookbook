# Intel Arc B60 Clients Guide

## Overview
This guide covers connecting AI clients to your Intel Arc B60 OpenVINO Model Server. The server is assumed to be running per the [Intel Arc B60 Server Setup Guide](./Intel-Arc-B60-Server-Setup.md), listening on `AI_API_URL`. For a Windows desktop running LM Studio instead, see the [Windows + LM Studio Guide](./Intel-Arc-B60-Windows-LM-Studio.md). LM Studio's local server is also OpenAI-compatible, so the SDK examples below work against it too.

## Connection Details
All connection values live in [.env](./.env) (template: [.env.example](./.env.example)):
- **Endpoint**: `AI_API_URL` (built from `AI_SERVER_HOST` + `AI_API_PORT`)
- **API key**: `AI_API_KEY`

Load them into your shell with:
```bash
set -a; source .env; set +a
```

GUI clients can't read `.env`; paste the values from it where the steps below say
`<AI_API_URL>` / `<AI_API_KEY>`.

## Supported Clients
This setup works with:
- **Roo Code**
- **VS Code Chat**
- **OpenAI SDK**
- **Open WebUI**

## VS Code AI Configuration

VS Code Chat (including agent mode) connects to OVMS as a **Custom Endpoint** ("bring
your own key"). It works without a Copilot plan and fully offline. Inline code
completions and semantic search still require a GitHub account.

### Configure Custom Endpoint
1. In the Chat view open the model picker → **Manage Language Models** (gear icon), or
   run **Chat: Manage Language Models** from the Command Palette.
2. Select **Add Models** → **Custom Endpoint**. VS Code opens `chatLanguageModels.json`.
3. Add the provider below. Replace `<AI_API_URL>` with the value from `.env`.
4. On first use VS Code prompts for the API key (`AI_API_KEY`) and stores it in the
   OS credential store, so the key never appears in the file.

```json
[
  {
    "name": "Arc B60 (OVMS)",
    "vendor": "customendpoint",
    "apiKey": "${input:arcB60ApiKey}",
    "apiType": "chat-completions",
    "models": [
      {
        "id": "OpenVINO/Qwen3.8-27B-int4-ov",
        "name": "Qwen3.8-27B (B60)",
        "url": "<AI_API_URL>/chat/completions",
        "toolCalling": true,
        "vision": false,
        "thinking": true,
        "streaming": true,
        "maxInputTokens": 81920,
        "maxOutputTokens": 16384
      }
    ]
  }
]
```

Notes:
- `vendor` must be **`customendpoint`**. With `vendor: openai`, VS Code ignores
  `maxInputTokens`/`maxOutputTokens` ([vscode#322216](https://github.com/microsoft/vscode/issues/322216)).
- The model `url` is the **full path** including `/chat/completions`. OVMS serves `/v3`, not `/v1`.
- `id` must match the OVMS model name exactly (`bun run list` in `scripts/speed-test`).
- Don't commit `chatLanguageModels.json` to a repository.

### Choosing `maxInputTokens` / `maxOutputTokens`

> **Recommended for Qwen3.8-27B on one B60**
>
> | Profile | `maxInputTokens` | `maxOutputTokens` | Use when |
> |---|---|---|---|
> | **Default (large refactors)** | **81920** | **16384** | Multi-file refactors and implementing features across a big JS/Node project. The first full prompt takes ~100 s; later turns are fast thanks to prefix caching. |
> | Fast start | 49152 | 16384 | Smaller tasks, or when the first response feels too slow (~60 s for a full prompt). |
>
> Keep `maxOutputTokens` at **16384** in both. Don't go below it: the model thinks
> before answering. Don't raise `maxInputTokens` above 81920 on a single B60, or you risk
> running out of VRAM. 128K+ needs a second B60.

VS Code packs the conversation up to `maxInputTokens`, and the model may generate up to
`maxOutputTokens` on top of that. **Input + output must fit in the KV cache**, which only
gets the VRAM left after the weights (24GB B60, minus ~1GB runtime overhead).

| Model (OVMS int4) | Weights | KV cache per token (fp16) | VRAM left for KV | **maxInputTokens** | **maxOutputTokens** | KV at max |
|---|---|---|---|---|---|---|
| **Qwen3.8-27B** (primary) | 16.0GB | 64 KiB (16 of 64 layers use full attention) | ~7GB | **81920** | **16384** | ~6.0GB |
| Qwen3.6-35B-A3B | 19.4GB | 20 KiB (10 of 40 layers use full attention) | ~3.6GB | **114688** | **16384** | ~2.5GB |
| Qwen3-Coder-30B-A3B (legacy) | 16.3GB | 96 KiB (all 48 layers use full attention) | ~6.7GB | **49152** | **8192** | ~5.3GB |

- **`49152` / `8192` is the right setting for Qwen3-Coder-30B**, a non-thinking model.
  For **Qwen3.8-27B it is too small on output**: the model thinks before answering, and
  8K output tokens can cut a refactor off mid-thought. Use 16K output.
- Qwen3.8's hybrid attention keeps only 1 in 4 layers in the KV cache. That's why it
  fits ~80K context despite being the larger dense model.
- **Prefill speed matters more than the limit.** OVMS reads prompts at ~830 tok/s on the
  B60, so filling 80K tokens takes ~100 s before the first output token. Later turns are
  fast because OVMS prefix caching (on by default) reuses the shared history. Lower
  `maxInputTokens` (e.g. 49152) if first responses feel too slow.
- These are single-session numbers. With parallel agent requests the KV cache is shared,
  so lower the limits or set a fixed `--cache_size` in OVMS. Check VRAM with `qmassa`
  while a long session runs (see the Server Setup Guide, §8).
- KV sizes assume fp16 KV cache, so they are conservative. If OVMS uses a compressed
  (int8) KV cache, you have about twice the headroom.

## OpenAI SDK
Point any OpenAI-compatible client at the server's `/v3` endpoint:

```bash
export OPENAI_API_BASE="$AI_API_URL"
export OPENAI_API_KEY="$AI_API_KEY"
```

```python
import os
from openai import OpenAI

client = OpenAI(
    base_url=os.environ["AI_API_URL"],
    api_key=os.environ["AI_API_KEY"],
)

response = client.chat.completions.create(
    model="OpenVINO/Qwen3.8-27B-int4-ov",
    messages=[{"role": "user", "content": "Hello!"}],
    temperature=1.0,
    top_p=0.95,
    max_tokens=16384,
    extra_body={"top_k": 20},
)
print(response.choices[0].message.content)
```

## Open WebUI
In Open WebUI settings, add a connection to the OpenVINO Model Server:
- **API URL**: `<AI_API_URL>`
- **API Key**: `<AI_API_KEY>`
- **Model**: `OpenVINO/Qwen3.8-27B-int4-ov`

## Recommended Client Settings
For the primary model (`OpenVINO/Qwen3.8-27B-int4-ov`) on large JS/Node refactors:
- **Temperature** 1.0, **top_p** 0.95, **top_k** 20 (official thinking-mode values)
- **Max output tokens** 16384. The model reasons before answering, and smaller limits cut
  refactors off mid-thought.
- **Context window** ~96K total on one B60 (80K input + 16K output) in agent clients
  (VS Code, Roo Code, Claude Code). The VRAM math is in
  [Choosing maxInputTokens / maxOutputTokens](#choosing-maxinputtokens--maxoutputtokens).

Background and model comparison: [Models Guide](./Intel-Arc-B60-Models.md#primary-model-qwen38-27b-int4).

## Testing the Configuration
1. Open a new file in VS Code
2. Pick "Qwen3.8-27B (B60)" in the Chat model picker and send a prompt (agent mode works; inline completions do not use custom endpoints)
3. Verify that responses come from your local OpenVINO Model Server

## Troubleshooting
### Common Issues
- **Connection refused**: Ensure your OpenVINO Model Server is running and accessible
- **Model not found**: Verify the model name matches exactly what's configured in your service
- **Network issues**: Confirm `AI_SERVER_HOST` in `.env` is correct for your setup

### Verification Steps
1. Test connectivity to your server:
   ```bash
   curl -H "Authorization: Bearer $AI_API_KEY" "$AI_API_URL"
   ```
2. Check if the model is available:
   ```bash
   curl -H "Authorization: Bearer $AI_API_KEY" "$AI_API_URL/models"
   ```
