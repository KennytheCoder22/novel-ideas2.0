/**
 * ComicVine entity-policy regressions.
 *
 * Coverage:
 * 1) hard rejects stay excluded
 * 2) preferred identities survive admission without score mutation
 * 3) semantic classification beats issue numbering
 * 4) collection beats component issue
 * 5) omnibus beats contained volume
 * 6) limited-series container beats middle issue
 * 7) first-issue fallback can release when no stronger unit exists
 * 8) middle issue is withheld
 * 9) reference material requires direct supporting evidence
 * 10) duplicate editions collapse to one representative
 * 11) honest underfill when only unsuitable issues remain
 * 12) taste relevance still outranks entity preference for unrelated works
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

function uniqueStrings(values, limit = 40) {
  const out = [];
  const seen = new Set();
  for (const value of values) {
    const text = String(value || "").trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= limit) break;
  }
  return out;
}

const dir = resolve(dirname(fileURLToPath(import.meta.url)), "../app/recommender-v2");
const { classifyComicVineIdentity } = require(resolve(dir, "comicVineIdentity.ts"));
const { normalizeSourceResults } = require(resolve(dir, "normalize.ts"));
const { buildTasteProfile } = require(resolve(dir, "tasteProfile.ts"));
const { scoreCandidates } = require(resolve(dir, "score.ts"));
const { applyComicVineSourceAdmissionPolicy, applyAdultComicVinePostScorePolicy } = require(resolve(dir, "comicVineAdmission.ts"));
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
      weight: action === "skip" ? 0 : 1,
    };
  });
}

function makeComicRow(overrides = {}) {
  return {
    id: 9000,
    resource_type: "issue",
    name: "Default Comic Row",
    deck: "Default deck",
    description: "Default description",
    issue_number: "1",
    cover_date: "2019-01-01",
    site_detail_url: "https://comicvine.gamespot.com/default/4000-9000/",
    volume: { id: 900, name: "Default Volume" },
    person_credits: [{ name: "Writer A" }],
    ...overrides,
  };
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
      queryText: "comicvine entity policy query",
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
      queries: ["comicvine entity policy query"],
    },
  }];
}

function buildAdultProfile(sequence = ["like", "like", "dislike", "skip", "like", "dislike", "like", "skip"]) {
  return buildTasteProfile({
    requestId: "comicvine-entity-policy-regression-profile",
    ageBand: "adult",
    limit: 5,
    signals: buildSignalsFromPreset(sequence),
    enabledSources: { comicVine: true },
    deckKey: "adult",
  });
}

function alignCandidateToProfile(candidate, profile, strength = "strong") {
  const genreSignals = profile.genreFamily.map((signal) => String(signal.value || "")).filter(Boolean).slice(0, strength === "strong" ? 2 : 1);
  const themeSignals = profile.themes.map((signal) => String(signal.value || "")).filter(Boolean).slice(0, strength === "strong" ? 2 : 1);
  const toneSignals = profile.tone.map((signal) => String(signal.value || "")).filter(Boolean).slice(0, strength === "strong" ? 1 : 0);
  candidate.genres = uniqueStrings([...(candidate.genres || []), ...genreSignals]);
  candidate.themes = uniqueStrings([...(candidate.themes || []), ...themeSignals]);
  candidate.tones = uniqueStrings([...(candidate.tones || []), ...toneSignals]);
  candidate.description = uniqueStrings([candidate.description || "", ...genreSignals, ...themeSignals, ...toneSignals], 20).join(". ");
}

function runPolicyPipeline(rows, options = {}) {
  const profile = options.profile || buildAdultProfile();
  const sourceResults = makeSourceResultFromRows(rows);
  const normalized = normalizeSourceResults(sourceResults);
  if (typeof options.align === "function") {
    for (const candidate of normalized) options.align(candidate, profile);
  }
  const admitted = applyComicVineSourceAdmissionPolicy(normalized, sourceResults);
  const scored = scoreCandidates(admitted.candidates, profile);
  const postScore = applyAdultComicVinePostScorePolicy(scored, profile, options.limit || 5);
  return { profile, normalized, admitted, scored, postScore, sourceResults };
}

function buildScoreMap(candidates) {
  return Object.fromEntries(candidates.map((candidate) => [String(candidate.sourceId || candidate.id), candidate.score]));
}

async function main() {
  const hardRejectFixtures = [
    { identity: "coloring_book", title: "Marvel Coloring Book", row: makeComicRow({ id: 7201, resource_type: "volume", name: "Marvel Coloring Book", issue_number: "", description: "Coloring pages collection.", volume: { id: 17201, name: "Marvel Coloring Book" } }) },
    { identity: "activity_book", title: "Spider-Man Activity Book", row: makeComicRow({ id: 7202, resource_type: "volume", name: "Spider-Man Activity Book", issue_number: "", description: "Activities and puzzles.", volume: { id: 17202, name: "Spider-Man Activity Book" } }) },
    { identity: "rpg_supplement", title: "Batman RPG Sourcebook", row: makeComicRow({ id: 7203, resource_type: "volume", name: "Batman RPG Sourcebook", issue_number: "", description: "Role-playing sourcebook.", volume: { id: 17203, name: "Batman RPG Sourcebook" } }) },
    { identity: "trading_card_guide", title: "X-Men Trading Card Price Guide", row: makeComicRow({ id: 7204, resource_type: "volume", name: "X-Men Trading Card Price Guide", issue_number: "", description: "Trading card values.", volume: { id: 17204, name: "X-Men Trading Card Price Guide" } }) },
    { identity: "toy_guide", title: "Justice League Action Figure Guide", row: makeComicRow({ id: 7205, resource_type: "volume", name: "Justice League Action Figure Guide", issue_number: "", description: "Toy guide and catalog.", volume: { id: 17205, name: "Justice League Action Figure Guide" } }) },
  ];
  const hardRejectRun = runPolicyPipeline(hardRejectFixtures.map((fixture) => fixture.row));
  assertEqual(hardRejectRun.admitted.candidates.length, 0, "G1 hard rejects removed before scoring");
  for (const fixture of hardRejectFixtures) {
    const classified = classifyComicVineIdentity({
      title: fixture.row.name,
      description: fixture.row.description,
      resourceType: fixture.row.resource_type,
      volumeName: asObject(fixture.row.volume).name,
    });
    assertEqual(classified.identity, fixture.identity, `G1 identity classification for ${fixture.identity}`);
  }
  console.log("PASS G1: hard rejects stay excluded");

  const preferredFixtures = [
    { identity: "omnibus", title: "Batman Omnibus Vol. 1", row: makeComicRow({ id: 7301, resource_type: "volume", name: "Batman Omnibus Vol. 1", issue_number: "", description: "Omnibus edition.", volume: { id: 17301, name: "Batman Omnibus" } }) },
    { identity: "compendium", title: "Saga Compendium", row: makeComicRow({ id: 7302, resource_type: "volume", name: "Saga Compendium", issue_number: "", description: "Compendium release.", volume: { id: 17302, name: "Saga Compendium" } }) },
    { identity: "trade_paperback", title: "Sandman TPB Vol. 2", row: makeComicRow({ id: 7303, resource_type: "volume", name: "Sandman TPB Vol. 2", issue_number: "", description: "Trade paperback release.", volume: { id: 17303, name: "Sandman TPB" } }) },
    { identity: "collected_edition", title: "Batman Vol. 1: Court of Owls", row: makeComicRow({ id: 7304, resource_type: "volume", name: "Batman Vol. 1: Court of Owls", issue_number: "", description: "Collects issues #1-7.", volume: { id: 17304, name: "Batman" } }) },
    { identity: "deluxe_edition", title: "Watchmen Deluxe Edition", row: makeComicRow({ id: 7305, resource_type: "volume", name: "Watchmen Deluxe Edition", issue_number: "", description: "Deluxe hardcover collection.", volume: { id: 17305, name: "Watchmen Deluxe" } }) },
    { identity: "graphic_novel", title: "Maus Graphic Novel", row: makeComicRow({ id: 7306, resource_type: "volume", name: "Maus Graphic Novel", issue_number: "", description: "Graphic novel release.", volume: { id: 17306, name: "Maus Graphic Novel" } }) },
  ];
  const preferredSourceResults = makeSourceResultFromRows(preferredFixtures.map((fixture) => fixture.row));
  const preferredNormalized = normalizeSourceResults(preferredSourceResults);
  const preferredProfile = buildAdultProfile();
  const preferredBaselineScores = scoreCandidates(preferredNormalized, preferredProfile);
  const preferredAdmitted = applyComicVineSourceAdmissionPolicy(preferredNormalized, preferredSourceResults);
  const preferredGatedScores = scoreCandidates(preferredAdmitted.candidates, preferredProfile);
  const baselineScoreMap = buildScoreMap(preferredBaselineScores);
  const gatedScoreMap = buildScoreMap(preferredGatedScores);
  for (const fixture of preferredFixtures) {
    const classified = classifyComicVineIdentity({
      title: fixture.row.name,
      description: fixture.row.description,
      resourceType: fixture.row.resource_type,
      volumeName: asObject(fixture.row.volume).name,
    });
    assertEqual(classified.identity, fixture.identity, `G2 identity classification for ${fixture.identity}`);
  }
  assertDeepEqual(gatedScoreMap, baselineScoreMap, "G2 admission policy preserves preferred score values");
  console.log("PASS G2: preferred identities survive admission without score mutation");

  const precedenceFixtures = [
    [{ title: "Character Guide #1", issueNumber: "1", resourceType: "issue", description: "Official guide to the cast." }, "companion_guide", "semantic_marker_over_issue_number"],
    [{ title: "The Art of Gotham #1", issueNumber: "1", resourceType: "issue", description: "Art book issue format." }, "art_book", "semantic_marker_over_issue_number"],
    [{ title: "Hulk: The Movie Adaptation #1", issueNumber: "1", resourceType: "issue", description: "Movie adaptation issue." }, "movie_or_tv_tie_in", "semantic_marker_over_issue_number"],
    [{ title: "Batman Vol. 1 #1", issueNumber: "1", resourceType: "issue", description: "Collects issues #1-6." }, "collected_edition", "collection_marker_over_issue_number"],
  ];
  for (const [input, expectedIdentity, expectedPrecedence] of precedenceFixtures) {
    const classification = classifyComicVineIdentity(input);
    assertEqual(classification.identity, expectedIdentity, `G3 identity precedence for ${input.title}`);
    assertEqual(classification.precedenceRule, expectedPrecedence, `G3 precedence rule for ${input.title}`);
  }
  console.log("PASS G3: semantic classification beats issue numbering");

  const collectionRun = runPolicyPipeline([
    makeComicRow({ id: 7401, resource_type: "issue", name: "Saga #1", issue_number: "1", description: "Saga opening issue.", volume: { id: 17401, name: "Saga" } }),
    makeComicRow({ id: 7402, resource_type: "volume", name: "Saga Vol. 1", issue_number: "", description: "Collects issues #1-6.", volume: { id: 17401, name: "Saga" } }),
  ], {
    align(candidate, profile) { alignCandidateToProfile(candidate, profile, "strong"); },
  });
  const collectionSuppressed = collectionRun.admitted.diagnostics.suppressedIssues;
  assertTruthy(collectionSuppressed.some((row) => row.reasonCodes.includes("collection_defeats_component_issue")), "G4 collection suppresses equivalent issue");
  assertTruthy(collectionRun.postScore.candidates.some((candidate) => candidate.title === "Saga Vol. 1"), "G4 collection survives");
  assertTruthy(!collectionRun.postScore.candidates.some((candidate) => candidate.title === "Saga #1"), "G4 issue removed");
  console.log("PASS G4: collected edition defeats equivalent issue");

  const omnibusRun = runPolicyPipeline([
    makeComicRow({ id: 7501, resource_type: "volume", name: "Night Shift Omnibus", issue_number: "", description: "Collects Vol. 1-3.", volume: { id: 17501, name: "Night Shift" } }),
    makeComicRow({ id: 7502, resource_type: "volume", name: "Night Shift Vol. 2", issue_number: "", description: "Collects issues #7-12.", volume: { id: 17501, name: "Night Shift" } }),
  ], {
    align(candidate, profile) { alignCandidateToProfile(candidate, profile, "strong"); },
  });
  assertTruthy(omnibusRun.admitted.diagnostics.suppressedIssues.some((row) => row.reasonCodes.includes("omnibus_defeats_contained_volume")), "G5 omnibus suppresses contained volume");
  assertTruthy(omnibusRun.postScore.candidates.some((candidate) => candidate.title === "Night Shift Omnibus"), "G5 omnibus survives");
  assertTruthy(!omnibusRun.postScore.candidates.some((candidate) => candidate.title === "Night Shift Vol. 2"), "G5 contained volume removed");
  console.log("PASS G5: omnibus defeats contained volume");

  const limitedSeriesRun = runPolicyPipeline([
    makeComicRow({ id: 7601, resource_type: "volume", name: "Night Shift Limited Series", issue_number: "", description: "Limited series container.", volume: { id: 17601, name: "Night Shift Limited Series" } }),
    makeComicRow({ id: 7602, resource_type: "issue", name: "Night Shift #4", issue_number: "4", description: "Middle issue.", volume: { id: 17601, name: "Night Shift Limited Series" } }),
  ], {
    align(candidate, profile) { alignCandidateToProfile(candidate, profile, "strong"); },
  });
  assertTruthy(limitedSeriesRun.admitted.diagnostics.suppressedIssues.some((row) => row.reasonCodes.includes("series_container_defeats_component_issue")), "G6 limited-series container suppresses middle issue");
  console.log("PASS G6: limited-series container defeats middle issue");

  const firstIssueRun = runPolicyPipeline([
    makeComicRow({ id: 7701, resource_type: "issue", name: "Frontier Ghosts #1", issue_number: "1", description: "No collection available.", volume: { id: 17701, name: "Frontier Ghosts" } }),
  ], {
    align(candidate, profile) { alignCandidateToProfile(candidate, profile, "strong"); },
  });
  const firstIssue = firstIssueRun.postScore.candidates.find((candidate) => candidate.title === "Frontier Ghosts #1");
  assertTruthy(Boolean(firstIssue), "G7 first issue fallback released");
  assertEqual(String(firstIssue?.comicVine?.fallbackState || ""), "released", "G7 first issue marked released");
  console.log("PASS G7: first-issue fallback can release when no stronger unit exists");

  const middleIssueRun = runPolicyPipeline([
    makeComicRow({ id: 7801, resource_type: "issue", name: "Frontier Ghosts #4", issue_number: "4", description: "Middle issue only.", volume: { id: 17801, name: "Frontier Ghosts" } }),
  ], {
    align(candidate, profile) { alignCandidateToProfile(candidate, profile, "strong"); },
  });
  assertEqual(middleIssueRun.postScore.candidates.length, 0, "G8 middle issue withheld from final pool");
  assertTruthy(middleIssueRun.postScore.diagnostics.withheldCandidates.some((row) => row.reason === "fallback_middle_issue_withheld"), "G8 middle issue withholding reason recorded");
  console.log("PASS G8: middle issue is withheld");

  const restrictedWithoutEvidence = runPolicyPipeline([
    makeComicRow({ id: 7901, resource_type: "issue", name: "Character Handbook", issue_number: "", description: "Reference handbook.", volume: { id: 17901, name: "Character Handbook" } }),
  ]);
  assertEqual(restrictedWithoutEvidence.postScore.candidates.length, 0, "G9 reference material withheld without direct evidence");
  assertTruthy(restrictedWithoutEvidence.postScore.diagnostics.withheldCandidates.some((row) => row.reason === "restricted_category_lacks_direct_taste_evidence"), "G9 restricted evidence requirement recorded");
  const restrictedWithEvidence = runPolicyPipeline([
    makeComicRow({ id: 7902, resource_type: "volume", name: "Monster Atlas Handbook", issue_number: "", description: "Reference handbook.", volume: { id: 17902, name: "Monster Atlas Handbook" } }),
  ], {
    align(candidate, profile) { alignCandidateToProfile(candidate, profile, "strong"); },
  });
  assertTruthy(restrictedWithEvidence.postScore.candidates.some((candidate) => candidate.title === "Monster Atlas Handbook"), "G9 restricted category can survive with direct evidence");
  console.log("PASS G9: reference material requires direct supporting evidence");

  const duplicateEditionRun = runPolicyPipeline([
    makeComicRow({ id: 8001, resource_type: "volume", name: "Skyline Deluxe Edition", issue_number: "", description: "Collects issues #1-6.", volume: { id: 18001, name: "Skyline" } }),
    makeComicRow({ id: 8002, resource_type: "volume", name: "Skyline Hardcover Vol. 1", issue_number: "", description: "Collects issues #1-6.", volume: { id: 18001, name: "Skyline" } }),
  ], {
    align(candidate, profile) { alignCandidateToProfile(candidate, profile, "strong"); },
  });
  assertTruthy(duplicateEditionRun.admitted.diagnostics.suppressedIssues.some((row) => String(row.reasonCodes || []).includes("duplicate_collection_family_collapsed_by_issue_range")), "G10 duplicate editions collapse");
  assertEqual(duplicateEditionRun.postScore.candidates.length, 1, "G10 only one representative survives");
  console.log("PASS G10: duplicate editions collapse to one representative");

  const underfillRun = runPolicyPipeline([
    makeComicRow({ id: 8101, resource_type: "issue", name: "Underfill Case #4", issue_number: "4", description: "Weak middle issue.", volume: { id: 18101, name: "Underfill Case" } }),
    makeComicRow({ id: 8102, resource_type: "issue", name: "Underfill Case #6", issue_number: "6", description: "Weak middle issue.", volume: { id: 18101, name: "Underfill Case" } }),
  ]);
  assertEqual(underfillRun.postScore.candidates.length, 0, "G11 unsuitable issues do not pad the slate");
  assertTruthy(underfillRun.postScore.diagnostics.withheldCandidates.length >= 2, "G11 withholding diagnostics retained");
  console.log("PASS G11: honest underfill preserved when only unsuitable issues remain");

  const tasteVsFormatRun = runPolicyPipeline([
    makeComicRow({ id: 8201, resource_type: "volume", name: "Weak Omnibus", issue_number: "", description: "Omnibus edition with sparse metadata.", volume: { id: 18201, name: "Weak Omnibus" } }),
    makeComicRow({ id: 8202, resource_type: "volume", name: "Strong Ongoing Series", issue_number: "", description: "Series container.", volume: { id: 18202, name: "Strong Ongoing Series" } }),
  ], {
    align(candidate, profile) {
      if (candidate.title === "Strong Ongoing Series") alignCandidateToProfile(candidate, profile, "strong");
    },
  });
  const rankingTitles = tasteVsFormatRun.postScore.candidates.map((candidate) => candidate.title);
  assertDeepEqual(rankingTitles.slice(0, 2), ["Strong Ongoing Series", "Weak Omnibus"], "G12 stronger unrelated taste fit outranks weaker omnibus");
  console.log("PASS G12: taste relevance still outranks entity preference for unrelated works");

  console.log("\nComicVine entity-policy regressions passed.");
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exitCode = 1;
});
