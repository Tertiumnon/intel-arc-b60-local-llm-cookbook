#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

/**
 * pi--setup.ts
 * Point the Pi coding agent at the model the Arc B60 server is serving now.
 * Reads AI_API_URL and AI_API_KEY from .env, asks the server for its model and
 * context, and writes ~/.pi/agent/models.json (the old file is kept as .previous).
 *
 * Usage: bun run pi
 * Then:  pi --provider arc-b60
 */

const required = (name: string): string => {
  const value = Bun.env[name];
  if (!value) throw new Error(`Missing env ${name} - set it in .env`);
  return value;
};

type ServerModel = { id: string; meta?: { n_ctx?: number } };

const fetchModel = async (baseUrl: string, apiKey: string): Promise<ServerModel> => {
  const response = await fetch(`${baseUrl}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!response.ok) throw new Error(`GET ${baseUrl}/models returned ${response.status} - check the server and AI_API_URL`);
  const { data } = (await response.json()) as { data: ServerModel[] };
  if (!data.length) throw new Error(`No model loaded at ${baseUrl} - run a bun run switch:* command first`);
  return data[0];
};

const baseUrl = required("AI_API_URL");
const apiKey = required("AI_API_KEY");
const model = await fetchModel(baseUrl, apiKey);
const contextWindow = model.meta?.n_ctx;
if (!contextWindow) throw new Error(`Server did not report a context size for ${model.id} - Pi needs it for compaction`);

const file = path.join(homedir(), ".pi", "agent", "models.json");
const config = {
  $schema: "https://pi.dev/schemas/models.schema.json",
  providers: {
    "arc-b60": {
      baseUrl,
      api: "openai-completions",
      apiKey,
      models: [
        {
          id: model.id,
          name: `${model.id} (Arc B60)`,
          reasoning: true,
          input: ["text"],
          contextWindow,
          maxTokens: Math.min(8192, Math.floor(contextWindow / 4)),
        },
      ],
    },
  },
};

await mkdir(path.dirname(file), { recursive: true });
if (existsSync(file)) await copyFile(file, `${file}.previous`);
await writeFile(file, `${JSON.stringify(config, null, 2)}\n`);
console.log(`Pi: ${file}\nRun: pi --provider arc-b60 --model ${model.id}`);
