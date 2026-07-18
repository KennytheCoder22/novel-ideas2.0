/**
 * Regression tests: mock source must be off in normal production-style V2 runs.
 *
 * Verifies:
 * 1. Normal production-style V2 run with no mock in enabledSources → mock is skipped,
 *    raw count = 0, The Lantern Archive and Signal in the Stacks absent.
 * 2. Normal run with mock explicitly false → same result.
 * 3. Normal run with mock explicitly true (developer opt-in) → mock rows appear.
 * 4. buildSearchPlan default (empty enabledSources) → mock NOT enabled.
 * 5. buildSearchPlan with { mock: true } → mock IS enabled.
 * 6. buildSearchPlan with { mock: false } → mock NOT enabled.
 * 7. A run with only { googleBooks: true } includes no mock candidates.
 * 8. Mock removal does not affect Google Books or Open Library plan entries.
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertFalsy(value, message) {
  if (value) throw new Error(`${message}: expected falsy, got ${JSON.stringify(value)}`);
}

function assertTruthy(value, message) {
  if (!value) throw new Error(`${message}: expected truthy, got ${JSON.stringify(value)}`);
}

function assertNotIncludes(values, forbidden, message) {
  if (Array.isArray(values) && values.some((v) => String(v).toLowerCase().includes(String(forbidden).toLowerCase()))) {
    throw new Error(`${message}: ${JSON.stringify(values)} should NOT include ${JSON.stringify(forbidden)}`);
  }
}

function assertIncludes(values, expected, message) {
  if (!Array.isArray(values) || !values.some((v) => String(v).toLowerCase().includes(String(expected).toLowerCase()))) {
    throw new Error(`${message}: expected ${JSON.stringify(values)} to include ${JSON.stringify(expected)}`);
  }
}

const dir = resolve(new URL(".", import.meta.url).pathname, "../app/recommender-v2");
const { buildSearchPlan } = require(resolve(dir, "searchPlan.ts"));

const adultProfile = {
  ageBand: "adult",
  maturityBand: "adult",
  genreFamily: [{ value: "mystery", weight: 5 }],
  tone: [{ value: "atmospheric", weight: 3 }],
  themes: [{ value: "secrets", weight: 2 }],
  formatPreference: [{ value: "book", weight: 4 }],
  diagnostics: {},
};

// ─── Test 1: buildSearchPlan with empty enabledSources → mock NOT enabled ──────
{
  const plan = buildSearchPlan(adultProfile, {});
  const mockPlan = plan.sourcePlans.find((p) => p.source === "mock");
  assertTruthy(mockPlan, "T1: mock source plan must exist in sourcePlans");
  assertFalsy(mockPlan.enabled, "T1: mock must NOT be enabled when enabledSources is empty {}");
  assertEqual(mockPlan.status, "skipped", "T1: mock status must be skipped");
  console.log("PASS T1: buildSearchPlan({}) → mock disabled");
}

// ─── Test 2: buildSearchPlan with no argument (default = {}) → mock NOT enabled ─
{
  const plan = buildSearchPlan(adultProfile);
  const mockPlan = plan.sourcePlans.find((p) => p.source === "mock");
  assertFalsy(mockPlan?.enabled, "T2: mock must NOT be enabled with default empty enabledSources");
  console.log("PASS T2: buildSearchPlan(profile) default → mock disabled");
}

// ─── Test 3: buildSearchPlan with { mock: false } → mock NOT enabled ─────────
{
  const plan = buildSearchPlan(adultProfile, { mock: false });
  const mockPlan = plan.sourcePlans.find((p) => p.source === "mock");
  assertFalsy(mockPlan?.enabled, "T3: mock must NOT be enabled when explicitly false");
  console.log("PASS T3: buildSearchPlan({ mock: false }) → mock disabled");
}

// ─── Test 4: buildSearchPlan with { mock: true } → mock IS enabled ────────────
{
  const plan = buildSearchPlan(adultProfile, { mock: true });
  const mockPlan = plan.sourcePlans.find((p) => p.source === "mock");
  assertTruthy(mockPlan?.enabled, "T4: mock must be enabled when explicitly true (developer opt-in)");
  console.log("PASS T4: buildSearchPlan({ mock: true }) → mock enabled (dev opt-in)");
}

// ─── Test 5: { googleBooks: true } plan does not enable mock ────────────────
{
  const plan = buildSearchPlan(adultProfile, { googleBooks: true });
  const mockPlan = plan.sourcePlans.find((p) => p.source === "mock");
  const gbPlan = plan.sourcePlans.find((p) => p.source === "googleBooks");
  assertFalsy(mockPlan?.enabled, "T5: mock must NOT be enabled when only googleBooks is true");
  assertTruthy(gbPlan?.enabled, "T5: googleBooks must still be enabled");
  console.log("PASS T5: { googleBooks: true } → mock disabled, googleBooks enabled");
}

// ─── Test 6: { openLibrary: true } plan does not enable mock ────────────────
{
  const plan = buildSearchPlan(adultProfile, { openLibrary: true });
  const mockPlan = plan.sourcePlans.find((p) => p.source === "mock");
  const olPlan = plan.sourcePlans.find((p) => p.source === "openLibrary");
  assertFalsy(mockPlan?.enabled, "T6: mock must NOT be enabled when only openLibrary is true");
  assertTruthy(olPlan?.enabled, "T6: openLibrary must still be enabled");
  console.log("PASS T6: { openLibrary: true } → mock disabled, openLibrary enabled");
}

// ─── Test 7: { openLibrary: false, googleBooks: false } → mock still disabled ─
{
  const plan = buildSearchPlan(adultProfile, { openLibrary: false, googleBooks: false });
  const mockPlan = plan.sourcePlans.find((p) => p.source === "mock");
  assertFalsy(mockPlan?.enabled, "T7: mock must NOT be enabled even when all real sources are disabled (no ambient fallback)");
  console.log("PASS T7: all real sources off → mock still disabled (no ambient fallback)");
}

// ─── Test 8: mock source adapter returns empty when plan is disabled ────────
{
  const { mockSourceAdapter } = require(resolve(dir, "sources/mockSource.ts"));
  const disabledPlan = {
    source: "mock",
    enabled: false,
    status: "skipped",
    intents: [],
    skippedReason: "source_disabled",
    timeoutMs: 5000,
  };
  const result = await mockSourceAdapter.search(disabledPlan, { profile: adultProfile });
  assertEqual(result.status, "skipped", "T8: mock adapter must return skipped status when plan.enabled=false");
  assertEqual(result.rawItems.length, 0, "T8: mock adapter must return 0 raw items when disabled");
  console.log("PASS T8: mock adapter returns skipped/empty when plan.enabled=false");
}

// ─── Test 9: mock source adapter returns The Lantern Archive when enabled ────
{
  const { mockSourceAdapter } = require(resolve(dir, "sources/mockSource.ts"));
  const enabledPlan = {
    source: "mock",
    enabled: true,
    status: "planned",
    intents: [{ id: "t", query: "mystery novel", facets: [], priority: 1, rationale: [] }],
    skippedReason: undefined,
    timeoutMs: 5000,
  };
  const result = await mockSourceAdapter.search(enabledPlan, { profile: adultProfile });
  assertEqual(result.status, "succeeded", "T9: mock adapter succeeds when enabled");
  assertIncludes(result.rawItems.map((r) => r.title), "Lantern Archive", "T9: The Lantern Archive must appear when mock is enabled");
  assertIncludes(result.rawItems.map((r) => r.title), "Signal in the Stacks", "T9: Signal in the Stacks must appear when mock is enabled");
  console.log("PASS T9: mock adapter returns fake titles only when explicitly enabled");
}

// ─── Test 10: Verify The Lantern Archive / Signal in the Stacks not in normal
//             searchPlan source list ─────────────────────────────────────────
{
  const plan = buildSearchPlan(adultProfile, { googleBooks: true, openLibrary: true });
  const activeSources = plan.sourcePlans.filter((p) => p.enabled).map((p) => p.source);
  assertNotIncludes(activeSources, "mock", "T10: mock must not be in the active sources for a normal run");
  console.log("PASS T10: normal source plan contains no mock source");
}

console.log("\nAll mock-source regression tests passed.");
