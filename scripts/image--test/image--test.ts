#!/usr/bin/env bun
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { generateImage, requireEnv } from "../image--generate/image--generate.utils";
import prompts from "./prompts.json";

/**
 * image--test.ts
 * Generate one image per fantasy prompt, time each, and log the run.
 * Look at the images afterwards; the "hands" and "text" prompts check anatomy and lettering.
 *
 * Usage: bun run image:test                       all prompts, 1024x1024
 *        bun run image:test --only=goblin,elf     chosen prompts
 *        bun run image:test --size=768x1344
 * Output: test-results/images/<run>/*.png and test-results/image-runs.jsonl (git-ignored)
 */

const flag = (name: string): string | undefined => Bun.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);

const size = flag("size") ?? "1024x1024";
const names = flag("only")?.split(",") ?? Object.keys(prompts);
const unknown = names.filter((name) => !(name in prompts));
if (unknown.length) throw new Error(`Unknown prompt ${unknown.join(", ")} - choose from ${Object.keys(prompts).join(", ")}`);

const root = path.join(import.meta.dir, "../../test-results");
const run = new Date().toISOString().replace(/[:.]/g, "-");
await mkdir(root, { recursive: true });

for (const name of names) {
  const { file, seconds } = await generateImage({ prompt: prompts[name as keyof typeof prompts], size, directory: path.join(root, "images", run) });
  const row = { run, name, size, seconds: Number(seconds.toFixed(1)), file: path.relative(root, file), server: requireEnv("AI_SERVER_HOST") };
  await appendFile(path.join(root, "image-runs.jsonl"), `${JSON.stringify(row)}\n`);
  console.log(`${name.padEnd(8)} ${size}  ${seconds.toFixed(1).padStart(6)} s  ${row.file}`);
}
