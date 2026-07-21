function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pct(numerator, denominator) {
  if (!denominator) return 0;
  return Number(((numerator / denominator) * 100).toFixed(1));
}

function increment(map, key, amount = 1) {
  map[key] = toNumber(map[key]) + amount;
}

function categoriesBlob(categories) {
  return (Array.isArray(categories) ? categories : [])
    .map((value) => String(value || "").toLowerCase())
    .join(" | ");
}

export function mapPublicationShapeBucket(shape, categories) {
  const blob = categoriesBlob(categories);
  if (shape === "novel" || shape === "series_installment") return "narrative_novel";
  if (shape === "story_collection") return "short_story_collection";
  if (shape === "anthology" || shape === "essay_collection") return "anthology";
  if (shape === "critical_study") {
    if (/\bliterary criticism\b|\bhistory and criticism\b/.test(blob)) return "literary_criticism";
    return "critical_study";
  }
  if (shape === "writing_guide") return "writing_guide";
  if (
    shape === "reference" ||
    shape === "readers_advisory" ||
    shape === "generic_category_catalog" ||
    shape === "public_domain_compilation" ||
    shape === "periodical"
  ) return "reference_work";
  if (
    shape === "nonfiction" ||
    shape === "academic_text" ||
    shape === "literary_history" ||
    shape === "production_history" ||
    shape === "genre_survey" ||
    shape === "interview_collection" ||
    shape === "author_commentary" ||
    shape === "miscellany"
  ) return "nonfiction";
  if (shape === "unknown") return "unknown_insufficient_narrative_identity";
  return "other";
}

function emptyDistribution() {
  return {
    narrative_novel: 0,
    short_story_collection: 0,
    anthology: 0,
    critical_study: 0,
    literary_criticism: 0,
    writing_guide: 0,
    reference_work: 0,
    nonfiction: 0,
    unknown_insufficient_narrative_identity: 0,
    other: 0,
  };
}

export function analyzeQueryPopulation({
  family,
  queryLabel,
  query,
  rawRows,
  classifyRow,
}) {
  const distribution = emptyDistribution();
  const rejectionHistogram = {};
  const rows = Array.isArray(rawRows) ? rawRows : [];

  let narrativeCandidates = 0;
  let publicationPasses = 0;

  for (const row of rows) {
    const classification = classifyRow(row);
    const bucket = mapPublicationShapeBucket(classification.shape, classification.categories);
    increment(distribution, bucket);

    if (classification.isNarrativeCandidate) narrativeCandidates += 1;
    if (classification.publicationPass) {
      publicationPasses += 1;
    } else if (classification.rejectionReason) {
      increment(rejectionHistogram, classification.rejectionReason);
    }
  }

  const raw = rows.length;
  if (publicationPasses > narrativeCandidates) narrativeCandidates = publicationPasses;
  const scoredCandidates = publicationPasses;
  const selectedRecommendations = publicationPasses;
  const row = {
    family,
    queryLabel,
    query,
    rawApiResults: raw,
    narrativeCandidates,
    publicationIdentityPasses: publicationPasses,
    scoredCandidates,
    selectedRecommendations,
    narrativeYield: pct(narrativeCandidates, raw),
    publicationSurvival: pct(publicationPasses, narrativeCandidates),
    selectionEfficiency: pct(selectedRecommendations, scoredCandidates),
    overallRecallEfficiency: pct(selectedRecommendations, raw),
    publicationShapeDistributionCount: distribution,
    publicationShapeDistributionPercent: Object.fromEntries(
      Object.entries(distribution).map(([key, count]) => [key, pct(count, raw)]),
    ),
    rejectionHistogram,
  };

  let dominantReject = "none";
  let dominantRejectCount = 0;
  for (const key of Object.keys(rejectionHistogram).sort()) {
    const count = toNumber(rejectionHistogram[key]);
    if (count > dominantRejectCount) {
      dominantRejectCount = count;
      dominantReject = key;
    }
  }
  row.dominantReject = dominantReject;
  row.dominantRejectCount = dominantRejectCount;
  return row;
}

export function inferPrimaryCause(rowsForFamily) {
  const rows = Array.isArray(rowsForFamily) ? rowsForFamily : [];
  if (rows.length === 0) return "combination";
  const baseline = rows.find((row) => row.queryLabel === "current") || rows[0];
  const alternatives = rows.filter((row) => row !== baseline);
  const bestByPass = [...alternatives].sort((a, b) =>
    b.publicationIdentityPasses - a.publicationIdentityPasses ||
    b.narrativeYield - a.narrativeYield,
  )[0];

  const baselineUnknown = toNumber(baseline.rejectionHistogram.publication_shape_unknown_insufficient_narrative_identity)
    + toNumber(baseline.rejectionHistogram.publication_shape_unknown_insufficient_story_evidence);
  const baselineShapeRejects = Object.entries(baseline.rejectionHistogram)
    .filter(([key]) => key.startsWith("publication_shape_"))
    .reduce((sum, [, value]) => sum + toNumber(value), 0);

  if (bestByPass) {
    const passGain = bestByPass.publicationIdentityPasses - baseline.publicationIdentityPasses;
    const survivalGain = bestByPass.publicationSurvival - baseline.publicationSurvival;
    if (passGain >= 5 || survivalGain >= 20) return "poor query wording";
  }

  const allVeryLow = rows.every((row) => row.publicationIdentityPasses <= 2 && row.narrativeYield <= 8);
  if (allVeryLow) return "google books catalog bias";

  if (baselineShapeRejects > 0 && baselineUnknown * 2 >= baselineShapeRejects) {
    return "overly strict publication-identity rules";
  }

  return "combination";
}

export function sortQueriesForComparison(rowsForFamily) {
  return [...rowsForFamily].sort((a, b) =>
    b.publicationIdentityPasses - a.publicationIdentityPasses ||
    b.narrativeYield - a.narrativeYield ||
    a.query.localeCompare(b.query),
  );
}
