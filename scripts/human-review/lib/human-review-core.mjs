import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..", "..", "..");
const humanReviewRoot = resolve(repoRoot, "scripts", "human-review");
const defaultManifestPath = resolve(humanReviewRoot, "frozen-profile-manifest.v1.json");
const defaultRubricDir = resolve(humanReviewRoot, "rubrics");
const defaultOutputRoot = resolve(repoRoot, "scripts", "output", "human-review");

export function nowIso() {
  return new Date().toISOString();
}

export function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const key of Object.keys(value).sort()) out[key] = stableValue(value[key]);
  return out;
}

export function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

export function shortHash(value, length = 16) {
  return createHash("sha256").update(typeof value === "string" ? value : stableStringify(value)).digest("hex").slice(0, length);
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function writeJson(path, value) {
  ensureDir(dirname(path));
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", "utf8");
}

export function ensureDir(path) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out[key] = true;
      continue;
    }
    out[key] = next;
    i += 1;
  }
  return out;
}

export function loadFrozenManifest(path = defaultManifestPath) {
  const manifest = readJson(path);
  if (!manifest || !Array.isArray(manifest.profiles)) throw new Error("invalid_frozen_profile_manifest");
  const seen = new Set();
  for (const profile of manifest.profiles) {
    if (!profile?.id || typeof profile.id !== "string") throw new Error("invalid_profile_id");
    if (seen.has(profile.id)) throw new Error(`duplicate_profile_id:${profile.id}`);
    seen.add(profile.id);
  }
  return manifest;
}

export function loadRubric(versionOrPath = "v1") {
  const path = versionOrPath.includes(".json")
    ? resolve(versionOrPath)
    : resolve(defaultRubricDir, `novelideas-human-review-rubric.${versionOrPath}.json`);
  const rubric = readJson(path);
  if (!rubric?.rubricId || !rubric?.version || !Array.isArray(rubric.criteria)) throw new Error("invalid_rubric");
  return { path, rubric };
}

export function defaultPaths() {
  const snapshotsDir = resolve(defaultOutputRoot, "snapshots");
  const recordsPath = resolve(defaultOutputRoot, "review-records.v1.ndjson");
  const exportsDir = resolve(defaultOutputRoot, "exports");
  const reportsDir = resolve(defaultOutputRoot, "reports");
  return { snapshotsDir, recordsPath, exportsDir, reportsDir };
}

export function listNdjsonRecords(path) {
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.map((line, index) => {
    try {
      return JSON.parse(line);
    } catch {
      throw new Error(`invalid_ndjson_line:${index + 1}`);
    }
  });
}

export function appendNdjsonRecord(path, record) {
  ensureDir(dirname(path));
  appendFileSync(path, JSON.stringify(record) + "\n", "utf8");
}

