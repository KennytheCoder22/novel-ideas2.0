import type { AgeBandV2 } from "../../app/recommender-v2";
import {
  MELANIES_CONCEPTS,
  MELANIE_SEMANTIC_TAXONOMY,
  completeMelanieRanking,
  createInitialMelanieGame,
  melanieSemanticSimilarity,
  selectMelanieConcepts,
  type MelanieAttributes,
  type MelanieConcept,
  type MelanieDimension,
  type MelanieSemanticFingerprint,
} from "./melaniesGame";
import {
  MELANIE_COVER_SUBJECTS,
  coverSubjectsForConcept,
  createMelanieCoverArt,
  melanieCoverArtFingerprint,
} from "./melaniesGameCoverArt";

export const MELANIE_CONCEPTS_PER_AGE_BAND = 64;
export const MELANIE_CONCEPT_TOTAL = 256;

const AGE_BANDS: readonly AgeBandV2[] = ["kids", "preteens", "teens", "adult"];
const DIMENSIONS: readonly MelanieDimension[] = [
  "speculation", "darkness", "humor", "romance", "mystery", "scale", "emotion", "pace", "character",
];
const ATTRIBUTE_KEYS = [...DIMENSIONS, "genres", "tones", "themes", "dynamics", "settings"].sort();
const SEMANTIC_KEYS: readonly (keyof MelanieSemanticFingerprint)[] = [
  "centralActivities", "keyCoverMotifs", "narrativeEngine", "premiseFamily", "protagonistRoles",
  "relationshipShapes", "settingClasses", "socialFocus", "speculativeDevices", "stakesShapes",
];
const AXIS_VALUES = new Set([-2, -1, 0, 1, 2]);
const COVER_MOTIFS = new Set<string>(MELANIE_COVER_SUBJECTS);
const STOP_WORDS = new Set([
  "a", "an", "and", "as", "at", "before", "but", "by", "for", "from", "in", "into", "of", "on", "one",
  "that", "the", "their", "them", "they", "to", "two", "when", "where", "who", "whose", "with",
]);
const SETTING_MOTIFS: Partial<Record<MelanieSemanticFingerprint["settingClasses"][number], readonly string[]>> = {
  archive: ["archive", "book", "history"],
  city: ["city", "home"],
  coast: ["coast", "sea"],
  digital: ["machine", "signal"],
  garden: ["garden", "forest"],
  historical: ["history", "archive"],
  home: ["home"],
  island: ["sea", "coast"],
  "other-world": ["magic", "castle"],
  performance: ["performance", "art", "music"],
  political: ["politics", "city"],
  school: ["school", "book"],
  sea: ["sea"],
  space: ["space", "science"],
  sports: ["sport"],
  transit: ["train", "journey"],
  underground: ["train", "city"],
  wilderness: ["forest", "mountain"],
  workplace: ["home", "city", "science", "food", "art", "machine"],
};
const ACTIVITY_MOTIFS: Partial<Record<MelanieSemanticFingerprint["centralActivities"][number], readonly string[]>> = {
  build: ["machine", "home"],
  care: ["home", "garden", "animal"],
  compete: ["sport"],
  cook: ["food"],
  create: ["art", "book", "music"],
  discover: ["mystery", "science"],
  document: ["archive", "book", "history"],
  investigate: ["mystery"],
  perform: ["performance", "music"],
  travel: ["journey", "train"],
};
const DEVICE_MOTIFS: Partial<Record<MelanieSemanticFingerprint["speculativeDevices"][number], readonly string[]>> = {
  "artificial-intelligence": ["machine"],
  ghost: ["ghost"],
  "living-nature": ["forest", "garden"],
  "magic-object": ["magic"],
  "memory-technology": ["machine", "history", "archive"],
  "mythic-being": ["magic", "animal"],
  prophecy: ["clock", "mystery", "book"],
  transformation: ["magic", "animal"],
};

function normalize(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en-US").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function synopsisTokens(value: string): Set<string> {
  return new Set(normalize(value).split(/\s+/).filter((word) => word.length > 2 && !STOP_WORDS.has(word)));
}

