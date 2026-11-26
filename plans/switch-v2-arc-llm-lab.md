# Plan: `switch:` v2 based on arc-llm-lab

Status: **EXPERIMENTAL — prepared, not started**. The current agent is still working on the existing
`switch:` approach; do not implement or run anything here until it is done.
Source repo: https://github.com/edagher92-coder/arc-llm-lab (MIT).

## What the repo does differently

The repo (Windows, one Arc Pro B60 24 GB) replaces a static server with three pieces:

1. **llama-swap** (third-party model manager, port 8090).
   - `llama-swap/config.yaml` declares models with a `cmd` to start them, a `proxy`
     port, a `ttl`, `apiKeys`, and `aliases`.
   - Models start on first request and unload after `globalTTL`/per-model `ttl`.
   - Use-case presets (`:code`, `:plan`, `:vision`) are `setParamsByID` sampling
     filters on the *same loaded model* — no reload to change sampling.
2. **Governor** (`governor/governor.ps1` + `launch.ps1` + `profiles.json`).
   - `launch.ps1` sizes context **at load time** from VRAM free right now minus a
     profile margin (MAX 1.35 / BALANCED 1.5 / LEAN 3.0 GiB), capped per variant
     (64K f16-KV default). Session protection: never comes back smaller than the
     largest live agent session.
   - `governor.ps1` is a 15 s sampling daemon: picks MAX/BALANCED/LEAN from idle
     time, RAM, CPU and other-VRAM usage; unloads on idle or pressure; prewarms
     when the PC is idle; never interrupts a running request.
3. **Tuned engine + model recipe** (the actual speed win):
   - llama.cpp b11524 Vulkan with the vendored Intel FA prefill patches
     (`engine/patches/`, `engine/build-linux.sh`); `GGML_VK_FORCE_MMVQ=1`.
   - Qwen3.8-27B UD-Q4_K_M + DFlash2 draft model (7 tokens/round): decode 16 → 53 tok/s.
   - f16 KV cache + Intel FA: prefill at 32K 118 → 420 tok/s.
   - `-ub 256`, q8 draft KV, `-fit off`, `--no-context-shift`, `--jinja`, `-np 1`,
     `--cache-reuse 256`, `--reasoning-budget 4096`.
   - Measured: 53 tok/s mean decode (47–58), 64K context on 24 GB, 97/100 agent eval.

## Current approach (for contrast)

- Static `llama-cpp.service` (Docker, port 8080) with a fixed context.
- `llama-model-switch.py` rewrites the unit's `ExecStart` (model, `--ctx-size`,
  MTP, `--mmproj`), backs up the unit, restarts, waits for health; one service
  owns 8080 at a time.
- Context is a fixed preset value; no dynamic sizing, no auto-unload, no
  use-case sampling presets.

## What to port to the Ubuntu server, what to skip

Port:
- The engine build (`engine/build-linux.sh` — note: the author has **not** run it
  on Linux; first thing to verify) and the full flag recipe.
- llama-swap as the service owning 8080 (it proxies to per-model ports; on the
  server it replaces `llama-cpp.service` in the `SERVICES` map).
- The governor's *launch-time context sizing* and per-variant VRAM budgets
  (`base_gib`, `kv_kib_per_token`, `ctx_max`) as a small bash/python launcher,
  reading free VRAM from the GPU instead of Windows performance counters
  (`/sys/class/drm`/`vulkaninfo`/`xpu-smi` — pick during implementation).
- `setParamsByID` use-case presets (`:code`, `:plan`, `:vision`) — cheap win,
  no reload.
- DFlash2 draft model download for Qwen3.8-27B (check the model's repo tree and
  license first; do not invent file names).

Skip / adapt:
- Windows-only governor parts: `Get-Counter` PDH sampling, `powercfg` power
  plans, Tailscale watchdog, idle-time detection. A headless server is either
  serving requests or idle; a simpler profile set (MAX + LEAN under memory
  pressure, idle-unload) is enough.
- The phone Studio / gateway, video gen, Claude bridge — out of scope for
  `switch:`.
- `--cache-reuse` is a no-op on Qwen3.8-27B (DeltaNet layers); keep the flag
  only if it helps other models.

## Phases (each independently testable on the server)

1. **Engine**: run `engine/build-linux.sh` on the server, confirm the two
   patches apply to b11524 and `glslc` supports `GL_KHR_cooperative_matrix` +
   `GL_EXT_integer_dot_product`. Bench stock vs patched prefill at 32K.
2. **Recipe**: serve Qwen3.8-27B UD-Q4_K_M + DFlash2 with the full flag set
   (f16 KV, `-ub 256`, q8 draft KV) in a throwaway unit; measure decode,
   prefill, and actual VRAM to fill in `base_gib`/`kv_kib_per_token` for the
   server (the repo's numbers are for the author's Windows machine).
3. **llama-swap**: install, put it behind 8080, add `qwen3.8-27b` (+ `:code`
   etc. filters) with the governor launcher as `cmd`. Verify
   `switch:`-style selection works through its API.
4. **Launcher**: replace the fixed context with load-time VRAM sizing and
   session protection; add idle-unload.
5. **Integrate with `switch:`**: new helper path (e.g.
   `scripts/model--switch/llama-swap-switch.py` or extend the existing helper
   with a `--v2` mode) so `bun run switch:*` keeps its current interface;
   update `presets.json` (context becomes a cap, not a fixed value),
   `content/` docs, and `CHANGELOG.md`.
6. **Rollback**: keep the old `llama-cpp.service` unit and helper until v2 is
   tested end-to-end; the unit backup/restore mechanism already in
   `llama-model-switch.py` is the pattern to reuse.

## Open questions

- Does llama-swap run on Linux (it is a .exe in the repo; check its upstream
  project for a Linux build) or do we run the launcher directly under systemd
  with a small on-demand wrapper?
- Per-model VRAM budget table: only Qwen3.8-27B is measured in the repo;
  every other preset model (Tiel-Coder, Signal, Swift, Strata) needs its own
  `base_gib`/`kv_kib_per_token` measured on the server before dynamic sizing.
- Strata and ComfyUI services stay on the existing unit-switching path; only
  the llama path moves to v2.
- `--spec-draft-p-min 0.5` (+4.6% in the repo) — include after the base recipe
  is verified.

## Do not do yet

- No changes to `scripts/model--switch/`, `package.json`, `content/`, or the
  server until the current agent finishes the previous approach.
- No `switch:*` runs against the server from this work.
