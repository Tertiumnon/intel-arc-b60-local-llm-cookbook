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
explicit llama.cpp URL and placeholder key in the Swift examples below.

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
3. Add the provider below for the **currently running llama.cpp model**. Its model ID
   matches the live `/v1/models` response on October 6, 2026.

```json
[
  {
    "name": "Arc B60 (llama.cpp)",
    "vendor": "customendpoint",
    "apiKey": "local",
    "apiType": "chat-completions",
    "models": [
      {
        "id": "/models/Swift-1.5-Qwen3.8-27B-Q4_K_M.gguf",
        "name": "Swift 1.5 Qwen3.8-27B (B60 coding)",
        "url": "http://192.168.0.29:8001/v1/chat/completions",
        "toolCalling": true,
        "vision": false,
        "thinking": true,
        "streaming": true,
        "maxInputTokens": 40000,
        "maxOutputTokens": 8192
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

For the running Swift 1.5 service, use **49,152** for `contextWindow`, **40,000**
for `maxInputTokens`, and **8,192** for `maxOutputTokens`. The 960-token margin
allows for formatting overhead. A long input has succeeded locally; a full
40K-input plus 8K-output exchange is still unmeasured. Large uncached prompts
can take several minutes, so allow enough client request time. See the
[Speed Test Results](./Intel-Arc-B60-Speed-Test-Results.md#local-llamacpp-swift-15-qwen38-27b).

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
    model="/models/Swift-1.5-Qwen3.8-27B-Q4_K_M.gguf",
    messages=[{"role": "user", "content": "Hello!"}],
    temperature=0.6,
    top_p=0.95,
    max_tokens=8192,
    extra_body={"top_k": 20},
)
print(response.choices[0].message.content)
```

## Open WebUI
In Open WebUI settings, add a connection to the running llama.cpp server:
- **API URL**: `http://192.168.0.29:8001/v1`
- **API Key**: `local`
- **Model**: `/models/Swift-1.5-Qwen3.8-27B-Q4_K_M.gguf`

## Recommended Client Settings
For the currently running Swift 1.5 GGUF on large JS/Node refactors:
- **Temperature** 0.6, **top_p** 0.95, **top_k** 20 as a starting point; tune for your tasks.
- **Max output tokens** 8192 with the current 49,152-token server context. Reasoning
  and final text share this allowance.
- **VS Code input allowance** 40,000 tokens, including agent and repository context.
  The server must be restarted and retested before using a larger client profile. See
  [Choosing maxInputTokens / maxOutputTokens](#choosing-maxinputtokens--maxoutputtokens).

Background and model comparison: [Models Guide](./Intel-Arc-B60-Models.md#better-for-coding).

## Testing the Configuration
1. Open a new file in VS Code
2. Pick "Swift 1.5 Qwen3.8-27B (B60 coding)" in the Chat model picker and send a prompt
3. Verify that the response comes from the llama.cpp server on port `8001`

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
