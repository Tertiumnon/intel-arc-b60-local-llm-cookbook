# Pi setup

Run `bun run pi` after switching to a language model. The command reads `AI_API_URL` and
`AI_API_KEY` from the environment, fetches the served model and its context, and writes Pi's
`models.json` and default model selection in `settings.json`. Other settings, including the
thinking level, are preserved. Existing files are copied to `.previous` before replacement.
