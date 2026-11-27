#!/usr/bin/env bun
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { contextHeadroom, defaultMaxTokens, sampling } from "./model--quality.constants";
import { updateComparisonPage } from "./model--quality.report";
import type { Comparison, ComparisonRow, Task } from "./model--quality.types";
import { codingArgs, codingChoices } from "../model--switch/model--switch.coding";

type Choice = ReturnType<typeof codingChoices>[number];

const run = async (args: string[]): Promise<{ code: number; output: string }> => {
  const child = Bun.spawn([process.execPath, ...args], { stdout: "pipe", stderr: "pipe" });
  const stream = async (source: ReadableStream<Uint8Array>, target: NodeJS.WriteStream): Promise<string> => {
    let output = "";
    const reader = source.getReader();
    for (let next = await reader.read(); !next.done; next = await reader.read()) {
      const text = new TextDecoder().decode(next.value);
      output += text;
      target.write(text);
    }
    return output;
  };
  const [out, , code] = await Promise.all([stream(child.stdout, process.stdout), stream(child.stderr, process.stderr), child.exited]);
  return { code, output: out };
};

const checkContext = async (allocation: number): Promise<void> => {
  const base = Bun.env.AI_API_URL;
  const key = Bun.env.AI_API_KEY;
  if (!base || !key) throw new Error("Missing AI_API_URL or AI_API_KEY - set them in .env");
  const response = await fetch(`${base.replace(/\/+$/, "")}/models`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`Model discovery failed (HTTP ${response.status})`);
  const data = await response.json() as { data?: Array<{ meta?: { n_ctx?: number } }> };
  if (data.data?.[0]?.meta?.n_ctx !== allocation) throw new Error(`Model did not report the requested ${allocation} context - check the server`);
};