function shingles(value: string): Set<string> {
  const words = normalize(value).split(/\s+/).filter((word) => word.length > 2 && !STOP_WORDS.has(word));
  return new Set(words.slice(0, -1).map((word, index) => `${word} ${words[index + 1]}`));
}

function jaccard(left: Set<string>, right: Set<string>): number {
  const intersection = [...left].filter((word) => right.has(word)).length;
  const union = new Set([...left, ...right]).size;
  return union ? intersection / union : 0;
}

export type MelaniePremisePairAudit = {
  leftId: string;
  rightId: string;
  lexicalSimilarity: number;
  semanticSimilarity: number;
  combinedSimilarity: number;
  reasons: string[];
};

export function analyzeMelaniePremisePairs(concepts: readonly MelanieConcept[]): MelaniePremisePairAudit[] {
  const pairs: MelaniePremisePairAudit[] = [];
  for (let left = 0; left < concepts.length; left += 1) {
    for (let right = left + 1; right < concepts.length; right += 1) {
      const a = concepts[left];
      const b = concepts[right];
      const synopsisSimilarity = Math.max(
        jaccard(synopsisTokens(a.synopsis), synopsisTokens(b.synopsis)),
        jaccard(shingles(a.synopsis), shingles(b.synopsis)),
      );
      const titleSimilarity = jaccard(synopsisTokens(a.title), synopsisTokens(b.title));
      const lexicalSimilarity = Math.max(synopsisSimilarity, titleSimilarity * 0.9);
      const semanticSimilarity = melanieSemanticSimilarity(a, b);
      const reasons = [
        a.semantic.premiseFamily === b.semantic.premiseFamily ? `premise=${a.semantic.premiseFamily}` : "",
        a.semantic.narrativeEngine === b.semantic.narrativeEngine ? `engine=${a.semantic.narrativeEngine}` : "",
        lexicalSimilarity >= 0.42 ? `lexical=${lexicalSimilarity.toFixed(2)}` : "",
      ].filter(Boolean);
      pairs.push({
        leftId: a.id,
        rightId: b.id,
        lexicalSimilarity,
        semanticSimilarity,
        combinedSimilarity: lexicalSimilarity * 0.45 + semanticSimilarity * 0.55,
        reasons,
      });
    }
  }
  return pairs.sort((left, right) => right.combinedSimilarity - left.combinedSimilarity
    || left.leftId.localeCompare(right.leftId) || left.rightId.localeCompare(right.rightId));
}

function validateStringArray(
  issues: string[],
  concept: MelanieConcept,
  key: keyof Pick<MelanieAttributes, "genres" | "tones" | "themes" | "dynamics" | "settings">,
): void {
  const values = concept.attributes[key];
  if (!Array.isArray(values) || values.length === 0) {
    issues.push(`${concept.id}: ${key} must contain authored values`);
    return;
  }
  const normalized = values.map((value) => typeof value === "string" ? normalize(value) : "");
  if (normalized.some((value) => !value)) issues.push(`${concept.id}: ${key} contains a malformed value`);
  if (new Set(normalized).size !== normalized.length) issues.push(`${concept.id}: ${key} contains duplicates`);
}

function maxFrequency(values: readonly string[]): { value: string; count: number } {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts].map(([value, count]) => ({ value, count }))
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value))[0]
    || { value: "", count: 0 };
}

