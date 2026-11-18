# Changelog

## [Unreleased]

### Added

- Image generation with ComfyUI on Intel XPU: `image:download:*`, `image:start`, `image`, plus `image:test` for timed fantasy prompts (one image tested on the server).
- `AGENTS.md` describing the project for agents.
- Manuals per task in `content/{text,code,image,3d}_generation` and `content/text_to_speech` (INSTALL, TEST, USAGE).
- Hunyuan3D 2.1 image-to-3D service (`3d:download`, `3d:start`), tested for shape generation, and Qwen3-TTS speech through llama.cpp (`switch:tts`, `tts`), untested on the server.
- `bun run pi` writes the Pi coding agent provider for the served model.

### Changed

- Tested Qwen3.8-27B-pi on the B60, renamed its coding command to include `27b`, and recorded its JavaScript and context results.
- Compared three installed coding models on complex JavaScript and repository-context tasks, and recorded the results and limitations.
- Renamed coding switch commands to `switch:coding:<backend>-<model>`, added commands for both installed Strata models and the downloaded Qwen Q4_K_XL and Tiel-Coder models, and set larger context defaults based on B60 results where available.
- Tested Strata's Qwen3.8-Flash-Next IQ2_XS on the B60 and recorded the first speed and basic quality results.
- Documentation moved from `pages/` to `content/`; generated config files are written to `data/`.

## 1.0.0 - 2026-10-18

- chore(release): add changelog and release scripts
- feat(quality): add long-context and hard tasks, 131K presets, and recommendations
- docs: merge setup and model guides, drop archive and per-script READMEs
- feat(scripts): add switch presets, quality harness, and run log
- feat(scripts): add model delete, per-service VS Code providers, and new model results
- docs: add Tiel-Coder 35B-A3B UD-Q4_K_XL MTP speed test entry
- feat(scripts): add switch:qwen38-27b-intel-tuned script for Intel Arc tuned Qwen3.8-27B model
- Fix link to private model log
- Restructure docs into pages/ and replace model/bench scripts with switch/test
- docs: fix stale speed-test result link anchors
- docs: restructure speed test results and add Strata benchmark data
- docs: link the experimental Strata service from the main server guides
- docs: add Strata server setup and VS Code IDE config guides
- Add RAM sampling to model speed tests
- Add B60 model workflow and update guides
- Update cookbook documentation across all guides and speed test results
- docs: update
- docs: update
- Configure Qwen3.8 IQ3_M as active B60 model
- Document Unsloth Qwen3.8 B60 setup
- Organize Intel Arc B60 setup and model guides
- Add Intel Arc B60 local LLM cookbook

