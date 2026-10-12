# Intel Arc B60 on Windows with LM Studio (Single & Dual GPU)

## Overview
This guide covers running LLMs on one or two Intel Arc Pro B60 cards under **Windows**
with **LM Studio** (Vulkan llama.cpp runtime). It is the desktop alternative to the
Ubuntu server options in the [Server Setup Guide](./Intel-Arc-B60-Server-Setup.md).

> **Source:** community report from u/AmericanRiskCouncil,
> [Dual Intel Arc B60 & LM Studio - Best Drivers & Settings](https://www.reddit.com/r/IntelArc/comments/1veyi1z/dual_intel_arc_b60_lm_studio_best_drivers_settings/)
> (r/IntelArc, i9-14900K, 2× B60). These are one user's tested results, not Intel
> guidance. Driver behaviour on B60 changes between releases, so re-check after updates.

## Drivers
Driver choice matters more than anything else on this setup. Many odd LM Studio errors
come from a mismatched driver/runtime pair.

| Component | Recommended | Notes |
|---|---|---|
| GPU driver | **Pro driver 8805**, *GPU driver only* | Requires a **Clean Installation**. Works on both GPUs in a dual setup. |
| GPU driver (fallback) | Pro driver 6862 | Reliable fallback if 8805 still gives errors. |
| oneAPI Level Zero SDK | 1.21.10 | The version bundled with driver 6862. |

Match the LM Studio runtime to the driver:

| LM Studio runtime | Intel driver |
|---|---|
| Vulkan llama.cpp (Windows) **v2.28.2** | 8805 (best) |
| Vulkan llama.cpp (Windows) v2.27.2 | 8517 (required) |

After any driver change, do a clean install and re-select the runtime in LM Studio.

## Full VRAM in LM Studio
With a single B60 on Windows, LM Studio may show **less than the full 24 GB** of VRAM.

- **Root cause:** a setting in **Intel Graphics Software** reserves part of the card's
  memory. Changing that setting frees the full VRAM.
- **Not the cause on its own:** having no iGPU. The issue first showed up on an
  i9-14900KF, which has no integrated graphics, so the B60 also drives the display.
  Moving to a 14900K (with iGPU) did **not** free the VRAM by itself.
- Driving your monitors from the iGPU still helps, because it keeps desktop memory use
  off the B60s.

> The exact setting appears only as a screenshot in the source post and isn't
> reproduced here. Check the post's "Before / After Change" images.

## LM Studio Settings
Tested with **Qwen 3.6 35B-A3B**. These are a good starting point for MoE models of
similar size.

| Setting | Value |
|---|---|
| Runtime | Vulkan llama.cpp (Windows), matched to driver (see above) |
| Context length | 111,000 |
| GPU offload | 100% |
| CPU thread pool size | 100% (16 on i9-14900K) |
| Evaluation batch size | 2048 |
| Physical batch size | 512 |
| Max concurrent predictions | 8 |
| Unified KV cache | On |
| Context checkpoints | 32 |
| Number of experts | 10 |
| Speculative decoding | **Off** |
| Enable thinking | On |
| Temperature | 0.6 |

The same values map onto llama.cpp server flags (`--ctx-size 111000`, `--batch-size 2048`,
`--ubatch-size 512`, `--parallel 8`, `--kv-unified`, `--temp 0.6`). See the
[llama.cpp Setup Guide](./Intel-Arc-B60-llama.cpp-Setup.md).

## Intel Graphics Software Tuning
- **Overclocking:** possible, but only with strong airflow. The source system runs two
  extra fans directly below the cards. Intel Graphics Software **under-reports
  temperatures**, so an overclock that looks safe can still crash. Back it off if you
  see crashes under sustained load.
- **Minor speed boost:** one Intel Graphics Software toggle gives a small but repeatable
  gain when set to **On**. **On + Boost** performs *worse* than Off, so don't use it.

> The specific overclock values and the toggle's name are screenshots in the source
> post and aren't reproduced here.

## Expected Performance

The community report's single- and dual-B60 throughput measurements are in the
[Speed Test Results](./Intel-Arc-B60-Speed-Test-Results.md#community-windows-lm-studio-results).
For the tested model, use dual B60 when you need the combined VRAM for a larger
model or context; the report found lower speed when splitting a one-card model.

## Troubleshooting
- **Random errors / crashes in LM Studio:** check that the runtime matches the driver
  (see tables above). Then do a **clean** reinstall of driver 8805, or fall back to 6862.
- **Dual GPU errors (e.g. `ErrorDeviceLost` mid-generation):** this is a known Vulkan
  issue on dual B60. Driver 8805 with a clean install was the stable combo in the source
  report. See also
  [unsloth#11453](https://github.com/unslothai/unsloth/issues/11453).
- **Crashes after overclocking:** temps are under-reported, so reduce the overclock or
  improve airflow.
- **Less VRAM than expected:** see [Full VRAM in LM Studio](#full-vram-in-lm-studio).

## Related Guides
- [Intel Arc B60 Server Setup Guide](./Intel-Arc-B60-Server-Setup.md): Ubuntu backend choices
- [Intel Arc B60 llama.cpp Setup Guide](./Intel-Arc-B60-llama.cpp-Setup.md)
- [Intel Arc B60 Models Guide](./Intel-Arc-B60-Models.md)
- [Intel Arc B60 Clients Guide](./Intel-Arc-B60-Clients.md)
