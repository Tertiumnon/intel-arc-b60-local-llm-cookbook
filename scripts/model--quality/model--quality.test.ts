import { afterEach, expect, spyOn, test } from "bun:test";

import { ask, countTokens } from "./model--quality.api";
import { sampling } from "./model--quality.constants";
import { updateComparisonPage } from "./model--quality.report";
import type { Comparison, ComparisonRow } from "./model--quality.types";
import type { Task } from "./model--quality.types";
import { checkCommit, extractCode, hasForbiddenEvaluation, longPrompt, orderTasks, parseOptions } from "./model--quality.utils";

const originalFetch = globalThis.fetch;
const fetchReply = (response: Response): typeof fetch => Object.assign(async (): Promise<Response> => response, { preconnect: originalFetch.preconnect });
afterEach(() => { globalThis.fetch = originalFetch; });

test("invalid or repeated options fail before a run", () => {
  expect(() => parseOptions(["--group=typo"])).toThrow("Invalid --group");
  expect(() => parseOptions(["--context=NaN"])).toThrow("Invalid --context");
  expect(() => parseOptions(["--depth=2"])).toThrow("Invalid --depth");
  expect(() => parseOptions(["--efforts=low", "--efforts=high"])).toThrow("Invalid quality option");
  expect(parseOptions([]).efforts).toEqual(["low", "medium"]);
  expect(parseOptions([]).maxTokens).toBe(8192);
});

test("complex tasks run before long tasks", () => {
  const tasks: Task[] = [
    { id: "long", kind: "code", group: "long", prompt: "" },
    { id: "complex", kind: "code", group: "complex", prompt: "" },
    { id: "basic", kind: "code", prompt: "" },
  ];
  expect(orderTasks(tasks).map((task) => task.id)).toEqual(["basic", "complex", "long"]);
});

test("code extraction retains helpers in multiple JavaScript blocks", () => {
  expect(extractCode("Helper:\n```js\nconst a = 1;\n```\n```javascript\nfunction f() {}\n```")).toBe("const a = 1;\n\nfunction f() {}\n");
});

test("expression checks reject dynamic evaluation without rejecting strings", () => {
  expect(hasForbiddenEvaluation("function evaluate(x) { return eval(x); }")).toBe(true);
  expect(hasForbiddenEvaluation("function evaluate(x) { return globalThis['Function'](x); }")).toBe(true);
  expect(hasForbiddenEvaluation("function evaluate(x) { return 'eval' + x; }")).toBe(false);
});

test("commit check requires both changes and allows conventional custom types", async () => {
  const tasks = await Bun.file("scripts/model--quality/tasks.json").json() as Task[];
  const task = tasks.find((entry) => entry.id === "commit-login");
  if (!task) throw new Error("Missing commit-login task");
  expect(checkCommit(task, "feat: x")).toBe(false);
  expect(checkCommit(task, "security(login): validate login and fix README typo")).toBe(true);
});

test("long prompts are measured against the requested token budget", async () => {
  const task: Task = { id: "long", kind: "code", group: "long", prompt: "Find current rules" };
  const output = await longPrompt({ task, planted: "CURRENT_RULES", target: 500, depth: 0.4, count: async (value) => value.length });
  expect(output.tokens).toBe(500);
  expect(output.prompt).toContain("CURRENT_RULES");
  expect(output.prompt).toEndWith("Find current rules");
});

test("HTTP errors are reported as request errors instead of model answers", async () => {
  spyOn(globalThis, "fetch").mockImplementation(fetchReply(new Response("error", { status: 500 })));
  const api = { base: "http://example.test/v1", key: "local", model: "test", strata: false };
  await expect(ask({ api, prompt: "test", effort: "low", maxTokens: 10 })).rejects.toThrow("HTTP 500");
});

test("token counting uses the backend's tokenizer result", async () => {
  const fetch = spyOn(globalThis, "fetch").mockImplementation(fetchReply(Response.json({ tokens: [1, 2, 3] })));
  expect(await countTokens({ base: "http://example.test/v1", key: "local", model: "test", strata: false }, "test")).toBe(3);
  fetch.mockImplementation(fetchReply(Response.json({ input_tokens: 4 })));
  expect(await countTokens({ base: "http://example.test/v1", key: "local", model: "test", strata: true }, "test")).toBe(4);
});

