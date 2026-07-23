import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
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
const { buildSearchPlan } = require(resolve(repoRoot, "app/recommender-v2/searchPlan.ts"));

const localEnv = parseDotEnv(resolve(repoRoot, ".env"));
if (!process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY && localEnv.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY) {
  process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY = localEnv.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY;
}
if (!process.env.GOOGLE_BOOKS_API_KEY && localEnv.GOOGLE_BOOKS_API_KEY) {
  process.env.GOOGLE_BOOKS_API_KEY = localEnv.GOOGLE_BOOKS_API_KEY;
}

const ROUNDS = 4;
const LIMIT = 10;
const EXPECTED_DEFAULT_QUERIES = ["young adult sci fi", "YA dystopian", "YA speculative fiction"];
const LEGACY_QUERY = "young adult science fiction novel";

const SCIFI_PROFILES = TEEN_AUDIT_PROFILES
  .filter((profile) => String(profile.family || "").trim() === "science_fiction")
  .map((profile) => ({
    id: profile.id,
    label: profile.label,
    ageBand: profile.ageBand,
    signals: profile.signals,
  }));

function parseDotEnv(path) {
  try {
    const raw = readFileSync(path, "utf8");
    const out = {};
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx <= 0) continue;
      out[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
    }
    return out;
  } catch {
    return {};
  }
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function text(value) {
  return String(value || "").trim();
}

function key(value) {
  return text(value).toLowerCase();
}

function round2(value) {
  return Number(value.toFixed(2));
}

function stats(values) {
  const nums = values.map((v) => asNumber(v));
  if (!nums.length) return { mean: 0, min: 0, max: 0, stddev: 0 };
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const variance = nums.reduce((sum, v) => sum + ((v - mean) ** 2), 0) / nums.length;
  return { mean: round2(mean), min: round2(min), max: round2(max), stddev: round2(Math.sqrt(variance)) };
}

function normalizeQueries(values) {
  return asArray(values).map((v) => text(v)).filter(Boolean);
}

