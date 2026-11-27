import { randomUUID } from "node:crypto";

import { sandboxImage } from "./model--quality.constants";
import type { Task } from "./model--quality.types";

const symbols: Record<string, string> = {
  "sort-unique": "sortUnique", debounce: "debounce", "parse-query": "parseQuery", "deep-clone": "deepClone",
  chunk: "chunk", "fix-average": "average", retry: "retry", "map-limit": "mapLimit",
  "complex-ttl-cache": "TtlCache", "complex-expression": "evaluate", "long-discount": "discountFor",
  "long-shipping": "shippingFor", "complex-merge-intervals": "mergeIntervals", "complex-topo-sort": "topoSort", "complex-get-path": "getPath",
};

const verifier = String.raw`
const vm = require('node:vm');
const fs = require('node:fs');
const p = JSON.parse(fs.readFileSync(0, 'utf8'));
const scope = () => {
  const context = vm.createContext({}, { codeGeneration: { strings: false, wasm: false } });
  const install = vm.runInContext('(hostSet, hostClear, NativeParams) => {\n' +
    'let next=0; const timers=new Map();\n' +
    'globalThis.setTimeout=(fn,ms,...args)=>{const id=++next; timers.set(id,hostSet(()=>{timers.delete(id);fn(...args)},ms));return id};\n' +
    'globalThis.clearTimeout=id=>{if(timers.has(id)){hostClear(timers.get(id));timers.delete(id)}};\n' +
    'globalThis.URLSearchParams=class { #value; constructor(value){this.#value=new NativeParams(value)} append(k,v){this.#value.append(k,v)} delete(k,v){if(v===undefined)this.#value.delete(k);else this.#value.delete(k,v)} get(k){return this.#value.get(k)} getAll(k){return Array.from(this.#value.getAll(k))} has(k){return this.#value.has(k)} set(k,v){this.#value.set(k,v)} sort(){this.#value.sort()} toString(){return this.#value.toString()} get size(){return this.#value.size} *entries(){for(const [k,v] of this.#value)yield [k,v]} *keys(){for(const [k] of this)yield k} *values(){for(const [,v] of this)yield v} forEach(fn,thisArg){for(const [k,v] of this)fn.call(thisArg,v,k,this)} [Symbol.iterator](){return this.entries()} };\n' +
    'globalThis.structuredClone=(value)=>{const seen=new WeakMap(); const clone=x=>{if(x===null||typeof x!=="object")return x;if(seen.has(x))return seen.get(x);const out=Array.isArray(x)?[]:{};seen.set(x,out);for(const k of Object.keys(x))out[k]=clone(x[k]);return out};return clone(value)};\n' +
    'globalThis.console={log(){},warn(){},error(){}};\n' +
    '}', context);
  install(setTimeout, clearTimeout, URLSearchParams);
  return context;
};
(async () => {
  try {
    const answerContext = scope();
    const errors = vm.runInContext('({Error, TypeError, RangeError})', answerContext);
    const clock = p.symbol === 'debounce' ? vm.runInContext('(() => {\n' +
      'let now=0, next=0; const timers=new Map();\n' +
      'globalThis.setTimeout=(fn,ms,...args)=>{const id=++next;timers.set(id,{fn,args,at:now+ms});return id};\n' +
      'globalThis.clearTimeout=id=>timers.delete(id);\n' +
      'return {advance(ms){now+=ms;for(const [id,timer] of timers)if(timer.at<=now){timers.delete(id);timer.fn(...timer.args)}}};\n' +
      '})()', answerContext) : undefined;
    const answer = new vm.SourceTextModule(p.code + '\n;globalThis.__answer = typeof ' + p.symbol + " === 'undefined' ? undefined : " + p.symbol + ';', { context: answerContext });
    await answer.link((name) => {
      if (!Object.hasOwn(p.fixtures, name)) throw new Error('Unsupported import: ' + name);
      return new vm.SourceTextModule(p.fixtures[name], { context: answerContext });
    });
    await answer.evaluate({ timeout: 10000 });
    if (typeof answerContext.__answer !== 'function') throw new Error('Missing requested function or class');
    const testContext = scope();
    Object.assign(testContext, errors);
    const tests = new vm.Script('(async (answer, __clock) => { const ' + p.symbol + ' = answer;\n' + p.tests + '\n})');
    const run = tests.runInContext(testContext, { timeout: 10000 });
    await run(answerContext.__answer, clock);
    process.stdout.write(JSON.stringify({ token: p.token, pass: true, note: '' }));
  } catch (error) {
    process.stdout.write(JSON.stringify({ token: p.token, pass: false, note: String(error).slice(0, 300) }));
  }
})();
`;

