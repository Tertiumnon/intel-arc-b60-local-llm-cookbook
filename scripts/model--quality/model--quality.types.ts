export type Task = {
  id: string;
  kind: "code" | "commit";
  group?: "basic" | "complex" | "long";
  prompt: string;
  tests?: string;
  pattern?: string;
  terms?: string[][];
  planted?: string[];
};

export type QualityResult = {
  task: string;
  effort: string;
  status: "running" | "pass" | "fail" | "incomplete" | "error";
  pass: boolean | null;
  finish: string;
  completionTokens: number | null;
  promptTokens: number | null;
  seconds: number;
  repeatedLines: boolean;
  note: string;
  text: string;
  reasoning: string;
};

export type QualityReply = {
  text: string;
  reasoning: string;
  finish: string;
  completionTokens: number | null;
  promptTokens: number | null;
  seconds: number;
};

export type QualityApi = { base: string; key: string; model: string; strata: boolean };

export type QualityOptions = {
  efforts: string[];
  maxTokens: number;
  contextTokens: number;
  padded: boolean;
  temperature: number;
  seed: number;
  limit: number;
  depth: number;
  rep: string;
  group?: "basic" | "complex" | "long";
};

export type QualityRun = {
  api: QualityApi;
  host: string;
  context: number;
  options: QualityOptions;
  fixtures: Record<string, string>;
  prompts: Map<string, string>;
};

export type ComparisonRow = {
  model: string;
  switchExit: number | null;
  qualityExit: number | null;
  resultFile: string;
  passed: number;
  failed: number;
  incomplete: number;
  errors: number;
  seconds: number;
  completionTokens: number;
  inputMin: number | null;
  inputMax: number | null;
  note: string;
};

export type Comparison = {
  completedAt: string;
  allocation: number;
  promptTarget: number;
  effort: string;
  limit: number;
  sampling: { [K in keyof typeof import("./model--quality.constants").sampling]: number };
  maxTokens: number;
  filter: string | null;
  tasks: string[];
  rows: ComparisonRow[];
};
