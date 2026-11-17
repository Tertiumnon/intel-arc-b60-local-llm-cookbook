# Text to speech: usage

## Choose a model

| Need | Model | How |
|---|---|---|
| Multilingual speech, voice cloning (default) | Qwen3-TTS 1.7B Base | `bun run switch:tts` |
| Highest quality, newest | Fish Audio S2 Pro | needs a llama.cpp build newer than v1.0.0; add a preset after checking the model card |
| Tiny and fast | Soprano 80M or Pocket TTS | add a preset; see the llama.cpp [TTS guide](https://github.com/ggml-org/llama.cpp/blob/master/docs/multimodal/tts.md) |
| Voice cloning with ComfyUI | IndexTTS 2, VoxCPM1.5 | Intel `llm-scaler-omni:0.1.0-b8` workflows `audio_indextts2.json`, `audio_VoxCPM_example.json` (not set up here) |

Use llama.cpp models first; the ComfyUI audio nodes need the 3D image and extra model folders.

## Speak

```bash
bun run switch:tts
bun run tts "The goblin merchant clears his throat." --lang=en
bun run tts "Text in my voice" --speaker=voice.wav
```

Output is `audio/*.wav` (git-ignored). The API is OpenAI-compatible, so other clients can call
`POST http://<server>:8080/v1/audio/speech` with `{"model":"tts","input":"..."}`. Supported response formats are
`wav` (default) and `pcm`. Extra fields: `lang`, `voice`, `speed`, `speaker_ref_b64`, `seed`.

## Add another speech model

1. Find the GGUF and its `mmproj` in the model's Hugging Face repo and confirm llama.cpp lists it in
   `docs/multimodal/tts.md`.
2. Add a preset to [presets.json](../../scripts/model--switch/presets.json) like `tts-qwen3`:
   `"model"` and `"mmproj"` as `owner/repo/file.gguf`, `"tts": true`, a small `"context"`, and `"tested": false`.
3. Add a `switch:<name>` script to `package.json`, then run it and the checks in [TEST.md](./TEST.md).

## Switch back

Speech and language models share the same llama service, so only one is loaded at a time:

```bash
bun run switch:strata
bun run switch:qwen38-27b-unsloth:ctx49k
```
