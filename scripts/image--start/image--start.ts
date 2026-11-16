#!/usr/bin/env bun
import { $ } from "bun";

/**
 * image--start.ts
 * Start ComfyUI (Intel llm-scaler-omni) on the Arc B60 at http://AI_SERVER_HOST:8080.
 * Stops the language model service; run a bun run switch:* command to bring it back.
 *
 * Usage: bun run image:start
 */

const required = (name: string): string => {
  const value = Bun.env[name];
  if (!value) throw new Error(`Missing env ${name} - set it in .env`);
  return value;
};

const sshHost = required("AI_SSH_HOST");
if (!/^[A-Za-z0-9._-]+$/.test(sshHost)) throw new Error("AI_SSH_HOST must be an SSH config alias");

await $`ssh -o BatchMode=yes ${sshHost} sudo -n /usr/local/sbin/llama-model-switch --service comfyui`;
console.log(`ComfyUI: http://${required("AI_SERVER_HOST")}:8080  generate: bun run image "a goblin"`);
