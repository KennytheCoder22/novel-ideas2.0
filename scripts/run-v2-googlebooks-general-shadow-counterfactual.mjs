import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  averageScore,
  diversitySnapshot,
  evaluateGeneralShadowAdmission,
} from "./lib/googlebooks-general-shadow-counterfactual.mjs";

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
const { buildTasteProfile } = require(resolve(repoRoot, "app/recommender-v2/tasteProfile.ts"));
const { buildSearchPlan } = require(resolve(repoRoot, "app/recommender-v2/searchPlan.ts"));
const { normalizeSourceResults } = require(resolve(repoRoot, "app/recommender-v2/normalize.ts"));
const { scoreCandidates } = require(resolve(repoRoot, "app/recommender-v2/score.ts"));
const { selectRecommendations } = require(resolve(repoRoot, "app/recommender-v2/select.ts"));
const { sourceAdapters } = require(resolve(repoRoot, "app/recommender-v2/sources/index.ts"));
const {
  analyzeGoogleBooksVolumeForAudit,
  queryFamilyFromQuery,
} = require(resolve(repoRoot, "app/recommender-v2/sources/googleBooksSource.ts"));

const GOOGLE_BOOKS_API_BASE = "https://www.googleapis.com/books/v1/volumes";
const LIMIT = 6;

const PROFILES = [
  {
    id: "general-contemporary-core",
    label: "General contemporary core",
    ageBand: "teens",
    signals: [
      { action: "like", title: "To All the Boys I've Loved Before", source: "googleBooks", format: "book", genres: ["fiction"], tones: ["warm"] },
      { action: "like", title: "Eleanor & Park", source: "googleBooks", format: "book", genres: ["fiction"], themes: ["relationships"] },
      { action: "like", title: "The Hate U Give", source: "googleBooks", format: "book", genres: ["fiction"], themes: ["social issues"] },
      { action: "dislike", title: "Blood Meridian", source: "googleBooks", format: "book", genres: ["fiction"], tones: ["bleak"] },
      { action: "skip", title: "Normal People", source: "googleBooks", format: "book", genres: ["fiction"] },
    ],
  },
  {
    id: "general-coming-of-age",
    label: "General coming-of-age",
    ageBand: "teens",
    signals: [
      { action: "like", title: "The Perks of Being a Wallflower", source: "googleBooks", format: "book", genres: ["fiction"], tones: ["introspective"] },
      { action: "like", title: "The Poet X", source: "googleBooks", format: "book", genres: ["fiction"], themes: ["identity"] },
      { action: "like", title: "I'll Give You the Sun", source: "googleBooks", format: "book", genres: ["fiction"], themes: ["family"] },
      { action: "dislike", title: "A Little Life", source: "googleBooks", format: "book", genres: ["fiction"], tones: ["heavy"] },
      { action: "skip", title: "The Goldfinch", source: "googleBooks", format: "book", genres: ["fiction"] },
    ],
  },
  {
    id: "general-realistic-fiction",
    label: "General realistic fiction",
    ageBand: "teens",
    signals: [
      { action: "like", title: "Looking for Alaska", source: "googleBooks", format: "book", genres: ["fiction"], tones: ["reflective"] },
      { action: "like", title: "Fangirl", source: "googleBooks", format: "book", genres: ["fiction"], themes: ["self-discovery"] },
      { action: "like", title: "Turtles All the Way Down", source: "googleBooks", format: "book", genres: ["fiction"], themes: ["mental health"] },
      { action: "dislike", title: "The Bell Jar", source: "googleBooks", format: "book", genres: ["fiction"], tones: ["dark"] },
      { action: "skip", title: "The Catcher in the Rye", source: "googleBooks", format: "book", genres: ["fiction"] },
    ],
  },
];

