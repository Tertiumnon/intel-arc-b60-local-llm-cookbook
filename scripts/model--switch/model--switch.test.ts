import { expect, test } from "bun:test";

import { codingArgs, codingChoices } from "./model--switch.coding";

test("coding choices preserve approaches, model variants, and context", async () => {
  const presets = await Bun.file("scripts/model--switch/presets.json").json() as Parameters<typeof codingChoices>[0];
  const choices = codingChoices(presets);
  for (const choice of choices) {
    for (const context of [32768, 49152, 57344, 65536]) {
      const preset = codingArgs(choice, context)[0];
      if (preset.startsWith("--preset=")) {
        const setting = presets[preset.slice(9)];
        expect(typeof setting === "object" ? setting.context : undefined).toBe(context);
      }
    }
  }
  expect(choices.some((choice) => choice.label.includes("(Strata, IQ1_M)"))).toBe(true);
  expect(choices.some((choice) => choice.label.includes("(Strata, IQ2_XS)"))).toBe(true);
  expect(choices.some((choice) => choice.label.includes("(arc-lab, DFlash2)"))).toBe(true);
  expect(choices.some((choice) => choice.args.includes("--preset=tts-qwen3"))).toBe(false);
  expect(choices.filter((choice) => choice.label.startsWith("unsloth/Qwen3.8-27B-GGUF/Qwen3.8-27B-UD-Q4_K_XL.gguf"))).toHaveLength(1);
  const llama = choices.find((choice) => choice.args.includes("--preset=terse:no-mtp"));
  expect(llama).toBeDefined();
  if (!llama) throw new Error("Missing no-MTP Signal choice");
  expect(codingArgs(llama, 49152)).toEqual(["--preset=terse:no-mtp:ctx49k"]);
  expect(codingArgs(llama, 131072)).toEqual(["--preset=terse:no-mtp"]);
  expect(() => codingArgs(llama, 12345)).toThrow();
  const strata = choices[0];
  expect(codingArgs(strata, 57344)).toEqual(["--service=strata", "--model=coder:IQ1_M", "--context=57344"]);
  expect(codingArgs(strata, 131072)).toEqual(["--service=strata", "--model=coder:IQ1_M"]);
  expect(codingArgs(choices[2], 49152)).toEqual(["--service=arc-lab", "--context=49152"]);
});