test("sampling parameters are sent explicitly to the model", async () => {
  let request: Record<string, unknown> = {};
  spyOn(globalThis, "fetch").mockImplementation(Object.assign(async (_url: string | URL | Request, options?: RequestInit): Promise<Response> => {
    request = JSON.parse(String(options?.body)) as Record<string, unknown>;
    return new Response('data: {"choices":[{"finish_reason":"stop","delta":{"content":"ok"}}],"usage":{"completion_tokens":1,"prompt_tokens":2}}\n\ndata: [DONE]\n\n');
  }, { preconnect: originalFetch.preconnect }) as typeof fetch);
  const api = { base: "http://example.test/v1", key: "local", model: "test", strata: false };
  await ask({ api, prompt: "test", effort: "low", maxTokens: 8192, temperature: 0.6 });
  expect(request.temperature).toBe(0.6);
  expect(request.top_p).toBe(0.95);
  expect(request.top_k).toBe(20);
  expect(request.seed).toBe(42);
});

test("comparison rejects unsupported allocations and task counts before switching models", async () => {
  for (const args of [["--allocation=32768"], ["--allocation=65536", "--limit=6"]]) {
    const child = Bun.spawn([process.execPath, "scripts/model--quality/model--quality.compare.ts", ...args], { stdout: "pipe", stderr: "pipe" });
    const [status, error] = await Promise.all([child.exited, new Response(child.stderr).text()]);
    expect(status).toBe(1);
    expect(error).toContain("Comparison failed");
  }
});

const comparisonRow = (model: string, passed: number): ComparisonRow => ({
  model, switchExit: 0, qualityExit: 0, resultFile: "", passed, failed: 2 - passed,
  incomplete: 0, errors: 0, seconds: 12, completionTokens: 100, inputMin: 49001, inputMax: 49002, note: "",
});

const comparison: Comparison = {
  completedAt: "2026-11-27T12:00:00Z", allocation: 65536, promptTarget: 49152, effort: "low",
  limit: 2, sampling, maxTokens: 8192, filter: null, tasks: ["cache", "parser"], rows: [],
};
const comparisonPage = "Before\n<!-- quality-comparison:start -->\nOld results\n<!-- quality-comparison:end -->\nAfter";

test("published comparison preserves surrounding content and shows tied winners", () => {
  const rows = [comparisonRow("model A", 2), comparisonRow("model B", 2), comparisonRow("model C", 1)];
  const page = updateComparisonPage(comparisonPage, { ...comparison, rows });
  expect(page).toContain("Before\n<!-- quality-comparison:start -->");
  expect(page).toEndWith("<!-- quality-comparison:end -->\nAfter");
  expect(page).not.toContain("Old results");
  expect(page).toContain("Best completed results (tie): **model A; model B**, 2/2 checks passed.");
  expect(page).toContain("49001–49002");
  expect(updateComparisonPage(page, { ...comparison, rows })).toBe(page);
});

test("incomplete models cannot win and a filtered run is clearly identified", () => {
  const incomplete = { ...comparisonRow("unfinished", 2), qualityExit: 1, incomplete: 1 };
  const page = updateComparisonPage(comparisonPage, { ...comparison, filter: "subset", rows: [incomplete, comparisonRow("complete", 1)] });
  expect(page).toContain("Best completed result: **complete**, 1/2 checks passed.");
  expect(page).toContain("Model filter: subset");
  expect(page).toContain("| unfinished | Incomplete/error |");
});

test("comparison without a passing complete model has no winner", () => {
  const page = updateComparisonPage(comparisonPage, { ...comparison, rows: [comparisonRow("model", 0)] });
  expect(page).toContain("No winner: no fully evaluated model passed a check.");
  expect(() => updateComparisonPage("no markers", comparison)).toThrow("restore the markers");
  expect(() => updateComparisonPage(comparisonPage + comparisonPage, comparison)).toThrow("duplicated");
});

test("the results page contains a replaceable comparison section", async () => {
  const page = await Bun.file("content/results.md").text();
  const updated = updateComparisonPage(page, comparison);
  expect(updated).toContain("## Historical complex sweep coverage");
  expect(updated).toContain("No winner: no fully evaluated model passed a check.");
});
