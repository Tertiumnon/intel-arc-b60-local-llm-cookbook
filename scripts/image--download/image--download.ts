#!/usr/bin/env bun
import { $ } from "bun";
import models from "./models.json";

/**
 * image--download.ts
 * Download an image model set from Hugging Face into /models/comfyui/models on the server.
 * Files already there are reused.
 *
 * Usage: bun run image:download:qwen | image:download:z-image | 3d:download
 *        bun scripts/image--download/image--download.ts NAME   (names in models.json)
 */

const remoteScript = `set -euo pipefail
repo="$1"; file="$2"; dir="$3"
target="/models/comfyui/models/\${dir:-\${file#split_files/}}"
if [ -s "$target" ]; then echo "Reusing $target"; exit 0; fi
mkdir -p "$(dirname "$target")"
source="$("$HOME/.local/bin/hf" download "$repo" "$file" --cache-dir /models/.hf-cache/hub --quiet)"
ln "$(readlink -f "$source")" "$target"
echo "Downloaded $target"
`;

const required = (name: string): string => {
  const value = Bun.env[name];
  if (!value) throw new Error(`Missing env ${name} - set it in .env`);
  return value;
};

const name = Bun.argv[2] as keyof typeof models;
if (!(name in models)) throw new Error(`Pass one of: ${Object.keys(models).join(", ")}`);
const sshHost = required("AI_SSH_HOST");
if (!/^[A-Za-z0-9._-]+$/.test(sshHost)) throw new Error("AI_SSH_HOST must be an SSH config alias");

console.log(models[name].note);
for (const { repo, file, dir } of models[name].files as Array<{ repo: string; file: string; dir?: string }>) {
  await $`ssh -o BatchMode=yes ${sshHost} bash -s -- ${repo} ${file} ${dir ?? ""} < ${new Response(remoteScript)}`;
}
