# Intel Arc B60 Server Usage

The Ubuntu host runs one inference service at a time. **llama.cpp** is enabled
on port `8001`; **OpenVINO Model Server** is installed but disabled on port
`8000`. Both systemd units and their model files are kept. For first-time
backend setup, see [Server Setup](./Intel-Arc-B60-Server-Setup.md).

Run the following on the Ubuntu server. Keep its SSH host and user in your
local `.env` (see [.env.example](./.env.example)).

## Download a GGUF

Find the exact file name in its Hugging Face repository, then set these two
values. This example downloads the current Signal + Terse-Coder build; replace
both values for another model.

```bash
repo=mradermacher/Signal-3.8-27B-Terse-Coder-i1-GGUF
file=Signal-3.8-27B-Terse-Coder.i1-Q4_K_M.gguf
df -h /models
cd /models/gguf
curl -fL --retry 5 -C - -o "$file" \
  "https://huggingface.co/$repo/resolve/main/$file"
```

Compare `sha256sum "$file"` with the file's SHA-256 on Hugging Face before
switching the service. Keep the previous GGUF until the replacement works.

## Select and restart

```bash
sudoedit /etc/systemd/system/llama-cpp.service
# Change -m /models/<file>.gguf and --ctx-size for the new model.
sudo systemd-analyze verify /etc/systemd/system/llama-cpp.service
sudo systemctl daemon-reload
sudo systemctl restart llama-cpp.service
```

The host path `/models/gguf/<file>.gguf` becomes `/models/<file>.gguf` inside
the container. Remove `--spec-type draft-mtp --spec-draft-n-max 1` if the new
GGUF lacks an MTP head. Remove an old `--mmproj` path; add the new model's
matching projector only when using images. Choose context and client limits
from the [Models Guide](./Intel-Arc-B60-Models.md#recommended-b60-input-and-output-limits).

```bash
systemctl status llama-cpp.service --no-pager
curl -f http://localhost:8001/health
curl -s http://localhost:8001/v1/models
```

Large models can return HTTP 503 while loading. If startup fails, inspect
`sudo journalctl -u llama-cpp.service -n 100 --no-pager`. Copy the exact model
ID from `/v1/models` into your [client settings](./Intel-Arc-B60-Clients.md).

## Service state

```bash
systemctl is-enabled llama-cpp.service openvino-model-server.service
systemctl is-active llama-cpp.service openvino-model-server.service
```

The expected state is `enabled / disabled` and `active / inactive`, in that
order. To keep OVMS off while using llama.cpp:

```bash
sudo systemctl disable --now openvino-model-server.service
sudo systemctl enable --now llama-cpp.service
```

The preserved [OpenVINO service](./Intel-Arc-B60-OpenVINO.md) is for historical
reference. Use the SYCL API on port `8001` for current model work.
