# VS Code config for Strata

Strata's loaded model ID is `qwen3.8-flash-next-coder-iq1_m` (`/v1/models`). It serves OpenAI chat completions at `/v1/chat/completions`. On this server, Strata listens on the local network without API authentication. Use this provider in `chatLanguageModels.json` on the Windows PC:

```json
[
  {
    "name": "Arc B60 (Strata)",
    "vendor": "customendpoint",
    "apiKey": "local",
    "apiType": "chat-completions",
    "models": [
      {
        "id": "qwen3.8-flash-next-coder-iq1_m",
        "name": "Strata Coder IQ1_M",
        "url": "http://192.168.0.29:8080/v1/chat/completions",
        "toolCalling": true,
        "vision": false,
        "streaming": true,
        "maxInputTokens": 45056,
        "maxOutputTokens": 8192
      }
    ]
  }
]
```

`local` is only a placeholder for VS Code's key field. The input and output caps total 53,248 tokens, below Strata's configured 131,072-token context. Tool calling was verified with a function-call request; image input is disabled.

The Windows `chatLanguageModels.json` keeps Strata and the saved llama.cpp model as separate providers. Do not put Markdown link syntax in the JSON URL. See [Strata setup](./Intel-Arc-B60-Server-Setup-Strata.md) and the [general VS Code client guide](./Intel-Arc-B60-Clients.md) for the Custom Endpoint steps.
