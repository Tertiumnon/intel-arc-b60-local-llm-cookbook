#!/usr/bin/env bun
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

type Preset = { service: string; model: string; context: number; mtp: boolean; tts?: boolean };
type Choice = { label: string; args: string[]; defaultContext: number };

export const codingChoices = (presets: Record<string, Preset | string>): Choice[] => {
  const choices: Choice[] = [
    { label: "ISTA-DASLab/Qwen3.8-Flash-Next-GSQ-RCO-Coder-GGUF (Strata, IQ1_M)", args: ["--service=strata", "--model=coder:IQ1_M"], defaultContext: 131072 },
    { label: "ISTA-DASLab/Qwen3.8-Flash-Next-GSQ-RCO-GGUF (Strata, IQ2_XS)", args: ["--service=strata", "--model=qwen:IQ2_XS"], defaultContext: 131072 },
    { label: "unsloth/Qwen3.8-27B-GGUF/Qwen3.8-27B-UD-Q4_K_M.gguf (arc-lab, DFlash2)", args: ["--service=arc-lab"], defaultContext: 65536 },
  ];
  const seen = new Set<string>();
  for (const [name, preset] of Object.entries(presets)) {
    if (typeof preset === "string" || preset.service !== "llama" || preset.tts || name.includes(":ctx")) continue;
    const key = `${preset.service}/${preset.model}/${preset.mtp}`;
    if (seen.has(key)) continue;
    seen.add(key);
    choices.push({ label: `${preset.model} (llama.cpp, MTP ${preset.mtp ? "on" : "off"})`, args: [`--preset=${name}`], defaultContext: preset.context });
  }
  return choices;
};

export const codingArgs = (choice: Choice, context: number): string[] => {
  if (![32768, 49152, 57344, 65536, choice.defaultContext].includes(context)) throw new Error("Choose a listed context size");
  if (context === choice.defaultContext) return choice.args;
  const suffix: Record<number, string> = { 32768: "32k", 49152: "49k", 57344: "57k", 65536: "64k" };
  if (choice.args[0].startsWith("--preset=")) return [`${choice.args[0]}:ctx${suffix[context]}`];
  return [...choice.args, `--context=${context}`];
};

const main = async (): Promise<void> => {
  if (process.argv.length !== 2) throw new Error("Run bun run switch:coding without arguments");
  const choices = codingChoices(await Bun.file(new URL("./presets.json", import.meta.url)).json() as Record<string, Preset | string>);
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  const lines = input[Symbol.asyncIterator]();
  const select = async (title: string, labels: string[]): Promise<number> => {
    process.stdout.write(`${title}\n${labels.map((label, index) => `  ${index + 1}. ${label}`).join("\n")}\nChoose a number: `);
    const answer = await lines.next();
    if (answer.done || !/^\d+$/.test(answer.value.trim())) throw new Error("Enter a number from the list");
    const index = Number(answer.value.trim()) - 1;
    if (index < 0 || index >= labels.length) throw new Error("Choose a number from the list");
    return index;
  };
  try {
    const choice = choices[await select("Choose a model and approach:", choices.map((item) => item.label))];
    const contexts = [...new Set([32768, 49152, 57344, 65536, choice.defaultContext])].sort((a, b) => a - b);
    const context = contexts[await select("Choose a context size:", contexts.map((size) => `${size.toLocaleString("en-US")} tokens${size === choice.defaultContext ? " (existing default)" : ""}`))];
    input.close();
    const child = spawn(process.execPath, ["scripts/model--switch/model--switch.ts", ...codingArgs(choice, context)], { stdio: "inherit" });
    const code = await new Promise<number>((resolve, reject) => {
      child.on("error", reject);
      child.on("close", (status) => resolve(status === null ? 1 : status));
    });
    if (code !== 0) throw new Error(`Model switch failed with exit code ${code}`);
  } finally {
    input.close();
  }
};

if (import.meta.main) {
  await main().catch((error: Error) => {
    process.stderr.write(`Model selection failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
