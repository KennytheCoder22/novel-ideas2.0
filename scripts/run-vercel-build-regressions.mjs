import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const ts = require("typescript");
const options = {
  noEmit: true, skipLibCheck: true, types: ["node"],
  module: ts.ModuleKind.CommonJS, moduleResolution: ts.ModuleResolutionKind.Node10,
  target: ts.ScriptTarget.ES2022, esModuleInterop: true,
};
const api = resolve(root, "api/human-review-append.ts");
const program = ts.createProgram([api], options);
const diagnostics = ts.getPreEmitDiagnostics(program);
assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
  getCanonicalFileName: name => name,
  getCurrentDirectory: () => root,
  getNewLine: () => "\n",
}));

require.extensions[".ts"] = (module, filename) => {
  module._compile(ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: options,
  }).outputText, filename);
};
const handler = require(api).default;
const previousMode = process.env.HUMAN_REVIEW_STORAGE_MODE;
delete process.env.HUMAN_REVIEW_STORAGE_MODE;
try {
  for (const form of [undefined, null, false, 42, "invalid", [], {}, { itemReviews: "invalid" }]) {
    const response = {
      code: null, body: null,
      status(code) { this.code = code; return this; },
      json(body) { this.body = body; return this; },
    };
    await handler({ method: "POST", body: {
      action: "save_draft", draftOwnerId: "reviewer",
      snapshot: { schemaVersion: "human_review_snapshot_v1", snapshotId: "snapshot", profileId: "profile", recommendationItems: [] },
      draft: { schemaVersion: "human_review_draft_v1", snapshotId: "snapshot", updatedAt: "2026-10-21T00:00:00Z", form },
    } }, response);
    assert.equal(response.code, 400);
    assert.equal(response.body.error, "invalid_draft_items");
  }
} finally {
  if (previousMode === undefined) delete process.env.HUMAN_REVIEW_STORAGE_MODE;
  else process.env.HUMAN_REVIEW_STORAGE_MODE = previousMode;
}

// Build metadata/output must never recursively enter traced API bundles.
const config = JSON.parse(readFileSync(resolve(root, "vercel.json"), "utf8"));
const traceRequire = createRequire(require.resolve("@vercel/nft"));
const { isMatch } = traceRequire("picomatch");
const excluded = config.functions["api/**/*.ts"].excludeFiles;
// NFT uses picomatch without dot:true. A plain .vercel/** misses .routes.json
// and files beneath nested hidden directories, even inside generated output.
for (const path of [
  ".vercel/project.json",
  ".vercel/build-output/static/_expo/.routes.json",
  ".vercel/build-output/functions/api/library-config-diagnostics.func/.vercel/project.json",
]) assert.ok(isMatch(path, excluded), `Generated build file not excluded: ${path}`);
for (const path of [
  "api/library-config-diagnostics.ts",
  "lib/librarySharing/storage.ts",
  "scripts/human-review/lib/human-review-core.mjs",
]) assert.ok(!isMatch(path, excluded), `Runtime source accidentally excluded: ${path}`);
console.log("Vercel build regressions passed: API typecheck, malformed draft forms, generated-output exclusion.");
