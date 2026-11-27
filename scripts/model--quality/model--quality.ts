#!/usr/bin/env bun
import { randomUUID } from "node:crypto";
import { appendFile, mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { ask, countTokens } from "./model--quality.api";
import { contextHeadroom, sampling } from "./model--quality.constants";
import { checkSandbox } from "./model--quality.sandbox";
import type { QualityResult, QualityRun, Task } from "./model--quality.types";
import { checkCommit, extractCode, hasForbiddenEvaluation, longPrompt, looping, orderTasks, parseOptions } from "./model--quality.utils";

const root = path.resolve(import.meta.dir, "../..");

const required = (name: string): string => {
  const value = Bun.env[name]?.trim();
  if (!value) throw new Error(`Missing env ${name} - set it in .env`);
  return value;
};

const server = async (): Promise<{ api: QualityRun["api"]; context: number }> => {
  const base = required("AI_API_URL").replace(/\/+$/, "");
  const key = required("AI_API_KEY");
  if (!base.endsWith("/v1")) throw new Error("AI_API_URL must end in /v1 - select a compatible model");
  const headers = { Authorization: `Bearer ${key}` };
  const models = await fetch(`${base}/models`, { headers, signal: AbortSignal.timeout(10000) });
  if (!models.ok) throw new Error(`Model discovery failed (HTTP ${models.status}) - check the AI server`);
  const data = await models.json() as { data?: Array<{ id?: string; meta?: { n_ctx?: number } }> };
  const model = data.data?.[0]?.id;
  const context = data.data?.[0]?.meta?.n_ctx;
  if (!model || !Number.isInteger(context) || context === undefined || context < 49152) throw new Error("Model metadata must report at least 49152 context tokens - select a supported coding model");
  const health = await fetch(`${base.slice(0, -3)}/health`, { headers, signal: AbortSignal.timeout(10000) });
  if (!health.ok) throw new Error(`Server health failed (HTTP ${health.status}) - check the AI server`);
  const state = await health.json() as { status?: string; loaded?: boolean };
  if (state.status !== "ok" || ("loaded" in state && !state.loaded)) throw new Error("The AI server is not ready - start the selected model");
  return { api: { base, key, model, strata: "loaded" in state }, context };
};

const promptFor = async (run: QualityRun, task: Task): Promise<string> => {
  if (task.group !== "long" && !(task.group === "complex" && run.options.padded)) return task.prompt;
  const cached = run.prompts.get(task.id);
  if (cached !== undefined) return cached;
  const agent = await Bun.file(path.join(import.meta.dir, "model--quality.agent.json")).json() as { batch: { files: Record<string, string> }; board: { files: Record<string, string> } };
  const planted = task.planted?.length ? (await Promise.all(task.planted.map((file) => Bun.file(path.join(import.meta.dir, file)).text()))).join("\n") : Object.entries({ ...agent.batch.files, ...agent.board.files }).map(([name, text]) => `// ${name}\n${text}`).join("\n");
  const result = await longPrompt({ task, planted, target: run.options.contextTokens, depth: run.options.depth, count: (text) => countTokens(run.api, text) });
  run.prompts.set(task.id, result.prompt);
  process.stdout.write(`${task.id}: ${result.tokens} prompt-content tokens before chat-template headroom\n`);
  return result.prompt;
};

const judge = async (run: QualityRun, task: Task, result: QualityResult): Promise<void> => {
  if (result.finish !== "stop") {
    result.status = "incomplete";
    result.note = `Response ended with ${result.finish}; no quality verdict`;
    return;
  }
  if (result.promptTokens === null || result.promptTokens + run.options.maxTokens > run.context) {
    result.status = "error";
    result.note = "Missing prompt token count or prompt plus output cap exceeds the server context";
    return;
  }
  if (task.kind === "commit") {
    result.pass = checkCommit(task, result.text);
    result.status = result.pass ? "pass" : "fail";
    return;
  }
  const code = extractCode(result.text);
  if (task.id === "complex-expression" && hasForbiddenEvaluation(code)) {
    result.status = "fail";
    result.pass = false;
    result.note = "Expression solution uses forbidden eval or Function";
    return;
  }
  try {
    const verdict = await checkSandbox({ host: run.host, task, code, fixtures: run.fixtures });
    result.pass = verdict.pass;
    result.note = verdict.pass && task.id === "complex-ttl-cache" ? "Functional checks passed; O(1) complexity requires manual review" : verdict.note;
    result.status = verdict.pass ? "pass" : "fail";
  } catch {
    result.status = "error";
    result.note = "Sandbox failed - check SSH, Docker, and the pinned quality image";
  }
};

const evaluate = async (run: QualityRun, task: Task, result: QualityResult): Promise<void> => {
  const started = performance.now();
  try {
    const reply = await ask({ api: run.api, prompt: await promptFor(run, task), effort: result.effort, maxTokens: run.options.maxTokens, temperature: run.options.temperature, seed: run.options.seed });
    Object.assign(result, reply, { seconds: Math.round(reply.seconds * 10) / 10, repeatedLines: looping(reply.text + reply.reasoning) });
  } catch (error) {
    result.status = "error";
    result.note = error instanceof Error && /^(Model request failed \(HTTP \d+\)|Token counting failed \(HTTP \d+\)|The .+ fixture exceeds \d+ tokens)/.test(error.message) ? error.message : `Request or token counting failed (${error instanceof Error ? error.name : "unknown error"})`;
    result.seconds = Math.round((performance.now() - started) / 100) / 10;
    return;
  }
  await judge(run, task, result);
};

const runTasks = async (run: QualityRun, tasks: Task[]): Promise<void> => {
  const { api, context, options } = run;
  const stamp = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}`;
  const directory = path.join(root, "test-results", "quality");
  const outFile = path.join(directory, `${stamp}.json`);
  await mkdir(directory, { recursive: true });
  const results: QualityResult[] = [];
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(JSON.stringify({ tasks, fixtures: run.fixtures, agent: await Bun.file(path.join(import.meta.dir, "model--quality.agent.json")).text() }));
  const suiteHash = hasher.digest("hex");
  const save = async (): Promise<void> => {
    await writeFile(`${outFile}.tmp`, JSON.stringify({ suiteVersion: 3, suiteHash, sampling: { ...sampling, temperature: options.temperature, seed: options.seed }, runId: stamp, model: api.model, serverContext: context, options, results }, null, 2) + "\n");
    await rename(`${outFile}.tmp`, outFile);
  };
  for (const effort of options.efforts) {
    for (const task of tasks) {
      const result: QualityResult = { task: task.id, effort, status: "running", pass: null, finish: "", completionTokens: null, promptTokens: null, seconds: 0, repeatedLines: false, note: "", text: "", reasoning: "" };
      results.push(result);
      await save();
      await evaluate(run, task, result);
      await save();
      const { text: _text, reasoning: _reasoning, ...summary } = result;
      await appendFile(path.join(root, "test-results", "runs.jsonl"), JSON.stringify({ time: new Date().toISOString(), test: "quality", suiteVersion: 3, suiteHash, sampling: { ...sampling, temperature: options.temperature, seed: options.seed }, runId: stamp, model: api.model, serverContext: context, maxTokens: options.maxTokens, temperature: options.temperature, topP: sampling.top_p, topK: sampling.top_k, minP: sampling.min_p, seed: options.seed, group: task.group ?? "basic", contextTokens: task.group === "long" || (task.group === "complex" && options.padded) ? options.contextTokens : null, depth: task.group === "long" ? options.depth : null, rep: options.rep, reasoningEffort: effort, ...summary }) + "\n");
      process.stdout.write(`${effort.padEnd(6)} ${task.id.padEnd(24)} ${result.status.toUpperCase()} tokens=${result.completionTokens} secs=${result.seconds} finish=${result.finish}${result.repeatedLines ? " repeated-lines" : ""} ${result.note}\n`);
    }
  }
  for (const effort of options.efforts) {
    const rows = results.filter((result) => result.effort === effort);
    process.stdout.write(`${effort}: ${rows.filter((result) => result.status === "pass").length} pass, ${rows.filter((result) => result.status === "fail").length} fail, ${rows.filter((result) => result.status === "incomplete").length} incomplete, ${rows.filter((result) => result.status === "error").length} error\n`);
  }
  process.stdout.write(`Saved: ${outFile}\n`);
  if (results.some((result) => result.status === "error" || result.status === "incomplete")) process.exitCode = 1;
};

const main = async (): Promise<void> => {
  const options = parseOptions(process.argv.slice(2));
  const host = required("AI_SSH_HOST");
  if (!/^[A-Za-z0-9._-]+$/.test(host)) throw new Error("AI_SSH_HOST must be an SSH config alias");
  const { api, context } = await server();
  if (options.maxTokens + contextHeadroom >= context) throw new Error("--max-tokens leaves no prompt space - reduce the output cap");
  const all = await Bun.file(path.join(import.meta.dir, "tasks.json")).json() as Task[];
  const selected = orderTasks(all.filter((task) => !options.group || (task.group ?? "basic") === options.group));
  const tasks = options.group === "complex" ? selected.slice(0, options.limit) : selected;
  if (!tasks.length) throw new Error("No quality tasks match --group - check tasks.json");
  if (tasks.some((task) => task.group === "long" || (task.group === "complex" && options.padded)) && options.contextTokens + options.maxTokens + contextHeadroom > context) throw new Error("--context plus --max-tokens and template headroom exceeds the server context - reduce one of them");
  const fixtures = {
    "./pricing/rules.js": await Bun.file(path.join(import.meta.dir, "context/pricing-current.js")).text(),
    "./pricing/rules.legacy.js": await Bun.file(path.join(import.meta.dir, "context/pricing-legacy.js")).text(),
    "./shipping/table.js": await Bun.file(path.join(import.meta.dir, "context/shipping-current.js")).text(),
    "./shipping/table.old.js": await Bun.file(path.join(import.meta.dir, "context/shipping-legacy.js")).text(),
  };
  if (tasks.some((task) => task.kind === "code")) {
    const sample = all.find((task) => task.id === "sort-unique");
    if (!sample) throw new Error("Missing sort-unique task - restore tasks.json");
    const check = await checkSandbox({ host, task: sample, code: "function sortUnique(nums) { return [...new Set(nums)].sort((a, b) => a - b); }", fixtures });
    if (!check.pass) throw new Error(`Quality sandbox self-check failed: ${check.note}`);
  }
  await runTasks({ api, context, host, options, fixtures, prompts: new Map() }, tasks);
};

await main().catch((error: Error) => {
  process.stderr.write(`Quality run failed: ${error.message}\n`);
  process.exitCode = 1;
});
