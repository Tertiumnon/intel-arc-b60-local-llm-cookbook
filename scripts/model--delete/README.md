# Model Delete

Removes model files from the remote server over SSH (`AI_SSH_HOST` in the root `.env`).
Nothing is deleted without `--yes`.

```bash
bun run delete                                  # list GGUF files and OpenVINO models
bun run delete -- --gguf=FILE.gguf              # dry run: show what would be removed
bun run delete -- --gguf=FILE.gguf --yes        # delete
bun run delete -- --openvino=DIR --yes          # delete an OpenVINO model directory
```

- A GGUF is hardlinked to a Hugging Face cache blob, so the script also removes the
  blob and the cache symlinks that point at it.
- A model named in a live `/etc/systemd/system/*.service` unit or a `strata-*.json`
  config is refused. Switch to another model first, then delete.
- Strata packs in `/models/Strata-data` and backup files are not handled here.
