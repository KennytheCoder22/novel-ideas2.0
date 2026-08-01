/**
 * Adapter: Source Competence Artifact → Comparison Harness Envelope
 *
 * Converts a frozen source-competence characterization summary (produced by the
 * GCD or ComicVine characterizer) into the comparison-harness source-envelope
 * format used by `compare.mjs`.
 *
 * This adapter may only consume frozen characterization artifacts. It must not
 * import production code, call external services, or alter comparison methodology.
 *
 * Mapping decisions:
 * - workKey = recommendationIdentity.id  (stable cross-case identity; no canonical
 *   cross-source work key exists for synthetic fixtures)
 * - Records are de-duplicated by recommendationIdentity.id (keep first in raw
 *   return order); variant publications collapsed to one representative candidate
 * - Records with recommendationCapable=false are excluded → diagnostics.dropCounts
 * - All creator lists are preserved as-is; workKey resolution avoids identity
 *   failures for records with empty creators
 * - terminalState is the characterizationOutcome string (passthrough, not remapped
 *   to a recommendation lifecycle state)
 * - profileId on each source is set to the shared matrixProfileId so the comparison
 *   harness can verify both sources describe the same logical profile
 */

export const ADAPTER_VERSION = "1.0.0";

/**
 * Compute the shared profile key used for matching GCD and CV cases.
 * - For content profiles: use matrixProfileId
 * - For operational controls (matrixProfileId = null): use "control:" + expectedOutcome
 */
function sharedProfileKey(charCase) {
  if (charCase.profile.matrixProfileId) return charCase.profile.matrixProfileId;
  return `control:${charCase.profile.expectedOutcome || charCase.characterizationOutcome}`;
}

/**
 * Extract publication year (as integer) from the first date entry, or null.
 */
