# Recommendations

Use `bun run switch:coding` to choose the model, approach, and context. **Keep Strata Flash-Next Coder IQ1_M as the default for Kyra and Pi**, as previously chosen. The results below are small local samples, often one run per task; different contexts, prompts, output caps, and checkers make the numbers directional rather than a ranking. The earlier quality scores use different checks and settings; a standardized long-context sweep has not yet established the best model. See [results.md](./results.md) for settings, failures, and the full history.

| Use | Model and approach | Evidence and tradeoff |
|---|---|---|
| Default; large context | **Strata Flash-Next Coder IQ1_M**, 131K | 5/5 complex checks in one run and both 27K-input checks in 40–52 s. A 45K rule task took 71 s, but one Pi project took 823 s. Cache and path edge cases failed review. |
| Shorter coding tasks; fallback | **Signal Terse Coder**, llama.cpp, 57K | Latest low and medium runs each passed 16/17 checks; ~54.5K-input tasks took 287–292 s. The cache has an expiry edge case, and the template rejects `high`. |
| Hard short tasks; second opinion | **Qwen3.8-27B UD-Q4_K_XL**, llama.cpp, 64K | One run passed 10/10 basic and 5/5 complex checks, but only 1/2 long checks; the server stopped at 131K. Repeat before relying on the cache result. |
| Faster Qwen prefill experiment | **Qwen3.8-27B UD-Q4_K_M**, arc-lab, 64K | One identical 30K prompt took 89 s versus 169 s on the existing Qwen SYCL configuration. The corrected 57K complex rerun passed 3/5, failing cache expiry and a `toString` dependency; agent reliability remains untested. |
| Pi-focused alternative | **Qwen3.8-27B-pi**, llama.cpp, 64K | Passed 5/5 complex checks and both ~27K context checks in one run, but extra cache/parser/sort checks and a Pi concurrency check failed. |
| Current experiment | **Dirk Qwen3.8-27B UD-Q4_K_XL**, llama.cpp, 57K | Low passed 10/10 basic and 4/5 complex checks; the cache hit the cap. Two ~54.6K requests took 319–325 s and failed standalone checks with fixture caveats. Medium is incomplete; high was not run. [Details](./results.md#dirk-qwen38-27b-at-57k-november-27-2026). |

Other measured candidates: base Qwen3.8 UD-Q4_K_M passed 5/5 complex checks once and 4/5 in a later comparison; Strata Flash-Next IQ2_XS passed 3/5 despite fast short generation; Greatjedi's Arc-tuned Pi Q4_K passed 4/5, with long requests failing at the service boundary. Tiel-Coder measured 49.3 tok/s on one short prompt but lacks a local quality score. The smaller Greatjedi IQ3_S was rejected after failing a simple commit request. Qwen3.6, Qwen3.8 IQ3_M, and Swift have speed or load checks but insufficient comparable quality evidence for a recommendation.

Context includes input and output. A 57K allocation cannot reserve a full 4K output after a 54.5K input; the VS Code input limit is lower still. For coding evaluations use at least 49K allocated context, and check generated code, especially cache expiry and path parsing.
