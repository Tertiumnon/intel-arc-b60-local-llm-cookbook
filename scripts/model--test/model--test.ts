#!/usr/bin/env bun
import { spawn } from "node:child_process";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * model--test.ts
 * Speed & latency benchmark for an OpenAI-compatible AI server
 * on the Intel Arc B60 box.
 *
 * What it measures per run:
 *   - Time To First Token (TTFT)      — request latency
 *   - Token generation throughput     — tokens/sec after the first token
 *   - Overall throughput              — tokens/sec over the whole request
 *   - Prompt / completion token counts (from the server `usage` field)
 *   - Remote llama-server RAM          — sampled over SSH during the request
 *
 * Runs on Bun with no dependencies: it uses the built-in `fetch` + streaming
 * to parse the SSE response.
 *
 * Usage (from the repository root):
 *   bun run test [model]
 *   bun run list
 *
 * API settings come from the repo-root .env (see .env.example):
 *   AI_API_URL              base URL (required)
 *   AI_API_KEY              API key (required)
 *   SPEED_TEST_MODEL        model name (empty = first model from /models)
 *   SPEED_TEST_ITERATIONS   measured runs (default 3)
 *   SPEED_TEST_MAX_TOKENS   max output tokens
 *   SPEED_TEST_TEMPERATURE  sampling temperature
 *   SPEED_TEST_PROMPT       prompt text
 *   SPEED_TEST_TIMEOUT_MS   per-request timeout
 *
 * Flags:
 *   --list          Only list available models and exit
 *   --no-warmup     Skip the (uncounted) warm-up run
 *   --no-reasoning  Ask the server to skip chain-of-thought (reasoning: none)
 */

interface Config {
  baseUrl: string;
  model: string;
  apiKey: string;
  iterations: number;
  maxTokens: number;
  temperature: number;
  prompt: string;
  timeoutMs: number;
  listOnly: boolean;
  noWarmup: boolean;
  noReasoning: boolean;
}

interface RunResult {
  model: string;
  promptTokens: number | null;
  completionTokens: number | null;
  reasoningTokens: number | null;
  estTokens: number;
  ttftMs: number;
  totalMs: number;
  genTokensPerSec: number;
  overallTokensPerSec: number;
  outputPreview: string;
  content: string;
  reasoning: string;
  promptMs: number | null;
  ramPeakMiB: number | null;
  ramHighWaterMiB: number | null;
}

interface MemoryMonitor {
  stop(): Promise<{ peakMiB: number | null; highWaterMiB: number | null }>;
}

// --- helpers ---------------------------------------------------------------

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function env(name: string): string {
  const v = Bun.env[name];
  if (v === undefined || v === "") {
    throw new Error(`${name} is not set — add it to the repo-root .env (see .env.example)`);
  }
  return v;
}

