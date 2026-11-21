import { expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

test("setup selects the served model and preserves existing Pi settings", async (): Promise<void> => {
  const home = await mkdtemp(path.join(tmpdir(), "pi-setup-"));
  try {
    const agent = path.join(home, ".pi", "agent");
    await mkdir(agent, { recursive: true });
    await writeFile(path.join(agent, "settings.json"), JSON.stringify({ defaultThinkingLevel: "medium", defaultModel: "old" }));
    const mock = path.join(home, "fetch.js");
    await writeFile(mock, 'globalThis.fetch = async () => new Response(JSON.stringify({data:[{id:"current-model",meta:{n_ctx:131072}}]}));');
    const command = Bun.spawn([process.execPath, "--preload", mock, path.join(import.meta.dir, "pi--setup.ts")], {
      env: { ...process.env, HOME: home, USERPROFILE: home, AI_API_URL: "http://test.invalid/v1", AI_API_KEY: "test", BUN_CONFIG_NO_DOTENV: "1" },
      stdout: "ignore",
      stderr: "pipe",
    });
    expect(await command.exited).toBe(0);
    const settings = JSON.parse(await readFile(path.join(agent, "settings.json"), "utf8"));
    const config = JSON.parse(await readFile(path.join(agent, "models.json"), "utf8"));
    expect(settings).toMatchObject({ defaultModel: "current-model", defaultProvider: "arc-b60", defaultThinkingLevel: "medium" });
    expect(config.providers["arc-b60"].models[0]).toMatchObject({ id: "current-model", contextWindow: 131072 });
    expect(JSON.parse(await readFile(path.join(agent, "settings.json.previous"), "utf8")).defaultModel).toBe("old");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
