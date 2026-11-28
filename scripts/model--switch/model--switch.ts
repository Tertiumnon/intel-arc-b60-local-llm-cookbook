#!/usr/bin/env bun
import { spawn } from "node:child_process";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dir, "../..");
const envFile = path.join(root, ".env");
const safeRepo = /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
const safeFile = /^[A-Za-z0-9][A-Za-z0-9._-]*\.gguf$/i;

function required(name: string): string {
  const value = Bun.env[name]?.trim();
  if (!value) throw new Error(`Set ${name} in the root .env`);
  return value;
}

function modelSpec(repoName: string, fileName: string) {
  const repo = required(repoName);
  const file = required(fileName);
  if (!safeRepo.test(repo) || !safeFile.test(file)) {
    throw new Error(`${repoName} must be owner/repo and ${fileName} must be a GGUF basename`);
  }
  return { repo, file, local: `${repo.split("/")[0]}__${file}` };
}

async function command(exe: string, args: string[], input?: string) {
  return new Promise<{ code: number; output: string }>((resolve, reject) => {
    const child = spawn(exe, args, { cwd: root, stdio: ["pipe", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      output += text;
      process.stdout.write(text);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      output += text;
      process.stderr.write(text);
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, output }));
    child.stdin.end(input);
  });
}

async function checked(exe: string, args: string[], input?: string) {
  const result = await command(exe, args, input);
  if (result.code !== 0) throw new Error(`${exe} failed with exit code ${result.code}`);
  return result.output;
}

const downloadScript = `set -euo pipefail
repo="$1"; file="$2"; owner="$3"
target="/models/gguf/\${owner}__\${file}"
if [ -s "$target" ]; then echo "Reusing $target"; exit 0; fi
if [ -e "$target" ]; then echo "Empty target: $target" >&2; exit 1; fi
source="$("$HOME/.local/bin/hf" download "$repo" "$file" --cache-dir /models/.hf-cache/hub --quiet)"
source="$(readlink -f "$source")"
test -s "$source"
ln "$source" "$target"
echo "Downloaded $target"
`;

function vscodePath(): string {
  if (Bun.env.VSCODE_MODELS_FILE) return Bun.env.VSCODE_MODELS_FILE;
  if (process.platform === "win32") return path.join(required("APPDATA"), "Code", "User", "chatLanguageModels.json");
  if (process.platform === "darwin") return path.join(homedir(), "Library", "Application Support", "Code", "User", "chatLanguageModels.json");
  return path.join(homedir(), ".config", "Code", "User", "chatLanguageModels.json");
}

type VsModel = Record<string, unknown> & { id?: string; url?: string };
type VsProvider = Record<string, unknown> & { models: VsModel[] };

