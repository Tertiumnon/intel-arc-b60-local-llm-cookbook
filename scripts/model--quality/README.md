# Model Quality

Checks answer quality on the model served at `AI_API_URL`. Tasks are in
[tasks.json](./tasks.json): JavaScript and TypeScript-style function tasks with
unit-test assertions, and Conventional Commits message tasks with a format check.

```bash
bun run quality                                  # low, medium, high reasoning
bun run quality -- --efforts=medium,high
bun run quality -- --max-tokens=8192
```

## What a run does

For each task and each reasoning level, the script sends the prompt with
`reasoning_effort` set and records:

- **pass / fail** — code tasks run the reply's first code block with the task's
  tests in Bun; commit tasks check the subject line against the Conventional Commits pattern.
- **finish** — `stop` means the model ended. `length` means it hit `--max-tokens`.
- **loop** — `length`, or a line repeated 8 times in the reply or reasoning.
- **tokens, reasoning characters, seconds** per task.

Sampling and context are whatever the server is set to. Strata uses its config
file; llama.cpp uses its unit file. The script does not change them, so each
result must be recorded with the server settings in effect.

Each test is saved as one line in `test-results/runs.jsonl`, with the endpoint,
model, server context, max tokens, and reasoning level. The speed test writes its
runs to the same file. The reply texts are not saved.

## Adding tasks

Add an entry to `tasks.json`:

- `kind: "code"`: `prompt` asks for one code block; `tests` is JavaScript
  appended to the reply's code. Throw on failure.
- `kind: "commit"`: `prompt` asks for only the message; `pattern` is a regex
  for the first line.
