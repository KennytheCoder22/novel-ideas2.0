#!/usr/bin/env node
import { resolve } from "node:path";
import { stableJson } from "./lib/harness.mjs";
import {
  characterizeComicVineFixture,
  comicVineProductionHashes,
  loadComicVineDefinitions,
} from "./lib/comicVineCharacterization.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function equal(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const repoRoot = resolve(import.meta.dirname, "../..");
const definitions = loadComicVineDefinitions(repoRoot);
const hashesBefore = comicVineProductionHashes(repoRoot);

function execute() {
  return definitions.profiles.map((profile) => characterizeComicVineFixture(
    profile,
    definitions.fixtures[profile.profileId],
    definitions,
    hashesBefore,
  ));
}

const originalFetch = globalThis.fetch;
let networkAttempted = false;
globalThis.fetch = async (url) => {
  networkAttempted = true;
  throw new Error(`NETWORK_DISABLED_UNEXPECTED_REQUEST:${url}`);
};
let first;
let second;
try {
  first = execute();
  second = execute();
} finally {
  globalThis.fetch = originalFetch;
}
assert(!networkAttempted, "fixture-only ComicVine characterization must not attempt network access");
equal(stableJson(first), stableJson(second), "ComicVine characterization must be deterministic");
equal(stableJson(comicVineProductionHashes(repoRoot)), stableJson(hashesBefore), "production hashes must remain unchanged");

const byId = Object.fromEntries(first.map((artifact) => [artifact.profile.profileId, artifact]));
for (const profile of definitions.profiles) {
  equal(byId[profile.profileId].characterizationOutcome, profile.expectedOutcome, `${profile.profileId} outcome`);
  equal(byId[profile.profileId].identity.recommendationCapableIdentityCount, profile.expectedRecommendationCapableCount, `${profile.profileId} recommendation-capable identity count`);
  equal(byId[profile.profileId].productionBoundary.productionAdapterState, "adapter_implemented", `${profile.profileId} production boundary`);
  equal(byId[profile.profileId].comparison.performed, false, `${profile.profileId} comparison boundary`);
}

// --- Adult speculative ensemble ---
const speculative = byId["cv-adult-speculative-ensemble"];
equal(speculative.raw.recordCount, 8, "Adult speculative raw record count");
equal(speculative.identity.recommendationCapableIdentityCount, 6, "Adult speculative recommendation identity collapse");
assert(speculative.identity.readingUnitKindHistogram.single_issue === 2, "Issue and variant must remain visible as two source records");
assert(speculative.identity.readingUnitKindHistogram.collected_volume === 2, "Trade and hardcover binding must classify as collected volumes");
assert(speculative.identity.readingUnitKindHistogram.omnibus === 1, "Omnibus identity must remain distinct");
assert(speculative.identity.readingUnitKindHistogram.boxed_set === 1, "Boxed-set identity must remain distinct");
assert(speculative.identity.readingUnitKindHistogram.standalone_graphic_work === 2, "Standalone graphic novel and memoir must classify as standalone works");
assert(speculative.identity.collapseGroups.some((group) =>
  group.publicationIds.includes("cv-publication:2001") && group.publicationIds.includes("cv-publication:2002")
), "Variant cover must collapse at readable/recommendation identity");
assert(speculative.identity.collapseGroups.some((group) =>
  group.publicationIds.includes("cv-publication:2101") && group.publicationIds.includes("cv-publication:2102")
), "Trade and hardcover edition must collapse at readable/recommendation identity");
const trade = speculative.records.find((record) => record.sourceRecordIdentity.id === "cv:2101");
assert(trade.readableWorkIdentity.constituentIssueIds.length === 4, "Trade must preserve explicit constituent issues");
assert(trade.recommendationIdentity.id !== speculative.records[0].recommendationIdentity.id, "Collection must remain a distinct reading unit from its issue");

