import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const PRESETS = [
  { deck: "Teen A", ageBand: "teens", signals: [
    { action: "like", title: "Percy Jackson", genres: ["fantasy", "adventure"], themes: ["mythology", "school"], format: "book" },
    { action: "like", title: "Scythe", genres: ["science fiction", "dystopian"], themes: ["action", "ethical conflict"], format: "book" },
    { action: "like", title: "Spy School", genres: ["comedy", "action"], themes: ["school", "mission"], format: "book" },
  ] },
  { deck: "Teen B", ageBand: "teens", signals: [
    { action: "like", title: "Fangirl", genres: ["contemporary", "romance"], themes: ["coming of age"], format: "book" },
    { action: "like", title: "The Summer I Turned Pretty", genres: ["romance", "contemporary"], themes: ["family", "relationships"], format: "book" },
    { action: "like", title: "Percy Jackson", genres: ["fantasy", "adventure"], themes: ["mythology"], format: "book" },
  ] },
  { deck: "Teen C", ageBand: "teens", signals: [
    { action: "like", title: "Five Nights at Freddy's", genres: ["horror", "mystery"], themes: ["survival", "psychological"], format: "book" },
    { action: "like", title: "The Inheritance Games", genres: ["mystery", "thriller"], themes: ["puzzles"], format: "book" },
    { action: "like", title: "A Deadly Education", genres: ["fantasy", "horror"], themes: ["school", "survival"], format: "book" },
  ] },
  { deck: "Adult A", ageBand: "adult", signals: [
    { action: "like", title: "Gone Girl", genres: ["psychological thriller", "mystery"], themes: ["crime", "suspense"], format: "book" },
    { action: "like", title: "The Girl with the Dragon Tattoo", genres: ["crime", "thriller"], themes: ["investigation"], format: "book" },
    { action: "like", title: "The Secret History", genres: ["literary fiction", "crime drama"], themes: ["dark academia"], format: "book" },
  ] },
  { deck: "Adult B", ageBand: "adult", signals: [
    { action: "like", title: "All Systems Red", genres: ["science fiction", "adventure"], themes: ["space", "humor"], format: "book" },
    { action: "like", title: "Legends & Lattes", genres: ["cozy fantasy", "fantasy"], themes: ["comfort", "found family"], format: "book" },
    { action: "like", title: "The Long Way to a Small Angry Planet", genres: ["science fiction"], themes: ["found family", "adventure"], format: "book" },
  ] },
  { deck: "Adult C", ageBand: "adult", signals: [
    { action: "like", title: "11/22/63", genres: ["historical fiction", "science fiction"], themes: ["drama", "alternate history"], format: "book" },
    { action: "like", title: "The Plot Against America", genres: ["historical fiction"], themes: ["political", "drama"], format: "book" },
    { action: "like", title: "Dark Matter", genres: ["science fiction", "thriller"], themes: ["suspense"], format: "book" },
  ] },
  { deck: "MG A placeholder", ageBand: "preteens", signals: [], placeholder: true },
  { deck: "K-2 A placeholder", ageBand: "kids", signals: [], placeholder: true },
];

const HARD_ARTIFACT_TITLE = /\b(crime and punishment notes|the poet and the murderer|mystery in the mainstream|study notes?|notes on|study aids?|study guides?|companions? to|criticism|critical essays?|literary history|bibliograph(?:y|ies)|true crime nonfiction)\b/i;
const OUT_DIR = ".tmp/v2-openlibrary-presets";
const TS_FILES = [
  "app/recommender-v2/engine.ts",
  "app/recommender-v2/diagnostics.ts",
  "app/recommender-v2/normalize.ts",
  "app/recommender-v2/searchPlan.ts",
  "app/recommender-v2/score.ts",
  "app/recommender-v2/select.ts",
  "app/recommender-v2/tasteProfile.ts",
  "app/recommender-v2/types.ts",
  "app/recommender-v2/sources/index.ts",
  "app/recommender-v2/sources/openLibrarySource.ts",
  "app/recommender-v2/sources/openLibraryProfiles.ts",
  "app/recommender-v2/sources/mockSource.ts",
];

function stageCount(result, stage, key) {
  const row = result.diagnostics.stages.find((item) => item.stage === stage);
  return Number(row?.counts?.[key] || 0);
}

