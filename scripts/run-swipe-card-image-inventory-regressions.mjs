import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");

function runNode(scriptPath, args = []) {
  const run = spawnSync(process.execPath, [resolve(scriptDir, scriptPath), ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return {
    ok: run.status === 0 && !run.error,
    stdout: String(run.stdout || ""),
    stderr: String(run.stderr || ""),
    status: run.status,
  };
}

function parsePayload(stdout) {
  const text = String(stdout || "").trim();
  const start = text.indexOf("{");
  if (start < 0) return null;
  try {
    return JSON.parse(text.slice(start));
  } catch {
    return null;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function main() {
  const run = runNode("generate-swipe-card-image-inventory.mjs", ["--assert"]);
  assert(run.ok, `inventory_generation_failed:${run.stderr || run.stdout}`);
  const payload = parsePayload(run.stdout);
  assert(payload && payload.ok, "inventory_payload_invalid_or_failed");
  const checks = Array.isArray(payload.checks) ? payload.checks : [];
  assert(checks.every((row) => row.pass), "inventory_regression_check_failed");
  process.stdout.write(`${JSON.stringify({
    ok: true,
    checks,
    outputPath: payload.outputPath,
  }, null, 2)}\n`);
}

main();
