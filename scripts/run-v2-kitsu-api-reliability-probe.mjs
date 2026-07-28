/**
 * GAP-K4 live API reliability probe.
 *
 * Makes 20 sequential calls to the Kitsu manga API with a 250ms delay between
 * each call. Measures: success rate, error types, HTTP status distribution,
 * elapsed time, and whether the delay eliminates fetch_error.
 *
 * Does NOT touch production code. Read-only investigation.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const KITSU_BASE = "https://kitsu.app/api/edge";
const DELAY_MS = 250;

const PROBE_QUERIES = [
  "fantasy manga",
  "thriller mystery",
  "drama historical",
  "science fiction",
  "horror paranormal",
  "romance manhwa",
  "adventure action",
  "fantasy dystopian",
  "psychological thriller",
  "slice of life",
  "fantasy mythology",
  "dark fantasy",
  "comedy romance",
  "military history",
  "cozy fantasy",
  "crime mystery",
  "adult manga",
  "literary drama",
  "supernatural horror",
  "epic adventure",
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function probeCall(query, index) {
  const url = `${KITSU_BASE}/manga?filter[text]=${encodeURIComponent(query)}&page[limit]=5`;
  const start = Date.now();
  let status = null;
  let error = null;
  let resultCount = 0;
  let outcome = "unknown";

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/vnd.api+json, application/json" },
      signal: AbortSignal.timeout(5000),
    });
    status = res.status;
    const body = await res.text();
    if (res.ok) {
      const payload = body ? JSON.parse(body) : {};
      resultCount = Array.isArray(payload?.data) ? payload.data.length : 0;
      outcome = resultCount > 0 ? "success" : "success_empty";
    } else {
      outcome = `http_${status}`;
      error = `HTTP ${status}`;
    }
  } catch (err) {
    error = String(err?.message || err);
    outcome = error.includes("abort") || error.includes("timeout") ? "timeout" : "fetch_error";
  }

  const elapsed = Date.now() - start;
  return { index, query, url: url.replace(KITSU_BASE, "[kitsu]"), status, outcome, error, resultCount, elapsedMs: elapsed };
}

async function main() {
  console.log(`\nKitsu API Reliability Probe — ${PROBE_QUERIES.length} calls, ${DELAY_MS}ms delay between each\n`);

  const results = [];
  const outcomeCounts = {};

  for (let i = 0; i < PROBE_QUERIES.length; i++) {
    const query = PROBE_QUERIES[i];
    if (i > 0) await sleep(DELAY_MS);

    const result = await probeCall(query, i + 1);
    results.push(result);
    outcomeCounts[result.outcome] = (outcomeCounts[result.outcome] || 0) + 1;

    const icon = result.outcome.startsWith("success") ? "✓" : "✗";
    console.log(
      `  [${String(i + 1).padStart(2)}] ${icon} ${result.outcome.padEnd(14)} ${String(result.elapsedMs).padStart(5)}ms  results=${result.resultCount}  "${query}"${result.error ? ` → ${result.error}` : ""}`,
    );
  }

  const successCount = (outcomeCounts.success || 0) + (outcomeCounts.success_empty || 0);
  const failCount = PROBE_QUERIES.length - successCount;
  const successRate = Math.round((successCount / PROBE_QUERIES.length) * 100);
  const avgElapsed = Math.round(results.reduce((sum, r) => sum + r.elapsedMs, 0) / results.length);

  console.log("\n─────────────────────────────────────────────────────────────────");
  console.log(`Success rate: ${successCount}/${PROBE_QUERIES.length} (${successRate}%)`);
  console.log(`Failures:     ${failCount}/${PROBE_QUERIES.length}`);
  console.log(`Avg elapsed:  ${avgElapsed}ms`);
  console.log(`Outcomes:`, JSON.stringify(outcomeCounts, null, 2));

  const rateLimit = outcomeCounts.http_429 > 0;
  const fetchErrors = (outcomeCounts.fetch_error || 0) > 0;
  const timeouts = (outcomeCounts.timeout || 0) > 0;

  let rootCause = "unknown";
  if (rateLimit) rootCause = "rate_limiting_http_429";
  else if (successRate >= 90) rootCause = "environment_flake_acceptable";
  else if (timeouts && !fetchErrors) rootCause = "timeout_under_2500ms_budget";
  else if (fetchErrors) rootCause = "network_or_dns_flake";

  const recommendation = successRate >= 90
    ? "Delay sufficient. Baseline failures were environment flake. No retry needed."
    : rateLimit
      ? "Rate-limiting confirmed. Add 200-300ms inter-query delay + backoff on 429."
      : timeouts
        ? "Timeout is the bottleneck. Increase Kitsu timeout to 5000ms."
        : "Intermittent network errors. Document as environment artifact; consider 1 retry.";

  console.log(`\nRoot cause: ${rootCause}`);
  console.log(`Recommendation: ${recommendation}`);

  const artifact = {
    probeAt: new Date().toISOString(),
    delayMs: DELAY_MS,
    totalCalls: PROBE_QUERIES.length,
    successCount,
    failCount,
    successRate: `${successRate}%`,
    avgElapsedMs: avgElapsed,
    outcomeCounts,
    rootCause,
    recommendation,
    results,
  };

  const outDir = resolve(dirname(fileURLToPath(import.meta.url)), "output");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, "kitsu-api-reliability-probe.json");
  writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(`\nArtifact saved: ${outPath}`);
}

main().catch((err) => {
  console.error(err?.stack || err?.message || err);
  process.exitCode = 1;
});
