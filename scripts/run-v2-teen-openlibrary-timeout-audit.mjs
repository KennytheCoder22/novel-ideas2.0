/**
 * OL-F2 Phase 1 — Teen Open Library timeout measurement audit (read-only).
 *
 * Usage:
 *   node scripts/run-v2-teen-openlibrary-timeout-audit.mjs --rounds=12
 */

import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TEEN_AUDIT_PROFILES } from "./lib/teen-googlebooks-audit-profiles.mjs";

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

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const outDir = resolve(scriptDir, "output");
const { runRecommenderV2 } = require(resolve(repoRoot, "app/recommender-v2/engine.ts"));

const roundsArg = process.argv.find((arg) => arg.startsWith("--rounds="));
const rounds = Math.max(1, Number.parseInt((roundsArg || "--rounds=12").split("=")[1], 10) || 12);
const limit = 5;

const caseSpecs = [
  { scopeFamily: "fantasy", requiredFamily: "fantasy", profileId: "fantasy-high-epic" },
  { scopeFamily: "mystery_thriller", requiredFamily: "mystery/thriller", profileId: "mystery-psychological-thriller" },
  { scopeFamily: "horror_paranormal", requiredFamily: "horror/paranormal", profileId: "horror-supernatural-ghost" },
  { scopeFamily: "speculative_scifi", requiredFamily: "speculative/science fiction", profileId: "scifi-space-opera" },
  { scopeFamily: "contemporary", requiredFamily: "contemporary/romance", profileId: "contemporary-coming-of-age" },
  { scopeFamily: "romance", requiredFamily: "contemporary/romance", profileId: "romance-contemporary-sweet" },
  { scopeFamily: "adventure_historical", requiredFamily: "adventure/historical", profileId: "historical-adventure-exploration" },
];

const cases = caseSpecs.map((spec) => {
  const profile = TEEN_AUDIT_PROFILES.find((row) => row.id === spec.profileId);
  if (!profile) throw new Error(`Missing profile ${spec.profileId}`);
  return { ...spec, profile };
});

const records = [];
const runSummaries = [];
const runErrors = [];

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function csvEscape(value) {
  const str = String(value == null ? "" : value);
  return str.includes(",") || str.includes('"') || str.includes("\n") ? `"${str.replace(/"/g, '""')}"` : str;
}

function lifecycleStage(fetch) {
  if (!fetch.timedOut) return "completed";
  if (!fetch.responseHeadersReceived) return "pre_headers";
  if (!fetch.bodyCompleted) return "headers_received_body_incomplete";
  return "post_body_completion";
}

console.log(`Running Teen Open Library timeout audit: ${rounds} rounds x ${cases.length} families`);

