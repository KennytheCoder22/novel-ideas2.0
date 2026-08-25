import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  readOrCreatePatronId,
  redactedPatronId,
  resetPatronIdentity,
} from "../lib/patronIdentity.mjs";

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
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  module._compile(output, filename);
};

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const artifactArgument = process.argv.find((value) => value.startsWith("--artifact="))?.slice("--artifact=".length);

const profileDefinitions = [
  {
    name: "fantasy",
    signals: [
      { id: "f1", title: "Fantasy One", action: "like", genres: ["fantasy"], tones: ["epic"], themes: ["magic"], format: "book", weight: 1 },
      { id: "f2", title: "Fantasy Two", action: "like", genres: ["fantasy", "adventure"], tones: ["epic"], themes: ["magic"], format: "book", weight: 1 },
      { id: "f3", title: "Fantasy Three", action: "like", genres: ["fantasy"], tones: ["atmospheric"], themes: ["quest"], format: "book", weight: 1 },
      { id: "f4", title: "Realistic One", action: "dislike", genres: ["realistic fiction", "romance"], format: "book", weight: 1 },
    ],
  },
  {
    name: "realistic-romance",
    signals: [
      { id: "r1", title: "Realistic One", action: "like", genres: ["realistic fiction"], tones: ["warm"], themes: ["relationships"], format: "book", weight: 1 },
      { id: "r2", title: "Romance One", action: "like", genres: ["romance"], tones: ["warm"], themes: ["love"], format: "book", weight: 1 },
      { id: "r3", title: "Realistic Two", action: "like", genres: ["realistic fiction", "romance"], tones: ["hopeful"], themes: ["identity"], format: "book", weight: 1 },
      { id: "r4", title: "Horror One", action: "dislike", genres: ["horror"], tones: ["dark"], format: "book", weight: 1 },
    ],
  },
  {
    name: "horror-mystery",
    signals: [
      { id: "h1", title: "Horror One", action: "like", genres: ["horror"], tones: ["suspense"], themes: ["supernatural"], format: "book", weight: 1 },
      { id: "h2", title: "Mystery One", action: "like", genres: ["mystery"], tones: ["suspense"], themes: ["secrets"], format: "book", weight: 1 },
      { id: "h3", title: "Horror Two", action: "like", genres: ["horror", "mystery"], tones: ["atmospheric"], themes: ["supernatural"], format: "book", weight: 1 },
      { id: "h4", title: "Romance One", action: "dislike", genres: ["romance"], tones: ["warm"], format: "book", weight: 1 },
    ],
  },
];

function fixtureArtifact() {
  const fixtureWord = (index) => {
    const first = String.fromCharCode(97 + Math.floor(index / 26));
    const second = String.fromCharCode(97 + (index % 26));
    return `${first}${second}`;
  };
  const shelves = [
    ["Fantasy", "Fantasy"],
    ["Realistic Fiction", "Realistic"],
    ["Romance", "Romance"],
    ["Horror", "Horror"],
    ["Adventure, Mystery, & Suspense", "Mystery"],
    ["", "General"],
  ];
  const records = shelves.flatMap(([shelf, prefix], shelfIndex) => Array.from({ length: 70 }, (_, index) => ({
    localId: `fixture-${shelfIndex}-${index}`,
    title: `${prefix} Story ${fixtureWord(index)}`,
    author: `Author ${shelfIndex}-${index}`,
    publicationYear: 2000 + (index % 24),
    audience: "Young Adult",
    shelvingLocation: shelf || undefined,
    callNumber: `FIC ${prefix.slice(0, 3).toUpperCase()} ${index}`,
    copies: 1,
  })));
  return {
    schemaVersion: "local_collection_recommendation_v1",
    createdAt: new Date(0).toISOString(),
    metadata: { schemaVersion: "local_collection_import_v1", libraryId: "y" },
    deterministicContentHash: "hosted-personalization-fixture",
    summary: { totalRows: records.length, acceptedTitles: records.length },
    records,
  };
}

function loadArtifact() {
  if (!artifactArgument) return fixtureArtifact();
  const parsed = JSON.parse(readFileSync(resolve(artifactArgument), "utf8"));
  return parsed.artifact || parsed;
}