function parseDotEnv(path) {
  try {
    const raw = readFileSync(path, "utf8");
    const out = {};
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx <= 0) continue;
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim();
      out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

const localEnv = parseDotEnv(resolve(repoRoot, ".env"));
if (!process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY && localEnv.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY) {
  process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY = localEnv.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY;
}
if (!process.env.GOOGLE_BOOKS_API_KEY && localEnv.GOOGLE_BOOKS_API_KEY) {
  process.env.GOOGLE_BOOKS_API_KEY = localEnv.GOOGLE_BOOKS_API_KEY;
}
const GOOGLE_BOOKS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY || process.env.GOOGLE_BOOKS_API_KEY || "";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, label) {
  const maxAttempts = 10;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetch(url);
    if (response.ok) return response;
    const retryable = [429, 500, 502, 503, 504].includes(Number(response.status));
    if (!retryable || attempt === maxAttempts) throw new Error(`Google Books fetch failed (${response.status}) for ${label}`);
    await sleep(1300 * attempt + Math.floor(Math.random() * 300));
  }
  throw new Error(`Google Books fetch failed (retry_exhausted) for ${label}`);
}

async function fetchTop100(query) {
  const items = [];
  for (const startIndex of [0, 20, 40, 60, 80]) {
    const url = new URL(GOOGLE_BOOKS_API_BASE);
    url.searchParams.set("q", query);
    url.searchParams.set("startIndex", String(startIndex));
    url.searchParams.set("maxResults", "20");
    url.searchParams.set("printType", "books");
    if (GOOGLE_BOOKS_API_KEY) url.searchParams.set("key", GOOGLE_BOOKS_API_KEY);
    const response = await fetchWithRetry(url.toString(), `${query}:${startIndex}`);
    const payload = await response.json();
    const batch = Array.isArray(payload?.items) ? payload.items : [];
    items.push(...batch);
    await sleep(250);
  }
  return items.slice(0, 100);
}

function firstGeneralQueryFromPlan(searchPlan) {
  const gbPlan = (searchPlan?.sourcePlans || []).find((plan) => plan && plan.source === "googleBooks");
  if (!gbPlan) return "";
  const queries = (gbPlan.intents || []).map((intent) => String(intent?.query || "").trim()).filter(Boolean);
  return queries.find((query) => queryFamilyFromQuery(query) === "general") || "";
}

function titleAuthorKey(title, creators) {
  const author = Array.isArray(creators) ? String(creators[0] || "").trim().toLowerCase() : "";
  return `${String(title || "").trim().toLowerCase()}::${author}`;
}

