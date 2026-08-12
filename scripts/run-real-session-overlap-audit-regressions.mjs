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
  computeRecommendationOverlap,
  parseRealSessionAuditEvent,
} = require(resolve(repoRoot, "lib", "realSessionOverlapAudit.ts"));

const payload = {
  auditId: "rec-12345678",
  libraryId: "y",
  patronHash: "12ab34cd",
  ageBand: "teens",
  likes: 7,
  dislikes: 3,
  skips: 2,
  dominantTaste: {
    genreFamily: [{ value: "fantasy", weight: 3 }],
    tone: [{ value: "epic", weight: 2 }],
    themes: [{ value: "magic", weight: 2 }],
    avoidSignals: [{ value: "romance", weight: -1 }],
  },
  localQueries: ["fantasy adventure epic book"],
  finalRecommendations: Array.from({ length: 10 }, (_, index) => ({ id: `book-${index}`, title: `Book ${index}` })),
  patronId: "must-not-persist",
  sessionId: "must-not-persist",
  swipeHistory: [{ title: "must-not-persist" }],
};

const parsed = parseRealSessionAuditEvent(payload);
assert.deepEqual(Object.keys(parsed).sort(), [
  "ageBand", "auditId", "dislikes", "dominantTaste", "finalRecommendations", "libraryId",
  "likes", "localQueries", "patronHash", "skips",
]);
assert.throws(() => parseRealSessionAuditEvent({ ...payload, libraryId: "m" }), /invalid_real_session_library/);
assert.deepEqual(
  computeRecommendationOverlap(
    payload.finalRecommendations,
    payload.finalRecommendations.slice(5).concat([{ id: "other", title: "Other" }]),
  ),
  { overlapCount: 5, overlapPercent: 83.3 },
);

const screen = readFileSync(resolve(repoRoot, "screens", "SwipeDeckScreen.tsx"), "utf8");
const api = readFileSync(resolve(repoRoot, "api", "real-session-overlap-audit.ts"), "utf8");
const dashboardApi = readFileSync(resolve(repoRoot, "api", "human-review-dashboard.ts"), "utf8");
const dashboard = readFileSync(resolve(repoRoot, "app", "admin", "human-review.tsx"), "utf8");
const migration = readFileSync(resolve(repoRoot, "migrations", "real-session-overlap-audit-init.sql"), "utf8");

assert.match(screen, /runtimeLibraryId === "y"/);
assert.match(screen, /patronHash: redactedPatronId\(recommendationPatronId\)/);
assert.match(screen, /recordedSessionAuditsRef/);
assert.match(screen, /finalRecommendations: guardedNormalizedItems\.slice\(0, 10\)/);
assert.match(readFileSync(resolve(repoRoot, "lib", "realSessionOverlapAudit.ts"), "utf8"), /patron_hash <> \$\{event\.patronHash\}/);
assert.doesNotMatch(migration, /patron_id|session_id|swipe_history/i);
assert.match(api, /parseRealSessionAuditEvent/);
assert.match(dashboardApi, /listRealSessionAudits/);
assert.match(dashboard, /Real Session Overlap Audit/);
assert.match(dashboard, /Final 10:/);
assert.match(dashboard, /Recent overlap:/);

console.log("Real session overlap audit regressions passed.");