export function validateMelanieConceptLibrary(
  bank: Record<AgeBandV2, readonly MelanieConcept[]> = MELANIES_CONCEPTS,
): string[] {
  const issues: string[] = [];
  const all = AGE_BANDS.flatMap((ageBand) => bank[ageBand] || []);
  if (all.length !== MELANIE_CONCEPT_TOTAL) issues.push(`expected ${MELANIE_CONCEPT_TOTAL} concepts, received ${all.length}`);

  const ids = new Set<string>();
  const titles = new Map<string, string>();
  const synopses = new Map<string, string>();
  const coverIds = new Set<string>();
  const coverFingerprints = new Set<string>();

  for (const ageBand of AGE_BANDS) {
    const concepts = bank[ageBand] || [];
    if (concepts.length !== MELANIE_CONCEPTS_PER_AGE_BAND) {
      issues.push(`${ageBand}: expected ${MELANIE_CONCEPTS_PER_AGE_BAND} concepts, received ${concepts.length}`);
    }
    const expectedPrefix = ageBand === "adult" ? "a-" : `${ageBand[0]}-`;
    for (const concept of concepts) {
      if (concept.ageBand !== ageBand) issues.push(`${concept.id}: leaked from ${concept.ageBand} into ${ageBand}`);
      if (!concept.id.startsWith(expectedPrefix)) issues.push(`${concept.id}: does not use the ${ageBand} id prefix`);
      if (ids.has(concept.id)) issues.push(`${concept.id}: duplicate concept id`);
      ids.add(concept.id);

      const title = normalize(concept.title);
      const synopsis = normalize(concept.synopsis);
      if (!title) issues.push(`${concept.id}: missing title`);
      if (!synopsis || !/[.!?]$/.test(concept.synopsis.trim())) issues.push(`${concept.id}: synopsis must be one complete sentence`);
      if ((concept.synopsis.match(/[.!?](?:\s|$)/g) || []).length !== 1) issues.push(`${concept.id}: synopsis must contain exactly one sentence`);
      if (titles.has(title)) issues.push(`${concept.id}: duplicate title with ${titles.get(title)}`);
      if (synopses.has(synopsis)) issues.push(`${concept.id}: duplicate synopsis with ${synopses.get(synopsis)}`);
      titles.set(title, concept.id);
      synopses.set(synopsis, concept.id);

      if (Object.keys(concept.attributes).sort().join("|") !== ATTRIBUTE_KEYS.join("|")) {
        issues.push(`${concept.id}: malformed attribute keys`);
      }
      for (const dimension of DIMENSIONS) {
        if (!AXIS_VALUES.has(concept.attributes[dimension])) issues.push(`${concept.id}: invalid ${dimension} axis`);
      }
      validateStringArray(issues, concept, "genres");
      validateStringArray(issues, concept, "tones");
      validateStringArray(issues, concept, "themes");
      validateStringArray(issues, concept, "dynamics");
      validateStringArray(issues, concept, "settings");
      if (
        !Array.isArray(concept.palette)
        || concept.palette.length !== 2
        || concept.palette.some((color) => !/^#[0-9a-f]{6}$/i.test(color))
      ) issues.push(`${concept.id}: malformed palette`);

      const semantic = concept.semantic;
      if (!semantic || typeof semantic !== "object") {
        issues.push(`${concept.id}: missing semantic fingerprint`);
        continue;
      }
      if (Object.keys(semantic).sort().join("|") !== [...SEMANTIC_KEYS].sort().join("|")) {
        issues.push(`${concept.id}: malformed semantic fingerprint keys`);
      }
      const semanticArrays: (keyof MelanieSemanticFingerprint)[] = [
        "centralActivities", "settingClasses", "protagonistRoles", "relationshipShapes",
        "speculativeDevices", "stakesShapes", "keyCoverMotifs",
      ];
      for (const key of semanticArrays) {
        const values = semantic[key];
        if (!Array.isArray(values) || values.length === 0 || values.some((value) => typeof value !== "string" || !value.trim())) {
          issues.push(`${concept.id}: semantic ${key} must contain authored values`);
        } else if (new Set(values).size !== values.length) {
          issues.push(`${concept.id}: semantic ${key} contains duplicates`);
        }
      }
      if (!semantic.premiseFamily || !semantic.narrativeEngine || !semantic.socialFocus) {
        issues.push(`${concept.id}: semantic scalar facets are required`);
      }
      if (!MELANIE_SEMANTIC_TAXONOMY.premiseFamily.includes(semantic.premiseFamily)) {
        issues.push(`${concept.id}: unknown premise family`);
      }
      if (!MELANIE_SEMANTIC_TAXONOMY.narrativeEngine.includes(semantic.narrativeEngine)) {
        issues.push(`${concept.id}: unknown narrative engine`);
      }
      if (!MELANIE_SEMANTIC_TAXONOMY.socialFocus.includes(semantic.socialFocus)) {
        issues.push(`${concept.id}: unknown social focus`);
      }
      const taxonomyArrays: Partial<Record<keyof MelanieSemanticFingerprint, readonly string[]>> = {
        centralActivities: MELANIE_SEMANTIC_TAXONOMY.centralActivities,
        settingClasses: MELANIE_SEMANTIC_TAXONOMY.settingClasses,
        protagonistRoles: MELANIE_SEMANTIC_TAXONOMY.protagonistRoles,
        relationshipShapes: MELANIE_SEMANTIC_TAXONOMY.relationshipShapes,
        speculativeDevices: MELANIE_SEMANTIC_TAXONOMY.speculativeDevices,
        stakesShapes: MELANIE_SEMANTIC_TAXONOMY.stakesShapes,
        keyCoverMotifs: MELANIE_COVER_SUBJECTS,
      };
      for (const key of semanticArrays) {
        const allowed = taxonomyArrays[key];
        const values = semantic[key] as readonly string[];
        if (allowed && values.some((value) => !allowed.includes(value))) {
          issues.push(`${concept.id}: semantic ${key} contains a value outside the authored taxonomy`);
        }
      }

      const expectedMotifs = new Set<string>();
      for (const setting of semantic.settingClasses) for (const motif of SETTING_MOTIFS[setting] || []) expectedMotifs.add(motif);
      for (const activity of semantic.centralActivities) for (const motif of ACTIVITY_MOTIFS[activity] || []) expectedMotifs.add(motif);
      for (const device of semantic.speculativeDevices) for (const motif of DEVICE_MOTIFS[device] || []) expectedMotifs.add(motif);
      if (semantic.keyCoverMotifs.length < 2) issues.push(`${concept.id}: at least two premise-specific cover motifs are required`);
      if (semantic.keyCoverMotifs.some((motif) => !COVER_MOTIFS.has(motif))) {
        issues.push(`${concept.id}: cover motif is not supported by the renderer`);
      }
      if (expectedMotifs.size && !semantic.keyCoverMotifs.some((motif) => expectedMotifs.has(motif))) {
        issues.push(`${concept.id}: cover motifs do not reflect its setting, activity, or speculative device`);
      }

      try {
        const cover = createMelanieCoverArt(concept);
        const semanticSubjects = coverSubjectsForConcept(concept);
        if (coverIds.has(cover.assetId)) issues.push(`${concept.id}: duplicate cover asset id`);
        coverIds.add(cover.assetId);
        const fingerprint = melanieCoverArtFingerprint(cover);
        if (coverFingerprints.has(fingerprint)) issues.push(`${concept.id}: duplicate cover composition hash`);
        coverFingerprints.add(fingerprint);
        if (
          !semantic.keyCoverMotifs.includes(cover.primarySubject)
          || !semantic.keyCoverMotifs.includes(cover.secondarySubject)
          || semanticSubjects.length !== semantic.keyCoverMotifs.length
        ) issues.push(`${concept.id}: rendered cover does not follow authored cover motifs`);
      } catch (error) {
        issues.push(`${concept.id}: missing cover definition (${error instanceof Error ? error.message : "unknown error"})`);
      }
    }

    const premiseFamilies = concepts.map((concept) => concept.semantic?.premiseFamily).filter(Boolean);
    const engines = concepts.map((concept) => concept.semantic?.narrativeEngine).filter(Boolean);
    const settings = new Set(concepts.flatMap((concept) => concept.semantic?.settingClasses || []));
    const roles = new Set(concepts.flatMap((concept) => concept.semantic?.protagonistRoles || []));
    const tones = new Set(concepts.flatMap((concept) => concept.attributes?.tones || []));
    const social = new Set(concepts.map((concept) => concept.semantic?.socialFocus).filter(Boolean));
    if (new Set(premiseFamilies).size < 12) issues.push(`${ageBand}: premise-family coverage below 12`);
    if (new Set(engines).size < 12) issues.push(`${ageBand}: narrative-engine coverage below 12`);
    if (settings.size < 10) issues.push(`${ageBand}: setting-class coverage below 10`);
    if (roles.size < 10) issues.push(`${ageBand}: protagonist-role coverage below 10`);
    if (tones.size < 12) issues.push(`${ageBand}: emotional-tone coverage below 12`);
    if (social.size < 4) issues.push(`${ageBand}: social-focus coverage below 4`);
    const dominantFamily = maxFrequency(premiseFamilies);
    const dominantEngine = maxFrequency(engines);
    if (dominantFamily.count > Math.ceil(concepts.length * 0.28)) {
      issues.push(`${ageBand}: premise family ${dominantFamily.value} dominates ${dominantFamily.count}/${concepts.length}`);
    }
    if (dominantEngine.count > Math.ceil(concepts.length * 0.24)) {
      issues.push(`${ageBand}: narrative engine ${dominantEngine.value} dominates ${dominantEngine.count}/${concepts.length}`);
    }
    for (const dimension of DIMENSIONS) {
      const values = concepts.map((concept) => concept.attributes[dimension]);
      // Every axis must deliberately span low and high evidence, with one age-aware
      // exception: young readers are never pushed toward high romance, so kids and
      // preteens only need to demonstrate low/absent romance rather than a high pole.
      const romanceExempt = dimension === "romance" && (ageBand === "kids" || ageBand === "preteens");
      const hasLow = values.some((value) => value < 0);
      const hasHigh = values.some((value) => value > 0);
      if (!hasLow || (!hasHigh && !romanceExempt)) {
        issues.push(
          romanceExempt
            ? `${ageBand}: ${dimension} lacks low evidence`
            : `${ageBand}: ${dimension} lacks both low and high evidence`,
        );
      }
    }
  }

  for (const pair of analyzeMelaniePremisePairs(all)) {
    if (
      pair.lexicalSimilarity >= 0.64
      || pair.semanticSimilarity >= 0.78
      || (pair.lexicalSimilarity >= 0.42 && pair.semanticSimilarity >= 0.56)
    ) {
      issues.push(
        `${pair.leftId}/${pair.rightId}: likely premise duplicate `
        + `(lexical ${pair.lexicalSimilarity.toFixed(2)}, semantic ${pair.semanticSimilarity.toFixed(2)}; `
        + `${pair.reasons.join(", ") || "overlapping facets"})`,
      );
    }
  }

  return issues;
}

function roundDiversity(concepts: readonly MelanieConcept[]): {
  minimumDistance: number;
  averageDistance: number;
  maximumFamilyCount: number;
  maximumEngineCount: number;
} {
  const distances: number[] = [];
  for (let left = 0; left < concepts.length; left += 1) {
    for (let right = left + 1; right < concepts.length; right += 1) {
      distances.push(1 - melanieSemanticSimilarity(concepts[left], concepts[right]));
    }
  }
  return {
    minimumDistance: distances.length ? Math.min(...distances) : 1,
    averageDistance: distances.length ? distances.reduce((sum, value) => sum + value, 0) / distances.length : 1,
    maximumFamilyCount: maxFrequency(concepts.map((concept) => concept.semantic.premiseFamily)).count,
    maximumEngineCount: maxFrequency(concepts.map((concept) => concept.semantic.narrativeEngine)).count,
  };
}

export function buildMelanieContentAuditReport(
  bank: Record<AgeBandV2, readonly MelanieConcept[]> = MELANIES_CONCEPTS,
): string {
  const all = AGE_BANDS.flatMap((ageBand) => bank[ageBand]);
  const closest = analyzeMelaniePremisePairs(all).slice(0, 12);
  const roundRows: string[] = [];
  for (const ageBand of AGE_BANDS) {
    const conceptById = new Map(bank[ageBand].map((concept) => [concept.id, concept]));
    const sampledIds = new Set<string>();
    const metrics: ReturnType<typeof roundDiversity>[] = [];
    for (let seed = 0; seed < 24; seed += 1) {
      const initial = createInitialMelanieGame({
        anonymousPlayerId: `audit-player-${seed}`,
        libraryId: `audit-library-${seed % 3}`,
        ageBand,
        gameSessionId: `audit-${ageBand}-${seed}`,
        now: "2026-01-01T00:00:00.000Z",
      });
      const opening = initial.currentConceptIds.map((id) => conceptById.get(id)).filter((value): value is MelanieConcept => Boolean(value));
      opening.forEach((concept) => sampledIds.add(concept.id));
      metrics.push(roundDiversity(opening));
      const adaptive = completeMelanieRanking(
        selectMelanieConcepts(initial, initial.currentConceptIds.slice(0, 3), "2026-01-01T00:01:00.000Z"),
        "2026-01-01T00:02:00.000Z",
      );
      const adaptiveConcepts = adaptive.currentConceptIds
        .map((id) => conceptById.get(id))
        .filter((value): value is MelanieConcept => Boolean(value));
      adaptiveConcepts.forEach((concept) => sampledIds.add(concept.id));
      metrics.push(roundDiversity(adaptiveConcepts));
    }
    roundRows.push(
      `| ${ageBand} | ${sampledIds.size}/${bank[ageBand].length} | `
      + `${Math.min(...metrics.map((metric) => metric.minimumDistance)).toFixed(2)} | `
      + `${(metrics.reduce((sum, metric) => sum + metric.averageDistance, 0) / metrics.length).toFixed(2)} | `
      + `${Math.max(...metrics.map((metric) => metric.maximumFamilyCount))} | `
      + `${Math.max(...metrics.map((metric) => metric.maximumEngineCount))} |`,
    );
  }
  const taxonomyRows = AGE_BANDS.map((ageBand) => {
    const concepts = bank[ageBand];
    const unique = (values: readonly string[]) => new Set(values).size;
    return `| ${ageBand} | ${concepts.length} | ${unique(concepts.map((concept) => concept.semantic.premiseFamily))} | `
      + `${unique(concepts.map((concept) => concept.semantic.narrativeEngine))} | `
      + `${unique(concepts.flatMap((concept) => concept.semantic.settingClasses))} | `
      + `${unique(concepts.flatMap((concept) => concept.semantic.protagonistRoles))} | `
      + `${unique(concepts.flatMap((concept) => concept.attributes.tones))} | `
      + `${unique(concepts.map((concept) => concept.semantic.socialFocus))} |`;
  });
  const motifCounts = maxFrequency(all.flatMap((concept) => concept.semantic.keyCoverMotifs));
  const issues = validateMelanieConceptLibrary(bank);
  return [
    "# Melanie's Game content audit",
    "",
    `Generated deterministically for \`${MELANIE_CONCEPT_TOTAL}\` authored concepts. Integrity status: **${issues.length ? `FAIL (${issues.length} issues)` : "PASS"}**.`,
    "",
    "## Taxonomy coverage",
    "",
    "| Age band | Concepts | Premise families | Narrative engines | Settings | Protagonist roles | Tones | Social focus |",
    "|---|---:|---:|---:|---:|---:|---:|---:|",
    ...taxonomyRows,
    "",
    "## Closest premise pairs",
    "",
    "| Concepts | Lexical | Semantic | Combined | Shared signals |",
    "|---|---:|---:|---:|---|",
    ...closest.map((pair) => (
      `| ${pair.leftId} / ${pair.rightId} | ${pair.lexicalSimilarity.toFixed(2)} | `
      + `${pair.semanticSimilarity.toFixed(2)} | ${pair.combinedSimilarity.toFixed(2)} | ${pair.reasons.join(", ") || "none"} |`
    )),
    "",
    "## Deterministic round diversity",
    "",
    "Twenty-four player/session seeds per age band, including opening and first adaptive rounds.",
    "",
    "| Age band | Catalog sampled | Min pair distance | Mean pair distance | Max same family | Max same engine |",
    "|---|---:|---:|---:|---:|---:|",
    ...roundRows,
    "",
    "## Cover motif coverage",
    "",
    `- Unique semantic motifs: ${new Set(all.flatMap((concept) => concept.semantic.keyCoverMotifs)).size}`,
    `- Unique rendered cover fingerprints: ${new Set(all.map((concept) => melanieCoverArtFingerprint(createMelanieCoverArt(concept)))).size}`,
    `- Most-used motif: \`${motifCounts.value}\` on ${motifCounts.count}/${all.length} concepts`,
    "- Every rendered primary and secondary subject is selected from its concept's authored premise motifs.",
    ...(issues.length ? ["", "## Blocking findings", "", ...issues.map((issue) => `- ${issue}`)] : []),
    "",
  ].join("\n");
}
