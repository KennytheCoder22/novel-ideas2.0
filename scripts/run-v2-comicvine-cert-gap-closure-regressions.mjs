/**
 * ComicVine certification gap-closure regressions.
 *
 * Regression-only coverage for:
 * 1) Complete hard-reject identity behavior
 * 2) Complete preferred-survival identity behavior
 * 3) Explicit deferred-policy non-enforcement boundaries
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");

process.env.EXPO_PUBLIC_COMICVINE_PROXY_URL = "undefined";
process.env.COMICVINE_PROXY_URL = "https://proxy.localhost/api/comicvine";

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

function assertTruthy(value, message) {
  if (!value) throw new Error(`${message}: expected truthy, got ${JSON.stringify(value)}`);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function assertDeepEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${message}: expected ${b}, got ${a}`);
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

const dir = resolve(dirname(fileURLToPath(import.meta.url)), "../app/recommender-v2");
const { runRecommenderV2 } = require(resolve(dir, "engine.ts"));
const { classifyComicVineIdentity } = require(resolve(dir, "comicVineIdentity.ts"));
const { normalizeSourceResults } = require(resolve(dir, "normalize.ts"));
const { buildTasteProfile } = require(resolve(dir, "tasteProfile.ts"));
const { scoreCandidates } = require(resolve(dir, "score.ts"));
const { applyComicVineSourceAdmissionPolicy } = require(resolve(dir, "comicVineAdmission.ts"));
const adultDeck = require(resolve(dirname(fileURLToPath(import.meta.url)), "../data/swipeDecks/adult.ts")).default;

function formatFromTagsForV2(tags) {
  const joined = tags.join(" ").toLowerCase();
  if (/\b(manga|anime)\b/.test(joined)) return joined.includes("anime") ? "anime" : "manga";
  if (/\b(comic|superhero)\b/.test(joined)) return "comic";
  if (/graphicnovel|graphic novel/.test(joined)) return "graphicNovel";
  return "book";
}

function buildSignalsFromPreset(sequence) {
  const cards = adultDeck.cards.slice(0, sequence.length);
  return cards.map((card, index) => {
    const tags = Array.isArray(card.tags) ? card.tags.map((tag) => String(tag || "").trim()).filter(Boolean) : [];
    const bareTags = tags.map((tag) => tag.replace(/^[a-zA-Z]+:/, "").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase());
    const genres = [card.genre, ...tags.filter((tag) => /^genre:/i.test(tag)).map((tag) => tag.replace(/^genre:/i, ""))]
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    const tones = tags.filter((tag) => /^(tone|mood):/i.test(tag)).map((tag) => tag.replace(/^(tone|mood):/i, ""));
    const themes = tags.filter((tag) => /^(theme|setting|stakes|graphicNovel):/i.test(tag)).map((tag) => tag.replace(/^(theme|setting|stakes|graphicNovel):/i, ""));
    const characterDynamics = tags.filter((tag) => /^(character|relationship|dynamic):/i.test(tag)).map((tag) => tag.replace(/^(character|relationship|dynamic):/i, ""));
    const action = sequence[index] || "skip";
    return {
      id: `${index + 1}-${String(card.title || "")}`,
      title: String(card.title || "").trim(),
      action: action === "like" ? "like" : action === "dislike" ? "dislike" : "skip",
      source: "mock",
      format: formatFromTagsForV2(tags),
      tags: bareTags,
      genres,
      tones,
      themes,
      characterDynamics,
      weight: action === "skip" ? 0.25 : 1,
    };
  });
}

function makeComicRow(overrides = {}) {
  return {
    id: 9000,
    resource_type: "volume",
    name: "Default Volume",
    deck: "Default deck",
    description: "Default description",
    issue_number: "",
    cover_date: "2019-01-01",
    site_detail_url: "https://comicvine.gamespot.com/default/4000-9000/",
    volume: { id: 900, name: "Default Volume" },
    person_credits: [{ name: "Writer A" }],
    ...overrides,
  };
}

async function runComicVineOnly(requestId, sequence, rows) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input || "");
    if (!url.includes("proxy.localhost/api/comicvine")) {
      return new Response(JSON.stringify({ results: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ results: rows }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    return await runRecommenderV2({
      requestId,
      ageBand: "adult",
      limit: 10,
      enabledSources: {
        mock: false,
        googleBooks: false,
        openLibrary: false,
        kitsu: false,
        comicVine: true,
        localLibrary: false,
        nyt: false,
      },
      signals: buildSignalsFromPreset(sequence),
      deckKey: "adult",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function comicDiag(result) {
  return asObject((result?.diagnostics?.sources || []).find((source) => source.source === "comicVine"));
}

function makeSourceResultFromRows(rows) {
  return [{
    source: "comicVine",
    status: "succeeded",
    rawItems: rows.map((row, index) => ({
      id: `comicVine:gap-${index + 1}`,
      sourceId: `comicVine:gap-${index + 1}`,
      title: String(row.name || ""),
      subtitle: String(asObject(row.volume).name || row.name || ""),
      creators: ["Writer A"],
      description: String(row.description || row.deck || ""),
      formats: ["comic"],
      genres: ["comics"],
      themes: ["adventure"],
      tones: ["dramatic"],
      characterDynamics: [],
      publicationYear: 2019 + (index % 3),
      sourceUrl: String(row.site_detail_url || ""),
      queryText: "comicvine gap closure query",
      queryFamily: "core",
      queryCascadeIndex: 0,
      facets: [],
      routingReason: "comicvine_v2_intent_adapter",
      raw: row,
    })),
    diagnostics: {
      source: "comicVine",
      status: "succeeded",
      planned: true,
      attempted: true,
      timedOut: false,
      rawCount: rows.length,
      queries: ["comicvine gap closure query"],
    },
  }];
}

function assertHardRejectIdentity(diag, identity, title) {
  const hardRejected = Array.isArray(diag.comicVineHardRejectedCandidates) ? diag.comicVineHardRejectedCandidates : [];
  const reachingScorer = Array.isArray(diag.comicVineCandidatesReachingScorerAfterAdmission) ? diag.comicVineCandidatesReachingScorerAfterAdmission : [];
  const matched = hardRejected.find((row) => row.identity === identity && row.title === title);
  assertTruthy(Boolean(matched), `hard-reject retained in diagnostics for ${identity}`);
  assertEqual(String(matched.decision || ""), "hard_reject", `hard-reject decision for ${identity}`);
  assertTruthy(Array.isArray(matched.reasonCodes) && matched.reasonCodes.includes(`hard_reject_identity_${identity}`), `hard-reject specific reason for ${identity}`);
  assertTruthy(Array.isArray(matched.reasonCodes) && matched.reasonCodes.includes("hard_reject_identity"), `hard-reject umbrella reason for ${identity}`);
  assertTruthy(Array.isArray(matched.evidence) && matched.evidence.length > 0, `hard-reject evidence for ${identity}`);
  assertTruthy(String(matched.sourceId || "").length > 0 && String(matched.sourceQuery || "").length > 0, `hard-reject provenance complete for ${identity}`);
  assertTruthy(!reachingScorer.some((row) => row.identity === identity), `hard-reject ${identity} absent from scorer handoff`);
}

function assertPreferredIdentity(diag, identity, title) {
  const reachingScorer = Array.isArray(diag.comicVineCandidatesReachingScorerAfterAdmission) ? diag.comicVineCandidatesReachingScorerAfterAdmission : [];
  const matched = reachingScorer.find((row) => row.identity === identity && row.title === title);
  assertTruthy(Boolean(matched), `preferred identity reaches scorer handoff for ${identity}`);
  assertEqual(String(matched.decision || ""), "preferred_admit", `preferred decision for ${identity}`);
  assertTruthy(String(matched.sourceId || "").length > 0, `preferred provenance sourceId present for ${identity}`);
}

function buildScoreMap(candidates) {
  return Object.fromEntries(candidates.map((candidate) => [String(candidate.sourceId || candidate.id), candidate.score]));
}

async function main() {
  const sequence = ["like", "like", "dislike", "skip", "like", "dislike", "like", "skip"];

  const hardRejectFixtures = [
    { identity: "coloring_book", title: "Marvel Coloring Book", row: makeComicRow({ id: 7201, name: "Marvel Coloring Book", description: "Coloring pages collection.", volume: { id: 17201, name: "Marvel Coloring Book" } }) },
    { identity: "activity_book", title: "Spider-Man Activity Book", row: makeComicRow({ id: 7202, name: "Spider-Man Activity Book", description: "Activities and puzzles.", volume: { id: 17202, name: "Spider-Man Activity Book" } }) },
    { identity: "rpg_supplement", title: "Batman RPG Sourcebook", row: makeComicRow({ id: 7203, name: "Batman RPG Sourcebook", description: "Role-playing sourcebook.", volume: { id: 17203, name: "Batman RPG Sourcebook" } }) },
    { identity: "trading_card_guide", title: "X-Men Trading Card Price Guide", row: makeComicRow({ id: 7204, name: "X-Men Trading Card Price Guide", description: "Trading card values.", volume: { id: 17204, name: "X-Men Trading Card Price Guide" } }) },
    { identity: "toy_guide", title: "Justice League Action Figure Guide", row: makeComicRow({ id: 7205, name: "Justice League Action Figure Guide", description: "Toy guide and catalog.", volume: { id: 17205, name: "Justice League Action Figure Guide" } }) },
  ];

  const hardRejectRun = await runComicVineOnly("comicvine-gap-hard-reject-identities", sequence, hardRejectFixtures.map((fixture) => fixture.row));
  const hardRejectDiag = comicDiag(hardRejectRun);
  assertEqual(String(hardRejectDiag.status || ""), "succeeded", "hard-reject run source status");
  assertEqual(Number(hardRejectRun.items.length || 0), 0, "hard-reject run yields no admitted items");

  for (const fixture of hardRejectFixtures) {
    const classified = classifyComicVineIdentity({
      title: fixture.row.name,
      description: fixture.row.description,
      resourceType: fixture.row.resource_type,
      volumeName: asObject(fixture.row.volume).name,
    });
    assertEqual(classified.identity, fixture.identity, `identity classification for ${fixture.identity}`);
    assertHardRejectIdentity(hardRejectDiag, fixture.identity, fixture.title);
  }
  console.log("PASS G1: complete hard-reject identity coverage");

  const preferredFixtures = [
    { identity: "omnibus", title: "Batman Omnibus Vol. 1", row: makeComicRow({ id: 7301, name: "Batman Omnibus Vol. 1", description: "Omnibus edition.", volume: { id: 17301, name: "Batman Omnibus" } }) },
    { identity: "compendium", title: "Saga Compendium", row: makeComicRow({ id: 7302, name: "Saga Compendium", description: "Compendium release.", volume: { id: 17302, name: "Saga Compendium" } }) },
    { identity: "trade_paperback", title: "Sandman TPB Vol. 2", row: makeComicRow({ id: 7303, name: "Sandman TPB Vol. 2", description: "Trade paperback release.", volume: { id: 17303, name: "Sandman TPB" } }) },
    { identity: "collected_edition", title: "Batman Vol. 1: Court of Owls", row: makeComicRow({ id: 7304, name: "Batman Vol. 1: Court of Owls", description: "Collects issues #1-7.", volume: { id: 17304, name: "Batman" } }) },
    { identity: "deluxe_edition", title: "Watchmen Deluxe Edition", row: makeComicRow({ id: 7305, name: "Watchmen Deluxe Edition", description: "Deluxe hardcover collection.", volume: { id: 17305, name: "Watchmen Deluxe" } }) },
    { identity: "graphic_novel", title: "Maus Graphic Novel", row: makeComicRow({ id: 7306, name: "Maus Graphic Novel", description: "Graphic novel release.", volume: { id: 17306, name: "Maus Graphic Novel" } }) },
  ];

  const preferredRun = await runComicVineOnly("comicvine-gap-preferred-identities", sequence, preferredFixtures.map((fixture) => fixture.row));
  const preferredDiag = comicDiag(preferredRun);
  assertEqual(String(preferredDiag.status || ""), "succeeded", "preferred run source status");

  for (const fixture of preferredFixtures) {
    const classified = classifyComicVineIdentity({
      title: fixture.row.name,
      description: fixture.row.description,
      resourceType: fixture.row.resource_type,
      volumeName: asObject(fixture.row.volume).name,
    });
    assertEqual(classified.identity, fixture.identity, `identity classification for ${fixture.identity}`);
    assertPreferredIdentity(preferredDiag, fixture.identity, fixture.title);
  }

  const preferredSourceResults = makeSourceResultFromRows(preferredFixtures.map((fixture) => fixture.row));
  const preferredNormalized = normalizeSourceResults(preferredSourceResults);
  const preferredProfile = buildTasteProfile({
    requestId: "comicvine-gap-score-parity",
    ageBand: "adult",
    limit: 10,
    signals: buildSignalsFromPreset(sequence),
    enabledSources: { comicVine: true },
    deckKey: "adult",
  });
  const preferredBaselineScores = scoreCandidates(preferredNormalized, preferredProfile);
  const preferredGated = applyComicVineSourceAdmissionPolicy(preferredNormalized, preferredSourceResults);
  const preferredGatedScores = scoreCandidates(preferredGated.candidates, preferredProfile);
  const baselineScoreMap = buildScoreMap(preferredBaselineScores);
  const gatedScoreMap = buildScoreMap(preferredGatedScores);
  const preferredCandidateBySourceId = Object.fromEntries(preferredGated.candidates.map((candidate) => [String(candidate.sourceId || candidate.id), candidate]));
  for (const fixture of preferredFixtures) {
    const sourceId = `comicVine:gap-${preferredFixtures.findIndex((entry) => entry.identity === fixture.identity) + 1}`;
    const candidate = preferredCandidateBySourceId[sourceId];
    assertTruthy(Boolean(candidate), `preferred candidate retained post-admission for ${fixture.identity}`);
    const provenance = asObject(asObject(candidate).diagnostics?.sourceProvenance);
    assertEqual(String(provenance.admissionDecision || ""), "preferred_admit", `source provenance admission decision for ${fixture.identity}`);
    assertTruthy(Array.isArray(provenance.admissionReasons) && provenance.admissionReasons.includes(`preferred_identity_${fixture.identity}`), `source provenance reasons for ${fixture.identity}`);
    assertTruthy(Array.isArray(provenance.admissionEvidence) && provenance.admissionEvidence.length > 0, `source provenance evidence for ${fixture.identity}`);
    assertEqual(gatedScoreMap[sourceId], baselineScoreMap[sourceId], `no taste-side score mutation for ${fixture.identity}`);
  }
  console.log("PASS G2: complete preferred-survival identity coverage + score invariance");

  const deferredRows = [
    makeComicRow({ id: 7401, name: "Franchise Alpha Preview Special", description: "Preview issue for Franchise Alpha.", volume: { id: 17401, name: "Franchise Alpha Preview" } }),
    makeComicRow({ id: 7402, name: "Franchise Alpha Variant Cover Edition", description: "Variant cover release for Franchise Alpha.", volume: { id: 17402, name: "Franchise Alpha Variant" } }),
    makeComicRow({ id: 7403, name: "Franchise Alpha Omnibus", description: "Omnibus collection for Franchise Alpha.", volume: { id: 17403, name: "Franchise Alpha Omnibus" } }),
    makeComicRow({ id: 7404, name: "Franchise Alpha Compendium", description: "Compendium collection for Franchise Alpha.", volume: { id: 17404, name: "Franchise Alpha Compendium" } }),
    makeComicRow({ id: 7405, name: "Franchise Alpha Vol. 3", description: "Collects issues #20-30.", volume: { id: 17405, name: "Franchise Alpha" } }),
  ];

  const deferredSourceResults = makeSourceResultFromRows(deferredRows);
  const deferredNormalized = normalizeSourceResults(deferredSourceResults);
  const deferredGated = applyComicVineSourceAdmissionPolicy(deferredNormalized, deferredSourceResults);
  const deferredDiag = asObject(deferredGated.diagnostics);
  const deferredObs = asObject(deferredDiag.deferredObservability);
  const deferredHardRejected = Array.isArray(deferredDiag.hardRejectedCandidates) ? deferredDiag.hardRejectedCandidates : [];
  const deferredScorerRows = Array.isArray(deferredDiag.candidatesReachingScorer) ? deferredDiag.candidatesReachingScorer : [];

  assertEqual(Boolean(asObject(deferredObs.previews).enforced), false, "preview suppression remains unenforced");
  assertEqual(Boolean(asObject(deferredObs.variant_covers).enforced), false, "variant-cover suppression remains unenforced");
  assertEqual(Boolean(asObject(deferredObs.broad_franchise_diversity).enforced), false, "broad franchise diversity remains unenforced");
  assertEqual(Boolean(asObject(deferredObs.final_selection_diversity).enforced), false, "final-selection diversity remains unenforced");

  assertTruthy(!deferredHardRejected.some((row) => String(row.title || "").includes("Preview")), "preview-like record not auto-rejected solely as preview");
  assertTruthy(!deferredHardRejected.some((row) => String(row.title || "").includes("Variant")), "variant-cover record not auto-rejected solely as variant");
  assertTruthy(deferredScorerRows.some((row) => String(row.title || "").includes("Preview")), "preview-like record reaches scorer handoff");
  assertTruthy(deferredScorerRows.some((row) => String(row.title || "").includes("Variant")), "variant-cover record reaches scorer handoff");
  assertEqual(deferredScorerRows.length, deferredRows.length, "same-franchise candidates not source-filtered solely for diversity");

  const baselineDeferredIds = deferredNormalized.map((candidate) => String(candidate.sourceId || candidate.id));
  const gatedDeferredIds = deferredGated.candidates.map((candidate) => String(candidate.sourceId || candidate.id));
  assertDeepEqual(gatedDeferredIds, baselineDeferredIds, "final-selection diversity behavior not introduced by ComicVine admission policy");
  console.log("PASS G3: explicit deferred-policy non-enforcement boundaries");

  console.log("\nComicVine certification gap-closure regressions passed.");
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exitCode = 1;
});