function toShadowRawRow(item, analysis, query, queryCascadeIndex) {
  const volumeInfo = (item && item.volumeInfo) || {};
  const industryIdentifiers = Array.isArray(volumeInfo.industryIdentifiers) ? volumeInfo.industryIdentifiers : [];
  const isbn13 = industryIdentifiers.find((entry) => String(entry?.type || "").toUpperCase() === "ISBN_13");
  const isbn10 = industryIdentifiers.find((entry) => String(entry?.type || "").toUpperCase() === "ISBN_10");
  return {
    id: `googleBooks:${String(item?.id || analysis.title).trim()}`,
    sourceId: String(item?.id || analysis.title).trim(),
    canonicalVolumeId: String(item?.id || analysis.title).trim(),
    title: String(analysis.title || "").trim(),
    subtitle: String(analysis.subtitle || "").trim() || undefined,
    creators: Array.isArray(analysis.authors) ? analysis.authors : [],
    authors: Array.isArray(analysis.authors) ? analysis.authors : [],
    description: String(analysis.description || "").trim(),
    genres: Array.isArray(analysis.categories) ? analysis.categories : [],
    themes: [],
    tones: [],
    characterDynamics: [],
    formats: ["book"],
    publisher: String(analysis.publisher || "").trim() || undefined,
    publishedDate: analysis.publicationYear ? String(analysis.publicationYear) : String(volumeInfo.publishedDate || ""),
    publicationYear: analysis.publicationYear,
    pageCount: analysis.pageCount,
    ratingsCount: Number(volumeInfo.ratingsCount || 0),
    averageRating: typeof volumeInfo.averageRating === "number" ? volumeInfo.averageRating : undefined,
    language: String(volumeInfo.language || "").trim() || undefined,
    maturityBand: String(volumeInfo.maturityRating || "").trim() || "NOT_MATURE",
    maturityRating: String(volumeInfo.maturityRating || "").trim() || "NOT_MATURE",
    audienceBand: "teens",
    contentMaturity: "not_mature",
    sourceMaturityRating: String(volumeInfo.maturityRating || "").trim() || "NOT_MATURE",
    requestedAgeBand: "teens",
    sourceUrl: String(volumeInfo.previewLink || item?.selfLink || "").trim() || undefined,
    queryText: query,
    originalPlannedQuery: query,
    queryCascadeIndex,
    queryFamily: "general",
    googleBooksPublicationShape: analysis.publicationShape,
    googleBooksNarrativeConfidence: analysis.narrativeConfidence,
    googleBooksPublicationShapeEvidence: analysis.publicationShapeEvidence,
    googleBooksDominantPublicationShapeEvidence: analysis.publicationShapeEvidence,
    googleBooksOverriddenNarrativeEvidence: [],
    googleBooksPublicationShapePrecedenceDecision: "shadow_counterfactual_admitted",
    googleBooksExplicitNonNarrativeIdentity: analysis.explicitNonNarrativeIdentity,
    googleBooksStoryLevelNarrativeEvidence: analysis.storyLevelNarrativeEvidence,
    googleBooksGenericCategoryTitle: analysis.genericCategoryTitle,
    googleBooksGenericCategoryEvidence: [],
    googleBooksUnknownShapeEligibility: analysis.unknownShapeEligibility,
    googleBooksUnknownShapeEvidence: analysis.unknownShapeEvidence,
    googleBooksUnknownShapeRejectedReason: analysis.unknownShapeRejectedReason,
    googleBooksUnknownStoryEvidenceCount: analysis.unknownStoryEvidenceCount,
    googleBooksUnknownStoryEvidenceFamilies: analysis.unknownStoryEvidenceFamilies,
    googleBooksUnknownNarrativeCorroboration: analysis.unknownNarrativeCorroboration,
    googleBooksUnknownEligibilityThresholdDecision: analysis.unknownEligibilityThresholdDecision,
    googleBooksSubjectOfStudyTitle: analysis.subjectOfStudyTitle,
    googleBooksSubjectOfStudyEvidence: analysis.subjectOfStudyEvidence,
    googleBooksCuratedBookGuideIdentity: analysis.curatedBookGuideIdentity,
    googleBooksCuratedBookGuideEvidence: analysis.curatedBookGuideEvidence,
    googleBooksPeriodicalIdentityEvidence: analysis.periodicalIdentityEvidence,
    googleBooksPeriodicalIdentityDecision: analysis.periodicalIdentityDecision,
    shadowCounterfactualAdmitted: true,
    shadowCounterfactualOriginalRejectReason: analysis.publicationShapeDropReason,
    shadowCounterfactualIsbn13: String(isbn13?.identifier || ""),
    shadowCounterfactualIsbn10: String(isbn10?.identifier || ""),
    volumeInfo,
  };
}

