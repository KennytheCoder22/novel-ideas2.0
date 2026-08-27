#!/usr/bin/env node

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => {
  const output = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  module._compile(output, filename);
};

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const {
  REAL_SESSION_AUDIT_RETENTION_LIMIT,
  computeRecommendationOverlap,
  listRealSessionAudits,
  parseRealSessionAuditEvent,
  realSessionAuditBlobStorageConfigured,
  recordRealSessionAudit,
} = require(resolve(repoRoot, "lib", "realSessionOverlapAudit.ts"));
const {
  isAnonymousReviewEligible,
  selectAnonymousReviewSession,
  toAnonymousReviewSession,
} = require(resolve(repoRoot, "lib", "anonymousHumanReview.ts"));

const savedBlobToken = process.env.BLOB_READ_WRITE_TOKEN;
process.env.BLOB_READ_WRITE_TOKEN = " '  ' ";
assert.equal(realSessionAuditBlobStorageConfigured(), false);
process.env.BLOB_READ_WRITE_TOKEN = "test-token";
assert.equal(realSessionAuditBlobStorageConfigured(), true);
if (savedBlobToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
else process.env.BLOB_READ_WRITE_TOKEN = savedBlobToken;

class MemoryBlobStore {
  constructor() {
    this.values = new Map();
    this.sequence = 0;
    this.failWrites = false;
    this.failReadPathname = "";
  }

  async putJson(pathname, value) {
    if (this.failWrites) throw new Error("simulated_blob_failure");
    const uploadedAt = new Date(Date.UTC(2026, 7, 1, 0, 0, this.sequence++)).toISOString();
    this.values.set(pathname, { value: structuredClone(value), uploadedAt });
    return { pathname, uploadedAt };
  }

  async list(prefix) {
    return [...this.values.entries()]
      .filter(([pathname]) => pathname.startsWith(prefix))
      .map(([pathname, entry]) => ({ pathname, uploadedAt: entry.uploadedAt }));
  }

  async readJson(pathname) {
    if (pathname === this.failReadPathname) throw new Error("simulated_blob_read_failure");
    return structuredClone(this.values.get(pathname)?.value ?? null);
  }

  async delete(pathnames) {
    for (const pathname of pathnames) this.values.delete(pathname);
  }
}

function payload(index = 0, overrides = {}) {
  return {
    auditId: `rec-${String(index).padStart(8, "0")}`,
    libraryId: "default",
    libraryScope: "default",
    patronHash: `${(index % 0xffffffff).toString(16).padStart(8, "0")}`,
    ageBand: "adult",
    likes: 7,
    dislikes: 3,
    skips: 2,
    dominantTaste: {
      genreFamily: [{ value: "literary fiction", weight: 3 }],
      tone: [{ value: "emotional", weight: 2 }],
      themes: [{ value: "family", weight: 2 }],
      avoidSignals: [{ value: "graphic horror", weight: -1 }],
    },
    localQueries: ["character driven family fiction"],
    searchPlan: {
      intents: [{
        id: "intent-1",
        query: "sweeping multigenerational emotional historical fiction",
        facets: ["family", "relationships"],
        priority: 5,
        rationale: ["liked character-driven stories"],
      }],
      sourcePlans: [{
        source: "googleBooks",
        enabled: true,
        status: "planned",
        timeoutMs: 1000,
        intents: [{
          id: "intent-1",
          query: "sweeping multigenerational emotional historical fiction",
          facets: ["family"],
          priority: 5,
          rationale: ["dominant theme"],
        }],
      }],
    },
    finalRecommendations: Array.from({ length: 10 }, (_, itemIndex) => ({
      id: `book-${index}-${itemIndex}`,
      title: `Book ${index}-${itemIndex}`,
      source: itemIndex % 2 ? "googleBooks" : "openLibrary",
    })),
    patronId: "must-not-persist",
    sessionId: "must-not-persist",
    swipeHistory: [{ title: "must-not-persist" }],
    ...overrides,
  };
}

function reviewEvidence(index = 0) {
  return {
    schemaVersion: "anonymous_review_evidence_v1",
    swipeEvidence: [
      { id: `swipe-${index}-1`, title: "Card One", mediaType: "books", imageUrl: "https://images.example/one.jpg", action: "like" },
      { id: `swipe-${index}-2`, title: "Card Two", mediaType: "movies", action: "dislike" },
      { id: `swipe-${index}-3`, title: "Card Three", mediaType: "games", action: "like" },
      { id: `swipe-${index}-4`, title: "Card Four", mediaType: "tv", action: "dislike" },
      { id: `swipe-${index}-5`, title: "Card Five", mediaType: "anime", action: "skip" },
    ],
    recommendationSlate: Array.from({ length: 5 }, (_, rank) => ({
      id: `exact-rec-${index}-${rank}`,
      title: `Exact Recommendation ${index}-${rank}`,
      author: `Author ${rank}`,
      source: "openLibrary",
      coverUrl: `https://images.example/${rank}.jpg`,
      matchedSignals: ["adventure", "hopeful"],
    })),
  };
}

const parsedDefault = parseRealSessionAuditEvent(payload());
assert.equal(parsedDefault.libraryId, "default");
assert.equal(parsedDefault.libraryScope, "default");
assert.equal(parsedDefault.searchPlan.intents[0].query, "sweeping multigenerational emotional historical fiction");
assert.equal(parsedDefault.finalRecommendations[0].source, "openLibrary");
assert.deepEqual(Object.keys(parsedDefault).sort(), [
  "ageBand", "auditId", "dislikes", "dominantTaste", "finalRecommendations", "libraryId",
  "libraryScope", "likes", "localQueries", "patronHash", "searchPlan", "skips",
]);
assert(!JSON.stringify(parsedDefault).includes("must-not-persist"));
assert.equal(isAnonymousReviewEligible(parsedDefault), false);

const parsedWithReviewEvidence = parseRealSessionAuditEvent(payload(20, {
  reviewEvidence: {
    ...reviewEvidence(20),
    patronHash: "must-not-leak",
    deviceId: "must-not-leak",
  },
}));
assert.equal(isAnonymousReviewEligible(parsedWithReviewEvidence), true);
assert.deepEqual(parsedWithReviewEvidence.reviewEvidence.recommendationSlate, reviewEvidence(20).recommendationSlate);
const publicSession = toAnonymousReviewSession({ ...parsedWithReviewEvidence, createdAt: "2026-08-02T00:00:00.000Z", recentOverlaps: [] });
assert(publicSession);
assert.deepEqual(publicSession.recommendationSlate, reviewEvidence(20).recommendationSlate);
assert(!JSON.stringify(publicSession).includes(parsedWithReviewEvidence.auditId));
assert(!JSON.stringify(publicSession).includes(parsedWithReviewEvidence.patronHash));
assert(!JSON.stringify(publicSession).includes("must-not-leak"));
assert(!("capturedAt" in publicSession));

const selectionRows = [20, 21, 22].map((index) => ({
  ...parseRealSessionAuditEvent(payload(index, {
    ageBand: index === 22 ? "teens" : "adult",
    reviewEvidence: reviewEvidence(index),
  })),
  createdAt: `2026-08-0${index - 19}T00:00:00.000Z`,
  recentOverlaps: [],
}));
const session20 = toAnonymousReviewSession(selectionRows[0]);
const selectedLowCoverage = selectAnonymousReviewSession({
  rows: selectionRows,
  reviewCoverageBySessionId: new Map([[session20.anonymousSessionId, 3]]),
  rotationKey: "2026-08-02",
});
assert.notEqual(selectedLowCoverage.anonymousSessionId, session20.anonymousSessionId);
const selectedWithExclusions = selectAnonymousReviewSession({
  rows: selectionRows,
  reviewCoverageBySessionId: new Map(),
  excludedSessionIds: new Set(selectionRows.slice(0, 2).map((row) => toAnonymousReviewSession(row).anonymousSessionId)),
  rotationKey: "2026-08-02",
});
assert.equal(selectedWithExclusions.anonymousSessionId, toAnonymousReviewSession(selectionRows[2]).anonymousSessionId);

const parsedHosted = parseRealSessionAuditEvent(payload(1, {
  libraryId: "branch-42",
  libraryScope: "hosted",
}));
assert.equal(parsedHosted.libraryId, "branch-42");
assert.equal(parsedHosted.libraryScope, "hosted");
assert.throws(
  () => parseRealSessionAuditEvent(payload(2, { libraryId: "bad library id", libraryScope: "hosted" })),
  /invalid_real_session_library/,
);

assert.deepEqual(
  computeRecommendationOverlap(
    parsedDefault.finalRecommendations,
    parsedDefault.finalRecommendations.slice(5).concat([{ id: "other", title: "Other", source: "nyt" }]),
  ),
  { overlapCount: 5, overlapPercent: 83.3 },
);

const store = new MemoryBlobStore();
const firstRecorded = await recordRealSessionAudit(parsedDefault, store);
const readBack = await listRealSessionAudits({ store, limit: 10 });
assert.equal(readBack.length, 1);
assert.deepEqual(readBack[0], firstRecorded);
assert.equal(readBack[0].dominantTaste.themes[0].value, "family");
assert.equal(readBack[0].searchPlan.sourcePlans[0].source, "googleBooks");
assert.equal(readBack[0].finalRecommendations[1].source, "googleBooks");

const flakyPathname = [...store.values.keys()][0];
store.failReadPathname = flakyPathname;
const survivesHistoricalReadFailure = parseRealSessionAuditEvent(payload(2, { patronHash: "feedface" }));
const recordedDespiteReadFailure = await recordRealSessionAudit(survivesHistoricalReadFailure, store);
assert.equal(recordedDespiteReadFailure.auditId, survivesHistoricalReadFailure.auditId);
assert([...store.values.values()].some((entry) => entry.value.auditId === survivesHistoricalReadFailure.auditId));
const dashboardRowsDespiteReadFailure = await listRealSessionAudits({ store, limit: 10 });
assert(dashboardRowsDespiteReadFailure.some((row) => row.auditId === survivesHistoricalReadFailure.auditId));
assert(!dashboardRowsDespiteReadFailure.some((row) => row.auditId === parsedDefault.auditId));
store.failReadPathname = "";

const overlapping = parseRealSessionAuditEvent(payload(3, {
  patronHash: "deadbeef",
  finalRecommendations: parsedDefault.finalRecommendations,
}));
const secondRecorded = await recordRealSessionAudit(overlapping, store);
assert(secondRecorded.recentOverlaps.some((overlap) => overlap.overlapPercent === 100));

for (let index = 4; index < REAL_SESSION_AUDIT_RETENTION_LIMIT + 7; index += 1) {
  await recordRealSessionAudit(parseRealSessionAuditEvent(payload(index)), store);
}
const retained = await listRealSessionAudits({ store, limit: REAL_SESSION_AUDIT_RETENTION_LIMIT });
assert.equal(retained.length, REAL_SESSION_AUDIT_RETENTION_LIMIT);
assert.equal(store.values.size, REAL_SESSION_AUDIT_RETENTION_LIMIT);
assert(!retained.some((row) => row.auditId === parsedDefault.auditId));

store.failWrites = true;
await assert.rejects(
  recordRealSessionAudit(parseRealSessionAuditEvent(payload(9999)), store),
  /simulated_blob_failure/,
);

const screen = readFileSync(resolve(repoRoot, "screens", "SwipeDeckScreen.tsx"), "utf8");
const api = readFileSync(resolve(repoRoot, "api", "real-session-overlap-audit.ts"), "utf8");
const dashboardApi = readFileSync(resolve(repoRoot, "api", "human-review-dashboard.ts"), "utf8");
const dashboard = readFileSync(resolve(repoRoot, "app", "admin", "human-review.tsx"), "utf8");
const storage = readFileSync(resolve(repoRoot, "lib", "realSessionOverlapAudit.ts"), "utf8");

assert.match(storage, /BLOB_READ_WRITE_TOKEN/);
assert.match(storage, /access: "private"/);
assert.doesNotMatch(storage, /POSTGRES_URL|@vercel\/postgres/);
assert.match(storage, /REAL_SESSION_AUDIT_RETENTION_LIMIT = 500/);
assert.match(screen, /libraryId: runtimeLibraryId \|\| "default"/);
assert.match(screen, /libraryScope: runtimeLibraryId \? "hosted" : "default"/);
assert.doesNotMatch(screen, /runtimeLibraryId === "y" && !recordedSessionAuditsRef/);
assert.match(screen, /searchPlan: result\.diagnostics\.searchPlan/);
assert.match(screen, /source: String\(item\.doc\.source \|\| "unknown"\)/);
assert.match(screen, /fetch\(REAL_SESSION_AUDIT_API_URL/);
assert.match(screen, /for \(let attempt = 1; attempt <= 3; attempt \+= 1\)/);
assert.match(screen, /recordedSessionAuditsRef\.current\.delete\(runId\)/);
assert.match(screen, /schemaVersion: "anonymous_review_evidence_v1"/);
assert.match(screen, /swipeEvidence: history\.slice\(0, 200\)/);
assert.match(screen, /recommendationSlate: guardedNormalizedItems\.slice\(0, 10\)/);
assert(screen.indexOf("setRecItems(guardedNormalizedItems)") < screen.indexOf("fetch(REAL_SESSION_AUDIT_API_URL"));
assert.match(api, /logRealSessionAuditStorageFailure\("record", error\)/);
assert.match(api, /req\.method === "GET"/);
assert.match(dashboardApi, /storageMode: "durable_blob"/);
assert.match(dashboardApi, /listRealSessionAudits\(\)/);
assert.match(dashboard, /Recommendation queries:/);
assert.match(dashboard, /Final 10:/);
assert.match(dashboard, /\[\$\{item\.source\}\]/);
const anonymousApi = readFileSync(resolve(repoRoot, "api", "anonymous-human-review-session.ts"), "utf8");
assert.doesNotMatch(anonymousApi, /\\.\\.\\.row|patronHash|auditId:/);
assert.match(anonymousApi, /reviewMode !== "anonymous_session"/);

console.log("Real session Blob audit regressions passed.");
