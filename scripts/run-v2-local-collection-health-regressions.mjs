import { createRequire } from "node:module";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => {
  const source = readFileSync(filename, "utf8");
  module._compile(ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText, filename);
};

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { importLocalCollectionCsv } = require(resolve(ROOT, "lib/localCollection/index.ts"));
const {
  buildRecommendationArtifact,
  publishAndVerifySharedLocalCollectionRecommendationArtifact,
} = require(resolve(ROOT, "lib/localCollection/storage.ts"));
const {
  buildCollectionHealth,
  runCollectionSmokeTest,
} = require(resolve(ROOT, "lib/localCollection/health.ts"));
const {
  loadSharedLibraryCollectionPayload,
  saveSharedLibraryCollection,
} = require(resolve(ROOT, "lib/librarySharing/storage.ts"));

function check(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
}

function csvArtifact(libraryId, rows, filename = "destiny-export.csv") {
  return importLocalCollectionCsv({
    libraryId,
    sourceFilename: filename,
    importTimestamp: "2026-09-01T17:00:00.000Z",
    csvText: [
      "Title,Author,Description,ISBN,Call Number,Audience,Cover URL",
      ...rows,
    ].join("\n"),
  });
}

const healthy = csvArtifact("health-a", [
  "Healthy One,Writer One,First description,9780306406157,FIC ONE,Teen,https://covers.example/one.jpg",
  "Healthy Two,Writer Two,Second description,9780140328721,FIC TWO,Teen,https://covers.example/two.jpg",
]);
const healthyHealth = buildCollectionHealth(healthy, { publishStatus: "verified" });
check(healthyHealth.status === "ready", "healthy CSV import is Ready");
check(
  healthyHealth.metrics.descriptionsPresent === 2 &&
    healthyHealth.metrics.authorsPresent === 2 &&
    healthyHealth.metrics.callNumbersPresent === 2,
  "health reports description, author, and call-number coverage",
);

const noDescriptions = csvArtifact("health-a", [
  "No Summary,Writer One,,9780306406157,FIC ONE,Teen,",
]);
check(
  buildCollectionHealth(noDescriptions, { publishStatus: "verified" }).status === "ready_with_warnings",
  "missing optional descriptions produces a warning instead of failure",
);
const noDescriptionRecommendation = buildRecommendationArtifact(noDescriptions);
check(
  runCollectionSmokeTest(
    noDescriptions.acceptedRecords,
    noDescriptionRecommendation.records,
    noDescriptionRecommendation.records,
  ).passed,
  "a genuinely missing source description does not create a smoke-test failure",
);

const mixedMalformed = csvArtifact("health-a", [
  "Valid,Writer One,Present,9780306406157,FIC ONE,Teen,",
  ",Missing Title,Rejected,9780140328721,FIC BAD,Teen,",
]);
check(
  mixedMalformed.summary.acceptedTitles === 1 && mixedMalformed.summary.rejectedRows === 1,
  "valid records survive alongside malformed records",
);
check(
  buildCollectionHealth(mixedMalformed, { publishStatus: "verified" }).status === "ready_with_warnings",
  "a partially malformed but usable import remains available with warnings",
);
const unusable = csvArtifact("health-a", [
  ",Missing Title One,Rejected,,,,",
  ",Missing Title Two,Rejected,,,,",
  "Only Valid,Writer,Present,9780306406157,FIC ONE,Teen,",
]);
check(
  buildCollectionHealth(unusable, { publishStatus: "verified" }).status === "failed",
  "an import that rejects most source records fails visibly",
);

const duplicate = csvArtifact("health-a", [
  "Duplicate,Writer One,Present,9780306406157,FIC ONE,Teen,",
  "Duplicate,Writer One,Present,9780306406157,FIC ONE,Teen,",
]);
check(
  duplicate.summary.mergedDuplicatesOrCopies === 1 && duplicate.summary.duplicateRate === 0.5,
  "duplicate count and rate are reported",
);
check(
  buildCollectionHealth(duplicate, { publishStatus: "verified" }).status === "ready_with_warnings",
  "duplicate-heavy valid holdings remain usable after copy merging",
);

const adapted = buildRecommendationArtifact(healthy);
const droppedDescription = adapted.records.map((record, index) =>
  index === 0 ? { ...record, description: undefined } : record
);
const smoke = runCollectionSmokeTest(healthy.acceptedRecords, droppedDescription, droppedDescription);
check(
  !smoke.passed && smoke.issues.some((issue) => issue.field === "description" && issue.stage === "artifact_adapter"),
  "smoke test catches a deliberately dropped description",
);
const normalizationDropped = healthy.acceptedRecords.map((record, index) =>
  index === 0 ? { ...record, description: undefined } : record
);
const normalizationSmoke = runCollectionSmokeTest(normalizationDropped, adapted.records, adapted.records);
check(
  normalizationSmoke.issues.some((issue) => issue.field === "description" && issue.stage === "normalization"),
  "smoke test distinguishes normalization field loss from a genuinely missing source field",
);