function extractYear(dates) {
  if (!Array.isArray(dates) || dates.length === 0) return null;
  const raw = dates[0]?.value;
  if (!raw) return null;
  const parsed = parseInt(String(raw).slice(0, 4), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Adapt one characterization case into a comparison-harness source object.
 *
 * @param {string} sourceId   - Source identifier ("gcd" or "comicvine")
 * @param {object} charCase   - One case from a frozen characterization summary
 * @param {string} sharedProfileId - The shared profile ID for this comparison case
 * @returns {object} Source object conforming to the comparison fixture input contract
 */
export function adaptCharacterizationCase(sourceId, charCase, sharedProfileId) {
  const profileId = sharedProfileId || charCase.profile.matrixProfileId || charCase.profile.profileId;
  const records = charCase.records || [];

  const dropCounts = {};
  const seen = new Set();
  const selected = [];

  for (const record of records) {
    const capable = record.readingUnitIdentity?.recommendationCapable === true;
    if (!capable) {
      const kind = record.readingUnitIdentity?.kind || "unknown";
      dropCounts[kind] = (dropCounts[kind] || 0) + 1;
      continue;
    }

    const recId = record.recommendationIdentity.id;
    if (seen.has(recId)) {
      dropCounts.collapsed_publication_variant =
        (dropCounts.collapsed_publication_variant || 0) + 1;
      continue;
    }
    seen.add(recId);

    const publicationYear = extractYear(record.publicationIdentity?.dates);
    const seriesKey = record.seriesIdentity?.id || null;

    selected.push({
      stableId: recId,
      workKey: recId,
      isbn13: record.publicationIdentity?.identifier || null,
      title: record.readableWorkIdentity.title,
      creators: record.readableWorkIdentity.creators || [],
      description: null,
      genres: [],
      themes: [],
      formats: [record.readingUnitIdentity.kind],
      publicationYear,
      seriesKey,
      selectedRank: selected.length + 1,
      queryProvenance: {
        query: `synthetic_fixture_competence_replay:${profileId}`,
        queryFamily: "source_competence_fixture",
        fallback: false,
      },
      documentEvidence: { positive: [], negative: [] },
    });
  }

  return {
    source: sourceId,
    artifactId: `source-competence:${sourceId}:${profileId}:frozen`,
    profileId: profileId,
    mode: "source_competence_fixture_replay",
    actualActivation: "attempted",
    terminalState: charCase.characterizationOutcome,
    targetSlateSize: charCase.profile.expectedRecommendationCapableCount,
    failureReason: null,
    diagnostics: { dropCounts, rejectionCounts: {} },
    selected,
  };
}

/**
 * Build one comparison case by pairing a GCD case with its ComicVine equivalent.
 * Matching is by matrixProfileId (content profiles) or by characterizationOutcome
 * (operational controls with matrixProfileId = null).
 *
 * @param {object} gcdCase    - GCD characterization case
 * @param {object} cvCase     - ComicVine characterization case with the same shared key
 * @returns {object} Comparison case conforming to the comparison fixture input contract
 */
export function buildComparisonCase(gcdCase, cvCase) {
  const gcdKey = sharedProfileKey(gcdCase);
  const cvKey = sharedProfileKey(cvCase);
  if (gcdKey !== cvKey) {
    throw new Error(
      `Profile mismatch: GCD shared key "${gcdKey}" !== CV "${cvKey}"`
    );
  }

  // For operational controls, use a deterministic caseId from the key.
  // For content profiles, use the matrixProfileId directly.
  const caseId = gcdCase.profile.matrixProfileId || gcdKey.replace("control:", "control-");
  const profileId = gcdCase.profile.matrixProfileId || caseId;

  return {
    caseId,
    profile: {
      profileId,
      ageBand: gcdCase.profile.ageBand,
      readerIntentSummary: gcdCase.profile.intent,
      positiveSignals: [],
      negativeSignals: [],
      formatIntent: ["graphic_novel"],
    },
    sources: [
      adaptCharacterizationCase("gcd", gcdCase, profileId),
      adaptCharacterizationCase("comicvine", cvCase, profileId),
    ],
    humanReviewArtifacts: [],
  };
}

/**
 * Build a full comparison fixture from a GCD summary and a ComicVine summary.
 *
 * @param {object} gcdSummary   - Parsed gcd-phase1-summary.json
 * @param {object} cvSummary    - Parsed comicvine-phase2-summary.json
 * @param {object} opts         - { fixtureId, captureKind }
 * @returns {object} Comparison fixture conforming to schemaVersion "1.0.0"
 */
export function buildComparisonFixture(gcdSummary, cvSummary, opts = {}) {
  const {
    fixtureId = "gcd-vs-comicvine-fixture-class-v1",
    captureKind = "source_competence_fixture_class_comparison",
  } = opts;

  const gcdCases = gcdSummary.cases;
  const cvCases = cvSummary.cases;

  // Index ComicVine cases by shared key for O(1) lookup
  const cvByKey = new Map(
    cvCases.map((c) => [sharedProfileKey(c), c])
  );

  const cases = [];
  for (const gcdCase of gcdCases) {
    const key = sharedProfileKey(gcdCase);
    const cvCase = cvByKey.get(key);
    if (!cvCase) {
      throw new Error(
        `comparison_unavailable_profile_asymmetry: GCD profile with key "${key}" has no ComicVine equivalent`
      );
    }
    cases.push(buildComparisonCase(gcdCase, cvCase));
  }

  // Verify CV has no extra profiles
  const gcdKeys = new Set(gcdCases.map(sharedProfileKey));
  for (const cvCase of cvCases) {
    if (!gcdKeys.has(sharedProfileKey(cvCase))) {
      throw new Error(
        `comparison_unavailable_profile_asymmetry: CV profile with key "${sharedProfileKey(cvCase)}" has no GCD equivalent`
      );
    }
  }

  return {
    schemaVersion: "1.0.0",
    fixtureId,
    captureKind,
    adapterVersion: ADAPTER_VERSION,
    evidenceClass: "Fixture Class",
    equivalenceCertification: "comparison_valid",
    phaseIArtifact: "scripts/source-competence/frozen/gcd-phase1-summary.json",
    phaseIIArtifact: "scripts/source-competence/frozen/comicvine-phase2-summary.json",
    cases,
  };
}
