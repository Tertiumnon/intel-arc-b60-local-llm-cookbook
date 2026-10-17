# Recommendations

A dated history. Add a new entry at the top when a decision changes. Data is in
[results.md](./results.md); model details are in [models.md](./models.md).

## October 17, 2026

**Keep Strata IQ1_M as the default. Use Qwen3.8 UD-Q4_K_M for hard algorithmic tasks with short prompts.**

- Qwen3.8 UD-Q4_K_M loads and runs at 131K context on the B60 (`bun run switch:qwen38-27b-unsloth`).
- It passed 5/5 hard tasks, including the TTL cache that Strata failed in all 5 runs. Strata passed 4/5.
- It is about twice as slow on short tasks and about five times slower on a 27K prompt (174–212 s vs about 39 s).
- Both models failed the long discount task the same way (used a constant without defining it).
- Evidence is one run per task. Repeat the TTL cache task before treating it as a proven quant effect.
- Qwen medium reasoning was not measured: the first request timed out at about 5 minutes.

Details: [Hard tasks in results.md](./results.md#hard-tasks-strata-iq1_m-vs-qwen38-ud-q4_k_m).

## October 16, 2026

**Use Strata Coder IQ1_M with low reasoning, 131K context.**

| Setting | Value |
|---|---|
| Model | Strata Qwen3.8-Flash-Next Coder IQ1_M (`bun run switch:strata`) |
| Reasoning | low (server default); medium is fine; avoid high on long prompts |
| Server context | 131,072 |
| VS Code limits | 110,000 input, 8,192 output |
| Backup | Signal Q4_K_M, 32K context (`bun run switch:terse:ctx32k`), for short prompts only |

Why:
- Accuracy did not change from 27K to 110K prompt tokens (10/12 at each size).
- Strata handled a 110K prompt in about 2 minutes. Signal took about 290 s at 55K and timed out.
- Low reasoning passed everything the higher levels passed, in about a third of the time.
- High reasoning failed both 60K long tasks (used constants it never defined).

Not settled:
- IQ1_M is the most compressed quant. Both models struggled on the harder TTL-cache task, so
  large refactors may need a higher-bit model. Untested.
- Few tasks and few repeats. A gap of 1–2 tasks is not meaningful.
- Reasoning level may be ignored by llama.cpp, so the Signal rows say nothing about it.

Rejected:
- Greatjedi Intel Arc tuned IQ3_S: fast, but too weak on simple tasks (failed conventional commits).
- A3B models (Tiel-Coder, Qwen3.6-35B-A3B): fast, kept in a separate section of the models guide
  because they were judged not smart enough.

Next test: one higher-bit model (Qwen3.8 UD-Q4_K_M, about 16 GB download) on the same hard tasks.
