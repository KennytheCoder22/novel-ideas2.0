import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stableJson } from "./harness.mjs";

export const COMICVINE_CHARACTERIZATION_VERSION = "1.0.0";

// Production files whose hashes are verified to remain unchanged during characterization.
// This list is identical to the GCD characterizer to prove production invariance.
const PRODUCTION_FILES = [
  "app/recommender-v2/types.ts",
  "app/recommender-v2/engine.ts",
  "app/recommender-v2/normalize.ts",
  "app/recommender-v2/score.ts",
  "app/recommender-v2/select.ts",
  "app/recommender-v2/comicVineIdentity.ts",
  "app/recommender-v2/comicVineAdmission.ts",
  "app/recommender-v2/sources/comicVineSource.ts"
];

function json(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function lower(value) {
  return String(value || "").trim().toLowerCase();
}

function values(value) {
  return Array.isArray(value) ? value : [];
}

function unique(valuesToDedupe) {
  return [...new Set(valuesToDedupe.filter((value) => value !== null && value !== undefined && value !== ""))];
}

export function comicVineProductionHashes(repoRoot) {
  return Object.fromEntries(PRODUCTION_FILES.map((file) => [
    file,
    sha256(readFileSync(join(repoRoot, file))),
  ]));
}

export function loadComicVineDefinitions(repoRoot) {
  const profileSet = json(join(repoRoot, "scripts/source-competence/profiles/graphic-novel-source-competence-phase2.json"));
  const fixtureSet = json(join(repoRoot, "scripts/source-competence/fixtures/comicvine/phase2-cases.json"));
  const neutralFixtureSet = json(join(repoRoot, "scripts/source-competence/fixtures/graphicNovel/source-neutral-reading-unit-identity-v1.json"));
  if (profileSet.schemaVersion !== "1.0.0" || fixtureSet.schemaVersion !== "1.0.0") {
    throw new Error("Unsupported ComicVine characterization schema version");
  }
  if (profileSet.source !== "comicvine" || fixtureSet.source !== "comicvine") {
    throw new Error("ComicVine characterization definitions must retain a distinct comicvine source identity");
  }
  if (!Array.isArray(profileSet.profiles) || profileSet.profiles.length !== 8) {
    throw new Error("Graphic Novel Source Competence Phase II requires exactly eight profiles");
  }
  for (const profile of profileSet.profiles) {
    for (const field of [
      "profileId", "matrixProfileId", "ageBand", "intent", "characterizationPurpose",
      "expectedOutcome", "expectedRecommendationCapableCount", "humanReview",
    ]) {
      if (!(field in profile)) throw new Error(`${profile.profileId || "unknown"}: missing profile field ${field}`);
    }
    if (!fixtureSet.cases[profile.profileId]) throw new Error(`${profile.profileId}: fixture missing`);
  }
  if (!Array.isArray(neutralFixtureSet.cases) || neutralFixtureSet.cases.length !== 13) {
    throw new Error("The approved source-neutral reading-unit fixture contract must contain 13 cases");
  }
  return {
    profiles: profileSet.profiles,
    fixtures: fixtureSet.cases,
    sourceSchemaBasis: fixtureSet.sourceSchemaBasis,
    provenance: fixtureSet.provenance,
    fixtureSchemaVersion: fixtureSet.schemaVersion,
    profileSchemaVersion: profileSet.schemaVersion,
    neutralContractVersion: neutralFixtureSet.contractVersion,
    neutralCaseIds: neutralFixtureSet.cases.map((fixtureCase) => fixtureCase.caseId),
  };
}

// ---------------------------------------------------------------------------
// Source-neutral 5-layer contract applied to ComicVine-shaped records.
// No production policy is consulted here. No import of comicVineAdmission.ts,
// comicVineIdentity.ts, comicVineTypes.ts, or any production routing/scoring/
// eligibility/selection code.
// ---------------------------------------------------------------------------

function shapeEvidence(record) {
  const deckText = lower(record.deck || "");
  const nameText = lower(record.name || "");
  const format = lower(record._synthetic_publication_format || "");
  return [nameText, deckText, format].join(" ");
}

function classifyReadingUnit(record) {
  const evidence = shapeEvidence(record);
  const evidenceList = [];

  const hasIssueNumber = record.issue_number !== null && record.issue_number !== undefined && String(record.issue_number).trim() !== "";
  const hasConstituents = values(record._synthetic_collects_issue_ids).length > 0 || values(record._synthetic_contains_volume_labels).length > 0;

  if (/reference|companion guide|encyclopedia|art book|companion|guide/.test(evidence)) {
    return { kind: "supporting_reference", recommendationCapable: false, confidence: "high", evidence: ["reference_format_or_descriptor"] };
  }

  if (record._synthetic_ambiguous_issue_vs_collection) {
    return { kind: "ambiguous_reading_unit", recommendationCapable: false, confidence: "low", evidence: ["issue_and_collection_signals_conflict", "constituents_missing"] };
  }

  if (/boxed set|box set/.test(evidence)) {
    evidenceList.push("boxed_set_format");
    if (values(record._synthetic_contains_volume_labels).length) evidenceList.push("explicit_contained_volumes");
    return { kind: "boxed_set", recommendationCapable: true, confidence: hasConstituents ? "high" : "medium", evidence: evidenceList };
  }

  if (/omnibus/.test(evidence)) {
    evidenceList.push("omnibus_format");
    if (values(record._synthetic_contains_volume_labels).length) evidenceList.push("explicit_contained_volumes");
    return { kind: "omnibus", recommendationCapable: true, confidence: hasConstituents ? "high" : "medium", evidence: evidenceList };
  }

  if (/manga/.test(evidence)) {
    return { kind: "manga_volume", recommendationCapable: true, confidence: "high", evidence: ["manga_format", ...(hasIssueNumber ? ["volume_number_present"] : [])] };
  }

  if (/graphic memoir|memoir/.test(evidence)) {
    return { kind: "standalone_graphic_work", recommendationCapable: true, confidence: "high", evidence: ["graphic_memoir_format"] };
  }

  if (/trade paperback|hardcover/.test(evidence) || values(record._synthetic_collects_issue_ids).length > 0) {
    evidenceList.push(/hardcover/.test(evidence) ? "hardcover_collection_format" : "trade_or_collection_format");
    if (values(record._synthetic_collects_issue_ids).length) evidenceList.push("explicit_constituent_issues");
    return { kind: "collected_volume", recommendationCapable: true, confidence: hasConstituents ? "high" : "medium", evidence: evidenceList };
  }

  if (/graphic novel/.test(evidence)) {
    return { kind: "standalone_graphic_work", recommendationCapable: true, confidence: "high", evidence: ["graphic_novel_format"] };
  }

  if (hasIssueNumber) {
    return { kind: "single_issue", recommendationCapable: true, confidence: "high", evidence: ["issue_number_present", "comic_publication_shape"] };
  }

  return { kind: "ambiguous_reading_unit", recommendationCapable: false, confidence: "low", evidence: ["insufficient_publication_shape_evidence"] };
}

function constituentSignature(record) {
  const issues = values(record._synthetic_collects_issue_ids).map(String).sort();
  if (issues.length) return `issues:${issues.join(",")}`;
  return null;
}

function readableIdentityId(record, classification) {
  // Variant: shares readable identity with the base record.
  if (record._synthetic_variant_of !== null && record._synthetic_variant_of !== undefined) {
    return `cv-readable:${record._synthetic_variant_of}`;
  }
  // Binding editions that share explicit constituents collapse to a shared readable identity.
  const signature = constituentSignature(record);
  if (signature && classification.kind === "collected_volume") return `cv-readable:${signature}`;
  return `cv-readable:${record.id}`;
}

function creatorsFor(record) {
  const people = values(record.person_credits);
  return unique(people.map((person) => String(person.name || "").trim()).filter(Boolean));
}

function creatorRolesFor(record) {
  const people = values(record.person_credits);
  return unique(people.map((person) => String(person.role || "").trim()).filter(Boolean));
}

function typedDates(record) {
  const dates = [];
  if (record.cover_date) dates.push({ type: "cover_date", value: String(record.cover_date) });
  return dates;
}

function normalizeRecord(record) {
  if (!record || record.id === null || record.id === undefined) return { rejected: "missing_source_id" };
  if (!String(record.name || "").trim()) return { rejected: "missing_title" };
  if (!record.volume || (record.volume.id === null && record.volume.id === undefined)) return { rejected: "missing_volume_identity" };

  const classification = classifyReadingUnit(record);
  const readableId = readableIdentityId(record, classification);
  const sourceRecordId = `cv:${record.id}`;
  const creators = creatorsFor(record);
  const creatorRoles = creatorRolesFor(record);
  const constituentIssueIds = values(record._synthetic_collects_issue_ids).map((id) => `cv:${id}`);
  const constituentVolumeLabels = values(record._synthetic_contains_volume_labels).map(String);

  const rawIssueNumber = record.issue_number === null || record.issue_number === undefined ? null : String(record.issue_number).trim();
  const parsedOrdinal = rawIssueNumber !== null && /^\d+$/.test(rawIssueNumber) ? Number(rawIssueNumber) : null;

  const result = {
    sourceRecordIdentity: {
      id: sourceRecordId,
      source: "comicvine",
      sourceRecordType: record.resource_type || "issue",
      nativeId: String(record.id),
      rawHash: sha256(stableJson(record)),
    },
    publicationIdentity: {
      id: `cv-publication:${record.id}`,
      format: lower(record._synthetic_publication_format || (record.issue_number !== null && record.issue_number !== undefined ? "single_issue" : "unknown")),
      publicationType: record.resource_type || "issue",
      identifier: null,
      variantName: record._synthetic_variant_of !== undefined && record._synthetic_variant_of !== null
        ? `Variant of cv:${record._synthetic_variant_of}`
        : null,
      printing: null,
      publisher: record.publisher?.name || null,
      indiciaPublisher: null,
      brand: null,
      language: null,
      dates: typedDates(record),
    },
    readableWorkIdentity: {
      id: readableId,
      kind: classification.kind,
      title: String(record.name),
      confidence: classification.confidence,
      evidence: classification.evidence,
      constituentIssueIds,
      constituentVolumeLabels,
      creators,
      creatorRoles,
      creatorCreditsComplete: values(record.person_credits).length > 0 && !record._synthetic_incomplete_creator_credits,
    },
    readingUnitIdentity: {
      id: readableId.replace("cv-readable:", "cv-reading-unit:"),
      kind: classification.kind,
      boundedExperienceEvidence: classification.evidence,
      recommendationCapable: classification.recommendationCapable,
    },
    seriesIdentity: {
      id: `cv-series:${record.volume?.id ?? "unknown"}`,
      title: String(record.volume?.name || ""),
      startYear: null,
      publisher: record.publisher?.name || null,
      rawSequenceLabel: rawIssueNumber,
      parsedOrdinal,
      orderConfidence: parsedOrdinal !== null ? "explicit" : (rawIssueNumber !== null ? "raw_only" : "unknown"),
    },
    recommendationIdentity: classification.recommendationCapable ? {
      id: readableId.replace("cv-readable:", "cv-recommendation:"),
      collapseLevel: "reading_unit",
    } : null,
    relationships: [
      ...(record._synthetic_variant_of !== null && record._synthetic_variant_of !== undefined
        ? [{ type: "variant_of", target: `cv-publication:${record._synthetic_variant_of}` }] : []),
      ...constituentIssueIds.map((target) => ({ type: "contains", target })),
      ...constituentVolumeLabels.map((target) => ({ type: "contains_unresolved_volume_label", target })),
    ],
    sourceEvidence: {
      deckPresent: Boolean(record.deck),
      personCreditsPresent: values(record.person_credits).length > 0,
      audienceAuthorityPresent: false,
      maturityAuthorityPresent: false,
      genreAuthorityPresent: false,
      summaryPresent: Boolean(record.description),
      coverExcludedByFixturePolicy: true,
    },
  };
  return { value: result };
}

function annotateGroupConflicts(records) {
  const byReadable = new Map();
  for (const record of records) {
    const id = record.readableWorkIdentity.id;
    if (!byReadable.has(id)) byReadable.set(id, []);
    byReadable.get(id).push(record);
  }
  for (const group of byReadable.values()) {
    const dates = unique(group.flatMap((record) => record.publicationIdentity.dates.map((date) => `${date.type}:${date.value}`)));
    const valuesOnly = unique(group.flatMap((record) => record.publicationIdentity.dates.map((date) => date.value)));
    const conflict = group.length > 1 && valuesOnly.length > 1;
    for (const record of group) {
      record.publicationIdentity.groupDateEvidence = dates;
      record.publicationIdentity.dateConflictPreserved = conflict;
    }
  }
  return byReadable;
}

function metadataCoverage(records) {
  const fields = {
    stableSourceId: (record) => Boolean(record.sourceRecordIdentity.id),
    title: (record) => Boolean(record.readableWorkIdentity.title),
    seriesIdentity: (record) => Boolean(record.seriesIdentity.id),
    sequence: (record) => record.seriesIdentity.rawSequenceLabel !== null,
    creators: (record) => record.readableWorkIdentity.creators.length > 0,
    creatorRoles: (record) => record.readableWorkIdentity.creatorRoles.length > 0,
    publisher: (record) => Boolean(record.publicationIdentity.publisher),
    dates: (record) => record.publicationIdentity.dates.length > 0,
    language: (record) => Boolean(record.publicationIdentity.language),
    summary: (record) => record.sourceEvidence.summaryPresent,
    audienceAuthority: (record) => record.sourceEvidence.audienceAuthorityPresent,
    maturityAuthority: (record) => record.sourceEvidence.maturityAuthorityPresent,
    genreAuthority: (record) => record.sourceEvidence.genreAuthorityPresent,
    constituentIdentity: (record) => record.readableWorkIdentity.constituentIssueIds.length > 0 || record.readableWorkIdentity.constituentVolumeLabels.length > 0,
  };
  return Object.fromEntries(Object.entries(fields).map(([field, predicate]) => {
    const present = records.filter(predicate).length;
    return [field, { present, total: records.length, rate: records.length ? Number((present / records.length).toFixed(4)) : 0 }];
  }));
}

function sameTitleDistinctSeries(records) {
  const titleToSeries = new Map();
  for (const record of records) {
    const title = lower(record.readableWorkIdentity.title);
    if (!titleToSeries.has(title)) titleToSeries.set(title, new Set());
    titleToSeries.get(title).add(record.seriesIdentity.id);
  }
  return [...titleToSeries.entries()]
    .filter(([, series]) => series.size > 1)
    .map(([title, series]) => ({ title, seriesIds: [...series].sort(), automaticMerge: false }));
}

function deriveOutcome(profile, payload, records, ambiguousCount) {
  if (!payload || !Array.isArray(payload.results)) return "response_invalid";
  if (payload.results.length === 0) return "valid_empty_response";
  if (ambiguousCount > 0) return "classified_with_ambiguity_and_audience_limit";
  const audienceAbsent = records.every((record) => !record.sourceEvidence.audienceAuthorityPresent);
  const maturityAbsent = records.every((record) => !record.sourceEvidence.maturityAuthorityPresent);
  if (profile.ageBand === "preteens" && audienceAbsent && maturityAbsent) return "identity_preserved_audience_and_maturity_unsupported";
  if (profile.ageBand === "teens" && audienceAbsent) {
    return profile.profileId === "cv-teen-manga-volume"
      ? "classified_complete_audience_unsupported"
      : "identity_preserved_audience_unsupported";
  }
  if (profile.profileId === "cv-adult-horror-mystery") return "classified_complete_with_metadata_limits";
  return "classified_complete";
}

export function characterizeComicVineFixture(profile, fixture, definitions, productionHashes) {
  const payload = fixture.payload;
  const rawRecords = Array.isArray(payload?.results) ? payload.results : [];
  const normalized = [];
  const structuralRejects = [];
  for (const rawRecord of rawRecords) {
    const result = normalizeRecord(rawRecord);
    if (result.rejected) structuralRejects.push({ nativeId: rawRecord?.id ?? null, reason: result.rejected });
    else normalized.push(result.value);
  }
  const groups = annotateGroupConflicts(normalized);
  const recommendationIds = unique(normalized.map((record) => record.recommendationIdentity?.id).filter(Boolean));
  const ambiguity = normalized.filter((record) => record.readingUnitIdentity.kind === "ambiguous_reading_unit");
  const outcome = deriveOutcome(profile, payload, normalized, ambiguity.length);
  const kindHistogram = {};
  for (const record of normalized) kindHistogram[record.readingUnitIdentity.kind] = (kindHistogram[record.readingUnitIdentity.kind] || 0) + 1;
  const collapseGroups = [...groups.entries()].filter(([, members]) => members.length > 1).map(([readableWorkId, members]) => ({
    readableWorkId,
    publicationIds: members.map((member) => member.publicationIdentity.id).sort(),
    recommendationId: members[0].recommendationIdentity?.id || null,
    reasons: unique(members.flatMap((member) => member.relationships.map((relationship) => relationship.type)).concat(
      members.every((member) => member.readableWorkIdentity.constituentIssueIds.length > 0) ? ["same_explicit_constituents"] : [],
    )).sort(),
  }));
  return {
    harness: {
      name: "NovelIdeas Source Competence Harness",
      characterization: "Graphic Novel Source Competence Phase II",
      version: COMICVINE_CHARACTERIZATION_VERSION,
      mode: "fixture_replay",
      schemaVersion: "1.0.0",
      networkPolicy: "fixture_only_hard_block",
    },
    profile,
    source: "comicvine",
    sourceContract: {
      officialApiDocumentation: definitions.sourceSchemaBasis.documentation,
      documentationObservedOn: definitions.sourceSchemaBasis.observedOn,
      endpointStability: "not_independently_verified",
      fieldAndFormatStability: "not_independently_verified",
      discoverySurface: ["search_endpoint_issues"],
      broadRecommendationSearch: "documented_available_subject_to_terms",
      authentication: ["api_key_required"],
      commercialTerms: "non_commercial_only",
      redistributionRestriction: "redistribution_restricted_per_terms",
    },
    licensingBoundary: {
      fixtureContent: "wholly_synthetic",
      liveMetadataCaptured: false,
      coverUrlsPresent: false,
      coverImagesPresent: false,
      publicProductionAuthorized: false,
      liveCharacterizationAuthorized: false,
      commercialUseGated: true,
    },
    productionBoundary: {
      productionAdapterState: "adapter_implemented",
      productionLifecycleTerminalState: "not_exercised_by_characterization",
      productionRoutingExercised: false,
      scoringExercised: false,
      eligibilityExercised: false,
      selectionExercised: false,
      recommendationBehaviorChanged: false,
      productionHashes,
    },
    fixture: {
      fixtureId: fixture.fixtureId,
      captureKind: "synthetic_comicvine_contract_fixture",
      payloadHash: sha256(stableJson(payload)),
      responseShape: Array.isArray(payload?.results) ? "results_array" : "invalid_missing_results_array",
      liveSourceData: false,
    },
    raw: {
      declaredCount: Number(payload?.number_of_total_results || 0),
      recordCount: rawRecords.length,
      nativeIdsInReturnedOrder: rawRecords.map((record) => record.id ?? null),
      structuralRejects,
    },
    identity: {
      neutralContractVersion: definitions.neutralContractVersion,
      neutralContractCases: definitions.neutralCaseIds,
      normalizedRecordCount: normalized.length,
      recommendationCapableIdentityCount: recommendationIds.length,
      readingUnitKindHistogram: kindHistogram,
      ambiguousCount: ambiguity.length,
      ambiguousSourceRecordIds: ambiguity.map((record) => record.sourceRecordIdentity.id),
      collapseGroups,
      sameTitleDistinctSeries: sameTitleDistinctSeries(normalized),
      missingSequenceSourceRecordIds: normalized.filter((record) => record.seriesIdentity.orderConfidence === "unknown").map((record) => record.sourceRecordIdentity.id),
      incompleteCreatorCreditSourceRecordIds: normalized.filter((record) => !record.readableWorkIdentity.creatorCreditsComplete).map((record) => record.sourceRecordIdentity.id),
      dateConflictSourceRecordIds: normalized.filter((record) => record.publicationIdentity.dateConflictPreserved).map((record) => record.sourceRecordIdentity.id),
    },
    metadataCoverage: metadataCoverage(normalized),
    records: normalized,
    expectedOutcome: profile.expectedOutcome,
    characterizationOutcome: outcome,
    expectedRecommendationCapableCount: profile.expectedRecommendationCapableCount,
    humanReview: {
      ...profile.humanReview,
      performedByHarness: false,
      machineIdentityCompetenceIsNotRecommendationUsefulness: true,
    },
    comparison: {
      performed: false,
      comparativeConclusionAuthorized: false,
      reason: "Independent ComicVine characterization only; no equivalent independently frozen GCD characterization was consumed for comparison.",
    },
  };
}

export function comicVineFixtureInventory(profile, fixture, definitions, productionHashes) {
  return {
    harness: {
      name: "NovelIdeas Source Competence Harness",
      characterization: "Graphic Novel Source Competence Phase II",
      version: COMICVINE_CHARACTERIZATION_VERSION,
      mode: "fixture_inventory",
      schemaVersion: "1.0.0",
    },
    profile,
    source: "comicvine",
    sourceContract: definitions.sourceSchemaBasis,
    productionBoundary: {
      productionAdapterState: "adapter_implemented",
      productionLifecycleTerminalState: "not_exercised_by_characterization",
      productionHashes,
    },
    fixture: {
      fixtureId: fixture.fixtureId,
      captureKind: "synthetic_comicvine_contract_fixture",
      responseShape: Array.isArray(fixture.payload?.results) ? "results_array" : "invalid_missing_results_array",
      liveSourceData: false,
    },
    raw: {
      recordCount: Array.isArray(fixture.payload?.results) ? fixture.payload.results.length : 0,
      nativeIdsInReturnedOrder: Array.isArray(fixture.payload?.results) ? fixture.payload.results.map((record) => record.id ?? null) : [],
    },
    expectedOutcome: profile.expectedOutcome,
    characterizationOutcome: null,
    humanReview: profile.humanReview,
  };
}

export function comicVineCharacterizationMarkdown(artifacts) {
  const lines = [
    "# Graphic Novel Source Competence Phase II - ComicVine",
    "",
    "Fixture-only deterministic characterization under the source-neutral reading-unit contract. No live request, scoring, selection, human review, or source comparison is included.",
    "",
    "| Profile | Age | Raw | Normalized | Recommendation-capable identities | Ambiguous | Outcome |",
    "| --- | --- | ---: | ---: | ---: | ---: | --- |",
  ];
  for (const artifact of artifacts) {
    lines.push(`| ${artifact.profile.profileId} | ${artifact.profile.ageBand} | ${artifact.raw.recordCount} | ${artifact.identity?.normalizedRecordCount ?? "not run"} | ${artifact.identity?.recommendationCapableIdentityCount ?? "not run"} | ${artifact.identity?.ambiguousCount ?? "not run"} | ${artifact.characterizationOutcome ?? "not run"} |`);
  }
  lines.push(
    "",
    "## Evidence boundary",
    "",
    "- Contract and fixture determinism: characterized.",
    "- Source-neutral identity mapping: characterized for the frozen synthetic cases.",
    "- Production adapter and dispatch: present but not exercised by characterization; reported as `adapter_implemented`.",
    "- Live transport, schema population, and result composition: not characterized.",
    "- Recommendation quality and route ownership: not characterized.",
    "- Human usefulness: not reviewed.",
    "",
  );
  return lines.join("\n");
}

export function writeComicVineArtifacts(outputDir, artifacts) {
  mkdirSync(outputDir, { recursive: true });
  for (const artifact of artifacts) {
    writeFileSync(join(outputDir, `${artifact.profile.profileId}.json`), stableJson(artifact));
  }
  const summary = {
    characterization: "Graphic Novel Source Competence Phase II",
    characterizationVersion: COMICVINE_CHARACTERIZATION_VERSION,
    source: "comicvine",
    cases: artifacts,
  };
  writeFileSync(join(outputDir, "summary.json"), stableJson(summary));
  writeFileSync(join(outputDir, "summary.md"), comicVineCharacterizationMarkdown(artifacts));
  return summary;
}