// --- Adult horror/mystery ---
const horror = byId["cv-adult-horror-mystery"];
equal(horror.identity.sameTitleDistinctSeries.length, 1, "Similarly titled unrelated series must be diagnosed");
equal(horror.identity.sameTitleDistinctSeries[0].automaticMerge, false, "Similarly titled series must not auto-merge");
equal(horror.identity.readingUnitKindHistogram.supporting_reference, 1, "Reference artifact must remain supporting-only");

// --- Teen fantasy/adventure ---
const teenFantasy = byId["cv-teen-fantasy-adventure"];
assert(teenFantasy.identity.incompleteCreatorCreditSourceRecordIds.includes("cv:4201"), "Incomplete creator credit must remain explicit");
assert(teenFantasy.identity.dateConflictSourceRecordIds.includes("cv:4201") || teenFantasy.identity.dateConflictSourceRecordIds.includes("cv:4301"), "Conflicting publication dates must be preserved across equivalent editions");
equal(teenFantasy.metadataCoverage.audienceAuthority.rate, 0, "Teen audience authority limitation");

// --- Teen superhero/identity ---
const superhero = byId["cv-teen-superhero-identity"];
equal(superhero.identity.ambiguousCount, 1, "Ambiguous issue-versus-collection shape must not be guessed");
assert(superhero.identity.ambiguousSourceRecordIds.includes("cv:5101"), "Ambiguous source record lineage");
assert(superhero.identity.collapseGroups.some((group) =>
  group.publicationIds.includes("cv-publication:5001") && group.publicationIds.includes("cv-publication:5002")
), "Superhero variant must collapse without losing publication identity");

// --- Preteen humor/adventure ---
const preteen = byId["cv-preteen-humor-adventure"];
equal(preteen.metadataCoverage.audienceAuthority.rate, 0, "Preteen audience authority limitation");
equal(preteen.metadataCoverage.maturityAuthority.rate, 0, "Preteen maturity authority limitation");

// --- Teen manga volume ---
const manga = byId["cv-teen-manga-volume"];
equal(manga.identity.readingUnitKindHistogram.manga_volume, 1, "Manga volume identity");
equal(manga.identity.readingUnitKindHistogram.omnibus, 1, "Manga omnibus identity");
assert(manga.records.find((record) => record.readingUnitIdentity.kind === "manga_volume").seriesIdentity.parsedOrdinal === 3, "Manga series order must be preserved");

// --- Controls ---
const empty = byId["cv-valid-empty"];
equal(empty.characterizationOutcome, "valid_empty_response", "Valid empty response state");
const invalid = byId["cv-invalid-response"];
equal(invalid.characterizationOutcome, "response_invalid", "Invalid response state");

// --- Licensing boundary ---
for (const artifact of first) {
  equal(artifact.licensingBoundary.coverUrlsPresent, false, "cover URL exclusion");
  equal(artifact.licensingBoundary.coverImagesPresent, false, "cover image exclusion");
  equal(artifact.licensingBoundary.liveMetadataCaptured, false, "no live ComicVine metadata");
  assert(!/https:\/\/comicvine\.gamespot\.com\//i.test(stableJson(artifact.records)), "fixture records must not contain live ComicVine entity URLs");
}

console.log(JSON.stringify({
  pass: true,
  characterization: "Graphic Novel Source Competence Phase II",
  source: "comicvine",
  caseCount: first.length,
  deterministic: true,
  noNetwork: true,
  productionHashesUnchanged: true,
  productionAdapterState: "adapter_implemented",
  liveTransportCharacterized: false,
  humanUsefulnessCharacterized: false,
  comparativeConclusionMade: false,
  assertions: [
    "source_record_publication_readable_work_reading_unit_and_recommendation_layers",
    "issue_variant_edition_collection_omnibus_boxed_set_manga_and_ambiguity_boundaries",
    "series_order_date_conflict_and_incomplete_creator_lineage",
    "audience_maturity_summary_and_genre_authority_limitations",
    "valid_empty_and_invalid_response_distinction",
    "cover_and_live_data_exclusion",
    "production_behavior_unchanged"
  ]
}, null, 2));