const artifact = loadArtifact();
const homeSource = readFileSync(resolve(repoRoot, "app", "(tabs)", "index.tsx"), "utf8");
const swipeScreenSource = readFileSync(resolve(repoRoot, "screens", "SwipeDeckScreen.tsx"), "utf8");
const engineSource = readFileSync(resolve(repoRoot, "app", "recommender-v2", "engine.ts"), "utf8");
const localSource = readFileSync(resolve(repoRoot, "app", "recommender-v2", "sources", "localLibrarySource.ts"), "utf8");
const scoreSource = readFileSync(resolve(repoRoot, "app", "recommender-v2", "score.ts"), "utf8");
if (!homeSource.includes("readOrCreatePatronId") || !homeSource.includes("resetPatronIdentity")) {
  throw new Error("HomeScreen does not initialize and reset device-local patron identity");
}
if (!homeSource.includes("Reset User") || !homeSource.includes("patronId={patronId}") || !homeSource.includes("libraryId={props.libraryId}")) {
  throw new Error("Reset User menu or SwipeDeckScreen identity wiring is missing");
}
if (!swipeScreenSource.includes("pipelineUserIdForPatron(activePatronId, deckKey, props.libraryId)") || swipeScreenSource.includes("`novelideas:${deckKey}`")) {
  throw new Error("pipeline identity is not isolated by patron and hosted library");
}
if (!swipeScreenSource.includes("diversitySeed: `${redactedPatronId(recommendationPatronId)}:${String(props.libraryId || getRuntimeLibraryId()")) {
  throw new Error("normal recommendation runs do not provide an anonymous patron diversity seed");
}
if (!engineSource.includes("diversitySeed: session.diversitySeed")) {
  throw new Error("recommender engine does not pass the diversity seed to source adapters");
}
if (!localSource.includes("localCollectionTieBreakOrder: context.diversitySeed")
  || !localSource.includes("stableRecordOrder(record, context.diversitySeed)")) {
  throw new Error("Local Collection source does not preserve seeded equal-score order");
}
if (!scoreSource.includes('a.source === "localLibrary" && b.source === "localLibrary"')) {
  throw new Error("scoring does not preserve the Local Collection equal-score order");
}
const Module = require("module");
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request.endsWith("storage") || request.includes("localCollection/storage")) {
    return { loadLocalCollectionRecommendationArtifact: async () => artifact };
  }
  if (request.endsWith("runtimeConfig") || request.includes("runtimeConfig")) {
    return { getRuntimeLibraryId: () => "y" };
  }
  return originalLoad.apply(this, arguments);
};

const { localLibrarySourceAdapter } = require(resolve(repoRoot, "app", "recommender-v2", "sources", "localLibrarySource.ts"));
const { buildSearchPlan } = require(resolve(repoRoot, "app", "recommender-v2", "searchPlan.ts"));
const { buildTasteProfile } = require(resolve(repoRoot, "app", "recommender-v2", "tasteProfile.ts"));
const { normalizeSourceResults } = require(resolve(repoRoot, "app", "recommender-v2", "normalize.ts"));
const { scoreCandidates } = require(resolve(repoRoot, "app", "recommender-v2", "score.ts"));
const { selectRecommendations } = require(resolve(repoRoot, "app", "recommender-v2", "select.ts"));
Module._load = originalLoad;

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function overlapPercent(left, right) {
  const rightSet = new Set(right);
  const denominator = Math.min(left.length, right.length);
  if (!denominator) return 0;
  return Math.round((left.filter((value) => rightSet.has(value)).length / denominator) * 1000) / 10;
}

const patrons = profileDefinitions.map((_, index) => {
  const storage = memoryStorage();
  if (index === 0) {
    storage.setItem("lib_config_y", JSON.stringify({ library: { id: "y", name: "YVHS Library" } }));
    storage.setItem("novelideas_saved_patron_libraries_v1", JSON.stringify([{ libraryId: "y" }]));
  }
  return { storage, id: readOrCreatePatronId(storage) };
});
if (new Set(patrons.map((row) => row.id)).size !== patrons.length) {
  throw new Error("independent devices received duplicate patron identities");
}
const resetBefore = patrons[0].id;
const resetAfter = resetPatronIdentity(patrons[0].storage).nextId;
if (resetBefore === resetAfter) throw new Error("Reset User did not create a new patron identity");
if (readOrCreatePatronId(patrons[0].storage) !== resetAfter) throw new Error("new patron identity was not persisted on the device");
if (!patrons[0].storage.getItem("lib_config_y") || !patrons[0].storage.getItem("novelideas_saved_patron_libraries_v1")) {
  throw new Error("Reset User removed hosted library configuration or saved libraries");
}
patrons[0].id = resetAfter;

const runs = [];
for (let index = 0; index < profileDefinitions.length; index += 1) {
  const definition = profileDefinitions[index];
  const profile = buildTasteProfile({
    requestId: `hosted-personalization-${definition.name}`,
    ageBand: "teens",
    enabledSources: { localLibrary: true },
    signals: definition.signals,
    localLibraryCurationTrusted: true,
  });
  const plan = buildSearchPlan(profile, { localLibrary: true });
  const localPlan = plan.sourcePlans.find((row) => row.source === "localLibrary");
  const sourceResult = await localLibrarySourceAdapter.search(localPlan, {
    profile,
    diversitySeed: redactedPatronId(patrons[index].id),
  });
  const normalized = normalizeSourceResults([sourceResult]);
  const scored = scoreCandidates(normalized, profile);
  const selection = selectRecommendations(scored, profile, 10);
  runs.push({
    user: redactedPatronId(patrons[index].id),
    profile: definition.name,
    signals: definition.signals.map((signal) => `${signal.action}:${signal.title}`),
    tasteVector: {
      genreFamily: profile.genreFamily,
      tone: profile.tone,
      themes: profile.themes,
      avoidSignals: profile.avoidSignals,
    },
    queries: localPlan.intents.map((intent) => intent.query),
    rawIds: sourceResult.rawItems.map((item) => item.sourceId || item.id),
    rankedIds: scored.slice(0, 20).map((item) => item.sourceId || item.id),
    finalIds: selection.selected.map((item) => item.sourceId || item.id),
    topRanked: scored.slice(0, 10).map((item) => ({
      title: item.title,
      score: Math.round(item.score * 1000) / 1000,
      components: item.scoreBreakdown,
    })),
    finalTitles: selection.selected.map((item) => item.title),
  });
}

