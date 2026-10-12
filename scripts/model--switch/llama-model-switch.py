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
SERVICES = {"llama": "llama-cpp.service", "strata": "strata.service", "openvino": "openvino-model-server.service"}
REPO = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]*/[A-Za-z0-9][A-Za-z0-9._-]*\Z")
TAG = re.compile(r"(?:swift-|coder-)?(?:q2_0|iq2_xs|iq3_xxs|iq3_s|iq1_m)\Z")


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
    command, count = re.subn(r"(?<!\S)-p[ \t]+\d+:8000", "-p 8080:8000", command)
    if count != 1:
        raise ValueError("expected one Docker port mapping in llama-cpp.service")
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
            with urlopen("http://127.0.0.1:8080/health", timeout=5) as response:
                if json.load(response).get("status") != "ok":
                    raise ValueError("health endpoint did not return ok")
            with urlopen("http://127.0.0.1:8080/v1/models", timeout=5) as response:
                ids = [item.get("id") for item in json.load(response).get("data", [])]
            if f"/models/{model}" in ids:
                return
        except (OSError, ValueError):
            pass
        time.sleep(5)
    raise TimeoutError(f"model {model} did not become ready in {seconds}s")


def main(args: list[str]) -> None:
    if len(args) != 4:
        raise ValueError("usage: llama-model-switch MODEL.gguf CONTEXT_TOKENS MTP(0|1) PROJECTOR.gguf|-")
    model, context_arg, mtp_arg, projector_arg = args
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


def unit_state(action: str, unit: str) -> bool:
    return subprocess.run(("systemctl", action, unit), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0


def install_unit(unit: Path, content: str) -> None:
    temp = unit.with_name(f"{unit.stem}-new-{os.getpid()}.service")
    try:
        temp.write_text(content)
        temp.chmod(0o644)
        subprocess.run(("systemd-analyze", "verify", str(temp)), check=True)
        os.replace(temp, unit)
        service("daemon-reload")
    finally:
        temp.unlink(missing_ok=True)


def wait_service(kind: str, model_id: str, seconds: int) -> str:
    port, version = 8080, "v1" if kind == "strata" else "v3"
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if not unit_state("is-active", SERVICES[kind]):
            raise RuntimeError(f"{SERVICES[kind]} stopped during startup")
        try:
            with urlopen(f"http://127.0.0.1:{port}/{version}/models", timeout=5) as response:
                ids = [item.get("id") for item in json.load(response).get("data", [])]
            if model_id in ids:
                if kind == "openvino":
                    return model_id
                with urlopen(f"http://127.0.0.1:{port}/health", timeout=5) as response:
                    health = json.load(response)
                if health.get("status") == "ok" and health.get("loaded"):
                    return model_id
        except (OSError, ValueError):
            pass
        time.sleep(5)
    raise TimeoutError(f"{kind} model {model_id} did not become ready in {seconds}s")


def select(kind: str, args: list[str]) -> None:
    if kind not in SERVICES:
        raise ValueError("service must be llama, strata, or openvino")
    unit = Path("/etc/systemd/system") / SERVICES[kind]
    before = unit.read_text()
    updated = before
    model_id = ""
    context = 0
    if kind == "llama":
        if len(args) != 4:
            raise ValueError("llama requires MODEL.gguf CONTEXT MTP PROJECTOR")
        model, context_arg, mtp_arg, projector_arg = args
        if not NAME.fullmatch(model) or (projector_arg != "-" and not NAME.fullmatch(projector_arg)):
            raise ValueError("invalid GGUF basename")
        if not 512 <= int(context_arg) <= 262144 or mtp_arg not in ("0", "1"):
            raise ValueError("invalid context or MTP setting")
        for name in (model, None if projector_arg == "-" else projector_arg):
            if name and not (MODELS / name).is_file():
                raise FileNotFoundError(MODELS / name)
    elif kind == "strata":
        if len(args) != 1 or not TAG.fullmatch(args[0]):
            raise ValueError("strata requires an installed family-quant tag, e.g. coder-iq1_m")
        tag = args[0]
        runner = Path("/models/Strata") / f"run-{tag}.sh"
        config = Path("/models/Strata") / f"strata-{tag}.json"
        if not runner.is_file() or not os.access(runner, os.X_OK):
            raise FileNotFoundError(runner)
        settings = json.loads(config.read_text())
        model_id = settings["model_name"]
        arglist = settings["args"]
        context = int(arglist[arglist.index("--max-context") + 1])
        updated, count = re.subn(r"(?m)^ExecStart=/models/Strata/run-[a-z0-9_-]+\.sh$", f"ExecStart={runner}", before)
        if count != 1:
            raise ValueError("strata.service has no runner ExecStart")
    else:
        if len(args) != 1 or not args[0].startswith("OpenVINO/") or not REPO.fullmatch(args[0]):
            raise ValueError("openvino requires an OpenVINO/REPO Hugging Face model")
        model_id = args[0]
        updated, count = re.subn(r"(?<!\S)--source_model[ \t]+[A-Za-z0-9._/-]+", f"--source_model {model_id}", before)
        if count != 1:
            raise ValueError("openvino-model-server.service has no source_model")
        updated, count = re.subn(r"(?<!\S)-p[ \t]+\d+:8000", "-p 8080:8000", updated)
        if count != 1:
            raise ValueError("openvino-model-server.service has no Docker port mapping")

    active = {name: unit_state("is-active", name) for name in SERVICES.values()}
    enabled = {name: unit_state("is-enabled", name) for name in SERVICES.values()}
    target = SERVICES[kind]
    try:
        if updated != before:
            install_unit(unit, updated)
        for name in SERVICES.values():
            if name != target:
                service("disable", "--now", name)
        service("enable", target)
        if kind == "llama":
            main(args)
        else:
            if updated != before or not active[target]:
                service("restart", target)
            wait_service(kind, model_id, 600 if kind == "strata" else 1800)
            print(f"MODEL_ID={model_id}", flush=True)
            if context:
                print(f"CONTEXT={context}", flush=True)
    except Exception:
        service("disable", "--now", target)
        if updated != before:
            install_unit(unit, before)
        for name in SERVICES.values():
            if enabled[name]:
                service("enable", name)
            if active[name]:
                service("start", name)
        print("Service switch failed; restored previous units", file=sys.stderr, flush=True)
        raise


if __name__ == "__main__":
    if sys.argv[1:3] == ["--service", "llama"]:
        select("llama", sys.argv[3:])
    elif len(sys.argv) >= 3 and sys.argv[1] == "--service":
        select(sys.argv[2], sys.argv[3:])
    else:
        select("llama", sys.argv[1:])
