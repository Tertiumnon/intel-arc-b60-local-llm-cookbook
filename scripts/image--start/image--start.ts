#!/usr/bin/env bun
import { $ } from "bun";

/**
 * image--start.ts
 * Start a ComfyUI service (Intel llm-scaler-omni) on the Arc B60 at http://AI_SERVER_HOST:8080.
 * comfyui = images (0.2.0-b2), comfyui3d = Hunyuan3D 3D generation (0.1.0-b8).
 * Stops the language model service; run a bun run switch:* command to bring it back.
 *
 * Usage: bun run image:start | 3d:start
 */

const required = (name: string): string => {
  const value = Bun.env[name];
  if (!value) throw new Error(`Missing env ${name} - set it in .env`);
  return value;
};

const service = Bun.argv[2];
if (service !== "comfyui" && service !== "comfyui3d") throw new Error("Pass comfyui or comfyui3d");
const sshHost = required("AI_SSH_HOST");
if (!/^[A-Za-z0-9._-]+$/.test(sshHost)) throw new Error("AI_SSH_HOST must be an SSH config alias");

await $`ssh -o BatchMode=yes ${sshHost} sudo -n /usr/local/sbin/llama-model-switch --service ${service}`;
console.log(`ComfyUI (${service}): http://${required("AI_SERVER_HOST")}:8080`);
