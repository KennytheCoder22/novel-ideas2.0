/**
 * OL-F2 timeout audit harness.
 *
 * Modes:
 *   1) Single-budget audit:
 *      node scripts/run-v2-teen-openlibrary-timeout-audit.mjs --rounds=12
 *   2) Budget-sensitivity matrix:
 *      node scripts/run-v2-teen-openlibrary-timeout-audit.mjs --budget-matrix --rounds=12
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

const roundsArg = process.argv.find((arg) => arg.startsWith("--rounds="));
const rounds = Math.max(1, Number.parseInt((roundsArg || "--rounds=12").split("=")[1], 10) || 12);
const budgetMatrixMode = process.argv.includes("--budget-matrix");
const targetedRetryExperimentMode = process.argv.includes("--targeted-retry-experiment");
const limit = 5;

const { runRecommenderV2 } = require(resolve(repoRoot, "app/recommender-v2/engine.ts"));
const openLibraryProfilesModule = require(resolve(repoRoot, "app/recommender-v2/sources/openLibraryProfiles.ts"));

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

const scenarios = budgetMatrixMode
  ? [
      { budgetLabel: "production", timeoutDeltaMs: 0 },
      { budgetLabel: "plus_250ms", timeoutDeltaMs: 250 },
      { budgetLabel: "plus_500ms", timeoutDeltaMs: 500 },
      { budgetLabel: "plus_750ms", timeoutDeltaMs: 750 },
    ]
  : [{ budgetLabel: "production", timeoutDeltaMs: 0 }];

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function csvEscape(value) {
  const str = String(value == null ? "" : value);
  return str.includes(",") || str.includes('"') || str.includes("\n") ? `"${str.replace(/"/g, '""')}"` : str;
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

function lifecycleStage(fetch) {
  if (!fetch.timedOut) return "completed";
  if (!fetch.responseHeadersReceived) return "pre_headers";
  if (!fetch.bodyCompleted) return "headers_received_body_incomplete";
  return "post_body_completion";
}

function parseQueryFromRequestUrl(requestUrl) {
  try {
    const parsed = requestUrl.startsWith("http")
      ? new URL(requestUrl)
      : new URL(requestUrl, "https://local.invalid");
    return String(parsed.searchParams.get("q") || "").trim();
  } catch {
    return "";
  }
}

const aggregateBy = (items, keyFn) => {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return [...map.entries()].map(([key, group]) => ({ key, group }));
};

function withTeenTimeoutDelta(timeoutDeltaMs, fn) {
  const original = openLibraryProfilesModule.openLibraryProfileForAgeBand;
  openLibraryProfilesModule.openLibraryProfileForAgeBand = (ageBand) => {
    const profile = original(ageBand);
    if (ageBand !== "teens" || timeoutDeltaMs === 0) return profile;
    return {
      ...profile,
      perQueryTimeoutMs: Number(profile.perQueryTimeoutMs || 0) + timeoutDeltaMs,
      behaviorLabel: `${profile.behaviorLabel}__ol_f2_plus_${timeoutDeltaMs}ms`,
    };
  };
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      openLibraryProfilesModule.openLibraryProfileForAgeBand = original;
    });
}

async function runOneAuditAttempt({ scenario, familyCase, round }) {
  const runId = `${scenario.budgetLabel}-${familyCase.scopeFamily}-r${round}`;
  const startedAt = Date.now();
  const result = await runRecommenderV2({
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
  const sourceDiag = (result?.diagnostics?.sources || []).find((source) => source.source === "openLibrary") || {};
  const fetches = Array.isArray(sourceDiag.fetches) ? sourceDiag.fetches.filter((fetch) => !fetch.diagnosticOnly) : [];
  const elapsedRunMs = Date.now() - startedAt;
  const selectedOpenLibraryTitles = (result.items || [])
    .filter((item) => item.source === "openLibrary")
    .map((item) => String(item.title || "").trim())
    .filter(Boolean);
  return {
    runSummary: {
      runId,
      budgetLabel: scenario.budgetLabel,
      timeoutDeltaMs: scenario.timeoutDeltaMs,
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
      timeoutCount: fetches.filter((fetch) => fetch.timedOut).length,
    },
    records: fetches.map((fetch) => ({
      runId,
      budgetLabel: scenario.budgetLabel,
      timeoutDeltaMs: scenario.timeoutDeltaMs,
      round,
      scopeFamily: familyCase.scopeFamily,
      requiredFamily: familyCase.requiredFamily,
      profileId: familyCase.profile.id,
      profileLabel: familyCase.profile.label,
      queryText: String(fetch.query || ""),
      requestUrl: String(fetch.requestUrl || ""),
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
      timeoutBudgetRemainingAtFetchStartMs: toNumber(fetch.timeoutBudgetRemainingAtFetchStartMs),
    })),
  };
}

function summarizeScenario(records, runSummaries) {
  const totalAttempts = records.length;
  const timeoutAttempts = records.filter((row) => row.timedOut);
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
    abortOrigins: aggregateBy(group, (row) => row.abortOrigin || "unknown")
      .map(({ key: abortOrigin, group: byAbort }) => ({ abortOrigin, count: byAbort.length }))
      .sort((a, b) => b.count - a.count),
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

  const attemptLatencies = records.map((row) => row.elapsedMs).filter((value) => Number.isFinite(value) && value > 0);
  const runLatencies = runSummaries.map((row) => row.elapsedRunMs).filter((value) => Number.isFinite(value) && value > 0);

  return {
    totalRuns: runSummaries.length,
    totalAttempts,
    timeoutAttempts: timeoutAttempts.length,
    timeoutRate: totalAttempts ? timeoutAttempts.length / totalAttempts : 0,
    medianAttemptLatencyMs: percentile(attemptLatencies, 50),
    p95AttemptLatencyMs: percentile(attemptLatencies, 95),
    medianRunLatencyMs: percentile(runLatencies, 50),
    p95RunLatencyMs: percentile(runLatencies, 95),
    totalRuntimeMs: runSummaries.reduce((sum, row) => sum + row.elapsedRunMs, 0),
    rawDocs: records.reduce((sum, row) => sum + row.docsReturned, 0),
    acceptedAfterSourcePolicy: records.reduce((sum, row) => sum + row.acceptedAfterSourcePolicy, 0),
    finalContribution: records.reduce((sum, row) => sum + row.finalContribution, 0),
    totalEstimatedAcceptedLost: queryRollup.reduce((sum, row) => sum + row.estimatedAcceptedLost, 0),
    totalEstimatedDocsLost: queryRollup.reduce((sum, row) => sum + row.estimatedDocsLost, 0),
    queryRollup,
    familyRollup,
    lifecycleRollup,
    positionRollup,
  };
}

async function runTargetedRetryExperiment() {
  const scenario = { budgetLabel: "production", timeoutDeltaMs: 0 };
  const rows = [];
  const retryEvents = [];
  const runErrors = [];
  console.log(`Running Teen Open Library targeted retry experiment: ${rounds} rounds x ${cases.length} families`);
  for (let round = 1; round <= rounds; round += 1) {
    const orderOffset = (round - 1) % cases.length;
    const roundCases = [...cases.slice(orderOffset), ...cases.slice(0, orderOffset)];
    console.log(`Round ${round}/${rounds}`);
    for (const familyCase of roundCases) {
      const controlId = `control-${familyCase.scopeFamily}-r${round}`;
      const experimentalId = `experimental-${familyCase.scopeFamily}-r${round}`;
      let controlRun;
      try {
        controlRun = await runOneAuditAttempt({ scenario, familyCase, round });
      } catch (error) {
        runErrors.push({
          runId: controlId,
          round,
          scopeFamily: familyCase.scopeFamily,
          profileId: familyCase.profile.id,
          mode: "control",
          error: String(error?.message || error || "unknown_error"),
        });
        process.stdout.write(`  ${familyCase.scopeFamily}: control ERROR (${String(error?.message || error)})\n`);
        continue;
      }

      const controlEligible = controlRun.records.filter((row) =>
        row.timedOut
        && row.attemptNumber === 1
        && row.abortOrigin === "local_timeout"
        && !row.responseHeadersReceived
        && !row.bodyCompleted,
      );
      const controlEligibleCount = controlEligible.length;

      const originalFetch = globalThis.fetch;
      const retriedRequestKeys = new Set();
      const retryProbeEvents = [];
      globalThis.fetch = async (url, options = {}) => {
        const requestUrl = String(url || "");
        const requestStart = Date.now();
        try {
          return await originalFetch(url, options);
        } catch (firstError) {
          const signal = options?.signal;
          const isOpenLibraryRequest = /openlibrary/i.test(requestUrl);
          const isEligibleTimeout = Boolean(
            isOpenLibraryRequest
            && signal?.aborted
            && signal?.reason === "per_query_timeout",
          );
          const retryKey = `${requestUrl}::${parseQueryFromRequestUrl(requestUrl)}`;
          if (!isEligibleTimeout || retriedRequestKeys.has(retryKey)) throw firstError;
          retriedRequestKeys.add(retryKey);
          const firstElapsedMs = Date.now() - requestStart;
          const retryTimeoutMs = Math.max(250, Math.round(firstElapsedMs));
          const retryController = new AbortController();
          const retryTimer = setTimeout(() => retryController.abort("per_query_timeout_retry"), retryTimeoutMs);
          const retryEvent = {
            runId: experimentalId,
            round,
            scopeFamily: familyCase.scopeFamily,
            requiredFamily: familyCase.requiredFamily,
            profileId: familyCase.profile.id,
            queryText: parseQueryFromRequestUrl(requestUrl),
            requestUrl,
            firstAttemptTimedOut: true,
            firstAttemptElapsedMs: firstElapsedMs,
            retryAttempted: true,
            retryTimeoutMs,
            retrySucceeded: false,
            retryElapsedMs: 0,
            retryHttpStatus: 0,
            retryError: "",
          };
          try {
            const retryStartedAt = Date.now();
            const retryResponse = await originalFetch(url, { ...options, signal: retryController.signal });
            retryEvent.retryElapsedMs = Date.now() - retryStartedAt;
            retryEvent.retryHttpStatus = Number(retryResponse?.status || 0);
            retryEvent.retrySucceeded = Boolean(retryResponse?.ok);
            retryProbeEvents.push(retryEvent);
            if (retryResponse?.ok) return retryResponse;
            throw firstError;
          } catch (retryError) {
            retryEvent.retryElapsedMs = retryEvent.retryElapsedMs || retryTimeoutMs;
            retryEvent.retryError = String(retryError?.message || retryError || "retry_failed");
            retryProbeEvents.push(retryEvent);
            throw firstError;
          } finally {
            clearTimeout(retryTimer);
          }
        }
      };

      let experimentalRun;
      try {
        experimentalRun = await runOneAuditAttempt({ scenario: { ...scenario, budgetLabel: "experimental_retry" }, familyCase, round });
      } catch (error) {
        runErrors.push({
          runId: experimentalId,
          round,
          scopeFamily: familyCase.scopeFamily,
          profileId: familyCase.profile.id,
          mode: "experimental",
          error: String(error?.message || error || "unknown_error"),
        });
        process.stdout.write(`  ${familyCase.scopeFamily}: experimental ERROR (${String(error?.message || error)})\n`);
        globalThis.fetch = originalFetch;
        continue;
      } finally {
        globalThis.fetch = originalFetch;
      }

      const controlElapsed = Number(controlRun.runSummary.elapsedRunMs || 0);
      const experimentalElapsed = Number(experimentalRun.runSummary.elapsedRunMs || 0);
      const addedWallClockMs = experimentalElapsed - controlElapsed;
      const controlWindowSlowdown = controlEligibleCount >= 2;
      const experimentalWindowSlowdown = retryProbeEvents.length >= 2;
      const slowdownWindowObserved = controlWindowSlowdown || experimentalWindowSlowdown;

      const experimentalFetchesByQuery = aggregateBy(experimentalRun.records, (row) => row.queryText.toLowerCase());
      for (const event of retryProbeEvents) {
        const queryKey = String(event.queryText || "").toLowerCase();
        const matchingGroup = experimentalFetchesByQuery.find((entry) => entry.key === queryKey)?.group || [];
        const firstNonTimeout = matchingGroup.find((row) => !row.timedOut);
        const recoveredRawDocs = toNumber(firstNonTimeout?.docsReturned, 0);
        const recoveredAccepted = toNumber(firstNonTimeout?.acceptedAfterSourcePolicy, 0);
        const recoveredFinalContribution = toNumber(firstNonTimeout?.finalContribution, 0);
        retryEvents.push({
          ...event,
          queryFamily: String(firstNonTimeout?.queryFamily || "unknown"),
          queryCascadeIndex: Number.isFinite(Number(firstNonTimeout?.queryCascadeIndex)) ? Number(firstNonTimeout?.queryCascadeIndex) : -1,
          recoveredRawDocs,
          recoveredAcceptedAfterSourcePolicy: recoveredAccepted,
          recoveredFinalContribution,
          slowdownWindowObserved,
          controlEligibleTimeoutCountInRun: controlEligibleCount,
          experimentalRetryCountInRun: retryProbeEvents.length,
        });
      }

      const recoveredRawDocsRun = retryEvents
        .filter((row) => row.runId === experimentalId && row.retrySucceeded)
        .reduce((sum, row) => sum + Number(row.recoveredRawDocs || 0), 0);
      const recoveredAcceptedRun = retryEvents
        .filter((row) => row.runId === experimentalId && row.retrySucceeded)
        .reduce((sum, row) => sum + Number(row.recoveredAcceptedAfterSourcePolicy || 0), 0);
      const recoveredFinalContributionRun = retryEvents
        .filter((row) => row.runId === experimentalId && row.retrySucceeded)
        .reduce((sum, row) => sum + Number(row.recoveredFinalContribution || 0), 0);

      rows.push({
        round,
        scopeFamily: familyCase.scopeFamily,
        requiredFamily: familyCase.requiredFamily,
        profileId: familyCase.profile.id,
        profileLabel: familyCase.profile.label,
        controlRunId: controlId,
        experimentalRunId: experimentalId,
        controlElapsedMs: controlElapsed,
        experimentalElapsedMs: experimentalElapsed,
        addedWallClockMs,
        controlEligibleTimeoutCount: controlEligibleCount,
        retryAttemptCount: retryProbeEvents.length,
        retrySuccessCount: retryProbeEvents.filter((row) => row.retrySucceeded).length,
        recoveredRawDocs: recoveredRawDocsRun,
        recoveredAcceptedAfterSourcePolicy: recoveredAcceptedRun,
        recoveredFinalContribution: recoveredFinalContributionRun,
        slowdownWindowObserved,
      });
      process.stdout.write(
        `  ${familyCase.scopeFamily}: controlTimeouts=${controlEligibleCount} retries=${retryProbeEvents.length} retrySuccess=${retryProbeEvents.filter((row) => row.retrySucceeded).length} addedMs=${addedWallClockMs}\n`,
      );
    }
  }

  const firstAttemptTimeoutCount = rows.reduce((sum, row) => sum + Number(row.controlEligibleTimeoutCount || 0), 0);
  const retryAttemptCount = rows.reduce((sum, row) => sum + Number(row.retryAttemptCount || 0), 0);
  const retrySuccessCount = rows.reduce((sum, row) => sum + Number(row.retrySuccessCount || 0), 0);
  const recoveredRawDocs = rows.reduce((sum, row) => sum + Number(row.recoveredRawDocs || 0), 0);
  const recoveredAcceptedAfterSourcePolicy = rows.reduce((sum, row) => sum + Number(row.recoveredAcceptedAfterSourcePolicy || 0), 0);
  const recoveredFinalContribution = rows.reduce((sum, row) => sum + Number(row.recoveredFinalContribution || 0), 0);
  const addedWallClockMs = rows.reduce((sum, row) => sum + Number(row.addedWallClockMs || 0), 0);
  const addedWallClockSeconds = addedWallClockMs / 1000;
  const recoveredAcceptedPerAdditionalSecond = addedWallClockSeconds > 0
    ? recoveredAcceptedAfterSourcePolicy / addedWallClockSeconds
    : null;

  const retrySuccessByFamily = aggregateBy(retryEvents, (row) => row.scopeFamily).map(({ key, group }) => ({
    scopeFamily: key,
    attempts: group.length,
    successes: group.filter((row) => row.retrySucceeded).length,
    successRate: group.length ? group.filter((row) => row.retrySucceeded).length / group.length : 0,
    recoveredAcceptedAfterSourcePolicy: group.reduce((sum, row) => sum + Number(row.recoveredAcceptedAfterSourcePolicy || 0), 0),
  })).sort((a, b) => b.successRate - a.successRate || b.successes - a.successes);

  const retrySuccessByWording = aggregateBy(retryEvents, (row) => row.queryText.toLowerCase()).map(({ key, group }) => ({
    queryText: key,
    attempts: group.length,
    successes: group.filter((row) => row.retrySucceeded).length,
    successRate: group.length ? group.filter((row) => row.retrySucceeded).length / group.length : 0,
    families: [...new Set(group.map((row) => row.scopeFamily))],
  })).sort((a, b) => b.successRate - a.successRate || b.successes - a.successes);

  const retrySuccessByCascadeIndex = aggregateBy(retryEvents, (row) => String(row.queryCascadeIndex)).map(({ key, group }) => ({
    queryCascadeIndex: Number(key),
    attempts: group.length,
    successes: group.filter((row) => row.retrySucceeded).length,
    successRate: group.length ? group.filter((row) => row.retrySucceeded).length / group.length : 0,
  })).sort((a, b) => a.queryCascadeIndex - b.queryCascadeIndex);

  const slowdownWindowSummary = {
    runsWithSlowdownWindow: rows.filter((row) => row.slowdownWindowObserved).length,
    retryAttemptsInSlowdownWindow: retryEvents.filter((row) => row.slowdownWindowObserved).length,
    retrySuccessesInSlowdownWindow: retryEvents.filter((row) => row.slowdownWindowObserved && row.retrySucceeded).length,
    retryAttemptsOutsideSlowdownWindow: retryEvents.filter((row) => !row.slowdownWindowObserved).length,
    retrySuccessesOutsideSlowdownWindow: retryEvents.filter((row) => !row.slowdownWindowObserved && row.retrySucceeded).length,
  };

  mkdirSync(outDir, { recursive: true });
  const outputPrefix = "teen-openlibrary-targeted-retry-experiment";
  const jsonOut = resolve(outDir, `${outputPrefix}.json`);
  const csvOut = resolve(outDir, `${outputPrefix}.csv`);
  const summaryOut = resolve(outDir, `${outputPrefix}-summary.txt`);

  const payload = {
    generatedAt: new Date().toISOString(),
    mode: "targeted_retry_experiment",
    rounds,
    limit,
    familyCases: cases.map((item) => ({
      scopeFamily: item.scopeFamily,
      requiredFamily: item.requiredFamily,
      profileId: item.profile.id,
      profileLabel: item.profile.label,
    })),
    totals: {
      firstAttemptTimeoutCount,
      retryAttemptCount,
      retrySuccessCount,
      retrySuccessRate: retryAttemptCount ? retrySuccessCount / retryAttemptCount : 0,
      recoveredRawDocs,
      recoveredAcceptedAfterSourcePolicy,
      recoveredFinalContribution,
      addedWallClockMs,
      recoveredAcceptedPerAdditionalSecond,
      recoveredAcceptedPerAdditionalSecondLabel: addedWallClockSeconds > 0
        ? recoveredAcceptedPerAdditionalSecond.toFixed(3)
        : recoveredAcceptedAfterSourcePolicy > 0
          ? "non_positive_additional_cost"
          : "not_applicable",
    },
    retrySuccessByFamily,
    retrySuccessByWording,
    retrySuccessByCascadeIndex,
    slowdownWindowSummary,
    runErrors,
    rows,
    retryEvents,
  };
  writeFileSync(jsonOut, JSON.stringify(payload, null, 2));

  const csvHeader = [
    "round",
    "scopeFamily",
    "requiredFamily",
    "profileId",
    "profileLabel",
    "controlRunId",
    "experimentalRunId",
    "controlElapsedMs",
    "experimentalElapsedMs",
    "addedWallClockMs",
    "controlEligibleTimeoutCount",
    "retryAttemptCount",
    "retrySuccessCount",
    "recoveredRawDocs",
    "recoveredAcceptedAfterSourcePolicy",
    "recoveredFinalContribution",
    "slowdownWindowObserved",
  ].join(",");
  const csvRows = rows.map((row) => [
    row.round,
    row.scopeFamily,
    row.requiredFamily,
    row.profileId,
    csvEscape(row.profileLabel),
    row.controlRunId,
    row.experimentalRunId,
    row.controlElapsedMs,
    row.experimentalElapsedMs,
    row.addedWallClockMs,
    row.controlEligibleTimeoutCount,
    row.retryAttemptCount,
    row.retrySuccessCount,
    row.recoveredRawDocs,
    row.recoveredAcceptedAfterSourcePolicy,
    row.recoveredFinalContribution,
    row.slowdownWindowObserved,
  ].join(","));
  writeFileSync(csvOut, `${csvHeader}\n${csvRows.join("\n")}\n`);

  const summaryLines = [
    "═══════════════════════════════════════════════════════════════════",
    " OL-F2 Phase 3 — Teen targeted retry experiment",
    "═══════════════════════════════════════════════════════════════════",
    "",
    `Rounds run ........................ ${rounds}`,
    `Family cases ...................... ${cases.length}`,
    `Runs completed .................... ${rows.length}`,
    `Errors ............................ ${runErrors.length}`,
    "",
    "── Control vs experimental totals ───────────────────────────────",
    `First-attempt timeout count ....... ${firstAttemptTimeoutCount}`,
    `Retry-attempt count ............... ${retryAttemptCount}`,
    `Retry-success count ............... ${retrySuccessCount}`,
    `Retry-success rate ................ ${(100 * (retryAttemptCount ? retrySuccessCount / retryAttemptCount : 0)).toFixed(1)}%`,
    `Recovered raw docs ................ ${recoveredRawDocs}`,
    `Recovered accepted candidates ..... ${recoveredAcceptedAfterSourcePolicy}`,
    `Recovered final contributions ..... ${recoveredFinalContribution}`,
    `Added wall-clock ms ............... ${Math.round(addedWallClockMs)}`,
    `Recovered accepted / addl second .. ${addedWallClockSeconds > 0 ? recoveredAcceptedPerAdditionalSecond.toFixed(3) : (recoveredAcceptedAfterSourcePolicy > 0 ? "non_positive_additional_cost" : "not_applicable")}`,
    "",
    "── Retry success by family ──────────────────────────────────────",
    ...retrySuccessByFamily.map((row) => `  ${row.scopeFamily.padEnd(24)} attempts=${String(row.attempts).padStart(3)} successes=${String(row.successes).padStart(3)} rate=${(100 * row.successRate).toFixed(1)}%`),
    "",
    "── Retry success by cascade index ───────────────────────────────",
    ...retrySuccessByCascadeIndex.map((row) => `  cascadeIndex=${String(row.queryCascadeIndex).padStart(2)} attempts=${String(row.attempts).padStart(3)} successes=${String(row.successes).padStart(3)} rate=${(100 * row.successRate).toFixed(1)}%`),
    "",
    "── Slowdown window check ────────────────────────────────────────",
    `Runs with multi-timeout window ..... ${slowdownWindowSummary.runsWithSlowdownWindow}`,
    `Retry attempts in slowdown window .. ${slowdownWindowSummary.retryAttemptsInSlowdownWindow}`,
    `Retry successes in slowdown window . ${slowdownWindowSummary.retrySuccessesInSlowdownWindow}`,
    `Retry attempts outside window ...... ${slowdownWindowSummary.retryAttemptsOutsideSlowdownWindow}`,
    `Retry successes outside window ..... ${slowdownWindowSummary.retrySuccessesOutsideSlowdownWindow}`,
    "",
    `JSON:    ${jsonOut}`,
    `CSV:     ${csvOut}`,
  ];
  writeFileSync(summaryOut, `${summaryLines.join("\n")}\n`);
  console.log(`Audit complete:\n  ${jsonOut}\n  ${csvOut}\n  ${summaryOut}`);
}

const records = [];
const runSummaries = [];
const runErrors = [];

if (targetedRetryExperimentMode) {
  await runTargetedRetryExperiment();
  process.exit(0);
}

console.log(
  budgetMatrixMode
    ? `Running Teen Open Library timeout budget matrix: ${rounds} rounds x ${cases.length} families x ${scenarios.length} budgets`
    : `Running Teen Open Library timeout audit: ${rounds} rounds x ${cases.length} families`,
);

for (let round = 1; round <= rounds; round += 1) {
  const orderOffset = (round - 1) % cases.length;
  const roundCases = [...cases.slice(orderOffset), ...cases.slice(0, orderOffset)];
  console.log(`Round ${round}/${rounds}`);
  for (const [familyIndex, familyCase] of roundCases.entries()) {
    const scenarioOrderOffset = (round - 1 + familyIndex) % scenarios.length;
    const orderedScenarios = [...scenarios.slice(scenarioOrderOffset), ...scenarios.slice(0, scenarioOrderOffset)];
    for (const scenario of orderedScenarios) {
      try {
        const result = await withTeenTimeoutDelta(scenario.timeoutDeltaMs, () =>
          runOneAuditAttempt({ scenario, familyCase, round }),
        );
        runSummaries.push(result.runSummary);
        records.push(...result.records);
        process.stdout.write(
          `  ${scenario.budgetLabel}:${familyCase.scopeFamily} fetches=${result.records.length} timeouts=${result.records.filter((row) => row.timedOut).length} selected=${result.runSummary.selectedOpenLibraryCount}\n`,
        );
      } catch (error) {
        const runId = `${scenario.budgetLabel}-${familyCase.scopeFamily}-r${round}`;
        runErrors.push({
          runId,
          budgetLabel: scenario.budgetLabel,
          timeoutDeltaMs: scenario.timeoutDeltaMs,
          round,
          scopeFamily: familyCase.scopeFamily,
          profileId: familyCase.profile.id,
          error: String(error?.message || error || "unknown_error"),
        });
        process.stdout.write(`  ${scenario.budgetLabel}:${familyCase.scopeFamily} ERROR (${String(error?.message || error)})\n`);
      }
    }
  }
}

const scenarioSummaries = scenarios.map((scenario) => {
  const scenarioRecords = records.filter((row) => row.budgetLabel === scenario.budgetLabel);
  const scenarioRuns = runSummaries.filter((row) => row.budgetLabel === scenario.budgetLabel);
  return {
    budgetLabel: scenario.budgetLabel,
    timeoutDeltaMs: scenario.timeoutDeltaMs,
    ...summarizeScenario(scenarioRecords, scenarioRuns),
  };
});

const baseline = scenarioSummaries.find((row) => row.budgetLabel === "production");
const matrixRollup = scenarioSummaries.map((row) => {
  const additionalWallClockMs = baseline ? row.totalRuntimeMs - baseline.totalRuntimeMs : 0;
  const recoveredAcceptedCandidates = baseline ? Math.max(0, baseline.totalEstimatedAcceptedLost - row.totalEstimatedAcceptedLost) : 0;
  const additionalWallClockSeconds = additionalWallClockMs / 1000;
  const recoveredPerAdditionalSecond =
    additionalWallClockSeconds > 0 ? recoveredAcceptedCandidates / additionalWallClockSeconds : null;
  const recoveryEfficiencyLabel = additionalWallClockSeconds > 0
    ? recoveredPerAdditionalSecond.toFixed(3)
    : recoveredAcceptedCandidates > 0
      ? "non_positive_additional_cost"
      : "not_applicable";
  return {
    budgetLabel: row.budgetLabel,
    timeoutDeltaMs: row.timeoutDeltaMs,
    timeoutAttempts: row.timeoutAttempts,
    timeoutRate: row.timeoutRate,
    medianAttemptLatencyMs: row.medianAttemptLatencyMs,
    p95AttemptLatencyMs: row.p95AttemptLatencyMs,
    rawDocs: row.rawDocs,
    acceptedAfterSourcePolicy: row.acceptedAfterSourcePolicy,
    finalContribution: row.finalContribution,
    totalRuntimeMs: row.totalRuntimeMs,
    additionalWallClockMsComparedToProduction: additionalWallClockMs,
    totalEstimatedAcceptedLost: row.totalEstimatedAcceptedLost,
    recoveredAcceptedCandidatesVsProduction: recoveredAcceptedCandidates,
    recoveredAcceptedCandidatesPerAdditionalSecondWallClock: recoveredPerAdditionalSecond,
    recoveredAcceptedCandidatesPerAdditionalSecondWallClockLabel: recoveryEfficiencyLabel,
  };
});

const suggestedIntervention = (() => {
  if (!baseline) return "No recommendation — baseline scenario missing.";
  const nonBaseline = matrixRollup.filter((row) => row.budgetLabel !== "production");
  const nearlyAllTimeoutLossRemoved = nonBaseline.filter((row) =>
    row.timeoutAttempts <= Math.max(0, baseline.timeoutAttempts - 1)
    && row.acceptedAfterSourcePolicy >= baseline.acceptedAfterSourcePolicy
    && row.additionalWallClockMsComparedToProduction <= baseline.totalRuntimeMs * 0.05,
  );
  if (nearlyAllTimeoutLossRemoved.length) {
    const best = [...nearlyAllTimeoutLossRemoved].sort((a, b) => a.timeoutDeltaMs - b.timeoutDeltaMs)[0];
    return `Smallest justified intervention from this matrix: teen per-query timeout +${best.timeoutDeltaMs}ms (removes nearly all observed timeout loss with minimal wall-clock overhead).`;
  }
  return "Timeout-budget increases did not show a clear low-cost improvement envelope; keep production budget and investigate narrow targeted recovery only if later data worsens.";
})();

mkdirSync(outDir, { recursive: true });
const outputPrefix = budgetMatrixMode ? "teen-openlibrary-timeout-budget-matrix" : "teen-openlibrary-timeout-audit";
const jsonOut = resolve(outDir, `${outputPrefix}.json`);
const csvOut = resolve(outDir, `${outputPrefix}.csv`);
const summaryOut = resolve(outDir, `${outputPrefix}-summary.txt`);

const payload = {
  generatedAt: new Date().toISOString(),
  mode: budgetMatrixMode ? "budget_matrix" : "single_budget",
  rounds,
  limit,
  familyCases: cases.map((item) => ({
    scopeFamily: item.scopeFamily,
    requiredFamily: item.requiredFamily,
    profileId: item.profile.id,
    profileLabel: item.profile.label,
  })),
  scenarios: scenarioSummaries,
  matrixRollup,
  suggestedIntervention,
  runErrors,
  runSummaries,
  records,
};
writeFileSync(jsonOut, JSON.stringify(payload, null, 2));

const csvHeader = [
  "budgetLabel",
  "timeoutDeltaMs",
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
  "timeoutBudgetRemainingAtFetchStartMs",
  "failedReason",
  "lifecycleStage",
].join(",");
const csvRows = records.map((row) => [
  row.budgetLabel,
  row.timeoutDeltaMs,
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
  row.timeoutBudgetRemainingAtFetchStartMs,
  csvEscape(row.failedReason),
  row.lifecycleStage,
].join(","));
writeFileSync(csvOut, `${csvHeader}\n${csvRows.join("\n")}\n`);

const matrixLines = matrixRollup.map((row) => {
  const recoveredRate = row.recoveredAcceptedCandidatesPerAdditionalSecondWallClockLabel;
  return `  ${row.budgetLabel.padEnd(12)} Δ=${String(row.timeoutDeltaMs).padStart(4)}ms  timeouts=${String(row.timeoutAttempts).padStart(3)} (${(100 * row.timeoutRate).toFixed(2)}%)  med=${Math.round(row.medianAttemptLatencyMs)}ms  p95=${Math.round(row.p95AttemptLatencyMs)}ms  accepted=${Math.round(row.acceptedAfterSourcePolicy)}  final=${Math.round(row.finalContribution)}  runtime=${Math.round(row.totalRuntimeMs)}ms  +wall=${Math.round(row.additionalWallClockMsComparedToProduction)}ms  rec/s=${recoveredRate}`;
});

const summaryLines = [
  "═══════════════════════════════════════════════════════════════════",
  budgetMatrixMode ? " OL-F2 Phase 2 — Teen Open Library timeout budget matrix" : " OL-F2 Phase 1 — Teen Open Library timeout audit",
  "═══════════════════════════════════════════════════════════════════",
  "",
  `Rounds run ........................ ${rounds}`,
  `Family cases ...................... ${cases.length}`,
  `Budget scenarios .................. ${scenarios.length}`,
  `Runs completed .................... ${runSummaries.length}`,
  `Errors ............................ ${runErrors.length}`,
  "",
  "── Budget matrix ─────────────────────────────────────────────────",
  ...matrixLines,
  "",
  "── Suggested smallest intervention ──────────────────────────────",
  `  ${suggestedIntervention}`,
  "",
  `JSON:    ${jsonOut}`,
  `CSV:     ${csvOut}`,
];
writeFileSync(summaryOut, `${summaryLines.join("\n")}\n`);

console.log(`Audit complete:\n  ${jsonOut}\n  ${csvOut}\n  ${summaryOut}`);
