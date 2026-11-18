# Text to speech: test

## 1. Switch

```bash
bun run switch:tts          # ends with "Health check passed: /models/...Qwen3-TTS..."
```

If the switch fails with an unknown model type or `/v1/audio/speech` returns 404, the server image is too old:
see [INSTALL.md](./INSTALL.md#2-update-the-llamacpp-image-once).

## 2. Speak

```bash
bun run tts "Hello from the Intel Arc B60."
bun run tts "Bonjour, ceci est un test." --lang=fr
bun run tts "Hello" --speaker=voice.wav
```

Each command saves `audio/<timestamp>.wav` and prints the path. The speaker file is a short clean recording.

## 3. Check

- The file opens in a player and is the sentence you sent, without clipped words.
- A reference voice sounds like the reference.
- Time to first audio and the full time for one sentence: record them here once measured.
- For another language, send a sentence in that language and `--lang=<code>`.

Direct request, without the script:

```bash
curl http://<server>:8080/v1/audio/speech -H "Content-Type: application/json" \
  -d '{"model":"tts","input":"Hello, this is a test."}' -o out.wav
```

## Pass criteria

One English and one other-language sentence play back correctly, and the service returns to the language model
with `bun run switch:coding:strata-qwen38-flash-next-coder-iq1m`.
