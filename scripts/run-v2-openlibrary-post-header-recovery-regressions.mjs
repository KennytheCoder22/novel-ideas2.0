import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const OUT_DIR = ".tmp/v2-openlibrary-post-header-recovery";
const TS_FILES = [
  "app/recommender-v2/tasteProfile.ts",
  "app/recommender-v2/diagnostics.ts",
  "app/recommender-v2/types.ts",
  "app/recommender-v2/engine.ts",
  "app/recommender-v2/select.ts",
  "app/recommender-v2/score.ts",
  "app/recommender-v2/normalize.ts",
  "app/recommender-v2/sources/index.ts",
  "app/recommender-v2/sources/mockSource.ts",
  "app/recommender-v2/sources/openLibrarySource.ts",
  "app/recommender-v2/sources/openLibraryProfiles.ts",
];

function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function assertDeepEqual(actual, expected, message) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
}

function compileHarnessDependencies() {
  execFileSync("node", [
    "node_modules/typescript/bin/tsc",
    "--target", "es2020",
    "--module", "commonjs",
    "--moduleResolution", "node",
    "--skipLibCheck",
    "--esModuleInterop",
    "--outDir", OUT_DIR,
    ...TS_FILES,
  ], { stdio: "pipe" });
}
  const titles = [
    "Clockwork Academy",
    "The Dragon Map",
    "Moonlit Library",
    "Stormbound Quest",
    "Ashwood Magic",
    "The Glass Familiar",
    "Ember School",
    "The Starlight Key",
  ];

function recoveryDocs() {
  return Array.from({ length: 8 }, (_, offset) => {
    const index = offset + 1;
    return {
      key: `/works/ol-f1b-${index}`,
      title: titles[offset],
      author_name: [`Recovery Author ${index}`],
      subject: ["Young adult fiction", "Teen fiction", "Fantasy fiction", "Adventure stories", "School stories"],
      first_publish_year: 2010 + index,
      description: "A teen hero begins a fantasy adventure with friends at school.",
    };
  });
}

function successResponse() {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: async () => JSON.stringify({ docs: recoveryDocs() }),
  };
}

function bodyTimeoutResponse(signal) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: () => new Promise((_, reject) => {
      const rejectAbort = () => reject(new DOMException("The response body was aborted.", "AbortError"));
      if (signal?.aborted) rejectAbort();
      else signal?.addEventListener("abort", rejectAbort, { once: true });
    }),
  };
}

function teenProfile(buildTasteProfile) {
  return buildTasteProfile({
    ageBand: "teens",
    limit: 5,
    signals: [
      { action: "like", title: "Teen Fantasy Quest", genres: ["fantasy"], themes: ["adventure", "school", "friendship"], format: "book" },
    ],
    diagnostics: {
      forceTeenPostFinalEligibilityRecovery: true,
      forceTeenPostFinalEligibilityRecoveryQueries: ["young adult fantasy series"],
      forceTeenPostFinalEligibilityRecoveryQueryOffset: 0,
      disableTeenSourceUnderfillRecovery: true,
    },
  });
}

const sourcePlan = {
  source: "openLibrary",
  enabled: true,
  status: "planned",
  timeoutMs: 6_000,
  intents: [{ id: "ol-f1b", query: "young adult fantasy series", facets: [], priority: 1, rationale: ["OL-F1B regression"] }],
};