for (let round = 1; round <= rounds; round += 1) {
  const orderOffset = (round - 1) % cases.length;
  const roundCases = [...cases.slice(orderOffset), ...cases.slice(0, orderOffset)];
  console.log(`Round ${round}/${rounds}`);
  for (const familyCase of roundCases) {
    const runId = `${familyCase.scopeFamily}-r${round}`;
    const startedAt = Date.now();
    let result;
    try {
      result = await runRecommenderV2({
        requestId: `ol-f2-timeout-audit-${runId}`,
        ageBand: "teens",
        limit,
        enabledSources: {
          openLibrary: true,
          googleBooks: false,
          kitsu: false,
          comicVine: false,
          localLibrary: false,
          nyt: false,
          mock: false,
        },
        signals: familyCase.profile.signals,
      });
    } catch (error) {
      runErrors.push({
        runId,
        round,
        scopeFamily: familyCase.scopeFamily,
        profileId: familyCase.profile.id,
        error: String(error?.message || error || "unknown_error"),
      });
      console.log(`  ${familyCase.scopeFamily}: ERROR (${String(error?.message || error)})`);
      continue;
    }

    const sourceDiag = (result?.diagnostics?.sources || []).find((source) => source.source === "openLibrary") || {};
    const fetches = Array.isArray(sourceDiag.fetches) ? sourceDiag.fetches.filter((fetch) => !fetch.diagnosticOnly) : [];
    const elapsedRunMs = Date.now() - startedAt;
    const selectedOpenLibraryTitles = (result.items || []).filter((item) => item.source === "openLibrary").map((item) => String(item.title || "").trim()).filter(Boolean);
    const timedOutCount = fetches.filter((fetch) => fetch.timedOut).length;
    console.log(`  ${familyCase.scopeFamily}: fetches=${fetches.length} timeouts=${timedOutCount} selected=${selectedOpenLibraryTitles.length}`);

    runSummaries.push({
      runId,
      round,
      scopeFamily: familyCase.scopeFamily,
      requiredFamily: familyCase.requiredFamily,
      profileId: familyCase.profile.id,
      profileLabel: familyCase.profile.label,
      elapsedRunMs,
      sourceStatus: sourceDiag.status || "unknown",
      openLibraryRawCount: toNumber(sourceDiag.rawCount),
      selectedOpenLibraryCount: selectedOpenLibraryTitles.length,
      selectedOpenLibraryTitles,
      timeoutCount: timedOutCount,
    });

    for (const fetch of fetches) {
      records.push({
        runId,
        round,
        scopeFamily: familyCase.scopeFamily,
        requiredFamily: familyCase.requiredFamily,
        profileId: familyCase.profile.id,
        profileLabel: familyCase.profile.label,
        queryText: String(fetch.query || ""),
        queryFamily: String(fetch.queryFamily || "unknown"),
        queryCascadeIndex: Number.isFinite(Number(fetch.queryCascadeIndex)) ? Number(fetch.queryCascadeIndex) : -1,
        attemptNumber: toNumber(fetch.attemptNumber, 1),
        elapsedMs: toNumber(fetch.elapsedMs),
        timedOut: Boolean(fetch.timedOut),
        abortOrigin: String(fetch.abortOrigin || ""),
        responseHeadersReceived: Boolean(fetch.responseHeadersReceived),
        bodyCompleted: Boolean(fetch.bodyCompleted),
        docsReturned: toNumber(fetch.docsReturned),
        acceptedAfterSourcePolicy: toNumber(fetch.acceptedAfterSourcePolicy),
        finalContribution: toNumber(fetch.finalContribution),
        contributedToFinalSlate: toNumber(fetch.finalContribution) > 0,
        failedReason: String(fetch.failedReason || ""),
        lifecycleStage: lifecycleStage(fetch),
      });
    }
  }
}

const totalAttempts = records.length;
const timeoutAttempts = records.filter((row) => row.timedOut);

const aggregateBy = (items, keyFn) => {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return [...map.entries()].map(([key, group]) => ({ key, group }));
};

const queryRollup = aggregateBy(records, (row) => `${row.scopeFamily}||${row.queryText}||${row.queryFamily}`).map(({ key, group }) => {
  const [scopeFamily, queryText, queryFamily] = key.split("||");
  const attempts = group.length;
  const timedOut = group.filter((row) => row.timedOut).length;
  const successful = group.filter((row) => !row.timedOut);
  const avgAcceptedOnSuccess = successful.length ? successful.reduce((sum, row) => sum + row.acceptedAfterSourcePolicy, 0) / successful.length : 0;
  const avgDocsOnSuccess = successful.length ? successful.reduce((sum, row) => sum + row.docsReturned, 0) / successful.length : 0;
  const estimatedAcceptedLost = group
    .filter((row) => row.timedOut)
    .reduce((sum, row) => sum + Math.max(0, avgAcceptedOnSuccess - row.acceptedAfterSourcePolicy), 0);
  const estimatedDocsLost = group
    .filter((row) => row.timedOut)
    .reduce((sum, row) => sum + Math.max(0, avgDocsOnSuccess - row.docsReturned), 0);
  return {
    scopeFamily,
    queryText,
    queryFamily,
    attempts,
    timedOut,
    timeoutRate: attempts ? timedOut / attempts : 0,
    successfulAttempts: successful.length,
    avgAcceptedOnSuccess,
    avgDocsOnSuccess,
    estimatedAcceptedLost,
    estimatedDocsLost,
    finalContributionTotal: group.reduce((sum, row) => sum + row.finalContribution, 0),
  };
}).sort((a, b) => b.timeoutRate - a.timeoutRate || b.timedOut - a.timedOut);