function topReasons(rejectedReasons) {
  return Object.entries(rejectedReasons || {})
    .filter(([reason]) => !reason.startsWith("adult_query_family_"))
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, 5)
    .map(([reason, count]) => `${reason}:${count}`);
}

function summarizeFetches(source) {
  const fetches = (source?.fetches || []).filter((fetch) => !fetch.diagnosticOnly);
  return fetches.length ? `${fetches.filter((fetch) => fetch.timedOut).length}/${fetches.length} timeouts` : "0/0 timeouts";
}

function allMainFetchesTimedOut(source) {
  const fetches = (source?.fetches || []).filter((fetch) => !fetch.diagnosticOnly);
  return fetches.length > 0 && fetches.every((fetch) => fetch.timedOut);
}

function familyDiagnostics(rejectedReasons) {
  return Object.keys(rejectedReasons || {})
    .filter((reason) => /^adult_query_family_(scored|selected|acceptance_pct)_/.test(reason))
    .sort()
    .map((reason) => `${reason}:${rejectedReasons[reason]}`);
}

function passFail(preset, result, source) {
  const count = result.items.length;
  const titles = result.items.map((item) => item.title).join(" | ");
  const expectedProfile = preset.ageBand === "teens" ? "teen" : preset.ageBand === "adult" ? "adult" : preset.ageBand === "preteens" ? "middleGrades" : "k2";
  const wrongProfile = source?.openLibraryAgeProfile !== expectedProfile;
  const cleanCount = count >= 3 && count <= 5;
  const zeroAllowed = count === 0 && allMainFetchesTimedOut(source);
  return !HARD_ARTIFACT_TITLE.test(titles) && !wrongProfile && (cleanCount || zeroAllowed) ? "PASS" : "FAIL";
}

function printSummary(preset, result) {
  const source = result.diagnostics.sources.find((row) => row.source === "openLibrary");
  const routing = source?.openLibraryQueryRouting || {};
  const rejectedReasons = result.diagnostics.rejectedReasons || {};
  console.log(JSON.stringify({
    deck: preset.deck,
    pass: passFail(preset, result, source),
    ageProfile: source?.openLibraryAgeProfile || "missing",
    routingReason: String(routing.reason || "missing"),
    queries: source?.queries || [],
    sourceStatus: source?.status || "missing",
    raw: source?.rawCount || 0,
    normalized: stageCount(result, "normalized", "normalized"),
    scored: stageCount(result, "scored", "scored"),
    selected: result.items.length,
    finalTitles: result.items.map((item) => item.title),
    artifactSuppressedTitles: source?.artifactSuppressedTitles || [],
    topRejectionReasons: topReasons(rejectedReasons),
    timeoutSummary: summarizeFetches(source),
    adultFamilyDiagnostics: familyDiagnostics(rejectedReasons),
  }));
}

function selectedPresets() {
  if (process.argv.includes("--adult-only")) return PRESETS.filter((preset) => preset.ageBand === "adult");
  if (process.argv.includes("--teen-only")) return PRESETS.filter((preset) => preset.ageBand === "teens");
  return PRESETS;
}

function printOfflineManifest() {
  for (const preset of selectedPresets()) {
    console.log(JSON.stringify({ deck: preset.deck, ageBand: preset.ageBand, status: preset.placeholder ? "placeholder" : "manual_live_run_available" }));
  }
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

async function main() {
  if (process.argv.includes("--offline")) {
    printOfflineManifest();
    return;
  }
  compileHarnessDependencies();
  const { runRecommenderV2 } = await import(pathToFileURL(`${process.cwd()}/${OUT_DIR}/engine.js`).href);
  for (const preset of selectedPresets()) {
    if (preset.placeholder) {
      console.log(JSON.stringify({ deck: preset.deck, ageProfile: preset.ageBand, pass: "PLACEHOLDER", note: "profile preset reserved for later MG/K-2 work" }));
      continue;
    }
    try {
      const result = await runRecommenderV2({
        requestId: `v2-openlibrary-preset-${preset.deck.replace(/\s+/g, "-").toLowerCase()}`,
        ageBand: preset.ageBand,
        limit: 5,
        enabledSources: { mock: false, openLibrary: true },
        signals: preset.signals,
      });
      printSummary(preset, result);
    } catch (error) {
      console.log(JSON.stringify({ deck: preset.deck, pass: "FAIL", error: error instanceof Error ? error.message : String(error) }));
      process.exitCode = 1;
    }
  }
}

await main();