async function main() {
  compileHarnessDependencies();
  const { buildTasteProfile } = await import(pathToFileURL(`${process.cwd()}/${OUT_DIR}/tasteProfile.js`).href);
  const { runRecommenderV2 } = await import(pathToFileURL(`${process.cwd()}/${OUT_DIR}/engine.js`).href);
  const { openLibrarySourceAdapter } = await import(pathToFileURL(`${process.cwd()}/${OUT_DIR}/sources/openLibrarySource.js`).href);
  const originalFetch = globalThis.fetch;

  try {
    let fetchCalls = 0;
    globalThis.fetch = async (_url, init = {}) => {
      fetchCalls += 1;
      return fetchCalls === 1 ? bodyTimeoutResponse(init.signal) : successResponse();
    };
    const recovered = await openLibrarySourceAdapter.search(sourcePlan, { profile: teenProfile(buildTasteProfile) });
    const recoveredFetches = (recovered.diagnostics.fetches || []).filter((fetch) => !fetch.diagnosticOnly);
    assertEqual(fetchCalls, 2, "post-header body timeout should make exactly one retry");
    assertEqual(recoveredFetches[0]?.postHeaderBodyTimeout, true, "first fetch should classify post-header body timeout");
    assertEqual(recoveredFetches[0]?.postHeaderBodyTimeoutRetry, true, "first fetch should record retry decision");
    assertEqual(recoveredFetches[1]?.postHeaderBodyTimeoutRetrySucceeded, true, "second fetch should record successful recovery");
    assertEqual(recoveredFetches[1]?.attemptNumber, 2, "recovery should be attempt two");
    assertDeepEqual(recovered.rawItems.map((item) => item.title), recoveryDocs().slice(0, recovered.rawItems.length).map((doc) => doc.title), "successful retry should return the expected ordered pool");
    console.log(JSON.stringify({ name: "Teen post-header body timeout retries once and restores expected pool", pass: true, fetchCalls, returned: recovered.rawItems.length }));

    fetchCalls = 0;
    globalThis.fetch = async () => {
      fetchCalls += 1;
      return successResponse();
    };
    const ordinary = await openLibrarySourceAdapter.search(sourcePlan, { profile: teenProfile(buildTasteProfile) });
    const ordinaryFetches = (ordinary.diagnostics.fetches || []).filter((fetch) => !fetch.diagnosticOnly);
    assertEqual(fetchCalls, 1, "ordinary success must not trigger a duplicate request");
    assertEqual(ordinaryFetches.some((fetch) => fetch.postHeaderBodyTimeoutRetry), false, "ordinary success must not enter recovery");
    assertDeepEqual(ordinary.rawItems.map((item) => item.title), recovered.rawItems.map((item) => item.title), "no-timeout source output should remain byte-for-byte identical to recovered expected pool");
    console.log(JSON.stringify({ name: "Ordinary success makes no retry and preserves source output", pass: true, fetchCalls }));

    fetchCalls = 0;
    globalThis.fetch = async (_url, init = {}) => {
      fetchCalls += 1;
      return bodyTimeoutResponse(init.signal);
    };
    const failedStartedMs = Date.now();
    const failed = await openLibrarySourceAdapter.search(sourcePlan, { profile: teenProfile(buildTasteProfile) });
    const failedElapsedMs = Date.now() - failedStartedMs;
    const failedFetches = (failed.diagnostics.fetches || []).filter((fetch) => !fetch.diagnosticOnly);
    assertEqual(failedFetches.filter((fetch) => fetch.attemptNumber === 2).length, 1, "both-fail path must cap post-header recovery at one retry");
    assertEqual(failedFetches.filter((fetch) => fetch.postHeaderBodyTimeoutRetrySucceeded).length, 0, "both-fail path must not report false recovery");
    assertEqual(failedElapsedMs < 7_000, true, "both-fail path must remain within the six-second source budget");
    assertEqual(failed.rawItems.length, 0, "both-fail path must not fabricate candidates");
    console.log(JSON.stringify({ name: "Both attempts failing remains bounded with no runaway retry", pass: true, fetchCalls, failedElapsedMs }));

    const recommendationRequestUrls = [];
    globalThis.fetch = async (url) => {
      recommendationRequestUrls.push(String(url));
      return successResponse();
    };
    const recommendation = await runRecommenderV2({
      requestId: "ol-f1b-no-timeout-output",
      ageBand: "teens",
      limit: 5,
      enabledSources: { mock: false, openLibrary: true },
      signals: [
        { action: "like", title: "Teen Fantasy Quest", genres: ["fantasy"], themes: ["adventure", "school", "friendship"], format: "book" },
      ],
    });
    const recommendationTitles = recommendation.items.map((item) => item.title);
    const recommendationSource = recommendation.diagnostics.sources.find((source) => source.source === "openLibrary") || {};
    const recommendationFetches = (recommendationSource.fetches || []).filter((fetch) => !fetch.diagnosticOnly);
    assertEqual(new Set(recommendationRequestUrls).size, recommendationRequestUrls.length, "no-timeout recommendation path must not repeat a successful request URL");
    assertEqual(recommendationFetches.some((fetch) => fetch.postHeaderBodyTimeoutRetry), false, "no-timeout recommendation path must not enter post-header recovery");
    assertDeepEqual(recommendationTitles, ["The Dragon Map", "The Glass Familiar", "The Starlight Key", "Ashwood Magic", "Clockwork Academy"], "no-timeout recommendation ordering must remain frozen");
    console.log(JSON.stringify({ name: "No-timeout recommendation output and ordering remain unchanged", pass: true, recommendationTitles }));
  } finally {
    globalThis.fetch = originalFetch;
  }
}

await main();