async function runProfile(profile) {
  const session = {
    requestId: `phase2-general-shadow-${profile.id}`,
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
  };

  const tasteProfile = buildTasteProfile(session);
  const searchPlan = buildSearchPlan(tasteProfile, session.enabledSources);
  const generalPrimaryQuery = firstGeneralQueryFromPlan(searchPlan);
  if (!generalPrimaryQuery) {
    return {
      profileId: profile.id,
      profileLabel: profile.label,
      blocker: "no_general_query_in_plan",
    };
  }

  const googleBooksPlan = (searchPlan.sourcePlans || []).find((plan) => plan && plan.source === "googleBooks");
  const baselineSourceResult = await sourceAdapters.googleBooks.search(googleBooksPlan, { profile: tasteProfile });
  const baselineNormalized = normalizeSourceResults([baselineSourceResult]);
  const baselineScored = scoreCandidates(baselineNormalized, tasteProfile);
  const baselineSelection = selectRecommendations(baselineScored, tasteProfile, LIMIT);
  const baselineSelected = baselineSelection.selected || [];
  const baselineSelectedKeys = new Set(baselineSelected.map((item) => titleAuthorKey(item.title, item.creators)));
  const baselineSelectedAverage = averageScore(baselineSelected);
  const baselineDiversity = diversitySnapshot(baselineSelected);

  const top100 = await fetchTop100(generalPrimaryQuery);
  const admittedRows = [];
  const candidateRows = [];
  for (let index = 0; index < top100.length; index += 1) {
    const item = top100[index];
    const analysis = analyzeGoogleBooksVolumeForAudit((item && item.volumeInfo) || {}, item || {});
    const decision = evaluateGeneralShadowAdmission(analysis);
    if (String(analysis.publicationShapeDropReason || "") !== "publication_shape_unknown_insufficient_narrative_identity") continue;
    const row = {
      title: analysis.title,
      authors: analysis.authors,
      originalRejectionReason: String(analysis.publicationShapeDropReason || ""),
      corroboratingSignals: decision.corroboratingSignals,
      contradictorySignals: decision.contradictorySignals,
      confidenceClassification: decision.confidence,
      bundleChecks: decision.bundleChecks,
      publicationShape: analysis.publicationShape,
      narrativeConfidence: analysis.narrativeConfidence,
      unknownStoryEvidenceFamilies: analysis.unknownStoryEvidenceFamilies,
      unknownShapeEvidence: analysis.unknownShapeEvidence,
      storyLevelNarrativeEvidence: analysis.storyLevelNarrativeEvidence,
      categories: analysis.categories,
      publisher: analysis.publisher,
      pageCount: analysis.pageCount,
      isbnPresent: analysis.isbnPresent,
      shadowAdmitted: decision.admit,
      _analysis: analysis,
      _item: item,
    };
    candidateRows.push(row);
    if (decision.admit) admittedRows.push(row);
  }

  const shadowRawRows = admittedRows.map((row, idx) => toShadowRawRow(row._item, row._analysis, generalPrimaryQuery, idx));
  const combinedSourceResult = {
    source: "googleBooks",
    status: baselineSourceResult.status,
    rawItems: [...(Array.isArray(baselineSourceResult.rawItems) ? baselineSourceResult.rawItems : []), ...shadowRawRows],
    diagnostics: baselineSourceResult.diagnostics,
  };
  const counterfactualNormalized = normalizeSourceResults([combinedSourceResult]);
  const counterfactualScored = scoreCandidates(counterfactualNormalized, tasteProfile);
  const counterfactualSelection = selectRecommendations(counterfactualScored, tasteProfile, LIMIT);
  const counterfactualSelected = counterfactualSelection.selected || [];
  const counterfactualSelectedKeys = new Set(counterfactualSelected.map((item) => titleAuthorKey(item.title, item.creators)));
  const counterfactualSelectedAverage = averageScore(counterfactualSelected);
  const counterfactualDiversity = diversitySnapshot(counterfactualSelected);

  const rankedCounterfactual = [...counterfactualScored]
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
    .map((candidate, index) => ({ candidate, rankPosition: index + 1 }));
  const rankByKey = new Map(rankedCounterfactual.map((row) => [titleAuthorKey(row.candidate.title, row.candidate.creators), row.rankPosition]));
  const scoredByKey = new Map(counterfactualScored.map((row) => [titleAuthorKey(row.title, row.creators), row]));

  const shadowCandidateDiagnostics = admittedRows.map((row) => {
    const key = titleAuthorKey(row.title, row.authors);
    const normalizedCandidate = counterfactualNormalized.find((candidate) => titleAuthorKey(candidate.title, candidate.creators) === key);
    const scoredCandidate = scoredByKey.get(key);
    const selectedInCounterfactual = counterfactualSelectedKeys.has(key);
    const replacedExistingSelected = selectedInCounterfactual && !baselineSelectedKeys.has(key);
    return {
      title: row.title,
      author: Array.isArray(row.authors) ? String(row.authors[0] || "") : "",
      originalRejectionReason: row.originalRejectionReason,
      corroboratingSignals: row.corroboratingSignals,
      contradictorySignals: row.contradictorySignals,
      confidenceClassification: row.confidenceClassification,
      survivesNormalization: Boolean(normalizedCandidate),
      score: scoredCandidate ? Number(scoredCandidate.score || 0) : null,
      rankPosition: rankByKey.get(key) || null,
      entersCandidatePool: Boolean(scoredCandidate),
      selectedInCounterfactual,
      replacesExistingSelectedTitle: replacedExistingSelected,
    };
  });

  const selectedAdditions = counterfactualSelected.filter((item) => !baselineSelectedKeys.has(titleAuthorKey(item.title, item.creators)));
  const selectedDrops = baselineSelected.filter((item) => !counterfactualSelectedKeys.has(titleAuthorKey(item.title, item.creators)));

  return {
    profileId: profile.id,
    profileLabel: profile.label,
    generalPrimaryQuery,
    baseline: {
      selectedTitles: baselineSelected.map((item) => item.title),
      selectedCount: baselineSelected.length,
      averageScore: baselineSelectedAverage,
      diversity: baselineDiversity,
    },
    counterfactual: {
      selectedTitles: counterfactualSelected.map((item) => item.title),
      selectedCount: counterfactualSelected.length,
      averageScore: counterfactualSelectedAverage,
      diversity: counterfactualDiversity,
    },
    deltas: {
      selectedAdditions: selectedAdditions.map((item) => item.title),
      selectedReplacements: selectedDrops.map((item) => item.title),
      averageScoreDelta: Number((counterfactualSelectedAverage - baselineSelectedAverage).toFixed(3)),
      diversityDelta: {
        uniqueAuthors: counterfactualDiversity.uniqueAuthors - baselineDiversity.uniqueAuthors,
        uniqueTitleRoots: counterfactualDiversity.uniqueTitleRoots - baselineDiversity.uniqueTitleRoots,
      },
    },
    shadowAdmissions: {
      candidateUnknownRejectsExamined: candidateRows.length,
      admittedCount: admittedRows.length,
      likelyTrueNarratives: admittedRows.filter((row) => row.confidenceClassification === "high").length,
      likelyFalseAccepts: admittedRows.filter((row) => row.confidenceClassification !== "high").length,
      scoredAdditions: shadowCandidateDiagnostics.filter((row) => row.entersCandidatePool).length,
      selectedAdditions: shadowCandidateDiagnostics.filter((row) => row.selectedInCounterfactual).length,
      selectedReplacements: shadowCandidateDiagnostics.filter((row) => row.replacesExistingSelectedTitle).length,
    },
    shadowCandidateDiagnostics,
  };
}

