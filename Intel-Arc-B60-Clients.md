# Intel Arc B60 Clients Guide

## Overview
This guide covers connecting AI clients to the Intel Arc B60 inference server. The
currently running server is llama.cpp on port `8001`; OpenVINO Model Server (OVMS)
can be started separately on port `8000` using the [OpenVINO guide](./Intel-Arc-B60-OpenVINO.md).
The live llama.cpp service is documented in the [Intel SYCL setup guide](./Intel-Arc-B60-Server-Setup-Intel_SYCL.md).
For a Windows desktop running LM Studio, see the [Windows + LM Studio Guide](./Intel-Arc-B60-Windows-LM-Studio.md).

## Connection Details
The [.env](./.env) file (template: [.env.example](./.env.example)) contains the
OVMS connection values; the template defaults to port `8000` and `/v3`. For the
currently running llama.cpp service, use `http://192.168.0.29:8001/v1`:
- **Endpoint**: `AI_API_URL` (built from `AI_SERVER_HOST` + `AI_API_PORT`)
- **API key**: `AI_API_KEY`

Load them into your shell with:
```bash
set -a; source .env; set +a
```

GUI clients can't read `.env`; paste its values when configuring OVMS. Use the
explicit llama.cpp URL and placeholder key in the examples below.

## Supported Clients
This setup works with:
- **Roo Code**
- **VS Code Chat**
- **OpenAI SDK**
- **Open WebUI**

## VS Code AI Configuration

VS Code Chat (including agent mode) connects to either server as a **Custom Endpoint**.

### Configure Custom Endpoint
1. In the Chat view open the model picker → **Manage Language Models** (gear icon), or
   run **Chat: Manage Language Models** from the Command Palette.
2. Select **Add Models** → **Custom Endpoint**. VS Code opens `chatLanguageModels.json`.
3. Add the provider below for the **currently running Qwen3.8 IQ3_M llama.cpp model**. Its
   model ID matches the live `/v1/models` response on October 6, 2026.

```json
[
  {
    "name": "Arc B60 (llama.cpp)",
    "vendor": "customendpoint",
    "apiKey": "local",
    "apiType": "chat-completions",
    "models": [
      {
        "id": "/models/Qwen3.8-27B-IQ3_M.gguf",
        "name": "Qwen3.8-27B IQ3_M imatrix (B60)",
        "url": "http://192.168.0.29:8001/v1/chat/completions",
        "toolCalling": true,
        "vision": true,
        "thinking": true,
        "streaming": true,
        "maxInputTokens": 24576,
        "maxOutputTokens": 4096,
        "modelOptions": {
          "temperature": 1.0,
          "top_p": 0.95,
          "top_k": 20,
          "min_p": 0.0
        }
      }
    ]
  }
]
```

For OVMS, use a separate Custom Endpoint provider with the model ID returned by its
`/v3/models` API and the full `<AI_API_URL>/chat/completions` URL. Put its API key in
VS Code's credential prompt. OVMS is currently stopped; see the
[OpenVINO guide](./Intel-Arc-B60-OpenVINO.md) before selecting an OVMS model.

Notes:
- The current llama.cpp server does not require authentication; `local` is a
  placeholder value for VS Code's API-key field. Use an actual stored key for OVMS.
- `vendor` must be **`customendpoint`**. With `vendor: openai`, VS Code ignores
  `maxInputTokens`/`maxOutputTokens` ([vscode#322216](https://github.com/microsoft/vscode/issues/322216)).
- The model `url` is the **full path** including `/chat/completions`. llama.cpp serves
  `/v1`; OVMS serves `/v3`.
- The `id` must match the active server's `/models` response exactly.
- Don't commit `chatLanguageModels.json` to a repository.

### Choosing `maxInputTokens` / `maxOutputTokens`

VS Code defines `contextWindow` as the total input plus output budget
([Custom Endpoint configuration](https://code.visualstudio.com/docs/agent-customization/language-models#custom-endpoint-configuration-reference)).
The input cap must include VS Code instructions, tool schemas, history, and repository
content. Thinking tokens count toward the output cap. Leave some space between the
sum of both caps and the server's context for chat-template tokens and counting
differences.

For the running IQ3_M service, use **24,576** for `maxInputTokens` and
**4,096** for `maxOutputTokens` (28,672 tokens combined), leaving 4,096 tokens
within the server's 32,768 context for formatting overhead. Treat this as a
starting profile: a full long-context VS Code agent session has not been measured
on this model. The GGUF was calibrated at 32,768 tokens; image tokens count
against the same context. Thinking tokens count against `maxOutputTokens`, so
very small output caps can be consumed before visible answer text appears.

When switching models, take the server context and client limits from the
[Models Guide](./Intel-Arc-B60-Models.md#recommended-b60-input-and-output-limits).
Check the live server context and memory before advertising an untested profile.
If a reasoning answer is cut off, increase server context or lower input before
raising `maxOutputTokens`. With parallel requests, KV cache capacity is shared.

## OpenAI SDK
For the running llama.cpp server, use `http://192.168.0.29:8001/v1` and a
placeholder API key. For OVMS, use its `/v3` endpoint and configured API key.

```bash
export AI_API_URL='http://192.168.0.29:8001/v1'
export AI_API_KEY='local'
```

```python
import os
from openai import OpenAI

client = OpenAI(
    base_url=os.environ["AI_API_URL"],
    api_key=os.environ["AI_API_KEY"],
)

response = client.chat.completions.create(
    model="/models/Qwen3.8-27B-IQ3_M.gguf",
    messages=[{"role": "user", "content": "Hello!"}],
    temperature=1.0,
    top_p=0.95,
    max_tokens=4096,
    extra_body={"top_k": 20},
)
print(response.choices[0].message.content)
```

## Open WebUI
In Open WebUI settings, add a connection to the running llama.cpp server:
- **API URL**: `http://192.168.0.29:8001/v1`
- **API Key**: `local`
- **Model**: `/models/Qwen3.8-27B-IQ3_M.gguf`

## Recommended Client Settings
For the currently running Qwen3.8-27B IQ3_M GGUF on coding and multimodal requests:
- **Server sampling defaults:** temperature 1.0, **top_p** 0.95, **top_k** 20, **min_p** 0.0.
- **Max output tokens** 4096 with the current 32,768-token server context. Reasoning
  and final text share this allowance.
- **VS Code input allowance** 24,576 tokens, including agent and repository context.
  The server must be restarted and retested before using a larger client profile. See
  [Choosing maxInputTokens / maxOutputTokens](#choosing-maxinputtokens--maxoutputtokens).

Background and model comparison: [Models Guide](./Intel-Arc-B60-Models.md#better-for-coding).

## Testing the Configuration
1. Open a new file in VS Code
2. Pick "Qwen3.8-27B IQ3_M imatrix (B60)" in the Chat model picker and send a prompt
3. Verify that the response comes from the llama.cpp server on port `8001`

## Troubleshooting
### Common Issues
- **HTTP 503 `Loading model` / VS Code says “Rate limit exceeded”**: llama.cpp is
  still loading the GGUF; this response is not a request quota. Check
  `curl -i http://192.168.0.29:8001/health` and retry after it returns HTTP 200.
- **Connection refused**: Ensure `llama-cpp.service` is running and port `8001` is reachable.
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
