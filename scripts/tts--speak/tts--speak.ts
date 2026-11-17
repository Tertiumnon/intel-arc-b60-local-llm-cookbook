#!/usr/bin/env bun
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * tts--speak.ts
 * Speak text with the llama.cpp speech model started by `bun run switch:tts`.
 *
 * Usage: bun run tts "Hello from the B60"
 *        bun run tts "Bonjour" --lang=fr --speaker=voice.wav
 * Output: audio/<timestamp>.wav (git-ignored)
 * Needs a llama.cpp server image with /v1/audio/speech (merged 2026-11-09).
 */

const required = (name: string): string => {
  const value = Bun.env[name];
  if (!value) throw new Error(`Missing env ${name} - set it in .env`);
  return value;
};

const flag = (name: string): string | undefined => Bun.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);

const input = Bun.argv[2];
if (!input || input.startsWith("--")) throw new Error('Pass the text: bun run tts "Hello"');
const speaker = flag("speaker");
const lang = flag("lang");

const response = await fetch(`http://${required("AI_SERVER_HOST")}:8080/v1/audio/speech`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${required("AI_API_KEY")}` },
  body: JSON.stringify({
    model: "tts",
    input,
    ...(lang && { lang }),
    ...(speaker && { speaker_ref_b64: (await readFile(speaker)).toString("base64") }),
  }),
  signal: AbortSignal.timeout(300000),
});
if (!response.ok) throw new Error(`Speech request failed (HTTP ${response.status}): ${await response.text()} - is the speech model served? Run bun run switch:tts`);

const file = path.join(import.meta.dir, "../../audio", `${new Date().toISOString().replace(/[:.]/g, "-")}.wav`);
await mkdir(path.dirname(file), { recursive: true });
await writeFile(file, await response.bytes());
console.log(file);
