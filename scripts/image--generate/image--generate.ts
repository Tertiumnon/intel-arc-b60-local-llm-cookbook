#!/usr/bin/env bun
import path from "node:path";
import { generateImage } from "./image--generate.utils";

/**
 * image--generate.ts
 * Generate one image with Qwen-Image 2.1 Turbo on the ComfyUI started by `bun run image:start`.
 *
 * Usage: bun run image "a goblin merchant in a lantern-lit market"
 *        bun run image "an elf archer" --size=768x1344
 * Output: images/<timestamp>.png (git-ignored)
 */

const prompt = Bun.argv[2];
if (!prompt || prompt.startsWith("--")) throw new Error('Pass a prompt: bun run image "a goblin merchant"');
const size = Bun.argv.find((arg) => arg.startsWith("--size="))?.slice(7) ?? "1024x1024";

const { file } = await generateImage({ prompt, size, directory: path.join(import.meta.dir, "../../images") });
console.log(file);
