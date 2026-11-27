# Changelog

## [Unreleased]

### Fixed

- Corrected and strengthened local-model quality tasks, isolated generated code on the AI server, supplied long-context fixtures, and distinguished truncated responses and server errors from failed answers.

- Stop remote memory-monitor loops after a speed test disconnects.

### Added

- Added repeatable 49K, 57K, and 64K all-model complex-quality comparisons with recorded sampling settings and long-input targets.

- Added selectable 32K, 49K, 57K, and 64K contexts for coding models, including Strata, arc-lab, and no-MTP variants; new combinations are untested unless otherwise recorded.
- Experimental arc-lab service for Qwen3.8-27B with a patched Vulkan engine and DFlash2.
- llama preset `qwen38-pi-arc-tuned` (plus `:ctx49k` and `:no-mtp`) for the Greatjedi Qwen3.8-27B-pi Intel Arc tuned MTP Q4_K GGUF.
- Added a TRELLIS.2 model download command; its 3D workflow is not yet integrated or tested on the B60.
- Configured Pi on the AI server for the current local Strata Coder model.
- Image generation with ComfyUI on Intel XPU: `image:download:*`, `image:start`, `image`, plus `image:test` for timed fantasy prompts (one image tested on the server).
- `AGENTS.md` describing the project for agents.
- Manuals per task in `content/{text,code,image,3d}_generation` and `content/text_to_speech` (INSTALL, TEST, USAGE).
- Hunyuan3D 2.1 image-to-3D service (`3d:download`, `3d:start`), tested for shape generation, and Qwen3-TTS speech through llama.cpp (`switch:tts`, `tts`), untested on the server.
- `bun run pi` writes the Pi coding agent provider for the served model.

### Changed

- Publish the latest completed complex-model comparison and its best completed result in `content/results.md`.

- Recorded the partial Dirk 57K quality run and consolidated recommendations across local tests.
- Recorded the latest Signal Terse Coder 57K quality run and its unsupported `high` reasoning requests.
- Replaced the coding command list with `bun run switch:coding`, which selects the model, approach, and context interactively.
- Recorded arc-llm-lab speed and manual coding-quality observations, including 54.5K-input tasks, and updated the coding recommendation.
- The smallest coding-model context is now 49,152 tokens: `:ctx32k` presets became `:ctx49k` (duplicates of existing `:ctx49k` presets were removed).
- Tested the Greatjedi Qwen3.8-27B-pi Arc-tuned Q4_K quality tasks on the B60 (basic and complex at low and medium; the high pass and long tasks returned empty server responses and need a rerun) and recorded the results.
- `content/results.md` now opens with cross-model comparison tables (basic 10, complex 5, long context) and the Qwen3.8-27B retest and Strata IQ2_XS sections use tables instead of prose.
- Compared four models on two project tasks and a 45K-input check; selected Strata Flash-Next Coder as the Kyra and Pi default at the user's request.
- `bun run pi` now updates Pi's default model as well as its provider configuration.
- Download the Hunyuan3D paint configuration files alongside its weights, and record the current Intel paint-loader failures.
- Tested Qwen3.8-27B-pi on the B60, renamed its coding command to include `27b`, and recorded its JavaScript and context results.
- Compared three installed coding models on complex JavaScript and repository-context tasks, and recorded the results and limitations.
- Added both installed Strata models and the downloaded Qwen Q4_K_XL and Tiel-Coder models to coding switches, with larger context defaults based on B60 results where available.
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

