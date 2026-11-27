import { sampling } from "./model--quality.constants";
import type { QualityApi, QualityReply } from "./model--quality.types";

export const countTokens = async (api: QualityApi, text: string): Promise<number> => {
  const endpoint = api.strata ? `${api.base}/messages/count_tokens` : `${api.base.slice(0, -3)}/tokenize`;
  const body = api.strata ? { model: api.model, messages: [{ role: "user", content: text }] } : { content: text, add_special: true };
  const response = await fetch(endpoint, {
    method: "POST", headers: { Authorization: `Bearer ${api.key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Token counting failed (HTTP ${response.status}) - check the server tokenizer endpoint`);
  const data = await response.json() as { input_tokens?: number; tokens?: unknown[] };
  const count = api.strata ? data.input_tokens : data.tokens?.length;
  if (!Number.isInteger(count) || count === undefined || count < 0) throw new Error("Token counting returned no valid count - check the server tokenizer");
  return count;
};

export const ask = async (options: {
  api: QualityApi; prompt: string; effort: string; maxTokens: number; temperature?: number; seed?: number;
}): Promise<QualityReply> => {
  const { api, prompt, effort, maxTokens } = options;
  const started = performance.now();
  const response = await fetch(`${api.base}/chat/completions`, {
    method: "POST", headers: { Authorization: `Bearer ${api.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...sampling, temperature: options.temperature === undefined ? sampling.temperature : options.temperature, seed: options.seed === undefined ? sampling.seed : options.seed, model: api.model, messages: [{ role: "user", content: prompt }], max_tokens: maxTokens, reasoning_effort: effort, stream: true, stream_options: { include_usage: true } }),
    signal: AbortSignal.timeout(3600000),
  });
  if (!response.ok) throw new Error(`Model request failed (HTTP ${response.status})`);
  if (!response.body) throw new Error("Model response has no stream");
  let text = "", reasoning = "", finish = "", buffer = "";
  let completionTokens: number | null = null, promptTokens: number | null = null;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  for (let read = await reader.read(); !read.done; read = await reader.read()) {
    buffer += decoder.decode(read.value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ") || line.includes("[DONE]")) continue;
      const data = JSON.parse(line.slice(6)) as { error?: unknown; choices?: Array<{ finish_reason?: string | null; delta?: { content?: string; reasoning_content?: string; reasoning?: string } }>; usage?: { completion_tokens?: number; prompt_tokens?: number } };
      if (data.error) throw new Error("Model response stream reported an error");
      const choice = data.choices?.[0];
      if (choice?.delta?.content) text += choice.delta.content;
      const thought = choice?.delta?.reasoning_content ?? choice?.delta?.reasoning;
      if (thought) reasoning += thought;
      if (choice?.finish_reason) finish = choice.finish_reason;
      if (data.usage) {
        completionTokens = data.usage.completion_tokens ?? completionTokens;
        promptTokens = data.usage.prompt_tokens ?? promptTokens;
      }
    }
  }
  if (!finish) throw new Error("Model response ended without a finish reason");
  return { text, reasoning, finish, completionTokens, promptTokens, seconds: (performance.now() - started) / 1000 };
};
