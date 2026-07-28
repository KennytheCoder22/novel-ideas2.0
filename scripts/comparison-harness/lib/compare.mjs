import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const COMPARISON_SCHEMA_VERSION = "1.0.0";

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}

export function stableJson(value) {
  return `${JSON.stringify(stable(value), null, 2)}\n`;
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalized(value) {
  return String(value || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function values(value) {
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : [];
}

function round(value) {
  return Number(Number(value || 0).toFixed(4));
}

export function candidateIdentity(candidate) {
  const workKey = normalized(candidate.workKey);
  if (workKey) return { key: `work:${workKey}`, strategy: "canonical_work_key" };
  const isbn13 = normalized(candidate.isbn13);
  if (isbn13) return { key: `isbn13:${isbn13}`, strategy: "isbn13" };
  const title = normalized(candidate.title);
  const creator = normalized(values(candidate.creators)[0]);
  if (!title || !creator) throw new Error(`Candidate ${candidate.stableId || candidate.title || "unknown"} lacks a comparable identity`);
  return { key: `title_creator:${title}|${creator}`, strategy: "normalized_title_first_creator" };
}

function validateSource(source, profileId) {
  for (const field of ["source", "artifactId", "profileId", "mode", "actualActivation", "terminalState", "targetSlateSize", "selected"]) {
    if (!(field in source)) throw new Error(`${source.source || "unknown source"}: missing ${field}`);
  }
  if (source.profileId !== profileId) throw new Error(`${source.source}: profile ${source.profileId} does not match ${profileId}`);
  if (!Array.isArray(source.selected)) throw new Error(`${source.source}: selected must be an array`);
  for (const candidate of source.selected) {
    if (!candidate.stableId || !candidate.title || !Array.isArray(candidate.creators)) throw new Error(`${source.source}: malformed selected candidate`);
    candidateIdentity(candidate);
  }
}

export function validateFixture(fixture) {
  if (fixture.schemaVersion !== COMPARISON_SCHEMA_VERSION) throw new Error(`Unsupported comparison fixture schema ${fixture.schemaVersion}`);
  if (!fixture.fixtureId || !Array.isArray(fixture.cases) || !fixture.cases.length) throw new Error("Comparison fixture requires fixtureId and cases");
  const caseIds = new Set();
  for (const comparisonCase of fixture.cases) {
    if (!comparisonCase.caseId || caseIds.has(comparisonCase.caseId)) throw new Error(`Duplicate or missing case ID: ${comparisonCase.caseId}`);
    caseIds.add(comparisonCase.caseId);
    if (!comparisonCase.profile?.profileId) throw new Error(`${comparisonCase.caseId}: profile missing`);
    if (!Array.isArray(comparisonCase.sources) || comparisonCase.sources.length !== 2) throw new Error(`${comparisonCase.caseId}: exactly two sources are required`);
    if (comparisonCase.sources[0].source === comparisonCase.sources[1].source) throw new Error(`${comparisonCase.caseId}: sources must differ`);
    for (const source of comparisonCase.sources) validateSource(source, comparisonCase.profile.profileId);
    if (!Array.isArray(comparisonCase.humanReviewArtifacts || [])) throw new Error(`${comparisonCase.caseId}: humanReviewArtifacts must be an array`);
  }
  return fixture;
}

function metadataSummary(source) {
  const fields = {
    stableIdentifier: (candidate) => Boolean(candidate.workKey || candidate.isbn13 || candidate.stableId),
    title: (candidate) => Boolean(String(candidate.title || "").trim()),
    creators: (candidate) => values(candidate.creators).length > 0,
    description: (candidate) => Boolean(String(candidate.description || "").trim()),
    genreOrTheme: (candidate) => values(candidate.genres).length + values(candidate.themes).length > 0,
    format: (candidate) => values(candidate.formats).length > 0,
    publicationYear: (candidate) =>
      candidate.publicationYear !== null &&
      candidate.publicationYear !== "" &&
      Number.isFinite(Number(candidate.publicationYear)),
    queryProvenance: (candidate) => Boolean(candidate.queryProvenance && (candidate.queryProvenance.query || candidate.queryProvenance.queryFamily)),
    documentEvidence: (candidate) => values(candidate.documentEvidence?.positive).length + values(candidate.documentEvidence?.negative).length > 0,
  };
  const fieldCoverage = {};
  const missingByCandidate = [];
  let present = 0;
  for (const [field, check] of Object.entries(fields)) {
    const count = source.selected.filter(check).length;
    fieldCoverage[field] = { present: count, total: source.selected.length, rate: source.selected.length ? round(count / source.selected.length) : 0 };
    present += count;
  }
  for (const candidate of source.selected) {
    const missingFields = Object.entries(fields).filter(([, check]) => !check(candidate)).map(([field]) => field);
    if (missingFields.length) missingByCandidate.push({ stableId: candidate.stableId, title: candidate.title, missingFields });
  }
  const denominator = source.selected.length * Object.keys(fields).length;
  return { measuredFieldCount: Object.keys(fields).length, presentFieldCount: present, possibleFieldCount: denominator, completenessRate: denominator ? round(present / denominator) : 0, fieldCoverage, missingByCandidate };
}

function diversitySummary(source) {
  const identities = source.selected.map((candidate) => candidateIdentity(candidate).key);
  const creators = new Set(source.selected.flatMap((candidate) => values(candidate.creators).map(normalized)).filter(Boolean));
  const genres = new Set(source.selected.flatMap((candidate) => values(candidate.genres).map(normalized)).filter(Boolean));
  const formats = new Set(source.selected.flatMap((candidate) => values(candidate.formats).map(normalized)).filter(Boolean));
  const series = new Set(source.selected.map((candidate) => normalized(candidate.seriesKey)).filter(Boolean));
  const queryFamilies = {};
  for (const candidate of source.selected) {
    const family = String(candidate.queryProvenance?.queryFamily || "unknown");
    queryFamilies[family] = Number(queryFamilies[family] || 0) + 1;
  }
  return {
    uniqueCreators: creators.size,
    uniqueGenres: genres.size,
    uniqueFormats: formats.size,
    uniqueSeries: series.size,
    duplicateComparisonIdentityCount: identities.length - new Set(identities).size,
    queryFamilyContribution: queryFamilies,
    fallbackSelectedCount: source.selected.filter((candidate) => Boolean(candidate.queryProvenance?.fallback)).length,
  };
}

function reviewSummary(comparisonCase, source, sourceArtifactSha256) {
  const all = comparisonCase.humanReviewArtifacts || [];
  const sourceReviews = all.filter((review) => review.source === source.source && review.profileId === comparisonCase.profile.profileId);
  const valid = sourceReviews.filter((review) => review.sourceArtifactSha256 === sourceArtifactSha256);
  const selectedIds = new Set(source.selected.map((candidate) => candidate.stableId));
  const completed = valid.filter((review) => review.reviewStatus === "completed" && selectedIds.has(review.candidateStableId));
  const fitClassifications = {};
  const concernCategories = {};
  for (const review of completed) {
    const fit = String(review.fitClassification || "missing");
    fitClassifications[fit] = Number(fitClassifications[fit] || 0) + 1;
    for (const concern of values(review.concernCategories)) concernCategories[concern] = Number(concernCategories[concern] || 0) + 1;
  }
  return {
    status: completed.length ? "partially_or_fully_reviewed" : "not_reviewed",
    selectedCandidateCount: source.selected.length,
    completedReviewCount: completed.length,
    coverageRate: source.selected.length ? round(completed.length / source.selected.length) : 0,
    invalidArtifactHashReviewCount: sourceReviews.length - valid.length,
    fitClassifications,
    concernCategories,
    claimsHumanUsefulness: false,
  };
}

function candidateReference(candidate) {
  const identity = candidateIdentity(candidate);
  return { stableId: candidate.stableId, title: candidate.title, creators: values(candidate.creators), selectedRank: candidate.selectedRank, comparisonIdentity: identity.key, identityStrategy: identity.strategy, queryFamily: candidate.queryProvenance?.queryFamily || "unknown" };
}

function sourceSummary(comparisonCase, source) {
  const sourceArtifactSha256 = sha256(stableJson(source));
  const target = Number(source.targetSlateSize || 0);
  const selectedCount = source.selected.length;
  return {
    source: source.source,
    artifactId: source.artifactId,
    sourceArtifactSha256,
    mode: source.mode,
    actualActivation: source.actualActivation,
    terminalState: source.terminalState,
    failureReason: source.failureReason || null,
    slate: { selectedCount, target, underfilled: selectedCount < target, underfillCount: Math.max(0, target - selectedCount) },
    diagnostics: source.diagnostics || { dropCounts: {}, rejectionCounts: {} },
    metadata: metadataSummary(source),
    diversity: diversitySummary(source),
    humanReview: reviewSummary(comparisonCase, source, sourceArtifactSha256),
  };
}

function compareCase(comparisonCase) {
  const [sourceA, sourceB] = comparisonCase.sources;
  const aByIdentity = new Map(sourceA.selected.map((candidate) => [candidateIdentity(candidate).key, candidate]));
  const bByIdentity = new Map(sourceB.selected.map((candidate) => [candidateIdentity(candidate).key, candidate]));
  const overlapKeys = [...aByIdentity.keys()].filter((key) => bByIdentity.has(key)).sort();
  const uniqueAKeys = [...aByIdentity.keys()].filter((key) => !bByIdentity.has(key)).sort();
  const uniqueBKeys = [...bByIdentity.keys()].filter((key) => !aByIdentity.has(key)).sort();
  const unionSize = new Set([...aByIdentity.keys(), ...bByIdentity.keys()]).size;
  const overlaps = overlapKeys.map((key) => {
    const a = aByIdentity.get(key);
    const b = bByIdentity.get(key);
    const strategy = candidateIdentity(a).strategy;
    return {
      comparisonIdentity: key,
      identityStrategy: strategy,
      sourceA: candidateReference(a),
      sourceB: candidateReference(b),
      rankDistance: Math.abs(Number(a.selectedRank || 0) - Number(b.selectedRank || 0)),
    };
  });
  const sourceSummaries = [sourceSummary(comparisonCase, sourceA), sourceSummary(comparisonCase, sourceB)];
  return {
    caseId: comparisonCase.caseId,
    profile: comparisonCase.profile,
    sources: sourceSummaries,
    overlap: {
      overlapCount: overlaps.length,
      unionSize,
      jaccard: unionSize ? round(overlaps.length / unionSize) : 0,
      sourceAShare: sourceA.selected.length ? round(overlaps.length / sourceA.selected.length) : 0,
      sourceBShare: sourceB.selected.length ? round(overlaps.length / sourceB.selected.length) : 0,
      records: overlaps,
    },
    uniqueContribution: {
      [sourceA.source]: uniqueAKeys.map((key) => candidateReference(aByIdentity.get(key))),
      [sourceB.source]: uniqueBKeys.map((key) => candidateReference(bByIdentity.get(key))),
    },
    interpretationBoundary: "Machine comparison only; unique and overlapping candidates are not human quality judgments.",
  };
}

export function compareFixture(fixtureInput) {
  const fixture = validateFixture(fixtureInput);
  const inputSha256 = sha256(stableJson(fixture));
  const result = {
    harness: { name: "NovelIdeas Source Comparison Harness", version: COMPARISON_SCHEMA_VERSION, mode: "fixture", deterministic: true, productionCodeImported: false },
    fixture: { fixtureId: fixture.fixtureId, captureKind: fixture.captureKind, inputSha256 },
    comparisonRunId: `comparison-${sha256(`${fixture.fixtureId}:${inputSha256}`).slice(0, 16)}`,
    comparisons: fixture.cases.map(compareCase),
    humanUsefulnessClaim: "not_established_without_completed_hash_linked_human_review",
  };
  return result;
}

export function comparisonMarkdown(result) {
  const lines = [
    "# Source Comparison Harness - Phase 1",
    "",
    `Fixture: \`${result.fixture.fixtureId}\``,
    "",
    "Machine comparison only. Human usefulness is not established without completed, hash-linked Human Review artifacts.",
    "",
    "| Case | Source | Terminal state | Slate | Underfill | Metadata coverage | Human review |",
    "| --- | --- | --- | ---: | ---: | ---: | --- |",
  ];
  for (const comparison of result.comparisons) {
    for (const source of comparison.sources) {
      lines.push(`| ${comparison.caseId} | ${source.source} | ${source.terminalState} | ${source.slate.selectedCount}/${source.slate.target} | ${source.slate.underfillCount} | ${source.metadata.completenessRate} | ${source.humanReview.status} (${source.humanReview.completedReviewCount}/${source.humanReview.selectedCandidateCount}) |`);
    }
  }
  for (const comparison of result.comparisons) {
    const [sourceA, sourceB] = comparison.sources;
    lines.push("", `## ${comparison.caseId}`, "", comparison.profile.readerIntentSummary, "", `Overlap: **${comparison.overlap.overlapCount}** of union **${comparison.overlap.unionSize}** (Jaccard ${comparison.overlap.jaccard}).`, "");
    if (comparison.overlap.records.length) {
      lines.push("### Shared recommendations", "", "| Title | Identity strategy | Ranks |", "| --- | --- | --- |");
      for (const record of comparison.overlap.records) lines.push(`| ${record.sourceA.title} | ${record.identityStrategy} | ${sourceA.source}: ${record.sourceA.selectedRank}; ${sourceB.source}: ${record.sourceB.selectedRank} |`);
      lines.push("");
    }
    lines.push("### Unique contribution", "");
    for (const source of [sourceA.source, sourceB.source]) {
      const titles = comparison.uniqueContribution[source].map((candidate) => candidate.title);
      lines.push(`- ${source}: ${titles.length ? titles.join("; ") : "none"}`);
    }
    lines.push("", "### Route-family contribution", "");
    for (const source of comparison.sources) lines.push(`- ${source.source}: ${Object.entries(source.diversity.queryFamilyContribution).map(([family, count]) => `${family}=${count}`).join(", ") || "none"}`);
    lines.push("", "### Source-specific failure", "");
    for (const source of comparison.sources) lines.push(`- ${source.source}: ${source.failureReason || "none"}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function writeComparisonArtifacts(outputDir, result) {
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(join(outputDir, "comparison.json"), stableJson(result));
  writeFileSync(join(outputDir, "comparison.md"), comparisonMarkdown(result));
}
