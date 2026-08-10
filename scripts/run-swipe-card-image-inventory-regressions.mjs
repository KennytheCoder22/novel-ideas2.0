import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => {
  const source = readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  module._compile(output, filename);
};

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
  const { wikipediaTitleCandidates } = require(resolve(repoRoot, "screens", "swipe", "swipeCardImages.ts"));
  assert(
    wikipediaTitleCandidates("Never Have I Ever", "tv")[0] === "Never Have I Ever (TV series)",
    "ambiguous_tv_title_not_disambiguated",
  );
  assert(
    wikipediaTitleCandidates("The Sopranos (TV series)", "tv")[1] === "The Sopranos",
    "invalid_explicit_suffix_does_not_fall_back_to_base_title",
  );
  const screenSource = readFileSync(resolve(repoRoot, "screens", "SwipeDeckScreen.tsx"), "utf8");
  assert(
    screenSource.includes("[currentCard, currentCardKey, swipeCoverCache, swipeCoverFailures]"),
    "failed_image_does_not_trigger_next_fallback",
  );
  checks.push(
    { name: "ambiguous_media_title_disambiguated", pass: true },
    { name: "explicit_suffix_falls_back_to_base_title", pass: true },
    { name: "failed_image_advances_fallback", pass: true },
  );
  process.stdout.write(`${JSON.stringify({
    ok: true,
    checks,
    outputPath: payload.outputPath,
  }, null, 2)}\n`);
}

main();