async function updateVsCode(modelId: string, context: number, vision: boolean, service: string, url: string) {
  const file = vscodePath();
  let providers: VsProvider[];
  let original = "";
  try {
    original = await readFile(file, "utf8");
    providers = JSON.parse(original) as VsProvider[];
    if (!Array.isArray(providers)) throw new Error("expected a JSON array");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    providers = [];
  }

  url = `${url}/chat/completions`;
  // One provider per service, found by name. Matching by URL is ambiguous because every service shares port 8080.
  const providerName = `Arc B60 (${service})`;
  const legacyName = service === "strata" ? "Strata (Arc B60)" : undefined;
  let provider = providers.find((entry) => entry.name === providerName) ?? providers.find((entry) => entry.name === legacyName);
  if (!provider) {
    provider = { name: providerName, vendor: "customendpoint", apiKey: required("AI_API_KEY"), apiType: "chat-completions", models: [] };
    providers.push(provider);
  }
  provider.name = providerName;
  // Only the selected service appears in VS Code; other providers are re-added by their own switch.
  providers = providers.filter((entry) => entry === provider || !String(entry.name ?? "").startsWith("Arc B60 ("));
  // Keep exactly one model per service so stale entries cannot pile up.
  const model: VsModel = {};
  provider.models = [model];
  const output = Math.min(8192, Math.floor(context / 4));
  const headroom = Math.min(4096, Math.floor(context / 8));
  Object.assign(model, {
    id: modelId,
    name: modelId.replace(/^\/models\//, ""),
    url,
    toolCalling: true,
    vision,
    streaming: true,
    maxInputTokens: service === "strata" ? Math.min(110000, context - output - headroom) : context - output - headroom,
    maxOutputTokens: output,
  });
  delete model.thinking;
  delete model.modelOptions;
  await mkdir(path.dirname(file), { recursive: true });
  if (original) await copyFile(file, `${file}.previous`);
  await writeFile(file, `${JSON.stringify(providers, null, 2)}\n`);
  // Copies for the repo. The API key is replaced with a placeholder; the server does not check it.
  const current = providers.filter((entry) => String(entry.name ?? "").startsWith("Arc B60 (")).map((entry) => ({ ...entry, apiKey: "local" }));
  await mkdir(path.join(root, "data"), { recursive: true });
  await writeFile(path.join(root, "data", "vscode.json"), `${JSON.stringify(current, null, 2)}\n`);
  const baseUrl = url.replace(/\/chat\/completions$/, "");
  const piConfig = {
    $schema: "https://pi.dev/schemas/models.schema.json",
    providers: {
      [`arc-b60-${service}`]: {
        baseUrl,
        api: "openai-completions",
        apiKey: "local",
        models: [{ id: modelId, reasoning: true, input: vision ? ["text", "image"] : ["text"] }],
      },
    },
  };
  await writeFile(path.join(root, "data", "pi.json"), `${JSON.stringify(piConfig, null, 2)}\n`);
  console.log(`VS Code: ${file}`);
  console.log(JSON.stringify(model, null, 2));
}

async function updateEnv(modelId: string, port: number, version: string, extra: Record<string, string> = {}) {
  let content = await readFile(envFile, "utf8");
  for (const [name, value] of Object.entries({ AI_API_PORT: String(port), AI_API_URL: `http://\${AI_SERVER_HOST}:\${AI_API_PORT}/${version}`, AI_MODEL_ID: modelId, SPEED_TEST_MODEL: modelId, ...extra })) {
    const line = `${name}=${value}`;
    const pattern = new RegExp(`^${name}=.*$`, "m");
    content = pattern.test(content) ? content.replace(pattern, line) : `${content.trimEnd()}\n${line}\n`;
  }
  await writeFile(envFile, content);
}

async function checkTts(url: string, modelId: string) {
  const headers = { Authorization: `Bearer ${required("AI_API_KEY")}` };
  const health = await fetch(`${url.slice(0, -3)}/health`, { headers, signal: AbortSignal.timeout(10000) });
  if (!health.ok) throw new Error("speech model health check failed");
  const models = await fetch(`${url}/models`, { headers, signal: AbortSignal.timeout(10000) });
  if (!models.ok || !(await models.json() as { data?: Array<{ id?: string }> }).data?.some((model) => model.id === modelId)) {
    throw new Error(`${modelId} is missing from /models`);
  }
  console.log(`Health check passed: ${modelId}. Try: bun run tts "Hello"`);
}

async function checkModel(url: string, modelId: string, service: string) {
  const headers = { Authorization: `Bearer ${required("AI_API_KEY")}` };
  if (service !== "openvino") {
    const health = await fetch(`${url.slice(0, -3)}/health`, { headers, signal: AbortSignal.timeout(10000) });
    if (!health.ok || (await health.json() as { status?: string }).status !== "ok") throw new Error(`${service} health check failed`);
  }
  const models = await fetch(`${url}/models`, { headers, signal: AbortSignal.timeout(10000) });
  if (!models.ok || !(await models.json() as { data?: Array<{ id?: string }> }).data?.some((model) => model.id === modelId)) {
    throw new Error(`${modelId} is missing from ${service} /models`);
  }
  const response = await fetch(`${url}/chat/completions`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ model: modelId, messages: [{ role: "user", content: "Reply READY." }], max_tokens: 128, reasoning_effort: "none" }),
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok || !(await response.json() as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content?.trim()) {
    throw new Error(`${service} simple response check failed (HTTP ${response.status})`);
  }
  console.log(`Health and response checks passed: ${modelId}`);
}

