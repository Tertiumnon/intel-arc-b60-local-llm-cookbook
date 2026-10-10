#!/usr/bin/env python3
"""Narrow root helper for the B60 model switch command."""

import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
from urllib.request import urlopen


UNIT = Path("/etc/systemd/system/llama-cpp.service")
MODELS = Path("/models/gguf")
NAME = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]*\.gguf\Z")


def replace_unit(unit: str, model: str, context: int, mtp: bool, projector: str | None) -> str:
    match = re.search(r"(?m)^ExecStart=(?:[^\n]*\\\n)*[^\n]*", unit)
    if not match:
        raise ValueError("llama-cpp.service has no ExecStart")
    command = match.group()
    for pattern in (r"(?<!\S)-m[ \t]+/models/[^\s\\]+", r"(?<!\S)--ctx-size[ \t]+\d+"):
        if len(re.findall(pattern, command)) != 1:
            raise ValueError(f"expected one {pattern} in ExecStart")
    command = re.sub(r"(?<!\S)-m[ \t]+/models/[^\s\\]+", f"-m /models/{model}", command)
    command = re.sub(r"(?<!\S)--ctx-size[ \t]+\d+", f"--ctx-size {context}", command)
    for flag in ("--spec-type", "--spec-draft-n-max", "--mmproj"):
        command = re.sub(rf"[ \t]+{flag}[ \t]+[^\s\\]+", "", command)
    if command.count("--jinja") != 1:
        raise ValueError("expected one --jinja in ExecStart")
    extras = []
    if mtp:
        extras.extend(("--spec-type draft-mtp", "--spec-draft-n-max 1"))
    if projector:
        extras.append(f"--mmproj /models/{projector}")
    command = command.replace("--jinja", " ".join((*extras, "--jinja")), 1)
    return unit[: match.start()] + command + unit[match.end() :]


def service(*args: str) -> None:
    subprocess.run(("systemctl", *args), check=True)


def wait_ready(model: str, seconds: int = 360) -> None:
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        try:
            with urlopen("http://127.0.0.1:8001/health", timeout=5) as response:
                if json.load(response).get("status") != "ok":
                    raise ValueError("health endpoint did not return ok")
            with urlopen("http://127.0.0.1:8001/v1/models", timeout=5) as response:
                ids = [item.get("id") for item in json.load(response).get("data", [])]
            if f"/models/{model}" in ids:
                return
        except (OSError, ValueError):
            pass
        time.sleep(5)
    raise TimeoutError(f"model {model} did not become ready in {seconds}s")


def main() -> None:
    if len(sys.argv) != 5:
        raise ValueError("usage: llama-model-switch MODEL.gguf CONTEXT_TOKENS MTP(0|1) PROJECTOR.gguf|-")
    model, context_arg, mtp_arg, projector_arg = sys.argv[1:]
    if not NAME.fullmatch(model) or (projector_arg != "-" and not NAME.fullmatch(projector_arg)):
        raise ValueError("model and projector must be GGUF basenames")
    context = int(context_arg)
    if not 512 <= context <= 262144 or mtp_arg not in ("0", "1"):
        raise ValueError("invalid context or MTP setting")
    projector = None if projector_arg == "-" else projector_arg
    for name in (model, projector):
        if name and not (MODELS / name).is_file():
            raise FileNotFoundError(MODELS / name)

    before = UNIT.read_text()
    previous = re.search(r"(?<!\S)-m[ \t]+/models/([^\s\\]+)", before)
    if not previous:
        raise ValueError("previous model path not found")
    updated = replace_unit(before, model, context, mtp_arg == "1", projector)
    if updated == before:
        try:
            wait_ready(model, 5)
            print(f"Already active: /models/{model} (context {context})", flush=True)
            return
        except TimeoutError:
            pass
    backup = UNIT.with_name(f"{UNIT.name}.before-model-switch-{time.strftime('%Y%m%d-%H%M%S')}")
    shutil.copy2(UNIT, backup)
    temp = UNIT.with_name(f"llama-cpp-new-{os.getpid()}.service")
    try:
        temp.write_text(updated)
        temp.chmod(0o644)
        subprocess.run(("systemd-analyze", "verify", str(temp)), check=True)
        os.replace(temp, UNIT)
        service("daemon-reload")
        service("restart", "llama-cpp.service")
        print(f"Waiting for /models/{model}...", flush=True)
        wait_ready(model)
        print(f"Ready: /models/{model} (context {context})", flush=True)
    except Exception:
        if temp.exists():
            temp.unlink()
        shutil.copy2(backup, UNIT)
        service("daemon-reload")
        service("restart", "llama-cpp.service")
        print(f"Switch failed; restored /models/{previous.group(1)}", file=sys.stderr, flush=True)
        raise


if __name__ == "__main__":
    main()
