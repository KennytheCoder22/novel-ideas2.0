import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { analyzeSwipeCardImage } from "./swipe-card-image-quality.mjs";

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

async function main() {
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
  const solidBlack = await sharp({
    create: { width: 100, height: 100, channels: 3, background: "#000000" },
  }).png().toBuffer();
  const nearBlackLogo = await sharp({
    create: { width: 100, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite([{
    input: Buffer.from(
      '<svg width="100" height="100"><text x="10" y="55" fill="#160c29" font-size="22">LOGO</text></svg>',
    ),
  }]).png().toBuffer();
  const legitimateDarkPoster = await sharp({
    create: { width: 100, height: 100, channels: 3, background: "#090b12" },
  }).composite([{
    input: Buffer.from(
      '<svg width="100" height="100"><circle cx="50" cy="42" r="24" fill="#db8c37"/><rect x="12" y="76" width="76" height="8" fill="#eee"/></svg>',
    ),
  }]).png().toBuffer();
  assert((await analyzeSwipeCardImage(solidBlack)).visuallyBlank, "solid_black_image_not_rejected");
  assert((await analyzeSwipeCardImage(nearBlackLogo)).visuallyBlank, "near_black_logo_not_rejected");
  assert(!(await analyzeSwipeCardImage(legitimateDarkPoster)).visuallyBlank, "legitimate_dark_poster_rejected");
  checks.push(
    { name: "ambiguous_media_title_disambiguated", pass: true },
    { name: "explicit_suffix_falls_back_to_base_title", pass: true },
    { name: "failed_image_advances_fallback", pass: true },
    { name: "solid_black_image_rejected", pass: true },
    { name: "near_black_logo_rejected", pass: true },
    { name: "legitimate_dark_poster_allowed", pass: true },
  );
  process.stdout.write(`${JSON.stringify({
    ok: true,
    checks,
    outputPath: payload.outputPath,
  }, null, 2)}\n`);
}

await main();
