#!/usr/bin/env bun
import { spawn } from "node:child_process";
import { appendFile, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dir, "../..");
const envFile = path.join(root, ".env");
const logFile = path.join(root, "Intel-Arc-B60-Models-Log.md");
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

async function updateVsCode(modelId: string, context: number, vision: boolean, previousId: string) {
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

  const url = `${required("AI_API_URL").replace(/\/+$/, "")}/chat/completions`;
  let provider = providers.find((entry) => Array.isArray(entry.models) && entry.models.some((m) => m.id === previousId && m.url === url));
  provider ??= providers.find((entry) => Array.isArray(entry.models) && entry.models.some((m) => m.url === url));
  if (!provider) {
    provider = { name: "Arc B60 (llama.cpp)", vendor: "customendpoint", apiKey: required("AI_API_KEY"), apiType: "chat-completions", models: [] };
    providers.push(provider);
  }
  let model = provider.models.find((entry) => entry.id === previousId && entry.url === url);
  model ??= provider.models.find((entry) => entry.url === url);
  if (!model) {
    model = {};
    provider.models.push(model);
  }
  const output = Math.min(8192, Math.floor(context / 4));
  const headroom = Math.min(4096, Math.floor(context / 8));
  Object.assign(model, {
    id: modelId,
    name: modelId.slice("/models/".length),
    url,
    toolCalling: true,
    vision,
    streaming: true,
    maxInputTokens: context - output - headroom,
    maxOutputTokens: output,
  });
  delete model.thinking;
  delete model.modelOptions;
  await mkdir(path.dirname(file), { recursive: true });
  if (original) await copyFile(file, `${file}.previous`);
  await writeFile(file, `${JSON.stringify(providers, null, 2)}\n`);
  console.log(`VS Code: ${file}`);
  console.log(JSON.stringify(model, null, 2));
}

async function updateEnv(modelId: string) {
  let content = await readFile(envFile, "utf8");
  for (const name of ["AI_MODEL_ID", "SPEED_TEST_MODEL"]) {
    const line = `${name}=${modelId}`;
    const pattern = new RegExp(`^${name}=.*$`, "m");
    content = pattern.test(content) ? content.replace(pattern, line) : `${content.trimEnd()}\n${line}\n`;
  }
  await writeFile(envFile, content);
}

async function main() {
  const model = modelSpec("HF_MODEL_REPO", "HF_MODEL_FILE");
  const sshHost = required("AI_SSH_HOST");
  if (!/^[A-Za-z0-9._-]+$/.test(sshHost)) throw new Error("AI_SSH_HOST must be an SSH config alias");
  const context = Number(required("MODEL_CONTEXT_TOKENS"));
  if (!Number.isInteger(context) || context < 512 || context > 262144) throw new Error("MODEL_CONTEXT_TOKENS must be 512–262144");
  const mtp = Bun.env.MODEL_MTP || "0";
  if (mtp !== "0" && mtp !== "1") throw new Error("MODEL_MTP must be 0 or 1");
  const projectorRepo = Bun.env.HF_MMPROJ_REPO?.trim() ?? "";
  const projectorFile = Bun.env.HF_MMPROJ_FILE?.trim() ?? "";
  if (Boolean(projectorRepo) !== Boolean(projectorFile)) throw new Error("Set both HF_MMPROJ_REPO and HF_MMPROJ_FILE, or neither");
  const projector = projectorRepo ? modelSpec("HF_MMPROJ_REPO", "HF_MMPROJ_FILE") : null;
  const previousId = Bun.env.AI_MODEL_ID ?? "";
  const id = `/models/${model.local}`;

  console.log(`Target: ${model.repo}/${model.file}`);
  await checked("ssh", ["-o", "BatchMode=yes", sshHost, "bash", "-s", "--", model.repo, model.file, model.repo.split("/")[0]], downloadScript);
  if (projector) {
    await checked("ssh", ["-o", "BatchMode=yes", sshHost, "bash", "-s", "--", projector.repo, projector.file, projector.repo.split("/")[0]], downloadScript);
  }
  await checked("ssh", ["-o", "BatchMode=yes", sshHost, "sudo", "-n", "/usr/local/sbin/llama-model-switch", model.local, String(context), mtp, projector?.local ?? "-"]);
  await updateEnv(id);
  await updateVsCode(id, context, Boolean(projector), previousId);

  console.log("\nRunning speed test...");
  const benchmark = await command("bun", ["scripts/model--test-speed/speed-test.ts", id]);
  const timestamp = new Date().toISOString();
  await appendFile(logFile, `\n## ${timestamp} — ${model.repo}/${model.file}\n\n- Model ID: \`${id}\`\n- Context: ${context}; MTP: ${mtp}; projector: ${projector?.local ?? "none"}\n- Speed test exit code: ${benchmark.code}\n\n\`\`\`text\n${benchmark.output.trimEnd()}\n\`\`\`\n`);
  console.log(`Saved result: ${logFile}`);
  if (benchmark.code !== 0) throw new Error(`Speed test failed with exit code ${benchmark.code}; the healthy model remains active`);
}

main().catch((error) => {
  console.error(`\nModel workflow failed: ${(error as Error).message}`);
  process.exitCode = 1;
});
