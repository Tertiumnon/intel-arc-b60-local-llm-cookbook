export const defaultEfforts = ["low", "medium"];
export const defaultMaxTokens = 8192;
export const defaultContextTokens = 30000;
export const defaultDepth = 0.4;
export const defaultRepeat = "1";
export const contextHeadroom = 256;
export const sandboxImage = "node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a";

export const sampling = { temperature: 0.5, top_p: 0.95, top_k: 20, min_p: 0, repeat_penalty: 1, repetition_penalty: 1, presence_penalty: 0, frequency_penalty: 0, seed: 42 } as const;