const profileResults = [];
for (const profile of PROFILES) {
  profileResults.push(await runProfile(profile));
}

const aggregate = profileResults.reduce((acc, row) => {
  if (row.blocker) {
    acc.blockedProfiles += 1;
    acc.blockers.push({ profileId: row.profileId, blocker: row.blocker });
    return acc;
  }
  acc.shadowAdmissions += Number(row.shadowAdmissions.admittedCount || 0);
  acc.likelyTrueNarratives += Number(row.shadowAdmissions.likelyTrueNarratives || 0);
  acc.likelyFalseAccepts += Number(row.shadowAdmissions.likelyFalseAccepts || 0);
  acc.scoredAdditions += Number(row.shadowAdmissions.scoredAdditions || 0);
  acc.selectedAdditions += Number(row.shadowAdmissions.selectedAdditions || 0);
  acc.selectedReplacements += Number(row.shadowAdmissions.selectedReplacements || 0);
  acc.averageScoreDelta += Number(row.deltas.averageScoreDelta || 0);
  acc.diversityDeltaAuthors += Number(row.deltas.diversityDelta.uniqueAuthors || 0);
  acc.diversityDeltaTitleRoots += Number(row.deltas.diversityDelta.uniqueTitleRoots || 0);
  acc.profilesEvaluated += 1;
  return acc;
}, {
  profilesEvaluated: 0,
  blockedProfiles: 0,
  blockers: [],
  shadowAdmissions: 0,
  likelyTrueNarratives: 0,
  likelyFalseAccepts: 0,
  scoredAdditions: 0,
  selectedAdditions: 0,
  selectedReplacements: 0,
  averageScoreDelta: 0,
  diversityDeltaAuthors: 0,
  diversityDeltaTitleRoots: 0,
});