const familyRollup = aggregateBy(records, (row) => row.scopeFamily).map(({ key, group }) => {
  const attempts = group.length;
  const timedOut = group.filter((row) => row.timedOut).length;
  return {
    scopeFamily: key,
    requiredFamily: group[0]?.requiredFamily || "",
    attempts,
    timedOut,
    timeoutRate: attempts ? timedOut / attempts : 0,
    docsReturned: group.reduce((sum, row) => sum + row.docsReturned, 0),
    acceptedAfterSourcePolicy: group.reduce((sum, row) => sum + row.acceptedAfterSourcePolicy, 0),
    finalContribution: group.reduce((sum, row) => sum + row.finalContribution, 0),
  };
}).sort((a, b) => b.timeoutRate - a.timeoutRate || b.timedOut - a.timedOut);

const lifecycleRollup = aggregateBy(timeoutAttempts, (row) => row.lifecycleStage).map(({ key, group }) => ({
  stage: key,
  count: group.length,
  share: timeoutAttempts.length ? group.length / timeoutAttempts.length : 0,
  abortOrigins: aggregateBy(group, (row) => row.abortOrigin || "unknown").map(({ key: abortOrigin, group: byAbort }) => ({
    abortOrigin,
    count: byAbort.length,
  })).sort((a, b) => b.count - a.count),
})).sort((a, b) => b.count - a.count);

const positionRollup = aggregateBy(records, (row) => String(row.queryCascadeIndex)).map(({ key, group }) => {
  const attempts = group.length;
  const timedOut = group.filter((row) => row.timedOut).length;
  return {
    queryCascadeIndex: Number(key),
    attempts,
    timedOut,
    timeoutRate: attempts ? timedOut / attempts : 0,
  };
}).sort((a, b) => a.queryCascadeIndex - b.queryCascadeIndex);

const wordingRollup = aggregateBy(records, (row) => row.queryText.toLowerCase()).map(({ key, group }) => {
  const attempts = group.length;
  const timedOut = group.filter((row) => row.timedOut).length;
  return {
    queryText: key,
    attempts,
    timedOut,
    timeoutRate: attempts ? timedOut / attempts : 0,
    families: [...new Set(group.map((row) => row.scopeFamily))],
  };
}).filter((row) => row.attempts >= rounds / 2).sort((a, b) => b.timeoutRate - a.timeoutRate || b.timedOut - a.timedOut);

const totalEstimatedAcceptedLost = queryRollup.reduce((sum, row) => sum + row.estimatedAcceptedLost, 0);
const totalEstimatedDocsLost = queryRollup.reduce((sum, row) => sum + row.estimatedDocsLost, 0);
const dominantTimeoutQuery = queryRollup.find((row) => row.timedOut > 0);
const dominantTimeoutShare = dominantTimeoutQuery && timeoutAttempts.length ? dominantTimeoutQuery.timedOut / timeoutAttempts.length : 0;
const primaryLifecycleStage = lifecycleRollup[0]?.stage || "none";
const highestPositionRate = [...positionRollup].sort((a, b) => b.timeoutRate - a.timeoutRate)[0];

const suggestedIntervention = (() => {
  if (!timeoutAttempts.length) return "No timeout intervention justified from this dataset; continue monitoring only.";
  if (dominantTimeoutShare >= 0.5 && primaryLifecycleStage === "pre_headers") {
    return "Smallest justified intervention: add a teen-only, single same-query retry only when an initial teen constituent fetch times out before headers with zero docs, preserving existing behavior for successful requests.";
  }
  if (highestPositionRate && highestPositionRate.queryCascadeIndex > 0 && highestPositionRate.timeoutRate >= 0.15) {
    return "Smallest justified intervention: keep behavior unchanged for successful queries; evaluate teen query-order adjustment to move the highest-timeout constituent earlier before considering retries.";
  }
  return "Smallest justified intervention: preserve current behavior and run a narrow timeout-budget sensitivity experiment before adding retry logic.";
})();

mkdirSync(outDir, { recursive: true });
const outputPrefix = "teen-openlibrary-timeout-audit";
const jsonOut = resolve(outDir, `${outputPrefix}.json`);
const csvOut = resolve(outDir, `${outputPrefix}.csv`);
const summaryOut = resolve(outDir, `${outputPrefix}-summary.txt`);

const payload = {
  generatedAt: new Date().toISOString(),
  rounds,
  limit,
  familyCases: cases.map((item) => ({
    scopeFamily: item.scopeFamily,
    requiredFamily: item.requiredFamily,
    profileId: item.profile.id,
    profileLabel: item.profile.label,
  })),
  totalRuns: runSummaries.length,
  totalAttempts,
  timeoutAttempts: timeoutAttempts.length,
  timeoutRate: totalAttempts ? timeoutAttempts.length / totalAttempts : 0,
  runErrors,
  familyRollup,
  queryRollup,
  lifecycleRollup,
  positionRollup,
  wordingRollup,
  totalEstimatedAcceptedLost,
  totalEstimatedDocsLost,
  suggestedIntervention,
  runSummaries,
  records,
};