const main = async (): Promise<void> => {
  const options = new Map<string, string>();
  for (const arg of process.argv.slice(2)) {
    const match = /^--(allocation|effort|limit|temperature|models|seed|max-tokens)=(.+)$/.exec(arg);
    if (!match || options.has(match[1])) throw new Error("Use --allocation=49152|57344|65536 [--effort=low|medium|high|xhigh] [--limit=1..5] [--temperature=0..2] [--seed=positive-integer] [--max-tokens=N] [--models=text]");
    options.set(match[1], match[2]);
  }
  const allocation = Number(options.get("allocation"));
  const inputs: Record<number, number> = { 49152: 32768, 57344: 40960, 65536: 49152 };
  if (!Object.hasOwn(inputs, allocation)) throw new Error("Choose --allocation=49152, 57344 or 65536");
  const effort = options.has("effort") ? options.get("effort")! : "low";
  const limit = options.has("limit") ? Number(options.get("limit")) : 5;
  const temperature = options.has("temperature") ? Number(options.get("temperature")) : sampling.temperature;
  const maxTokens = options.has("max-tokens") ? Number(options.get("max-tokens")) : defaultMaxTokens;
  if (!Number.isInteger(maxTokens) || maxTokens < 1 || inputs[allocation] + maxTokens + contextHeadroom > allocation) throw new Error("Invalid --max-tokens - leave room for the prompt and template");
  const seed = options.has("seed") ? Number(options.get("seed")) : sampling.seed;
  if (!Number.isSafeInteger(seed) || seed < 1) throw new Error("Invalid --seed - choose a positive integer");
  if (!["low", "medium", "high", "xhigh"].includes(effort) || !Number.isInteger(limit) || limit < 1 || limit > 5 || !Number.isFinite(temperature) || temperature < 0 || temperature > 2) throw new Error("Invalid effort, limit or temperature - see benchmark usage");
  const presets = JSON.parse(await readFile(path.join(import.meta.dir, "../model--switch/presets.json"), "utf8"));
  const choices: Choice[] = codingChoices(presets).filter((choice) => !options.has("models") || choice.label.toLowerCase().includes(options.get("models")!.toLowerCase()));
  if (!choices.length) throw new Error("No model choices match --models - check switch:coding");
  const directory = path.resolve("test-results/quality");
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, `comparison-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}.json`);
  const rows: ComparisonRow[] = [];
  const tasks = await Bun.file(path.join(import.meta.dir, "tasks.json")).json() as Task[];
  const comparison: Comparison = { completedAt: "", allocation, promptTarget: inputs[allocation], effort, limit, sampling: { ...sampling, temperature, seed }, maxTokens, filter: options.has("models") ? options.get("models")! : null, tasks: tasks.filter((task) => task.group === "complex").slice(0, limit).map((task) => task.id), rows };
  if (comparison.tasks.length !== limit) throw new Error("Not enough complex tasks - check tasks.json");
  const page = path.resolve("content/results.md");
  updateComparisonPage(await readFile(page, "utf8"), comparison);
  const save = async (): Promise<void> => {
    await writeFile(`${file}.tmp`, JSON.stringify({ suiteVersion: 3, ...comparison }, null, 2) + "\n");
    await rename(`${file}.tmp`, file);
    const heading = `# Complex model comparison\n\nAllocation: ${allocation}; prompt target: ${inputs[allocation]}; output cap: ${maxTokens}; effort: ${effort}; temperature: ${temperature}; seed: ${seed}.\n\n`;
    const table = rows.map((row) => `| ${row.model} | ${row.switchExit === null ? "switching" : row.switchExit !== 0 ? "switch error" : row.qualityExit === null ? "running" : row.qualityExit !== 0 ? "incomplete/error" : "complete"} | ${row.passed} | ${row.failed} | ${row.incomplete} | ${row.errors} | ${row.seconds} |`).join("\n");
    await writeFile(file.replace(/\.json$/, ".md"), `${heading}| Model and approach | Status | Pass | Fail | Incomplete | Error | Seconds |\n|---|---|---:|---:|---:|---:|---:|\n${table}\n`);
  };
  process.stdout.write(`Comparing ${choices.length} approaches: allocation ${allocation}, prompt target ${inputs[allocation]}, ${limit} tasks, ${effort}, temperature ${temperature}. Client config is unchanged; restore your model after the run.\n`);
  for (const choice of choices) {
    process.stdout.write(`\n${choice.label}\n`);
    const row: ComparisonRow = { model: choice.label, switchExit: null, qualityExit: null, resultFile: "", passed: 0, failed: 0, incomplete: 0, errors: 0, seconds: 0, completionTokens: 0, inputMin: null, inputMax: null, note: "" };
    rows.push(row);
    await save();
    const switched = await run(["scripts/model--switch/model--switch.ts", ...codingArgs(choice, allocation), "--benchmark"]);
    row.switchExit = switched.code;
    await save();
    if (switched.code === 0) {
      try {
        await checkContext(allocation);
      } catch (error) {
        row.qualityExit = 1;
        row.errors = 1;
        row.note = error instanceof Error ? error.message : "Model context check failed";
        process.stderr.write(`${row.note}\n`);
        await save();
        continue;
      }
      const quality = await run(["scripts/model--quality/model--quality.ts", "--group=complex", `--context=${inputs[allocation]}`, `--efforts=${effort}`, `--limit=${limit}`, `--temperature=${temperature}`, `--seed=${seed}`, `--max-tokens=${maxTokens}`]);
      row.qualityExit = quality.code;
      row.resultFile = /Saved: (.+)/.exec(quality.output)?.[1]?.trim() ?? "";
      if (row.resultFile) {
        const result = JSON.parse(await readFile(row.resultFile, "utf8")) as { results: { status: string; seconds: number; completionTokens: number | null; promptTokens: number | null }[] };
        const inputCounts = result.results.map((item) => item.promptTokens).filter((value): value is number => value !== null);
        if (inputCounts.length) {
          row.inputMin = Math.min(...inputCounts);
          row.inputMax = Math.max(...inputCounts);
        }
        row.passed = result.results.filter((item) => item.status === "pass").length;
        row.failed = result.results.filter((item) => item.status === "fail").length;
        row.incomplete = result.results.filter((item) => item.status === "incomplete").length;
        row.errors = result.results.filter((item) => item.status === "error").length;
        row.seconds = Math.round(result.results.reduce((sum, item) => sum + item.seconds, 0) * 10) / 10;
        row.completionTokens = result.results.reduce((sum, item) => sum + (item.completionTokens ?? 0), 0);
      }
    }
    await save();
  }
  comparison.completedAt = new Date().toISOString();
  await save();
  const pageContent = updateComparisonPage(await readFile(page, "utf8"), comparison);
  const pageTemp = `${page}.${randomUUID()}.tmp`;
  await writeFile(pageTemp, pageContent);
  await rename(pageTemp, page);
  process.stdout.write(`\nComparison saved: ${file}; updated content/results.md\nRestore your model with bun run switch:coding.\n`);
  if (rows.some((row) => row.switchExit !== 0 || row.qualityExit !== 0)) process.exitCode = 1;
};

await main().catch((error: Error) => {
  process.stderr.write(`Comparison failed: ${error.message}\n`);
  process.exitCode = 1;
});
