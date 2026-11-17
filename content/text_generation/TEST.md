# Text generation: test

Run after installing or switching a model.

## 1. Switch and check

```bash
bun run switch:qwen38-27b-unsloth:ctx49k
```

The switch downloads a missing model, restarts the service, waits for `/health`, and sends one
short request. It stops with an error if any step fails and restores the previous unit.

## 2. See what is served

```bash
bun run list                   # model IDs from /v1/models
curl -s http://<server>:8080/health
```

The ID shown must match the one in your client. `meta.n_ctx` in `/v1/models` is the loaded context.

## 3. Speed

```bash
bun run test                   # 3 timed runs: first-token time, tokens/s, server RAM
bun run test -- --no-reasoning
```

Results go to `test-results/` (git-ignored). Published numbers are in [results.md](../results.md).

## 4. Quality (optional)

```bash
bun run quality                # JS/TS and commit-message tasks with automatic checks
```

For chat quality, send the same three prompts to each model (a factual question, a rewrite, and
a long-context question) and compare answers and latency. Treat a gap of 1-2 tasks as noise.

## Pass criteria

- `bun run switch:*` finishes with "Health and response checks passed".
- `bun run list` shows the expected ID and context.
- `bun run test` completes 3 runs without timeouts.

HTTP 503 `Loading model` is normal while the GGUF loads; wait for `/health` to return 200.
