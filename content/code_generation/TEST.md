# Code generation: test

## 1. Switch and check

```bash
bun run switch:coding:strata-qwen38-flash-next-coder-iq1m
bun run list                    # expect qwen3.8-flash-next-coder-iq1_m, n_ctx 131072
```

## 2. Speed

```bash
bun run test                    # first-token time, tokens/s, RAM
```

Reference: Strata handled a 110K-token prompt in about 2 minutes ([results.md](../results.md)).

## 3. Quality

```bash
bun run quality                 # JS/TS and commit-message tasks, low/medium/high reasoning
```

Tasks are in [scripts/model--quality/tasks.json](../../scripts/model--quality/tasks.json); each has an
automatic check. Compare with the table in [recommendations.md](../recommendations.md) (Strata
4/5 on hard tasks, Qwen3.8 UD-Q4_K_M 5/5). One run per task is weak evidence; repeat before deciding.

## 4. Client check

1. Pi: `bun run pi`, then `pi --provider arc-b60 -p "Reply with the single word: ok"`.
2. VS Code: pick the `Arc B60 (strata)` model in Chat and ask for a small function.

If VS Code says "Sorry, no response was returned", reduce `maxInputTokens`, then check the server log
(see Troubleshooting in [clients.md](../clients.md)).

## Pass criteria

- `bun run quality` passes the tasks listed as passing for this model in [results.md](../results.md).
- A 30K-token prompt returns in under 2 minutes.
