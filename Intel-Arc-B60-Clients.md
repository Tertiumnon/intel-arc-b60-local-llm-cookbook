# Intel Arc B60 Clients Guide

## Overview
This guide covers connecting AI clients to the Intel Arc B60 inference server. The
current server is llama.cpp with Intel SYCL on port `8001`. OpenVINO Model Server
is installed but disabled. Use the SYCL API for current model work.
The live llama.cpp service is documented in the
[Intel SYCL setup guide](./Intel-Arc-B60-Server-Setup-Intel_SYCL.md).

## Connection Details
Set your server host and the SYCL API URL in local [.env](./.env) from
[.env.example](./.env.example). Use `AI_API_URL` and `AI_API_KEY` for API clients.

Load them into your shell with:
```bash
set -a; source .env; set +a
```

GUI clients need the values copied from `.env` into their settings.

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
3. Add the provider below for the running Signal + Terse-Coder model. Its model ID
   must match `/v1/models`.

```json
[
  {
    "name": "Arc B60 (llama.cpp)",
    "vendor": "customendpoint",
    "apiKey": "local",
    "apiType": "chat-completions",
    "models": [
      {
        "id": "/models/Signal-3.8-27B-Terse-Coder.i1-Q4_K_M.gguf",
        "name": "Signal + Terse-Coder (B60)",
        "url": "http://<server-host>:8001/v1/chat/completions",
        "toolCalling": true,
        "vision": false,
        "thinking": true,
        "streaming": true,
        "maxInputTokens": 45056,
        "maxOutputTokens": 8192,
        "modelOptions": {
          "temperature": 0.6,
          "top_p": 0.95,
          "top_k": 20
        }
      }
    ]
  }
]
```

Replace `<server-host>` with `AI_SERVER_HOST` from `.env` and use its
`AI_API_KEY` value in the provider. The model ID must match `/v1/models`.

Notes:
- The current llama.cpp server does not require authentication; `local` is a
  placeholder for VS Code's API-key field.
- `vendor` must be **`customendpoint`**. With `vendor: openai`, VS Code ignores
  `maxInputTokens`/`maxOutputTokens` ([vscode#322216](https://github.com/microsoft/vscode/issues/322216)).
- The model `url` is the **full path** including `/v1/chat/completions`.
- The `id` must match the active server's `/models` response exactly.
- Don't commit `chatLanguageModels.json` to a repository.

### Choosing `maxInputTokens` / `maxOutputTokens`

VS Code defines `contextWindow` as the total input plus output budget
([Custom Endpoint configuration](https://code.visualstudio.com/docs/agent-customization/language-models#custom-endpoint-configuration-reference)).
The input cap must include VS Code instructions, tool schemas, history, and repository
content. Thinking tokens count toward the output cap. Leave some space between the
sum of both caps and the server's context for chat-template tokens and counting
differences.

For usual coding work with the current model, use **45,056 input** and
**8,192 output** tokens with the SYCL server's **57,344-token** context.
The client budget totals 53,248, leaving 4,096 tokens of server headroom.
This is a practical allowance, not a claim that every request needs 45K tokens.
Thinking tokens count toward `maxOutputTokens`.

When switching models, take the server context and client limits from the
[Models Guide](./Intel-Arc-B60-Models.md#recommended-b60-input-and-output-limits).
Check the live server context and memory before advertising an untested profile.
If a reasoning answer is cut off, increase server context or lower input before
raising `maxOutputTokens`. With parallel requests, KV cache capacity is shared.

## OpenAI SDK
Load `AI_API_URL` and `AI_API_KEY` from `.env` as shown above.

```python
import os
from openai import OpenAI

client = OpenAI(
    base_url=os.environ["AI_API_URL"],
    api_key=os.environ["AI_API_KEY"],
)

response = client.chat.completions.create(
    model="/models/Signal-3.8-27B-Terse-Coder.i1-Q4_K_M.gguf",
    messages=[{"role": "user", "content": "Hello!"}],
    temperature=0.6,
    top_p=0.95,
    max_tokens=8192,
    extra_body={"top_k": 20},
)
print(response.choices[0].message.content)
```

## Open WebUI
In Open WebUI settings, add a connection to the running SYCL API:
- **API URL**: `AI_API_URL` from `.env`
- **API Key**: `AI_API_KEY` from `.env`
- **Model**: `/models/Signal-3.8-27B-Terse-Coder.i1-Q4_K_M.gguf`

## Testing the Configuration
1. Open a new file in VS Code
2. Pick "Signal + Terse-Coder (B60)" in the Chat model picker and send a prompt
3. Verify that the response comes from the llama.cpp server on port `8001`

## Troubleshooting
### Common Issues
- **HTTP 503 `Loading model` / VS Code says “Rate limit exceeded”**: llama.cpp is
  still loading the GGUF; this response is not a request quota. Check
  `curl -i "${AI_API_URL%/v1}/health"` and retry after it returns HTTP 200.
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
