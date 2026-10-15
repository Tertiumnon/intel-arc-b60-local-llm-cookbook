#!/usr/bin/env bun
import { spawn } from "node:child_process";

// Usage:
//   bun run delete                         list GGUF files and OpenVINO models (read-only)
//   bun run delete -- --gguf=FILE.gguf     dry run: show what would be removed
//   bun run delete -- --gguf=FILE.gguf --yes
//   bun run delete -- --openvino=DIR [--yes]
// Without --yes nothing is removed. A model referenced by a systemd unit or a
// Strata config is refused.

const safeName = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function required(name: string): string {
  const value = Bun.env[name]?.trim();
  if (!value) throw new Error(`Set ${name} in the root .env`);
  return value;
}

const remoteScript = `set -euo pipefail
mode="$1"; kind="$2"; name="\${3:-}"
case "$kind" in
  gguf) base=/models/gguf ;;
  openvino) base=/models/OpenVINO ;;
  *) echo "unknown kind: $kind" >&2; exit 2 ;;
esac

if [ "$mode" = list ]; then
  if [ "$kind" = gguf ]; then
    find "$base" -maxdepth 1 -name '*.gguf' -printf '%s %f\\n' | sort -n |
      awk '{ printf "%8.2f GiB  %s\\n", $1 / 1073741824, $2 }'
  else
    du -sh "$base"/*/ 2>/dev/null | sort -h
  fi
  exit 0
fi

target="$base/$name"
if [ ! -e "$target" ]; then echo "Not found: $target" >&2; exit 1; fi

refs="$(grep -lF -- "$name" /etc/systemd/system/*.service /models/Strata/strata-*.json 2>/dev/null || true)"
if [ -n "$refs" ]; then
  echo "Refused: $name is referenced by:" >&2
  echo "$refs" >&2
  exit 3
fi

if [ "$kind" = gguf ]; then
  # The gguf is hardlinked to a Hugging Face cache blob; snapshot symlinks point at the blob.
  files="$(find "$base" /models/.hf-cache/hub -xdev -samefile "$target" -print)"
  links=""
  for f in $files; do
    case "$f" in
      /models/.hf-cache/hub/*/blobs/*)
        links="$links$(find /models/.hf-cache/hub -type l -lname "*/\${f##*/}" -print 2>/dev/null || true)"$'\\n' ;;
    esac
  done
  all="$(printf '%s\\n%s\\n' "$files" "$links" | grep . | sort -u)"
else
  all="$target"
fi

echo "Will remove:"
echo "$all"
echo "Total size (hardlinks counted once):"
du -ch $all 2>/dev/null | tail -1

if [ "$mode" = delete ]; then
  if [ "$kind" = gguf ]; then
    echo "$all" | xargs -d '\\n' rm -f --
  else
    rm -rf -- "$target"
  fi
  echo "Deleted $name"
fi
`;

async function run(args: string[], input: string) {
  return new Promise<number>((resolve, reject) => {
    const child = spawn("ssh", ["-o", "BatchMode=yes", required("AI_SSH_HOST"), "bash", "-s", "--", ...args], {
      stdio: ["pipe", "inherit", "inherit"],
    });
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
    child.stdin.end(input);
  });
}

async function main() {
  const options = process.argv.slice(2);
  const gguf = options.find((arg) => arg.startsWith("--gguf="))?.slice(7);
  const openvino = options.find((arg) => arg.startsWith("--openvino="))?.slice(11);
  const execute = options.includes("--yes");
  const known = ["--yes"];
  const unknown = options.filter((arg) => !known.includes(arg) && !arg.startsWith("--gguf=") && !arg.startsWith("--openvino="));
  if (unknown.length || (gguf !== undefined && openvino !== undefined)) {
    throw new Error("Usage: [--gguf=FILE.gguf | --openvino=DIR] [--yes]");
  }

  if (gguf === undefined && openvino === undefined) {
    console.log("GGUF files (/models/gguf):");
    if ((await run(["list", "gguf"], remoteScript)) !== 0) throw new Error("listing GGUF files failed");
    console.log("\nOpenVINO models (/models/OpenVINO):");
    if ((await run(["list", "openvino"], remoteScript)) !== 0) throw new Error("listing OpenVINO models failed");
    return;
  }

  const kind = gguf !== undefined ? "gguf" : "openvino";
  const name = gguf ?? openvino ?? "";
  if (!safeName.test(name)) throw new Error("Name must be a plain file or directory name");
  const mode = execute ? "delete" : "plan";
  if (!execute) console.log("Dry run. Add --yes to delete.\n");
  if ((await run([mode, kind, name], remoteScript)) !== 0) throw new Error(`${kind} ${name}: ${mode} failed`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
