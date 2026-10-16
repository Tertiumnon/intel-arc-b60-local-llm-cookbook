#!/usr/bin/env bun
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

// Usage: bun run quality [--efforts=low,medium,high] [--max-tokens=4096]
// Runs scripts/model--quality/tasks.json against the server in AI_API_URL and
// writes results to test-results/quality/. Reasoning level is sent per request;
// sampling and context are whatever the server is configured with.

type Task = { id: string; kind: "code" | "commit"; prompt: string; tests?: string; pattern?: string };
type Result = {
  task: string;
  effort: string;
  pass: boolean;
  finish: string;
  completionTokens: number | null;
  reasoningChars: number;
  seconds: number;
  loop: boolean;
  note: string;
};

const root = path.resolve(import.meta.dir, "../..");
const options = process.argv.slice(2);
const efforts = (options.find((a) => a.startsWith("--efforts="))?.slice(10) ?? "low,medium,high").split(",");
const maxTokens = Number(options.find((a) => a.startsWith("--max-tokens="))?.slice(13) ?? 4096);
const base = Bun.env.AI_API_URL;
const key = Bun.env.AI_API_KEY ?? "";
if (!base) throw new Error("Set AI_API_URL in the root .env");

const tasks = JSON.parse(await Bun.file(path.join(import.meta.dir, "tasks.json")).text()) as Task[];
const work = path.join(root, "test-results", "quality", "work");
await mkdir(work, { recursive: true });

const modelList = await (await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${key}` } })).json() as { data: Array<{ id: string; meta?: { n_ctx?: number } }> };
const model = modelList.data[0].id;
const serverContext = modelList.data[0].meta?.n_ctx ?? null;
const runsFile = path.join(root, "test-results", "runs.jsonl");

function extractCode(text: string): string {
  const match = /```[\w-]*\n([\s\S]*?)```/.exec(text);
  return match ? match[1] : text;
}

function looping(text: string): boolean {
  const counts = new Map<string, number>();
  for (const line of text.split("\n").map((l) => l.trim()).filter((l) => l.length > 3)) {
    const n = (counts.get(line) ?? 0) + 1;
    counts.set(line, n);
    if (n >= 8) return true;
  }
  return false;
}

async function ask(prompt: string, effort: string) {
  const started = performance.now();
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
      reasoning_effort: effort,
      stream: false,
    }),
    signal: AbortSignal.timeout(900000),
  });
  const json = await response.json() as {
    choices: Array<{ finish_reason: string; message: { content?: string; reasoning_content?: string; reasoning?: string } }>;
    usage?: { completion_tokens?: number };
  };
  const choice = json.choices[0];
  return {
    text: choice.message.content ?? "",
    reasoning: choice.message.reasoning_content ?? choice.message.reasoning ?? "",
    finish: choice.finish_reason,
    completionTokens: json.usage?.completion_tokens ?? null,
    seconds: (performance.now() - started) / 1000,
  };
}

async function check(task: Task, text: string, index: number, effort: string): Promise<{ pass: boolean; note: string }> {
  if (task.kind === "commit") {
    const subject = text.trim().split("\n").find((l) => l.trim())?.replace(/^`+|`+$/g, "").trim() ?? "";
    return { pass: new RegExp(task.pattern!).test(subject), note: subject.slice(0, 80) };
  }
  const file = path.join(work, `${task.id}-${effort}-${index}.mjs`);
  await writeFile(file, `${extractCode(text)}\n${task.tests}\n`);
  const proc = Bun.spawn(["bun", file], { stdout: "pipe", stderr: "pipe", timeout: 15000 });
  const code = await proc.exited;
  const err = (await new Response(proc.stderr).text()).split("\n").find((l) => l.includes("Error")) ?? "";
  return { pass: code === 0, note: code === 0 ? "" : err.trim().slice(0, 120) };
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outFile = path.join(root, "test-results", "quality", `${stamp}.json`);
const results: Result[] = [];
for (const effort of efforts) {
  for (const [index, task] of tasks.entries()) {
    const reply = await ask(task.prompt, effort);
    const verdict = await check(task, reply.text, index, effort);
    const result: Result = {
      task: task.id,
      effort,
      pass: verdict.pass,
      finish: reply.finish,
      completionTokens: reply.completionTokens,
      reasoningChars: reply.reasoning.length,
      seconds: Math.round(reply.seconds * 10) / 10,
      loop: reply.finish === "length" || looping(reply.text + reply.reasoning),
      note: verdict.note,
    };
    results.push(result);
    // One line per test, with the parameters needed to reproduce it.
    await appendFile(runsFile, JSON.stringify({ time: new Date().toISOString(), test: "quality", endpoint: base, model, serverContext, maxTokens, reasoningEffort: effort, temperature: "server default", ...result }) + "\n");
    await writeFile(outFile, JSON.stringify({ model, maxTokens, efforts, results }, null, 2));
    console.log(`${effort.padEnd(6)} ${task.id.padEnd(14)} ${result.pass ? "PASS" : "FAIL"} tokens=${result.completionTokens} secs=${result.seconds} finish=${result.finish}${result.loop ? " LOOP" : ""} ${result.note}`);
  }
}

console.log(`\nSaved: ${outFile}`);
for (const effort of efforts) {
  const rows = results.filter((r) => r.effort === effort);
  const passed = rows.filter((r) => r.pass).length;
  const loops = rows.filter((r) => r.loop).length;
  const tokens = rows.reduce((s, r) => s + (r.completionTokens ?? 0), 0);
  const secs = rows.reduce((s, r) => s + r.seconds, 0);
  console.log(`${effort}: pass ${passed}/${rows.length}, loops ${loops}, avg tokens ${Math.round(tokens / rows.length)}, avg secs ${(secs / rows.length).toFixed(1)}`);
}
