import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import workflow from "./workflow.json";

type HistoryEntry = { status?: { status_str: string; messages: unknown }; outputs?: Record<string, { images: Array<Record<string, string>> }> };

export type GeneratedImage = { file: string; seconds: number };

export const requireEnv = (name: string): string => {
  const value = Bun.env[name];
  if (!value) throw new Error(`Missing env ${name} - set it in .env`);
  return value;
};

const getJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`${url} returned ${response.status}: ${await response.text()}`);
  return (await response.json()) as T;
};

const waitForImage = async (base: string, promptId: string): Promise<Record<string, string>> => {
  const deadline = Date.now() + 600000;
  while (Date.now() < deadline) {
    await Bun.sleep(2000);
    const entry = (await getJson<Record<string, HistoryEntry>>(`${base}/history/${promptId}`))[promptId];
    if (entry?.status?.status_str === "error") throw new Error(`ComfyUI failed: ${JSON.stringify(entry.status.messages)}`);
    const image = entry?.outputs?.["13"]?.images?.[0];
    if (image) return image;
  }
  throw new Error("Image generation timed out after 10 minutes - check the ComfyUI log");
};

export const generateImage = async ({ prompt, size, directory }: { prompt: string; size: string; directory: string }): Promise<GeneratedImage> => {
  const [width, height] = size.split("x").map(Number);
  if (!/^\d+x\d+$/.test(size) || width % 32 || height % 32) throw new Error("size must be WIDTHxHEIGHT in multiples of 32, e.g. 1024x1024");
  const base = `http://${requireEnv("AI_SERVER_HOST")}:8080`;
  const request = structuredClone(workflow);
  request["4"].inputs.prompt = prompt;
  request["9"].inputs.noise_seed = Math.floor(Math.random() * 2 ** 48);
  Object.assign(request["10"].inputs, { width, height });

  const started = performance.now();
  const { prompt_id } = await getJson<{ prompt_id: string }>(`${base}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: request }),
  });
  const image = await waitForImage(base, prompt_id);
  const seconds = (performance.now() - started) / 1000;

  const file = path.join(directory, `${new Date().toISOString().replace(/[:.]/g, "-")}.png`);
  await mkdir(directory, { recursive: true });
  await writeFile(file, await (await fetch(`${base}/view?${new URLSearchParams(image)}`)).bytes());
  return { file, seconds };
};