const sandboxCommand = [
  "docker", "run", "--rm", "-i", "--pull=never", "--network=none", "--read-only", "--cap-drop=ALL",
  "--security-opt=no-new-privileges", "--pids-limit=32", "--memory=256m", "--cpus=1", "--user=65534:65534",
  "--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=16m", "--workdir=/tmp", sandboxImage,
  "node", "--no-warnings", "--experimental-vm-modules", "-e", verifier,
];

const remote = `import json, resource, subprocess, sys, tempfile, uuid
name = 'quality-' + uuid.uuid4().hex
command = ${JSON.stringify(sandboxCommand)}
command[3:3] = ['--name', name]
def limit_output():
    resource.setrlimit(resource.RLIMIT_FSIZE, (1048576, 1048576))
with tempfile.TemporaryFile() as output:
    try:
        result = subprocess.run(command, input=sys.stdin.buffer.read(), stdout=output, stderr=subprocess.DEVNULL, timeout=25, preexec_fn=limit_output)
    except subprocess.TimeoutExpired:
        cleanup = subprocess.run(['docker', 'rm', '-f', name], stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=10)
        if cleanup.returncode != 0:
            sys.stderr.write('Timed-out quality sandbox could not be removed; check Docker on the AI server')
            sys.exit(1)
        print(json.dumps({'timeout': True}))
        sys.exit(0)
    if result.returncode != 0:
        sys.stderr.write('Sandbox failed; install the pinned quality image and check Docker on the AI server')
        sys.exit(1)
    output.seek(0)
    sys.stdout.buffer.write(output.read(1048576))
`;

export const checkSandbox = async (options: {
  host: string;
  task: Task;
  code: string;
  fixtures: Record<string, string>;
}): Promise<{ pass: boolean; note: string }> => {
  const { host, task, code, fixtures } = options;
  const symbol = symbols[task.id];
  if (!symbol || !task.tests) throw new Error(`Missing checker for ${task.id} - update tasks.json and the sandbox`);
  if (!/^[A-Za-z0-9._-]+$/.test(host)) throw new Error("AI_SSH_HOST must be an SSH config alias");
  const token = randomUUID();
  const command = `python3 -c '${remote.replaceAll("'", "'\\''")}'`;
  const child = Bun.spawn(["ssh", "-o", "BatchMode=yes", host, command], { stdin: "pipe", stdout: "pipe", stderr: "pipe" });
  child.stdin.write(JSON.stringify({ code, tests: task.tests, symbol, fixtures, token }));
  child.stdin.end();
  const [output, error, status] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  if (status !== 0) throw new Error(`Quality sandbox failed: ${error.trim() || "check SSH and Docker on the AI server"}`);
  const result = JSON.parse(output) as { token?: string; pass?: boolean; note?: string; timeout?: boolean };
  if (result.timeout) return { pass: false, note: "Answer or checks exceeded the 25-second sandbox limit" };
  if (result.token !== token || typeof result.pass !== "boolean" || typeof result.note !== "string") throw new Error("Quality sandbox returned an invalid verdict - check the server image");
  return { pass: result.pass, note: result.note };
};
