import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  defaultPaths,
  ensureDir,
  loadFrozenManifest,
  loadRubric,
  nowIso,
  parseArgs,
  shortHash,
  stableStringify,
  writeJson,
} from "./human-review/lib/human-review-core.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const appDir = resolve(repoRoot, "app", "recommender-v2");

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => {
  const source = readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  module._compile(output, filename);
};

const { runRecommenderV2 } = require(resolve(appDir, "engine.ts"));

function selectProfiles(manifest, profileArg) {
  if (!profileArg) return manifest.profiles;
  const wanted = new Set(String(profileArg).split(",").map((item) => item.trim()).filter(Boolean));
  const selected = manifest.profiles.filter((profile) => wanted.has(profile.id));
  if (selected.length !== wanted.size) {
    const found = new Set(selected.map((profile) => profile.id));
    const missing = [...wanted].filter((item) => !found.has(item));
    throw new Error(`unknown_profile_id:${missing.join(",")}`);
  }
  return selected;
}

function snapshotFromResult({ profile, result, manifestVersion, rubricVersion }) {
  const recommendationItems = (result.items || []).map((item, index) => ({
    rank: index + 1,
    title: item.title,
    source: item.source,
    sourceId: item.sourceId || null,
    score: Number(item.score || 0),
    matchedSignals: Array.isArray(item.matchedSignals) ? item.matchedSignals : [],
    scoreBreakdown: item.scoreBreakdown || {},
  }));
  const canonicalPayload = {
    schemaVersion: "human_review_snapshot_v1",
    manifestVersion,
    profileId: profile.id,
    profileVersion: profile.version,
    rubricVersion,
    engineVersion: result.engineVersion,
    recommendationItems,
    finalSelectionTitles: Array.isArray(result.diagnostics?.finalSelectionTitles) ? result.diagnostics.finalSelectionTitles : [],
    rejectedReasons: result.diagnostics?.rejectedReasons || {},
  };
  const contentSha256 = shortHash(canonicalPayload, 64);
  const snapshotId = shortHash({ profileId: profile.id, profileVersion: profile.version, contentSha256 });
  return {
    ...canonicalPayload,
    snapshotId,
    capturedAt: nowIso(),
    contentSha256,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = loadFrozenManifest(args.manifest ? resolve(args.manifest) : undefined);
  const selectedProfiles = selectProfiles(manifest, args.profile);
  const { rubric } = loadRubric(args["rubric-version"] || "v1");
  const outDir = args.out ? resolve(args.out) : defaultPaths().snapshotsDir;
  ensureDir(outDir);

  const written = [];
  for (const profile of selectedProfiles) {
    const session = {
      ...profile.session,
      requestId: `human-review-${profile.id}`,
    };
    const result = await runRecommenderV2(session);
    const snapshot = snapshotFromResult({
      profile,
      result,
      manifestVersion: manifest.manifestVersion,
      rubricVersion: rubric.version,
    });
    const fileName = `${profile.id}__${snapshot.snapshotId}.json`;
    const path = resolve(outDir, fileName);
    if (existsSync(path)) throw new Error(`immutable_snapshot_exists:${fileName}`);
    try {
      writeJson(path, snapshot);
    } catch (error) {
      throw new Error(`snapshot_write_failed:${profile.id}:${error instanceof Error ? error.message : String(error)}`);
    }
    written.push({ profileId: profile.id, snapshotId: snapshot.snapshotId, path, items: snapshot.recommendationItems.length });
  }

  console.log(JSON.stringify({
    status: "ok",
    snapshotSchemaVersion: "human_review_snapshot_v1",
    manifestVersion: manifest.manifestVersion,
    rubricVersion: rubric.version,
    frozenProfileIds: selectedProfiles.map((profile) => profile.id),
    snapshotsWritten: written,
    runSignature: shortHash(stableStringify(written)),
  }, null, 2));
}

main().catch((error) => {
  console.error(`human_review_snapshot_capture_failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