writeFileSync(jsonOut, JSON.stringify(payload, null, 2));

const csvHeader = [
  "runId",
  "round",
  "scopeFamily",
  "requiredFamily",
  "profileId",
  "profileLabel",
  "queryText",
  "queryFamily",
  "queryCascadeIndex",
  "attemptNumber",
  "elapsedMs",
  "timedOut",
  "abortOrigin",
  "responseHeadersReceived",
  "bodyCompleted",
  "docsReturned",
  "acceptedAfterSourcePolicy",
  "finalContribution",
  "contributedToFinalSlate",
  "failedReason",
  "lifecycleStage",
].join(",");
const csvRows = records.map((row) => [
  row.runId,
  row.round,
  row.scopeFamily,
  row.requiredFamily,
  row.profileId,
  csvEscape(row.profileLabel),
  csvEscape(row.queryText),
  row.queryFamily,
  row.queryCascadeIndex,
  row.attemptNumber,
  row.elapsedMs,
  row.timedOut,
  row.abortOrigin,
  row.responseHeadersReceived,
  row.bodyCompleted,
  row.docsReturned,
  row.acceptedAfterSourcePolicy,
  row.finalContribution,
  row.contributedToFinalSlate,
  csvEscape(row.failedReason),
  row.lifecycleStage,
].join(","));
writeFileSync(csvOut, `${csvHeader}\n${csvRows.join("\n")}\n`);

const summaryLines = [
  "═══════════════════════════════════════════════════════════════════",
  " OL-F2 Phase 1 — Teen Open Library timeout audit",
  "═══════════════════════════════════════════════════════════════════",
  "",
  `Rounds run ........................ ${rounds}`,
  `Family cases ...................... ${cases.length}`,
  `Runs completed .................... ${runSummaries.length}`,
  `Query attempts recorded ........... ${totalAttempts}`,
  `Timeout attempts .................. ${timeoutAttempts.length} (${(100 * (totalAttempts ? timeoutAttempts.length / totalAttempts : 0)).toFixed(1)}%)`,
  `Estimated accepted candidates lost  ${totalEstimatedAcceptedLost.toFixed(2)}`,
  `Estimated raw docs lost ........... ${totalEstimatedDocsLost.toFixed(2)}`,
  "",
  "── Timeout frequency by family ───────────────────────────────────",
  ...familyRollup.map((row) => `  ${row.scopeFamily.padEnd(24)} attempts=${String(row.attempts).padStart(3)}  timeouts=${String(row.timedOut).padStart(3)}  rate=${(100 * row.timeoutRate).toFixed(1)}%`),
  "",
  "── Highest-timeout query wordings ───────────────────────────────",
  ...queryRollup.filter((row) => row.timedOut > 0).slice(0, 12).map((row) => `  ${row.scopeFamily.padEnd(24)} ${row.queryText} | timeouts=${row.timedOut}/${row.attempts} (${(100 * row.timeoutRate).toFixed(1)}%)`),
  "",
  "── Timeout lifecycle stage ───────────────────────────────────────",
  ...(lifecycleRollup.length
    ? lifecycleRollup.map((row) => `  ${row.stage.padEnd(32)} ${row.count} (${(100 * row.share).toFixed(1)}%)`)
    : ["  none"]),
  "",
  "── Timeout clustering by query position ─────────────────────────",
  ...positionRollup.map((row) => `  cascadeIndex=${String(row.queryCascadeIndex).padStart(2)}  timeouts=${row.timedOut}/${row.attempts} (${(100 * row.timeoutRate).toFixed(1)}%)`),
  "",
  "── Suggested smallest intervention ──────────────────────────────",
  `  ${suggestedIntervention}`,
  "",
  `JSON:    ${jsonOut}`,
  `CSV:     ${csvOut}`,
];

writeFileSync(summaryOut, `${summaryLines.join("\n")}\n`);
console.log(`Audit complete:\n  ${jsonOut}\n  ${csvOut}\n  ${summaryOut}`);