type Preset = { service: string; model: string; context: number; mtp: boolean; tested: boolean; mmproj?: string; tts?: boolean };
const presetsFile = path.join(import.meta.dir, "presets.json");

async function loadPresets(): Promise<Record<string, Preset>> {
  const data = JSON.parse(await readFile(presetsFile, "utf8")) as Record<string, Preset | string>;
  return Object.fromEntries(Object.entries(data).filter((entry): entry is [string, Preset] => typeof entry[1] !== "string"));
}

async function main() {
  const options = process.argv.slice(2);
  if (options.includes("--list-presets")) {
    for (const [name, preset] of Object.entries(await loadPresets())) {
      console.log(`${name.padEnd(28)} ${preset.service.padEnd(6)} ctx ${String(preset.context).padStart(6)}  MTP ${preset.mtp ? "on " : "off"}  ${preset.tested ? "tested" : "untested"}  ${preset.model.split("/").pop()}`);
    }
    return;
  }
  const benchmark = options.includes("--benchmark");
  const presetName = options.find((arg) => arg.startsWith("--preset="))?.slice(9);
  const contextArg = options.find((arg) => arg.startsWith("--context="))?.slice(10);
  const preset = presetName ? (await loadPresets())[presetName] : undefined;
  if (presetName && !preset) throw new Error(`Unknown preset ${presetName}; run bun run switch -- --list-presets`);
  if (preset) {
    // A preset sets service, model and llama settings; the env values below are read by the llama branch.
    Bun.env.MODEL_CONTEXT_TOKENS = String(preset.context);
    Bun.env.MODEL_MTP = preset.mtp ? "1" : "0";
    if (preset.mmproj) {
      const projector = /^([A-Za-z0-9._-]+\/[A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+\.gguf)$/i.exec(preset.mmproj);
      if (!projector) throw new Error("preset mmproj must be owner/repo/file.gguf");
      Bun.env.HF_MMPROJ_REPO = projector[1];
      Bun.env.HF_MMPROJ_FILE = projector[2];
    }
    console.log(`Preset ${presetName}: ${preset.service} ${preset.model} ctx=${contextArg ?? preset.context} MTP=${preset.mtp ? 1 : 0} (${preset.tested && (!contextArg || Number(contextArg) === preset.context) ? "tested" : "untested"})`);
  }
  const service = preset?.service ?? options.find((arg) => arg.startsWith("--service="))?.slice(10) ?? "llama";
  const modelArg = preset?.model ?? options.find((arg) => arg.startsWith("--model="))?.slice(8);
  const allowed = (arg: string) => arg === "--benchmark" || arg.startsWith("--service=") || arg.startsWith("--model=") || arg.startsWith("--preset=") || arg.startsWith("--context=");
  if (options.some((arg) => !allowed(arg)) || !["llama", "arc-lab", "strata", "openvino"].includes(service) || (modelArg !== undefined && !modelArg) || (service === "arc-lab" && modelArg !== undefined) || (contextArg !== undefined && (!["32768", "49152", "57344", "65536"].includes(contextArg) || service === "openvino"))) {
    throw new Error("Usage: --preset=NAME | --service=llama|arc-lab|strata|openvino [--model=MODEL] [--context=32768|49152|57344|65536] | --list-presets");
  }
  if (contextArg && service === "llama") Bun.env.MODEL_CONTEXT_TOKENS = contextArg;
  const sshHost = required("AI_SSH_HOST");
  if (!/^[A-Za-z0-9._-]+$/.test(sshHost)) throw new Error("AI_SSH_HOST must be an SSH config alias");
  const port = 8080;
  const version = service === "openvino" ? "v3" : "v1";
  const url = `http://${required("AI_SERVER_HOST")}:${port}/${version}`;
  let id: string;
  let context: number;
  let description: string;
  let vision = false;
  let details = "";
  let extraEnv: Record<string, string> = {};

  if (service === "llama") {
    if (modelArg) {
      const match = /^([A-Za-z0-9._-]+\/[A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+\.gguf)$/i.exec(modelArg);
      if (!match) throw new Error("llama --model must be owner/repo/file.gguf");
      Bun.env.HF_MODEL_REPO = match[1];
      Bun.env.HF_MODEL_FILE = match[2];
      extraEnv = { HF_MODEL_REPO: match[1], HF_MODEL_FILE: match[2] };
    }
    const model = modelSpec("HF_MODEL_REPO", "HF_MODEL_FILE");
    context = Number(required("MODEL_CONTEXT_TOKENS"));
    if (!Number.isInteger(context) || context < 512 || context > 262144) throw new Error("MODEL_CONTEXT_TOKENS must be 512–262144");
    const mtp = Bun.env.MODEL_MTP || "0";
    if (mtp !== "0" && mtp !== "1") throw new Error("MODEL_MTP must be 0 or 1");
    // Keep .env in step with the served settings, so a later plain switch uses the same values.
    extraEnv = { ...extraEnv, MODEL_CONTEXT_TOKENS: String(context), MODEL_MTP: mtp };
    const projectorRepo = Bun.env.HF_MMPROJ_REPO?.trim() ?? "";
    const projectorFile = Bun.env.HF_MMPROJ_FILE?.trim() ?? "";
    if (Boolean(projectorRepo) !== Boolean(projectorFile)) throw new Error("Set both HF_MMPROJ_REPO and HF_MMPROJ_FILE, or neither");
    const projector = projectorRepo ? modelSpec("HF_MMPROJ_REPO", "HF_MMPROJ_FILE") : null;
    console.log(`Target: ${model.repo}/${model.file}`);
    await checked("ssh", ["-o", "BatchMode=yes", sshHost, "bash", "-s", "--", model.repo, model.file, model.repo.split("/")[0]], downloadScript);
    if (projector) await checked("ssh", ["-o", "BatchMode=yes", sshHost, "bash", "-s", "--", projector.repo, projector.file, projector.repo.split("/")[0]], downloadScript);
    await checked("ssh", ["-o", "BatchMode=yes", sshHost, "sudo", "-n", "/usr/local/sbin/llama-model-switch", "--service", "llama", model.local, String(context), mtp, projector?.local ?? "-"]);
    id = `/models/${model.local}`;
    description = `${model.repo}/${model.file}`;
    vision = Boolean(projector);
    details = `; MTP: ${mtp}; projector: ${projector?.local ?? "none"}`;
  } else if (service === "arc-lab") {
    const result = await checked("ssh", ["-o", "BatchMode=yes", sshHost, "sudo", "-n", "/usr/local/sbin/llama-model-switch", "--service", "arc-lab", ...(contextArg ? [contextArg] : [])]);
    id = result.match(/MODEL_ID=(.+)/)?.[1]?.trim() ?? "";
    context = Number(result.match(/CONTEXT=(\d+)/)?.[1]);
    if (!id || !context) throw new Error("arc-lab helper did not report model ID and context");
    description = "Qwen3.8-27B DFlash2 (experimental)";
  } else if (service === "strata") {
    const selected = modelArg ?? "coder:IQ1_M";
    const match = /^(qwen|swift|coder|inkling-2-mini):(Q2_0|IQ2_XS|IQ3_XXS|IQ3_S|IQ1_M|SQ-20)$/.exec(selected);
    if (!match) throw new Error("strata --model must be family:quant, e.g. coder:IQ1_M");
    if ((match[1] === "inkling-2-mini") !== (match[2] === "SQ-20")) throw new Error("Inkling requires --model=inkling-2-mini:SQ-20; use a Qwen quant for the other families");
    const tag = `${match[1] === "qwen" ? "" : `${match[1]}-`}${match[2].toLowerCase()}`;
    const setup = `set -euo pipefail
cd /models/Strata
if [ ! -x "run-${tag}.sh" ]; then
  if [ "$1" = "inkling-2-mini" ]; then
    echo 'Inkling SQ-20 is not installed for the service. Install it with Strata and link its config and runner into /models/Strata; see content/setup.md.' >&2
    exit 1
  fi
  ./setup.sh --setup --backend sycl --yes --family "$1" --model "$2" --context 131072 --vision no --data-dir /models/Strata-data --host 0.0.0.0 --no-start
  python3 - "strata-${tag}.json" <<'PY'
import json, sys
from pathlib import Path
p = Path(sys.argv[1])
c = json.loads(p.read_text())
c['sampling'] = {'temperature': 1.0, 'top_p': 0.95, 'top_k': 20, 'repeat_penalty': 1.05, 'repeat_last_n': 256}
c['reasoning_budget_tokens'] = 4096
c['reasoning_loop_recovery'] = 'recover'
p.write_text(json.dumps(c, indent=2))
PY
fi
if [ "$3" != "0" ]; then
  python3 - "$4" "$3" <<'PY'
import json, sys
from pathlib import Path
tag, context = sys.argv[1:]
source = Path(f'strata-{tag}.json')
runner = Path(f'run-{tag}.sh')
variant = Path(f'strata-{tag}-ctx{context}.json')
variant_runner = Path(f'run-{tag}-ctx{context}.sh')
if variant.exists() != variant_runner.exists():
    raise RuntimeError(f'Incomplete Strata variant for {tag} context {context}; remove the incomplete variant and retry')
if not variant.exists():
    settings = json.loads(source.read_text())
    args = settings['args']
    args[args.index('--max-context') + 1] = context
    command = runner.read_text()
    old = str(source.resolve())
    if command.count(old) != 1:
        raise ValueError(f'Expected one config path in {runner}')
    variant.write_text(json.dumps(settings, indent=2))
    variant_runner.write_text(command.replace(old, f'/models/Strata/{variant.name}'))
    variant_runner.chmod(0o755)
else:
    settings = json.loads(variant.read_text())
    args = settings['args']
    if args[args.index('--max-context') + 1] != context:
        raise ValueError(f'Wrong context in {variant}; correct the file before retrying')
PY
fi
`;
    await checked("ssh", ["-o", "BatchMode=yes", sshHost, "bash", "-s", "--", match[1], match[2], contextArg ?? "0", tag], setup);
    const result = await checked("ssh", ["-o", "BatchMode=yes", sshHost, "sudo", "-n", "/usr/local/sbin/llama-model-switch", "--service", "strata", contextArg ? `${tag}-ctx${contextArg}` : tag]);
    id = result.match(/MODEL_ID=(.+)/)?.[1]?.trim() ?? "";
    context = Number(result.match(/CONTEXT=(\d+)/)?.[1]);
    if (!id || !context) throw new Error("Strata helper did not report model ID and context");
    description = selected;
  } else {
    const selected = modelArg ?? "OpenVINO/Qwen3-Coder-30B-A3B-Instruct-int4-ov";
    if (!selected.startsWith("OpenVINO/") || !safeRepo.test(selected)) throw new Error("openvino --model must be an OpenVINO/REPO Hugging Face model");
    const result = await checked("ssh", ["-o", "BatchMode=yes", sshHost, "sudo", "-n", "/usr/local/sbin/llama-model-switch", "--service", "openvino", selected]);
    id = result.match(/MODEL_ID=(.+)/)?.[1]?.trim() ?? selected;
    context = Number(Bun.env.MODEL_CONTEXT_TOKENS || 16384);
    description = selected;
  }
  if (preset?.tts) {
    await checkTts(url, id);
    console.log(`Selected ${service}: ${description}${details}; .env and VS Code left unchanged (speech model)`);
    return;
  }
  await checkModel(url, id, service);
  if (benchmark) {
    console.log(`Selected ${service}: ${description}${details}; client settings left unchanged`);
    return;
  }
  await updateEnv(id, port, version, extraEnv);
  Bun.env.AI_API_URL = url;
  Bun.env.AI_MODEL_ID = id;
  Bun.env.SPEED_TEST_MODEL = id;
  await updateVsCode(id, context, vision, service, url);

  console.log(`Selected ${service}: ${description}${details}`);
}

main().catch((error) => {
  console.error(`\nModel workflow failed: ${(error as Error).message}`);
  process.exitCode = 1;
});
