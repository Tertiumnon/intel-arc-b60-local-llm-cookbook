import ts from "typescript";

import { defaultContextTokens, defaultDepth, defaultEfforts, defaultMaxTokens, defaultRepeat, sampling } from "./model--quality.constants";
import type { QualityOptions, Task } from "./model--quality.types";

export const parseOptions = (args: string[]): QualityOptions => {
  const names = ["efforts", "max-tokens", "context", "depth", "rep", "group", "temperature", "limit", "seed"];
  const values = new Map<string, string>();
  for (const arg of args) {
    const match = /^--([a-z-]+)=(.+)$/.exec(arg);
    if (!match || !names.includes(match[1]) || values.has(match[1])) throw new Error(`Invalid quality option ${arg} - check --efforts, --group, --max-tokens, --context, --depth, --rep, --temperature, --seed, and --limit`);
    values.set(match[1], match[2]);
  }
  const efforts = values.has("efforts") ? values.get("efforts")!.split(",") : defaultEfforts;
  const maxTokens = values.has("max-tokens") ? Number(values.get("max-tokens")) : defaultMaxTokens;
  const contextTokens = values.has("context") ? Number(values.get("context")) : defaultContextTokens;
  const depth = values.has("depth") ? Number(values.get("depth")) : defaultDepth;
  const rep = values.has("rep") ? values.get("rep")! : defaultRepeat;
  const group = values.get("group");
  const temperature = values.has("temperature") ? Number(values.get("temperature")) : sampling.temperature;
  const seed = values.has("seed") ? Number(values.get("seed")) : sampling.seed;
  const limit = values.has("limit") ? Number(values.get("limit")) : 5;
  if (!efforts.length || efforts.some((effort) => !["none", "low", "medium", "high", "xhigh"].includes(effort)) || new Set(efforts).size !== efforts.length) throw new Error("Invalid --efforts - choose distinct values from none, low, medium, high, xhigh");
  if (!Number.isInteger(maxTokens) || maxTokens < 1) throw new Error("Invalid --max-tokens - enter a positive integer");
  if (!Number.isInteger(contextTokens) || contextTokens < 1) throw new Error("Invalid --context - enter a positive token count");
  if (!Number.isFinite(depth) || depth < 0 || depth > 1) throw new Error("Invalid --depth - enter a number from 0 to 1");
  if (!/^[A-Za-z0-9_-]+$/.test(rep)) throw new Error("Invalid --rep - use letters, digits, underscores, or hyphens");
  if (group !== undefined && group !== "basic" && group !== "complex" && group !== "long") throw new Error("Invalid --group - choose basic, complex, or long");
  if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) throw new Error("Invalid --temperature - choose 0 to 2");
  if (!Number.isSafeInteger(seed) || seed < 1) throw new Error("Invalid --seed - choose a positive integer");
  if (!Number.isInteger(limit) || limit < 1 || limit > 5 || (values.has("limit") && group !== "complex")) throw new Error("Invalid --limit - use 1 to 5 with --group=complex");
  return { efforts, maxTokens, contextTokens, padded: values.has("context"), depth, rep, group, temperature, limit, seed };
};

export const extractCode = (text: string): string => {
  const blocks = [...text.matchAll(/```(?:javascript|js|mjs)?[ \t]*\r?\n([\s\S]*?)```/gi)];
  return blocks.length ? blocks.map((block) => block[1]).join("\n") : text;
};

export const hasForbiddenEvaluation = (text: string): boolean => {
  const source = ts.createSourceFile("answer.js", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const visit = (node: ts.Node): boolean => {
    if (ts.isIdentifier(node) && (node.text === "eval" || node.text === "Function")) return true;
    if (ts.isElementAccessExpression(node) && ts.isStringLiteral(node.argumentExpression) && ["eval", "Function"].includes(node.argumentExpression.text)) return true;
    return ts.forEachChild(node, visit) === true;
  };
  return visit(source);
};

export const checkCommit = (task: Task, text: string): boolean => {
  if (!task.pattern || !task.terms) throw new Error(`Missing commit checks for ${task.id} - update tasks.json`);
  const subject = text.trim().split("\n")[0];
  return new RegExp(task.pattern).test(subject) && task.terms.every((alternatives) => alternatives.some((term) => text.toLowerCase().includes(term)));
};

export const looping = (text: string): boolean => {
  const counts = new Map<string, number>();
  for (const line of text.split("\n").map((value) => value.trim()).filter((value) => value.length > 3)) {
    counts.set(line, (counts.get(line) ?? 0) + 1);
    if (counts.get(line) === 8) return true;
  }
  return false;
};

export const orderTasks = (tasks: Task[]): Task[] => {
  const order = { basic: 0, complex: 1, long: 2 };
  return [...tasks].sort((left, right) => order[left.group ?? "basic"] - order[right.group ?? "basic"]);
};

export const longPrompt = async (options: {
  task: Task;
  planted: string;
  target: number;
  depth: number;
  count: (text: string) => Promise<number>;
}): Promise<{ prompt: string; tokens: number }> => {
  const { task, planted, target, depth, count } = options;
  let filler = "";
  for (let index = 0; filler.length < target * 8; index++) {
    filler += `// util/helper${index}.js\nexport function scale${index}(x, n) {\n  return (x * ${(index % 97) + 3} + n) % ${(index % 13) + 5};\n}\n\n`;
  }
  let low = 0;
  let high = filler.length;
  let prompt = "";
  let tokens = 0;
  while (low <= high) {
    const size = Math.floor((low + high) / 2);
    const split = Math.floor(size * depth);
    const candidate = `Code base:\n\n${filler.slice(0, split)}\n${planted}\n${filler.slice(split, size)}\n\nTask:\n${task.prompt}`;
    const actual = await count(candidate);
    if (actual <= target) {
      prompt = candidate;
      tokens = actual;
      low = size + 1;
    } else high = size - 1;
  }
  if (!prompt) throw new Error(`The ${task.id} fixture exceeds ${target} tokens - increase --context`);
  return { prompt, tokens };
};