const pairs = [];
for (let left = 0; left < runs.length; left += 1) {
  for (let right = left + 1; right < runs.length; right += 1) {
    pairs.push({
      users: `${runs[left].profile} vs ${runs[right].profile}`,
      rawPoolOverlapPercent: overlapPercent(runs[left].rawIds, runs[right].rawIds),
      topRankedOverlapPercent: overlapPercent(runs[left].rankedIds, runs[right].rankedIds),
      finalSlateOverlapPercent: overlapPercent(runs[left].finalIds, runs[right].finalIds),
    });
  }
}

if (pairs.some((pair) => pair.finalSlateOverlapPercent > 50)) {
  throw new Error(`materially different profiles converged: ${JSON.stringify(pairs)}`);
}

const tiedProfile = buildTasteProfile({
  requestId: "hosted-personalization-tied-profile",
  ageBand: "teens",
  enabledSources: { localLibrary: true },
  signals: profileDefinitions[0].signals,
  localLibraryCurationTrusted: true,
});
const tiedPlan = buildSearchPlan(tiedProfile, { localLibrary: true }).sourcePlans
  .find((row) => row.source === "localLibrary");

async function tiedSlate(diversitySeed) {
  const sourceResult = await localLibrarySourceAdapter.search(tiedPlan, { profile: tiedProfile, diversitySeed });
  if (sourceResult.diagnostics.localCollectionDiversitySeedApplied !== true) {
    throw new Error("local collection did not report seeded tie-breaking");
  }
  const normalized = normalizeSourceResults([sourceResult]);
  return selectRecommendations(scoreCandidates(normalized, tiedProfile), tiedProfile, 10)
    .selected
    .map((item) => item.sourceId || item.id);
}

const tiedSeeds = Array.from({ length: 18 }, (_, index) => `class-patron-${index + 1}`);
const tiedSlates = await Promise.all(tiedSeeds.map(tiedSlate));
const tiedSlatesRepeated = await Promise.all(tiedSeeds.map(tiedSlate));
if (tiedSlates.some((slate, index) => JSON.stringify(slate) !== JSON.stringify(tiedSlatesRepeated[index]))) {
  throw new Error("seeded tie-breaking was not deterministic for the same patron");
}
const tiedSlateKeys = tiedSlates.map((slate) => [...slate].sort().join("|"));
if (new Set(tiedSlateKeys).size !== tiedSlates.length) {
  throw new Error(`equal-score class patrons received duplicate final slates: ${JSON.stringify({
    uniqueSlates: new Set(tiedSlateKeys).size,
    patrons: tiedSlates.length,
    lengths: tiedSlates.map((slate) => slate.length),
  })}`);
}
const tiedPairOverlaps = [];
for (let left = 0; left < tiedSlates.length; left += 1) {
  for (let right = left + 1; right < tiedSlates.length; right += 1) {
    tiedPairOverlaps.push(overlapPercent(tiedSlates[left], tiedSlates[right]));
  }
}
const tiedMeanOverlap = tiedPairOverlaps.reduce((sum, value) => sum + value, 0) / tiedPairOverlaps.length;
if (tiedMeanOverlap >= 35 || tiedPairOverlaps.some((value) => value >= 100)) {
  throw new Error(`equal-score patron diversity remained too concentrated: mean=${tiedMeanOverlap}; max=${Math.max(...tiedPairOverlaps)}`);
}

console.log(JSON.stringify({
  pass: true,
  artifact: {
    source: artifactArgument ? "production-snapshot" : "fixture",
    recordCount: artifact.records.length,
    hash: artifact.deterministicContentHash,
  },
  identity: {
    distinctPatrons: new Set(patrons.map((row) => row.id)).size,
    resetChangedIdentity: resetBefore !== resetAfter,
    pipelineIdentityIncludesPatronAndLibrary: true,
    resetPreservesLibraryConfiguration: true,
    redactedIds: patrons.map((row) => redactedPatronId(row.id)),
  },
  runs: runs.map(({ rawIds, rankedIds, finalIds, ...run }) => ({
    ...run,
    rawCandidateCount: rawIds.length,
    rankedComparisonCount: rankedIds.length,
    finalCount: finalIds.length,
  })),
  overlap: pairs,
  equalScoreTieDiversity: {
    patrons: tiedSlates.length,
    uniqueSlates: new Set(tiedSlateKeys).size,
    meanOverlapPercent: Math.round(tiedMeanOverlap * 10) / 10,
    maxOverlapPercent: Math.max(...tiedPairOverlaps),
    deterministicRepeat: true,
  },
}, null, 2));
