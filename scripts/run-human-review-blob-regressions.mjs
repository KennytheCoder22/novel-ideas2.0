#!/usr/bin/env node

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => {
  const source = readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  module._compile(output, filename);
};

const {
  BlobHumanReviewRepository,
  humanReviewBlobStorageConfigured,
} = require(resolve("lib", "humanReview", "BlobHumanReviewRepository.ts"));
const { createRepository } = require(resolve("lib", "humanReview", "index.ts"));
const {
  deleteHumanReviewDraft,
  listHumanReviewDrafts,
  saveHumanReviewDraft,
  summarizeHumanReviewDraft,
} = require(resolve("lib", "humanReview", "humanReviewDraftStorage.ts"));
const core = await import(pathToFileURL(resolve("scripts", "human-review", "lib", "human-review-core.mjs")).toString());

class MemoryBlobStore {
  records = new Map();

  async putJson(pathname, value, allowOverwrite) {
    if (!allowOverwrite && this.records.has(pathname)) throw new Error("blob_already_exists");
    this.records.set(pathname, structuredClone(value));
  }

  async list(prefix) {
    return [...this.records.keys()]
      .filter((pathname) => pathname.startsWith(prefix))
      .map((pathname) => ({ pathname, uploadedAt: "2026-08-20T00:00:00.000Z" }));
  }

  async readJson(pathname) {
    return this.records.has(pathname) ? structuredClone(this.records.get(pathname)) : null;
  }

  async delete(pathname) {
    this.records.delete(pathname);
  }
}

const rubric = {
  rubricId: "novelideas-human-review",
  version: "v1",
  scale: { min: 1, max: 5 },
  criteria: [
    { id: "taste_alignment", label: "Taste alignment" },
    { id: "novelty", label: "Novelty" },
    { id: "confidence", label: "Confidence" },
  ],
  decisionOptions: ["recommend", "weak_recommend", "not_recommended"],
};

function snapshot(overrides = {}) {
  return {
    schemaVersion: "human_review_snapshot_v1",
    snapshotId: "hrs-blob-test",
    profileId: "runtime-adult-blob-test",
    rubricVersion: "v1",
    engineVersion: "test",
    capturedAt: "2026-08-20T00:00:00.000Z",
    ageBand: "adult",
    deckKey: "adult",
    swipeSignalCount: 3,
    swipeSignals: [],
    recommendationItems: [{ rank: 1, title: "Test Book", author: "Test Author" }],
    ...overrides,
  };
}

function review(overrides = {}) {
  return {
    schemaVersion: "human_review_record_v1",
    reviewId: "hr-blob-test-0001",
    snapshotId: "hrs-blob-test",
    profileId: "runtime-adult-blob-test",
    rubricId: "novelideas-human-review",
    rubricVersion: "v1",
    reviewerId: "reviewer@example.org",
    createdAt: "2026-08-20T00:00:00.000Z",
    itemReviews: [{
      rank: 1,
      title: "Test Book",
      overallScore: 4,
      decision: "recommend",
      criteriaRatings: { taste_alignment: 4, novelty: 3, confidence: 4 },
    }],
    summary: { wouldUseSlate: true, wouldUseSlateDecision: "yes", notes: "Blob regression" },
    ...overrides,
  };
}

const store = new MemoryBlobStore();
const repo = new BlobHumanReviewRepository(store, core);

assert.equal((await repo.saveSnapshot(snapshot())).status, "created");
assert.equal((await repo.saveSnapshot(snapshot())).status, "unchanged");
await assert.rejects(() => repo.saveSnapshot(snapshot({ engineVersion: "changed" })), /snapshot_content_conflict/);

const appended = await repo.appendReview(review(), rubric);
assert.equal(appended.storageMode, "durable_blob");
assert.equal((await repo.listSnapshots()).length, 1);
assert.equal((await repo.listReviews()).length, 1);
assert.equal((await repo.listReviews({ reviewerId: "reviewer@example.org" })).length, 1);
assert.equal((await repo.listReviews({ reviewerId: "different" })).length, 0);

await assert.rejects(() => repo.appendReview(review(), rubric), /duplicate_review_id/);
await assert.rejects(
  () => repo.appendReview(review({ reviewId: "hr-blob-test-0002" }), rubric),
  /duplicate_reviewer_snapshot/,
);

const partialDraft = {
  schemaVersion: "human_review_durable_draft_v1",
  snapshotId: "hrs-blob-draft",
  profileId: "runtime-adult-blob-draft",
  reviewerId: "anonymous-reviewer",
  snapshot: snapshot({ snapshotId: "hrs-blob-draft", profileId: "runtime-adult-blob-draft" }),
  draft: {
    form: {
      reviewerId: "anonymous-reviewer",
      itemReviews: [{ expectedEnjoyment: 5 }, { expectedEnjoyment: null }],
    },
  },
  updatedAt: "2026-08-21T15:00:00.000Z",
};
await saveHumanReviewDraft(partialDraft, store);
await saveHumanReviewDraft({ ...partialDraft, updatedAt: "2026-08-21T15:01:00.000Z" }, store);
await saveHumanReviewDraft({ ...partialDraft, updatedAt: "2026-08-21T14:59:00.000Z" }, store);
const drafts = await listHumanReviewDrafts(store);
assert.equal(drafts.length, 1);
assert.deepEqual(summarizeHumanReviewDraft(drafts[0]), {
  snapshotId: "hrs-blob-draft",
  ageBand: "adult",
  updatedAt: "2026-08-21T15:01:00.000Z",
  completedItems: 1,
  totalItems: 2,
});
await deleteHumanReviewDraft(partialDraft.snapshotId, partialDraft.reviewerId, store);
assert.equal((await listHumanReviewDrafts(store)).length, 0);

const savedPostgres = process.env.POSTGRES_URL;
const savedBlob = process.env.BLOB_READ_WRITE_TOKEN;
const savedMode = process.env.HUMAN_REVIEW_STORAGE_MODE;
delete process.env.POSTGRES_URL;
delete process.env.HUMAN_REVIEW_STORAGE_MODE;
process.env.BLOB_READ_WRITE_TOKEN = "test-token";
assert.equal(humanReviewBlobStorageConfigured(), true);
assert.equal(createRepository().storageMode, "durable_blob");
process.env.BLOB_READ_WRITE_TOKEN = " '  ' ";
assert.equal(humanReviewBlobStorageConfigured(), false);
assert.equal(createRepository().storageMode, "local_filesystem");
if (savedPostgres === undefined) delete process.env.POSTGRES_URL;
else process.env.POSTGRES_URL = savedPostgres;
if (savedBlob === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
else process.env.BLOB_READ_WRITE_TOKEN = savedBlob;
if (savedMode === undefined) delete process.env.HUMAN_REVIEW_STORAGE_MODE;
else process.env.HUMAN_REVIEW_STORAGE_MODE = savedMode;

const screen = readFileSync(resolve("screens", "SwipeDeckScreen.tsx"), "utf8");
const factory = readFileSync(resolve("lib", "humanReview", "index.ts"), "utf8");
assert.match(screen, /storageMode === "durable_postgres" \|\| storageMode === "durable_blob"/);
assert.match(screen, /fetch\("\/api\/human-review-draft"/);
assert.match(screen, /Save Draft & Exit/);
assert.match(screen, /await queueDurableHumanReviewDraft\(humanReviewSnapshot, draft\)/);
assert.match(factory, /humanReviewBlobStorageConfigured\(\)/);

console.log("Human Review Blob regressions passed.");