function listEquals(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function uniqueAcceptedTitleCount(googleBooksSourceDiag) {
  const quality = asObject(googleBooksSourceDiag.googleBooksQueryResultQualityByQuery);
  const set = new Set();
  for (const row of Object.values(quality)) {
    for (const title of asArray(asObject(row).titles)) {
      const k = key(title);
      if (k) set.add(k);
    }
  }
  return set.size;
}

async function runDefaultScifiValidation() {
  const rows = [];
  for (let round = 1; round <= ROUNDS; round += 1) {
    for (const profile of SCIFI_PROFILES) {
      delete process.env.V2_TEEN_GB_SCIFI_PRIMARY_QUERY_OVERRIDE;
      delete process.env.V2_TEEN_GB_SCIFI_COMPOSITE_QUERIES_OVERRIDE;
      const result = await runRecommenderV2({
        requestId: `gbr1-postpromo-default-r${round}-${profile.id}`,
        ageBand: profile.ageBand,
        limit: LIMIT,
        enabledSources: {
          googleBooks: true,
          openLibrary: false,
          kitsu: false,
          comicVine: false,
          localLibrary: false,
          nyt: false,
          mock: false,
        },
        signals: profile.signals,
      });
      const diagnostics = asObject(asObject(result).diagnostics);
      const planDiag = asObject(asObject(diagnostics.searchPlan).diagnostics);
      const sourceDiag = asObject(asArray(diagnostics.sources).find((s) => asObject(s).source === "googleBooks"));
      const fetches = asArray(sourceDiag.fetches);
      const plannedQueries = normalizeQueries(planDiag.teenGoogleBooksFinalQueryList);
      const executedQueries = fetches.map((f) => text(asObject(f).query)).filter(Boolean);
      const timedOutFetches = fetches.filter((f) => asObject(f).timedOut === true).length;
      rows.push({
        round,
        profileId: profile.id,
        profileLabel: profile.label,
        plannedQueries,
        plannedQueriesMatchExpected: listEquals(plannedQueries, EXPECTED_DEFAULT_QUERIES),
        productionCompositeApplied: Boolean(planDiag.teenGoogleBooksScienceFictionProductionCompositeApplied),
        compositeOverrideApplied: Boolean(planDiag.teenGoogleBooksScienceFictionCompositeOverrideApplied),
        primaryOverrideApplied: Boolean(planDiag.teenGoogleBooksScienceFictionPrimaryQueryOverrideApplied),
        legacyPrimaryPresentInPlan: plannedQueries.includes(LEGACY_QUERY),
        legacyPrimaryExecuted: executedQueries.includes(LEGACY_QUERY),
        selectedCount: asArray(result.items).length,
        acceptedUniqueCount: uniqueAcceptedTitleCount(sourceDiag),
        latencyMs: asNumber(diagnostics.elapsedMs),
        requestCount: fetches.length,
        timeoutCount: timedOutFetches,
        timeoutRate: fetches.length > 0 ? timedOutFetches / fetches.length : 0,
      });
    }
  }
  return rows;
}

function teenProfile(ageBand, genres, themes = ["friendship"], tones = []) {
  return {
    ageBand,
    maturityBand: ageBand,
    genreFamily: genres.map((value, index) => ({ value, weight: Math.max(1, 2 - index), evidence: [`like:${ageBand}:${value}`] })),
    tone: tones.map((value) => ({ value, weight: 1, evidence: [`like:${ageBand}:${value}`] })),
    pacing: [],
    themes: themes.map((value) => ({ value, weight: 1, evidence: [`like:${ageBand}:${value}`] })),
    characterDynamics: [],
    formatPreference: [{ value: "book", weight: 1, evidence: [`like:${ageBand}:book`] }],
    avoidSignals: [],
    sourceHints: ["googleBooks"],
    diagnostics: {},
  };
}

function googleBooksQueriesFromProfile(profile) {
  const plan = buildSearchPlan(profile, { googleBooks: true });
  const sourcePlan = asArray(plan.sourcePlans).find((s) => asObject(s).source === "googleBooks");
  return asArray(asObject(sourcePlan).intents).map((intent) => text(asObject(intent).query)).filter(Boolean);
}

function runNonScifiInvariantChecks() {
  const romanceQueries = googleBooksQueriesFromProfile(teenProfile("teens", ["romance", "contemporary"]));
  const historicalMysteryQueries = googleBooksQueriesFromProfile(teenProfile("teens", ["historical", "mystery"]));
  return {
    romanceQueries,
    historicalMysteryQueries,
    romanceUnchanged: listEquals(romanceQueries, ["young adult romance fiction novel", "young adult contemporary fiction novel"]),
    historicalMysteryUnchanged: listEquals(historicalMysteryQueries, ["young adult historical fiction novel", "teen mystery thriller novel", "young adult historical mystery novel"]),
  };
}

async function runRollbackChecks(sampleProfile) {
  const checks = {};

  process.env.V2_TEEN_GB_SCIFI_PRIMARY_QUERY_OVERRIDE = "\"young adult\" dystopian novel";
  delete process.env.V2_TEEN_GB_SCIFI_COMPOSITE_QUERIES_OVERRIDE;
  {
    const result = await runRecommenderV2({
      requestId: "gbr1-postpromo-rollback-primary",
      ageBand: sampleProfile.ageBand,
      limit: LIMIT,
      enabledSources: { googleBooks: true, openLibrary: false, kitsu: false, comicVine: false, localLibrary: false, nyt: false, mock: false },
      signals: sampleProfile.signals,
    });
    const planDiag = asObject(asObject(asObject(result).diagnostics).searchPlan).diagnostics || {};
    const plannedQueries = normalizeQueries(planDiag.teenGoogleBooksFinalQueryList);
    checks.primaryOverride = {
      plannedQueries,
      appliedPrimaryOverride: Boolean(planDiag.teenGoogleBooksScienceFictionPrimaryQueryOverrideApplied),
      appliedCompositeOverride: Boolean(planDiag.teenGoogleBooksScienceFictionCompositeOverrideApplied),
      matchesExpected: listEquals(plannedQueries, ["\"young adult\" dystopian novel", "YA dystopian", "YA speculative fiction"]),
    };
  }

  delete process.env.V2_TEEN_GB_SCIFI_PRIMARY_QUERY_OVERRIDE;
  process.env.V2_TEEN_GB_SCIFI_COMPOSITE_QUERIES_OVERRIDE = "young adult sci fi|YA space opera|YA dystopian";
  {
    const result = await runRecommenderV2({
      requestId: "gbr1-postpromo-rollback-composite",
      ageBand: sampleProfile.ageBand,
      limit: LIMIT,
      enabledSources: { googleBooks: true, openLibrary: false, kitsu: false, comicVine: false, localLibrary: false, nyt: false, mock: false },
      signals: sampleProfile.signals,
    });
    const planDiag = asObject(asObject(asObject(result).diagnostics).searchPlan).diagnostics || {};
    const plannedQueries = normalizeQueries(planDiag.teenGoogleBooksFinalQueryList);
    checks.compositeOverride = {
      plannedQueries,
      appliedPrimaryOverride: Boolean(planDiag.teenGoogleBooksScienceFictionPrimaryQueryOverrideApplied),
      appliedCompositeOverride: Boolean(planDiag.teenGoogleBooksScienceFictionCompositeOverrideApplied),
      matchesExpected: listEquals(plannedQueries, ["young adult sci fi", "YA space opera", "YA dystopian"]),
    };
  }

  delete process.env.V2_TEEN_GB_SCIFI_PRIMARY_QUERY_OVERRIDE;
  delete process.env.V2_TEEN_GB_SCIFI_COMPOSITE_QUERIES_OVERRIDE;
  {
    const result = await runRecommenderV2({
      requestId: "gbr1-postpromo-rollback-restore-default",
      ageBand: sampleProfile.ageBand,
      limit: LIMIT,
      enabledSources: { googleBooks: true, openLibrary: false, kitsu: false, comicVine: false, localLibrary: false, nyt: false, mock: false },
      signals: sampleProfile.signals,
    });
    const planDiag = asObject(asObject(asObject(result).diagnostics).searchPlan).diagnostics || {};
    const plannedQueries = normalizeQueries(planDiag.teenGoogleBooksFinalQueryList);
    checks.restoredDefault = {
      plannedQueries,
      matchesExpected: listEquals(plannedQueries, EXPECTED_DEFAULT_QUERIES),
    };
  }
  return checks;
}

function loadPhase4Reference() {
  const path = resolve(outDir, "teen-gb-r1-phase4-final-slate-comparison.json");
  if (!existsSync(path)) return { available: false };
  const doc = JSON.parse(readFileSync(path, "utf8"));
  const b = asArray(doc.summaryByConfig).find((row) => row.configId === "B_composite");
  if (!b) return { available: false };
  return {
    available: true,
    selectedCountMean: asNumber(asObject(b.selectedCount).mean),
    acceptedUniqueMean: asNumber(asObject(b.acceptedAfterSourcePolicyUnique).mean),
    latencyNotRecordedInPhase4: true,
  };
}

function withinTolerance(actual, reference, tolerancePct = 35) {
  if (!Number.isFinite(actual) || !Number.isFinite(reference)) return false;
  if (reference === 0) return actual === 0;
  const pct = Math.abs((actual - reference) / reference) * 100;
  return pct <= tolerancePct;
}

function notMateriallyBelowReference(actual, reference, maxDeclinePct = 35) {
  if (!Number.isFinite(actual) || !Number.isFinite(reference)) return false;
  if (reference === 0) return actual >= 0;
  const floor = reference * (1 - (maxDeclinePct / 100));
  return actual >= floor;
}

async function run() {
  const defaultRows = await runDefaultScifiValidation();
  const nonScifi = runNonScifiInvariantChecks();
  const rollback = await runRollbackChecks(SCIFI_PROFILES[0]);

  const defaultSummary = {
    selectedCount: stats(defaultRows.map((r) => r.selectedCount)),
    acceptedUniqueCount: stats(defaultRows.map((r) => r.acceptedUniqueCount)),
    latencyMs: stats(defaultRows.map((r) => r.latencyMs)),
    requestCount: stats(defaultRows.map((r) => r.requestCount)),
    timeoutRatePct: stats(defaultRows.map((r) => r.timeoutRate * 100)),
    plannedQueryMatchRatePct: round2((defaultRows.filter((r) => r.plannedQueriesMatchExpected).length / defaultRows.length) * 100),
    productionCompositeAppliedRatePct: round2((defaultRows.filter((r) => r.productionCompositeApplied).length / defaultRows.length) * 100),
    legacyPrimaryPlanPresenceCount: defaultRows.filter((r) => r.legacyPrimaryPresentInPlan).length,
    legacyPrimaryExecutionCount: defaultRows.filter((r) => r.legacyPrimaryExecuted).length,
    primaryOverrideAppliedCount: defaultRows.filter((r) => r.primaryOverrideApplied).length,
    compositeOverrideAppliedCount: defaultRows.filter((r) => r.compositeOverrideApplied).length,
  };

  const phase4Ref = loadPhase4Reference();
  const comparableToPhase4 = phase4Ref.available
    ? {
      available: true,
      selectedCountComparable: notMateriallyBelowReference(defaultSummary.selectedCount.mean, phase4Ref.selectedCountMean, 35),
      acceptedUniqueComparable: notMateriallyBelowReference(defaultSummary.acceptedUniqueCount.mean, phase4Ref.acceptedUniqueMean, 35),
      currentSelectedMean: defaultSummary.selectedCount.mean,
      referenceSelectedMean: phase4Ref.selectedCountMean,
      currentAcceptedUniqueMean: defaultSummary.acceptedUniqueCount.mean,
      referenceAcceptedUniqueMean: phase4Ref.acceptedUniqueMean,
    }
    : { available: false };

  const allChecksPass =
    defaultSummary.plannedQueryMatchRatePct === 100
    && defaultSummary.productionCompositeAppliedRatePct === 100
    && defaultSummary.legacyPrimaryPlanPresenceCount === 0
    && defaultSummary.legacyPrimaryExecutionCount === 0
    && nonScifi.romanceUnchanged
    && nonScifi.historicalMysteryUnchanged
    && rollback.primaryOverride.matchesExpected
    && rollback.compositeOverride.matchesExpected
    && rollback.restoredDefault.matchesExpected
    && (!comparableToPhase4.available || (comparableToPhase4.selectedCountComparable && comparableToPhase4.acceptedUniqueComparable));

  mkdirSync(outDir, { recursive: true });
  const jsonOut = resolve(outDir, "teen-gb-r1-post-promotion-validation.json");
  const summaryOut = resolve(outDir, "teen-gb-r1-post-promotion-validation-summary.txt");
  const csvOut = resolve(outDir, "teen-gb-r1-post-promotion-validation.csv");

  writeFileSync(jsonOut, JSON.stringify({
    generatedAt: new Date().toISOString(),
    expectedDefaultQueries: EXPECTED_DEFAULT_QUERIES,
    legacyPrimaryQuery: LEGACY_QUERY,
    defaultRows,
    defaultSummary,
    nonScifi,
    rollback,
    comparableToPhase4,
    allChecksPass,
  }, null, 2));

  const csvHeader = [
    "round",
    "profileId",
    "plannedQueries",
    "plannedQueriesMatchExpected",
    "productionCompositeApplied",
    "legacyPrimaryExecuted",
    "selectedCount",
    "acceptedUniqueCount",
    "latencyMs",
    "requestCount",
    "timeoutRatePct",
  ].join(",");
  const csvRows = defaultRows.map((row) => [
    row.round,
    row.profileId,
    `"${row.plannedQueries.join(" | ").replace(/"/g, "\"\"")}"`,
    row.plannedQueriesMatchExpected,
    row.productionCompositeApplied,
    row.legacyPrimaryExecuted,
    row.selectedCount,
    row.acceptedUniqueCount,
    row.latencyMs,
    row.requestCount,
    round2(row.timeoutRate * 100),
  ].join(","));
  writeFileSync(csvOut, `${csvHeader}\n${csvRows.join("\n")}\n`);

  const summaryLines = [
    "Teen GB-R1 Post-promotion Validation",
    `All checks pass: ${allChecksPass}`,
    "",
    `Default planned queries match rate: ${defaultSummary.plannedQueryMatchRatePct}%`,
    `Production composite applied rate: ${defaultSummary.productionCompositeAppliedRatePct}%`,
    `Legacy primary present in plan count: ${defaultSummary.legacyPrimaryPlanPresenceCount}`,
    `Legacy primary executed count: ${defaultSummary.legacyPrimaryExecutionCount}`,
    "",
    `Selected count mean: ${defaultSummary.selectedCount.mean}`,
    `Accepted unique mean: ${defaultSummary.acceptedUniqueCount.mean}`,
    `Latency mean ms: ${defaultSummary.latencyMs.mean}`,
    `Request count mean: ${defaultSummary.requestCount.mean}`,
    `Timeout rate mean %: ${defaultSummary.timeoutRatePct.mean}`,
    "",
    `Non-sci-fi unchanged (romance): ${nonScifi.romanceUnchanged}`,
    `Non-sci-fi unchanged (historical+mystery): ${nonScifi.historicalMysteryUnchanged}`,
    `Rollback primary override ok: ${rollback.primaryOverride.matchesExpected}`,
    `Rollback composite override ok: ${rollback.compositeOverride.matchesExpected}`,
    `Override removal restores default: ${rollback.restoredDefault.matchesExpected}`,
    "",
    comparableToPhase4.available
      ? `Comparable to Phase 4 (selected/accepted): ${comparableToPhase4.selectedCountComparable}/${comparableToPhase4.acceptedUniqueComparable}`
      : "Comparable to Phase 4: reference unavailable",
    "",
    allChecksPass ? "Teen GB-R1: CLOSED — PRODUCTION PROMOTION VERIFIED" : "Teen GB-R1: VALIDATION INCOMPLETE",
  ];
  writeFileSync(summaryOut, `${summaryLines.join("\n")}\n`);

  console.log(`Wrote ${jsonOut}`);
  console.log(`Wrote ${csvOut}`);
  console.log(`Wrote ${summaryOut}`);
}

await run();