function envNum(name: string, fallback: number): number {
  const n = Number(Bun.env[name] || fallback);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number, got "${Bun.env[name]}"`);
  return n;
}

function resolveConfig(argv: string[]): Config {
  // Separate flags (start with "-") from the optional positional model name.
  const [modelArg] = argv.filter((a) => !a.startsWith("-"));
  return {
    baseUrl: env("AI_API_URL").replace(/\/+$/, ""),
    model: modelArg ?? Bun.env.SPEED_TEST_MODEL ?? "",
    apiKey: env("AI_API_KEY"),
    iterations: Math.max(1, Math.round(envNum("SPEED_TEST_ITERATIONS", 3))),
    maxTokens: Math.max(1, Math.round(envNum("SPEED_TEST_MAX_TOKENS", 256))),
    temperature: envNum("SPEED_TEST_TEMPERATURE", 0.7),
    prompt: Bun.env.SPEED_TEST_PROMPT || "Write a concise JavaScript function that sorts unique numbers.",
    timeoutMs: envNum("SPEED_TEST_TIMEOUT_MS", 120000),
    listOnly: argv.includes("--list"),
    noWarmup: argv.includes("--no-warmup"),
    noReasoning: argv.includes("--no-reasoning"),
  };
}

function fmt(n: number, digits = 2): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function stats(values: number[]) {
  if (values.length === 0) return { min: 0, avg: 0, max: 0 };
  const sum = values.reduce((a, b) => a + b, 0);
  return {
    min: Math.min(...values),
    avg: sum / values.length,
    max: Math.max(...values),
  };
}

function monitorServerMemory(): MemoryMonitor {
  const host = Bun.env.AI_SSH_HOST?.trim();
  if (!host) return { stop: async () => ({ peakMiB: null, highWaterMiB: null }) };
  const script = `while :; do p=$(pgrep -x llama-server | head -1); if [ -n "$p" ]; then sed -n 's/^VmRSS:[[:space:]]*\\([0-9]*\\).*/rss \\1/p; s/^VmHWM:[[:space:]]*\\([0-9]*\\).*/hwm \\1/p' /proc/$p/status; fi; sleep 0.5; done`;
  const child = spawn("ssh", ["-o", "BatchMode=yes", host, script], { stdio: ["ignore", "pipe", "ignore"] });
  let output = "";
  child.on("error", () => {});
  child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
  return {
    stop: async () => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill();
        await new Promise<void>((resolve) => child.once("close", () => resolve()));
      }
      const values = (name: string) =>
        [...output.matchAll(new RegExp(`^${name} (\\d+)$`, "gm"))].map((match) => Number(match[1]) / 1024);
      const rss = values("rss");
      const hwm = values("hwm");
      return {
        peakMiB: rss.length ? Math.max(...rss) : null,
        highWaterMiB: hwm.length ? Math.max(...hwm) : null,
      };
    },
  };
}

// --- API calls -------------------------------------------------------------

async function listModels(cfg: Config): Promise<string[]> {
  const res = await fetch(joinUrl(cfg.baseUrl, "models"), {
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GET /models failed: HTTP ${res.status} ${res.statusText} — ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    models?: Array<{ name?: string }>;
    data?: Array<{ id?: string }>;
  };
  // OVMS uses { models: [{ name }] }; OpenAI-compatible servers use { data: [{ id }] }.
  const names =
    data.models?.map((m) => m.name).filter((n): n is string => !!n) ??
    data.data?.map((m) => m.id).filter((n): n is string => !!n) ??
    [];
  return names;
}

async function runCompletion(cfg: Config): Promise<RunResult> {
  const url = joinUrl(cfg.baseUrl, "chat/completions");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);

  const start = performance.now();
  let firstTokenAt: number | null = null;
  let content = "";
  let reasoning = "";
  let promptTokens: number | null = null;
  let completionTokens: number | null = null;
  let reasoningTokens: number | null = null;
  let promptMs: number | null = null;
  const memory = monitorServerMemory();

  const body: Record<string, unknown> = {
    model: cfg.model,
    messages: [{ role: "user", content: cfg.prompt }],
    temperature: cfg.temperature,
    max_tokens: cfg.maxTokens,
    stream: true,
    // Ask for exact token counts in the final chunk (OVMS supports this).
    stream_options: { include_usage: true },
  };
  // Reasoning models (e.g. Qwen3) stream their thinking in `reasoning_content`.
  // Ask the server to skip it when --no-reasoning is set.
  if (cfg.noReasoning) body.reasoning = { effort: "none" };

  let ramPeakMiB: number | null = null;
  let ramHighWaterMiB: number | null = null;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok || !res.body) {
      const responseBody = await res.text().catch(() => "");
      throw new Error(`POST /chat/completions failed: HTTP ${res.status} ${res.statusText} — ${responseBody.slice(0, 500)}`);
    }

    // Parse the Server-Sent-Events stream.
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") {
          buffer = "";
          break;
        }
        try {
          const json = JSON.parse(payload);
          const delta = json.choices?.[0]?.delta;
          // Reasoning models stream thinking in `reasoning_content`; the final
          // answer arrives in `content`. Count both so throughput is accurate.
          if (delta?.content) {
            if (firstTokenAt === null) firstTokenAt = performance.now();
            content += delta.content;
          }
          if (delta?.reasoning_content) {
            if (firstTokenAt === null) firstTokenAt = performance.now();
            reasoning += delta.reasoning_content;
          }
          if (json.usage) {
            promptTokens = json.usage.prompt_tokens ?? promptTokens;
            completionTokens = json.usage.completion_tokens ?? completionTokens;
            reasoningTokens =
              json.usage.completion_tokens_details?.reasoning_tokens ??
              json.usage.reasoning_tokens ??
              reasoningTokens;
          }
          if (Number.isFinite(json.timings?.prompt_ms) && json.timings.prompt_ms > 0) promptMs = json.timings.prompt_ms;
          promptTokens = json.timings?.prompt_n ?? promptTokens;
        } catch {
          // Ignore keep-alive / non-JSON lines.
        }
      }
    }
  } finally {
    clearTimeout(timer);
    ({ peakMiB: ramPeakMiB, highWaterMiB: ramHighWaterMiB } = await memory.stop());
  }

  const totalMs = performance.now() - start;
  const ttftMs = firstTokenAt === null ? totalMs : firstTokenAt - start;
  const genMs = Math.max(totalMs - ttftMs, 1);

  // Prefer the server-reported token count; fall back to a whitespace estimate
  // that includes both the answer and any streamed reasoning tokens.
  const estContent = content.trim().split(/\s+/).filter(Boolean).length;
  const estReasoning = reasoning.trim().split(/\s+/).filter(Boolean).length;
  const estTokens =
    completionTokens ?? estContent + estReasoning;

  return {
    model: cfg.model,
    promptTokens,
    completionTokens,
    reasoningTokens,
    estTokens,
    ttftMs,
    totalMs,
    genTokensPerSec: estTokens / (genMs / 1000),
    overallTokensPerSec: estTokens / (totalMs / 1000),
    outputPreview: content.slice(0, 120).replace(/\s+/g, " ").trim(),
    content,
    reasoning,
    promptMs,
    ramPeakMiB,
    ramHighWaterMiB,
  };
}

// --- reporting -------------------------------------------------------------

function printHeader(cfg: Config): void {
  console.log("\n=== AI Speed Test ===");
  console.log(`Endpoint   : ${cfg.baseUrl}`);
  console.log(`Model      : ${cfg.model || "(auto)"}`);
  console.log(`Iterations : ${cfg.iterations}${cfg.noWarmup ? "" : " (+1 warm-up)"}`);
  console.log(`Max tokens : ${cfg.maxTokens}   Temperature: ${cfg.temperature}`);
  console.log(`Reasoning  : ${cfg.noReasoning ? "off" : "on (counted in throughput)"}`);
  console.log(`Prompt     : "${cfg.prompt.slice(0, 60)}${cfg.prompt.length > 60 ? "…" : ""}"`);
  console.log("----------------------------");
}

function printRun(i: number, r: RunResult, label: string): void {
  // Show the server-reported count when available, else the whitespace estimate.
  const tok = r.completionTokens !== null ? `${r.completionTokens} tok` : `${r.estTokens} tok (est)`;
  const reasoning = r.reasoningTokens !== null ? ` +${r.reasoningTokens} reasoning` : "";
  const ram = r.ramPeakMiB === null ? "" : ` | RAM ${fmt(r.ramPeakMiB, 0)} MiB peak (${fmt(r.ramHighWaterMiB ?? r.ramPeakMiB, 0)} MiB process HWM)`;
  console.log(
    `  [${label}] run ${i}: TTFT ${fmt(r.ttftMs, 0)}ms | ` +
      `${fmt(r.genTokensPerSec)} tok/s (gen) | ` +
      `${fmt(r.overallTokensPerSec)} tok/s (total) | ` +
      `${tok}${reasoning} | ${fmt(r.totalMs, 0)}ms${ram}`
  );
}

function printSummary(results: RunResult[]): void {
  const ttft = results.map((r) => r.ttftMs);
  const gen = results.map((r) => r.genTokensPerSec);
  const total = results.map((r) => r.overallTokensPerSec);
  const ram = results.flatMap((r) => (r.ramPeakMiB === null ? [] : [r.ramPeakMiB]));
  const s = (arr: number[]) => stats(arr);

  console.log("\n----------------------------");
  console.log("Summary (measured runs):");
  console.log(`  TTFT            : min ${fmt(s(ttft).min, 0)}ms | avg ${fmt(s(ttft).avg, 0)}ms | max ${fmt(s(ttft).max, 0)}ms`);
  console.log(`  Gen throughput  : min ${fmt(s(gen).min)} | avg ${fmt(s(gen).avg)} | max ${fmt(s(gen).max)} tok/s`);
  console.log(`  Overall tok/s   : min ${fmt(s(total).min)} | avg ${fmt(s(total).avg)} | max ${fmt(s(total).max)} tok/s`);
  if (ram.length) console.log(`  Peak process RAM: max ${fmt(s(ram).max, 0)} MiB`);
  console.log("");
}

// --- main ------------------------------------------------------------------

async function main(): Promise<void> {
  const cfg = resolveConfig(Bun.argv.slice(2));

  // Resolve the model name (auto-pick the first available if not supplied).
  if (!cfg.model) {
    process.stdout.write("Listing available models…\n");
    const models = await listModels(cfg);
    if (models.length === 0) {
      throw new Error("No models reported by the server. Is OVMS running?");
    }
    console.log(`  Found ${models.length} model(s): ${models.join(", ")}`);
    cfg.model = models[0];
    console.log(`  Using: ${cfg.model}\n`);
  }

  if (cfg.listOnly) {
    const models = await listModels(cfg);
    console.log(`\nAvailable models at ${cfg.baseUrl}:\n`);
    for (const m of models) console.log(`  - ${m}`);
    if (models.length === 0) console.log("  (none)");
    return;
  }

  printHeader(cfg);

  // Warm-up run (not counted) to avoid cold-start skew.
  let warmup: RunResult | null = null;
  if (!cfg.noWarmup) {
    process.stdout.write("  [warm-up] running…\n");
    try {
      warmup = await runCompletion(cfg);
      printRun(0, warmup, "warm-up");
    } catch (err) {
      console.error(`  [warm-up] failed: ${(err as Error).message}`);
    }
  }

  const results: RunResult[] = [];
  for (let i = 1; i <= cfg.iterations; i++) {
    try {
      const r = await runCompletion(cfg);
      results.push(r);
      printRun(i, r, "measured");
    } catch (err) {
      console.error(`  [measured] run ${i} failed: ${(err as Error).message}`);
    }
  }

  if (results.length === 0) {
    console.error("\nAll runs failed. Check the endpoint, model name, and API key.");
    process.exit(1);
  }

  printSummary(results);

  // Avoid prompt-cache reuse between prefill runs.
  const prefillPrompt = `${crypto.randomUUID()} Read this repeated text, then reply READY.\n${"The quick brown fox jumps over the lazy dog. The model should read this entire sentence carefully.\n".repeat(64)}`;
  const prefill = await runCompletion({ ...cfg, prompt: prefillPrompt, maxTokens: 16, noReasoning: true });
  const prefillTokenCount = prefill.promptTokens ?? prefillPrompt.trim().split(/\s+/).length;
  const prefillTokensPerSec = prefillTokenCount / ((prefill.promptMs ?? prefill.ttftMs) / 1000);
  const prefillSource = prefill.promptMs === null ? "TTFT estimate" : "server prompt timing";
  console.log(`  Prefill         : ${fmt(prefillTokensPerSec)} tok/s (${prefillSource}, ${prefillTokenCount} ${prefill.promptTokens === null ? "estimated " : ""}tokens)`);

  const timestamp = new Date().toISOString();
  const folder = path.join(import.meta.dir, "../..", "test-results", cfg.model.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^[._-]+/, "") || "unknown");
  const filename = `${timestamp.replace(/[:.]/g, "-")}.json`;
  const summary = {
    ttftMs: stats(results.map((run) => run.ttftMs)).avg,
    decodeTokensPerSec: stats(results.map((run) => run.genTokensPerSec)).avg,
    totalTokensPerSec: stats(results.map((run) => run.overallTokensPerSec)).avg,
    prefillTokensPerSec,
    prefillSource,
  };
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, filename), JSON.stringify({ timestamp, endpoint: cfg.baseUrl, model: cfg.model, settings: { prompt: cfg.prompt, iterations: cfg.iterations, maxTokens: cfg.maxTokens, temperature: cfg.temperature, noReasoning: cfg.noReasoning }, warmup, results, prefill, summary }, null, 2) + "\n");
  const table = path.join(import.meta.dir, "../..", "test-results", "test-results.md");
  try {
    await readFile(table);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await writeFile(table, "# Model test results\n\nPrefill uses server prompt timing when available; otherwise it estimates from time to first token. An asterisk marks estimated timing or token count. Decode and TTFT are averages of measured runs.\n\n| Timestamp (UTC) | Model | Endpoint | Prefill tok/s | TTFT ms | Decode tok/s | Overall tok/s | Details |\n|---|---|---|---:|---:|---:|---:|---|\n");
  }
  await appendFile(table, `| ${timestamp} | ${cfg.model.replaceAll("|", "\\|")} | ${cfg.baseUrl} | ${fmt(prefillTokensPerSec)}${prefill.promptMs === null || prefill.promptTokens === null ? "*" : ""} | ${fmt(summary.ttftMs, 0)} | ${fmt(summary.decodeTokensPerSec)} | ${fmt(summary.totalTokensPerSec)} | [JSON](./${path.basename(folder)}/${filename}) |\n`);
  console.log(`Saved results: ${path.join(folder, filename)}`);
}

main().catch((err) => {
  console.error(`\nSpeed test aborted: ${(err as Error).message}`);
  process.exit(1);
});