const active = new Map();
let failNextPublish = false;
let mismatchNextPublishReadback = false;
let mismatchReadbackReady = false;
let sawCompressedPublish = false;
global.window = { location: { origin: "https://health.test" } };
if (typeof global.btoa !== "function") {
  global.btoa = (value) => Buffer.from(value, "binary").toString("base64");
}
global.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  const libraryId = url.searchParams.get("libraryId") || "";
  if ((init.method || "GET") === "POST") {
    if (failNextPublish) {
      failNextPublish = false;
      return new Response(JSON.stringify({ error: "blob_write_failed", activeArtifactState: "previous_retained" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
    const body = JSON.parse(String(init.body || "{}"));
    let artifact = body.artifact;
    if (!artifact && body.artifactEncoding === "gzip-base64") {
      sawCompressedPublish = true;
      artifact = JSON.parse(gunzipSync(Buffer.from(body.artifactGzipBase64, "base64")).toString("utf8"));
    }
    active.set(libraryId, artifact);
    if (mismatchNextPublishReadback) {
      mismatchNextPublishReadback = false;
      mismatchReadbackReady = true;
    }
    return new Response(JSON.stringify({ success: true, activeArtifactState: "activated_verified" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  let artifact = active.get(libraryId) || null;
  if (artifact && mismatchReadbackReady) {
    mismatchReadbackReady = false;
    artifact = {
      ...artifact,
      records: artifact.records.map((record, index) =>
        index === 0 ? { ...record, description: undefined } : record
      ),
    };
  }
  return new Response(JSON.stringify({ artifact, artifactUrl: null }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

const firstPublish = await publishAndVerifySharedLocalCollectionRecommendationArtifact("health-a", healthy);
check(firstPublish.success && firstPublish.health.publishStatus === "verified", "publish is verified through patron read-back");
check(
  firstPublish.artifact.collectionVersion.publishStatus === "verified" &&
    firstPublish.artifact.collectionVersion.healthStatus === "ready" &&
    firstPublish.artifact.collectionVersion.originalUploadBytes > 0 &&
    firstPublish.artifact.collectionVersion.artifactBytes > 0,
  "version metadata records health, publish state, and artifact sizes",
);
const rolloverArtifact = csvArtifact("health-a", [
  "New Edition,Writer Three,New description,9780439554930,FIC NEW,Teen,",
], "second-export.csv");
const rollover = await publishAndVerifySharedLocalCollectionRecommendationArtifact("health-a", rolloverArtifact);
check(
  rollover.success &&
    rollover.previousArtifact?.artifactId === firstPublish.artifact.collectionVersion.artifactId,
  "successful version rollover retains bounded prior artifact metadata",
);

failNextPublish = true;
const failedUpdate = await publishAndVerifySharedLocalCollectionRecommendationArtifact("health-a", healthy);
check(
  !failedUpdate.success &&
    failedUpdate.previousArtifactRetained &&
    failedUpdate.artifact.collectionVersion.publishStatus === "failed" &&
    active.get("health-a").collectionVersion.artifactId === rollover.artifact.collectionVersion.artifactId,
  "publish failure keeps the previous active artifact",
);

mismatchNextPublishReadback = true;
const mismatchedReadback = await publishAndVerifySharedLocalCollectionRecommendationArtifact("health-a", healthy);
check(
  !mismatchedReadback.success && !mismatchedReadback.previousArtifactRetained,
  "post-publish read-back field mismatch is visible without falsely claiming rollback",
);

const bArtifact = csvArtifact("health-b", [
  "Library B,Writer B,Library B description,9780306406157,B FIC,Adult,",
]);
const bPublish = await publishAndVerifySharedLocalCollectionRecommendationArtifact("health-b", bArtifact);
check(
  bPublish.success &&
    active.get("health-a").collectionVersion.libraryId === "health-a" &&
    active.get("health-b").collectionVersion.libraryId === "health-b",
  "health and versions remain isolated by library",
);

const largeRows = Array.from({ length: 4300 }, (_, index) =>
  `Large ${index},Writer ${index},${"description ".repeat(95)},,FIC ${index},Teen,`
);
const largeArtifact = csvArtifact("health-large", largeRows, "large-destiny.csv");
const largePublish = await publishAndVerifySharedLocalCollectionRecommendationArtifact("health-large", largeArtifact);
check(largePublish.success && sawCompressedPublish, "large collection publishes through compressed transport");
check(largePublish.health.compressedArtifactBytes > 0, "compressed artifact size is recorded");
check(largePublish.health.smokeTest?.sampleSize === 20, "large imports use a representative 20-record smoke sample");

const yvhsArtifact = csvArtifact("yvhs", [
  "YVHS Record,Writer Y,Preserved summary,9780306406157,FIC Y,Teen,",
]);
const yvhsRecommendation = buildRecommendationArtifact(yvhsArtifact, { publishStatus: "verified" });
check(
  yvhsRecommendation.collectionVersion.libraryId === "yvhs" &&
    yvhsRecommendation.records[0].description === "Preserved summary",
  "existing YVHS identity and description behavior remain intact",
);

const filesystemId = `health-storage-${process.pid}`;
const filesystemPath = resolve(ROOT, "scripts/output/library-sharing/collections", `${filesystemId}.json`);
let filesystemDiagnosticsPath = "";
try {
  const initial = buildRecommendationArtifact(csvArtifact(filesystemId, [
    "Stored One,Writer One,Stored description,9780306406157,FIC ONE,Teen,",
  ]), { publishStatus: "verified" });
  filesystemDiagnosticsPath = resolve(
    ROOT,
    "scripts/output/library-sharing/collection-diagnostics",
    filesystemId,
    `${initial.collectionVersion.artifactId}.json`,
  );
  await saveSharedLibraryCollection(filesystemId, initial);
  const bad = {
    ...initial,
    records: [{ ...initial.records[0], title: "Tampered" }],
  };
  let checksumRejected = false;
  try {
    await saveSharedLibraryCollection(filesystemId, bad);
  } catch (error) {
    checksumRejected = String(error?.message || "") === "collection_checksum_mismatch";
  }

  const mixedCaseId = `MixedCase${process.pid}`;
  const mixedCasePath = resolve(ROOT, "scripts/output/library-sharing/collections", `${mixedCaseId}.json`);
  let mixedCaseDiagnosticsPath = "";
  try {
    const mixedCaseArtifact = buildRecommendationArtifact(csvArtifact(mixedCaseId.toLowerCase(), [
      "Mixed Case Library,Writer One,Stored description,9780306406157,FIC ONE,Teen,",
    ]), { publishStatus: "verified" });
    mixedCaseDiagnosticsPath = resolve(
      ROOT,
      "scripts/output/library-sharing/collection-diagnostics",
      mixedCaseId.toLowerCase(),
      `${mixedCaseArtifact.collectionVersion.artifactId}.json`,
    );
    await saveSharedLibraryCollection(mixedCaseId, mixedCaseArtifact);
    const mixedCaseStored = await loadSharedLibraryCollectionPayload(mixedCaseId);
    check(mixedCaseStored?.records?.length === 1, "mixed-case hosted IDs use the same canonical checksum identity");
  } finally {
    if (existsSync(mixedCasePath)) unlinkSync(mixedCasePath);
    if (mixedCaseDiagnosticsPath && existsSync(mixedCaseDiagnosticsPath)) unlinkSync(mixedCaseDiagnosticsPath);
  }
  const retained = await loadSharedLibraryCollectionPayload(filesystemId);
  check(checksumRejected, "server rejects a checksum mismatch");
  check(retained?.records?.[0]?.title === "Stored One", "checksum failure retains the previous stored artifact");
  let invalidVersionRejected = false;
  try {
    await saveSharedLibraryCollection(filesystemId, {
      ...initial,
      collectionVersion: { schemaVersion: "local_collection_artifact_future" },
    });
  } catch (error) {
    invalidVersionRejected = String(error?.message || "") === "invalid_collection_version_metadata";
  }
  check(invalidVersionRejected, "malformed or unknown version metadata cannot bypass checksum verification");
} finally {
  if (existsSync(filesystemPath)) unlinkSync(filesystemPath);
  if (filesystemDiagnosticsPath && existsSync(filesystemDiagnosticsPath)) unlinkSync(filesystemDiagnosticsPath);
}

const adminSource = readFileSync(resolve(ROOT, "app/app_admin-web.tsx"), "utf8");
check(
  adminSource.includes("Collection ready:") &&
    adminSource.includes("View import details") &&
    adminSource.includes("Previous collection remains active") &&
    adminSource.includes("collectionAttemptHealth"),
  "Librarian Settings exposes concise health and explicit failed-update status",
);

console.log("Local Collection health regressions passed.");