export function validateReviewRecord(record, rubric) {
  if (!record || typeof record !== "object") throw new Error("invalid_review_record");
  if (record.schemaVersion !== "human_review_record_v1") throw new Error("invalid_schema_version");
  const requiredStrings = ["reviewId", "snapshotId", "profileId", "rubricId", "rubricVersion", "reviewerId", "createdAt"];
  for (const key of requiredStrings) {
    if (typeof record[key] !== "string" || !record[key].trim()) throw new Error(`missing_field:${key}`);
  }
  if (!Array.isArray(record.itemReviews) || !record.itemReviews.length) throw new Error("missing_item_reviews");
  const rubricCriteria = new Set(rubric.criteria.map((item) => item.id));
  const scaleMin = Number(rubric.scale?.min ?? 1);
  const scaleMax = Number(rubric.scale?.max ?? 5);
  const decisionOptions = new Set(Array.isArray(rubric.decisionOptions) ? rubric.decisionOptions : []);
  const familiarityOptions = new Set(["never_heard_of_it", "know_of_it", "read_it", "tried_but_did_not_finish"]);
  for (const item of record.itemReviews) {
    if (typeof item.rank !== "number" || item.rank < 1) throw new Error("invalid_item_rank");
    if (typeof item.title !== "string" || !item.title.trim()) throw new Error("missing_item_title");
    if (typeof item.overallScore !== "number" || item.overallScore < scaleMin || item.overallScore > scaleMax) throw new Error("invalid_overall_score");
    if (!decisionOptions.has(item.decision)) throw new Error("invalid_item_decision");
    if (!item.criteriaRatings || typeof item.criteriaRatings !== "object") throw new Error("missing_criteria_ratings");
    const keys = Object.keys(item.criteriaRatings);
    for (const criteriaId of keys) {
      if (!rubricCriteria.has(criteriaId)) throw new Error(`unknown_criteria:${criteriaId}`);
      const score = Number(item.criteriaRatings[criteriaId]);
      if (!Number.isInteger(score) || score < scaleMin || score > scaleMax) throw new Error(`invalid_criteria_score:${criteriaId}`);
    }
    for (const criteriaId of rubricCriteria) {
      if (!(criteriaId in item.criteriaRatings)) throw new Error(`missing_criteria_score:${criteriaId}`);
    }
    if ("expectedEnjoyment" in item) {
      if (item.expectedEnjoyment !== null && typeof item.expectedEnjoyment !== "undefined") {
        const enjoyment = Number(item.expectedEnjoyment);
        if (!Number.isInteger(enjoyment) || enjoyment < scaleMin || enjoyment > scaleMax) {
          throw new Error("invalid_item_expected_enjoyment");
        }
      }
    }
    if ("familiarity" in item) {
      if (item.familiarity !== null && typeof item.familiarity !== "undefined" && !familiarityOptions.has(item.familiarity)) {
        throw new Error("invalid_item_familiarity");
      }
    }
  }
}

export function dedupeReviewIds(records) {
  const seen = new Set();
  for (const record of records) {
    if (seen.has(record.reviewId)) throw new Error(`duplicate_review_id:${record.reviewId}`);
    seen.add(record.reviewId);
  }
}

export function readImportRecords(path) {
  const extension = extname(path).toLowerCase();
  if (extension === ".ndjson") return listNdjsonRecords(path);
  const value = readJson(path);
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.records)) return value.records;
  throw new Error("invalid_import_payload");
}

export function summarizeReviews(records) {
  let totalItemReviews = 0;
  let totalScore = 0;
  let recommend = 0;
  const byProfile = {};
  for (const record of records) {
    const profile = String(record.profileId);
    const bucket = byProfile[profile] || { profileId: profile, reviewCount: 0, itemReviews: 0, avgOverallScore: 0, recommendRate: 0, _recommendVotes: 0, _scoreSum: 0 };
    bucket.reviewCount += 1;
    for (const item of record.itemReviews || []) {
      totalItemReviews += 1;
      totalScore += Number(item.overallScore || 0);
      bucket.itemReviews += 1;
      bucket._scoreSum += Number(item.overallScore || 0);
      if (item.decision === "recommend") {
        recommend += 1;
        bucket._recommendVotes += 1;
      }
    }
    byProfile[profile] = bucket;
  }
  const profiles = Object.values(byProfile)
    .map((row) => ({
      profileId: row.profileId,
      reviewCount: row.reviewCount,
      itemReviews: row.itemReviews,
      avgOverallScore: row.itemReviews ? Number((row._scoreSum / row.itemReviews).toFixed(3)) : 0,
      recommendRate: row.itemReviews ? Number((row._recommendVotes / row.itemReviews).toFixed(3)) : 0,
    }))
    .sort((a, b) => a.profileId.localeCompare(b.profileId));

  return {
    records: records.length,
    itemReviews: totalItemReviews,
    avgOverallScore: totalItemReviews ? Number((totalScore / totalItemReviews).toFixed(3)) : 0,
    recommendRate: totalItemReviews ? Number((recommend / totalItemReviews).toFixed(3)) : 0,
    profiles,
  };
}