aggregate.averageScoreDelta = Number(aggregate.averageScoreDelta.toFixed(3));
aggregate.falseAcceptRatePct = aggregate.shadowAdmissions
  ? Number(((aggregate.likelyFalseAccepts / aggregate.shadowAdmissions) * 100).toFixed(1))
  : 0;
aggregate.decision =
  aggregate.selectedAdditions > 1
  && aggregate.falseAcceptRatePct <= 20
  && aggregate.averageScoreDelta > 0
  && aggregate.diversityDeltaAuthors >= 0
  && aggregate.diversityDeltaTitleRoots >= 0
    ? "consider_promotion_experiment"
    : "no_action";

mkdirSync(outDir, { recursive: true });
const jsonOut = resolve(outDir, "googlebooks-general-shadow-counterfactual.json");
const csvOut = resolve(outDir, "googlebooks-general-shadow-counterfactual.csv");
const summaryOut = resolve(outDir, "googlebooks-general-shadow-counterfactual-summary.txt");

writeFileSync(jsonOut, JSON.stringify({
  generatedAt: new Date().toISOString(),
  aggregate,
  profileResults,
}, null, 2));

const csvHeader = [
  "profileId",
  "profileLabel",
  "generalPrimaryQuery",
  "admittedCount",
  "likelyTrueNarratives",
  "likelyFalseAccepts",
  "scoredAdditions",
  "selectedAdditions",
  "selectedReplacements",
  "averageScoreDelta",
  "diversityDeltaAuthors",
  "diversityDeltaTitleRoots",
].join(",");
const csvRows = profileResults.map((row) => [
  row.profileId,
  `"${String(row.profileLabel || "").replace(/"/g, "\"\"")}"`,
  `"${String(row.generalPrimaryQuery || "").replace(/"/g, "\"\"")}"`,
  Number(row.shadowAdmissions?.admittedCount || 0),
  Number(row.shadowAdmissions?.likelyTrueNarratives || 0),
  Number(row.shadowAdmissions?.likelyFalseAccepts || 0),
  Number(row.shadowAdmissions?.scoredAdditions || 0),
  Number(row.shadowAdmissions?.selectedAdditions || 0),
  Number(row.shadowAdmissions?.selectedReplacements || 0),
  Number(row.deltas?.averageScoreDelta || 0),
  Number(row.deltas?.diversityDelta?.uniqueAuthors || 0),
  Number(row.deltas?.diversityDelta?.uniqueTitleRoots || 0),
].join(","));
writeFileSync(csvOut, `${csvHeader}\n${csvRows.join("\n")}\n`);

const summaryLines = [
  "Google Books General shadow-mode counterfactual",
  `Profiles evaluated: ${aggregate.profilesEvaluated}`,
  `Blocked profiles: ${aggregate.blockedProfiles}`,
  `Shadow admissions: ${aggregate.shadowAdmissions}`,
  `Likely true narratives: ${aggregate.likelyTrueNarratives}`,
  `Likely false accepts: ${aggregate.likelyFalseAccepts}`,
  `False-accept rate: ${aggregate.falseAcceptRatePct}%`,
  `Scored additions: ${aggregate.scoredAdditions}`,
  `Selected additions: ${aggregate.selectedAdditions}`,
  `Selected replacements: ${aggregate.selectedReplacements}`,
  `Average score delta (sum across profiles): ${aggregate.averageScoreDelta}`,
  `Diversity delta authors (sum): ${aggregate.diversityDeltaAuthors}`,
  `Diversity delta title roots (sum): ${aggregate.diversityDeltaTitleRoots}`,
  `Decision: ${aggregate.decision}`,
];
if (aggregate.blockers.length > 0) {
  summaryLines.push("", "Blockers:");
  for (const blocker of aggregate.blockers) summaryLines.push(`- ${blocker.profileId}: ${blocker.blocker}`);
}
writeFileSync(summaryOut, `${summaryLines.join("\n")}\n`);

console.log(`Wrote ${jsonOut}`);
console.log(`Wrote ${csvOut}`);
console.log(`Wrote ${summaryOut}`);
