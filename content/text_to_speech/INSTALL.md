# Text to speech: install

Speech runs on **llama.cpp** itself, the same service as the language models: `llama-server` serves
`POST /v1/audio/speech` (merged 2026-11-09) and `POST /tts` for audio models. No extra stack is needed.
Not tested on this server yet.

## Model

**Qwen3-TTS 1.7B Base**, Q8_0 (1.85 GB + 0.45 GB projector), from
[`ggml-org/Qwen3-TTS-12Hz-1.7B-Base-GGUF`](https://huggingface.co/ggml-org/Qwen3-TTS-12Hz-1.7B-Base-GGUF).
Languages: zh, en, de, it, pt, es, ja, ko, fr, ru. Voice cloning from a short reference recording.

Other speech models llama.cpp supports (see
[docs/multimodal/tts.md](https://github.com/ggml-org/llama.cpp/blob/master/docs/multimodal/tts.md)):
Fish Audio S2 Pro, Chatterbox, Pocket TTS, Soprano, LFM3-Audio, Drama 3, ZONOS3. They need their own GGUF files;
add a preset after reading the model card. Fish Audio S2 Pro landed on 2026-11-16, after llama.cpp v1.0.0, so it
needs a build newer than the 1.0.0 release.

## 1. Base setup

Do [text_generation/INSTALL.md](../text_generation/INSTALL.md) first.

## 2. Update the llama.cpp image (once)

The server's `ghcr.io/ggml-org/llama.cpp:server-intel` was built on 2026-10-06, before the speech endpoint.
Pull a newer one and check the endpoint exists:

```bash
ssh ai-b60 'docker pull ghcr.io/ggml-org/llama.cpp:server-intel'
ssh ai-b60 'docker run --rm ghcr.io/ggml-org/llama.cpp:server-intel --help | grep -i tts'
```

The help must list `--tts-lang` and `--tts-voice`. Restart the service afterwards; a running container keeps
the old image. The new image can change other behaviour, so run `bun run test` on your main model after pulling.

## 3. Download and start

```bash
bun run switch:tts
```

The preset `tts-qwen3` downloads the model and its projector (`mmproj`) to `/models/gguf`, starts llama.cpp with
4,096 context and checks `/health` and `/v1/models`. It leaves `.env` and the VS Code provider unchanged, because
this is not a chat model.

## 4. Options after install

- Language and voice are chosen per request (`lang`, `voice`); the unit sets no defaults.
- Qwen3-TTS Base clones a voice from `speaker_ref_b64` or a reference file; without a reference the quality is
  unspecified. Keep a clean 5-15 second recording for the voice you want.

Next: [TEST.md](./TEST.md), [USAGE.md](./USAGE.md).
