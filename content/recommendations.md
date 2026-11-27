# Recommendations

A dated history. Add a new entry at the top when a decision changes. Data is in
[results.md](./results.md); model details are in [models.md](./models.md).

## November 27, 2026

**Keep Signal Terse Coder at 57K as an option, with checks on generated code.** Its latest run passed 16/17 supplied checks at both low and medium reasoning, including both approximately 54.5K-input tasks. Long tasks took about 288–292 seconds, and the TTL cache had an expiry error even in the low-reasoning answer that passed its supplied checks. The server rejected `high`; use `low` or `medium` for this model, and treat `xhigh` as untested. These single runs do not change the chosen Strata default. [Results](./results.md#signal-terse-coder-at-57k-november-27-2026).

## November 26, 2026

**Keep Strata Flash-Next Coder IQ1_M as the chosen default; try arc-llm-lab Qwen3.8 for a faster long-input alternative when 64K context is enough.** On one identical 30K-token prompt it took 89 s versus 169 s for the existing Qwen SYCL configuration. A 54.5K-input shipping task produced a seemingly correct standalone answer in 211 s, while the pricing answer omitted a required definition. Manual review of five complex answers found the TTL cache failed and a path-parser edge case; these are not automated scores. The full 64K limit, agent workflows, and repeat reliability remain unverified. Use `bun run switch --service=arc-lab`; switch back with an existing `switch:*` command. [Results and test conditions](./results.md#arc-llm-lab-qwen38-dflash2-november-26-2026).

## November 20, 2026

**Use Strata Flash-Next Coder IQ1_M as the coding default for Kyra and Pi**, per the user's choice. In the small comparison below, Strata, Signal and base Qwen passed both project tasks and the 45K-input rule-retrieval check, with different code-review tradeoffs. This is a single-run comparison, not proof of general superiority. The models share one endpoint, so an image or 3D job can switch the served model. Restore Strata with `bun run switch --service=strata --model=coder:IQ1_M` and `bun run pi`. Details: [results](./results.md#pi-agent-comparison-november-20-2026).

## November 18, 2026

**Keep Strata Flash-Next Coder IQ1_M for everyday complex JavaScript work.** In one matched run it passed 5/5 existing complex-task checks and both 27K-input context checks, and the context requests took 40–52 seconds. Qwen3.8-27B-pi also passed 5/5 complex and both context checks, but failed three added edge cases and took about 146–148 seconds per context request. The base Qwen3.8-27B passed 4/5 complex and both context checks, taking about three minutes per context request; Flash-Next IQ2_XS passed 3/5 complex and both context checks.

All three made mistakes in additional checks or requirement review, including Coder's cache violating strict worst-case O(1) and its path parser mishandling hyphenated keys. The small single-run comparison does not establish a universal quality ranking. See [results](./results.md#complex-javascript-comparison-november-18-2026) for the exact checks and the context-test fixture caveat.

## October 17, 2026 (update: Q4_K_XL)

**Keep Strata IQ1_M as the default. Qwen3.8 UD-Q4_K_XL at 64K context is the candidate for hard tasks, pending a repeat.**

- Qwen3.8 UD-Q4_K_XL at 64K context ran every basic and complex task without a crash. Basic: 10/10. Complex: 5/5, with the TTL cache passing at low reasoning, which Strata never did.
- At 131K context the same model crashed during the basic tasks, so do not use 131K for it. The 131K default in the presets is untested for this model.
- Long 15K: 1/2. The shipping task failed; not yet diagnosed.
- Evidence is one run per task. Repeat the TTL cache and the shipping task before choosing it.

Details: [Qwen3.8 Q4_K_XL in results.md](./results.md#qwen38-ud-q4_k_xl-at-64k-and-131k).

## October 17, 2026

**Keep Strata IQ1_M as the default. Use Qwen3.8 UD-Q4_K_M for hard algorithmic tasks with short prompts.**

- Qwen3.8 UD-Q4_K_M loads and runs at 131K context on the B60 (`bun run switch --preset=qwen38-27b-unsloth`).
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
| Model | Strata Qwen3.8-Flash-Next Coder IQ1_M (`bun run switch --service=strata --model=coder:IQ1_M`) |
| Reasoning | low (server default); medium is fine; avoid high on long prompts |
| Server context | 131,072 |
| VS Code limits | 110,000 input, 8,192 output |
| Backup | Signal Q4_K_M, 49K context (`bun run switch --preset=terse:ctx49k`), for short prompts only |

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
