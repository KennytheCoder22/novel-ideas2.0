import type { NormalizedCandidate } from "./types";
import type {
  ComicVineEntityMetadata,
  ComicVineEntityType,
  ComicVineIdentityConfidence,
  ComicVineIssueAccessibility,
  ComicVinePolicyBucket,
  ComicVinePublicationIdentity,
  ComicVineRange,
} from "./comicVineTypes";

export type ComicVineIdentityClassification = {
  identity: ComicVinePublicationIdentity;
  entityType: ComicVineEntityType;
  policyBucket: ComicVinePolicyBucket;
  confidence: ComicVineIdentityConfidence;
  evidence: string[];
  precedenceRule: string;
};

type IdentityRule = {
  identity: ComicVinePublicationIdentity;
  confidence: ComicVineIdentityConfidence;
  patterns: RegExp[];
  evidenceLabel: string;
};

const HARD_REJECT_RULES: IdentityRule[] = [
  { identity: "coloring_book", confidence: "high", patterns: [/\bcolou?ring\b/i], evidenceLabel: "title/metadata contains coloring marker" },
  { identity: "activity_book", confidence: "high", patterns: [/\bactivity book\b/i, /\bactivities\b/i, /\bpuzzle book\b/i], evidenceLabel: "title/metadata contains activity marker" },
  { identity: "rpg_supplement", confidence: "high", patterns: [/\brpg\b/i, /\brole[-\s]?playing\b/i, /\bsourcebook\b/i], evidenceLabel: "title/metadata contains RPG marker" },
  { identity: "trading_card_guide", confidence: "high", patterns: [/\btrading card\b/i, /\bcard guide\b/i, /\bprice guide\b/i], evidenceLabel: "title/metadata contains trading-card marker" },
  { identity: "toy_guide", confidence: "high", patterns: [/\btoy guide\b/i, /\baction figure guide\b/i], evidenceLabel: "title/metadata contains toy-guide marker" },
];

const SEMANTIC_PRIORITY_RULES: IdentityRule[] = [
  { identity: "encyclopedia", confidence: "high", patterns: [/\bencyclop(?:a)?edia\b/i], evidenceLabel: "title/metadata contains encyclopedia marker" },
  { identity: "art_book", confidence: "high", patterns: [/\bart of\b/i, /\bart book\b/i, /\bsketchbook\b/i, /\bgallery edition\b/i], evidenceLabel: "title/metadata contains art-book marker" },
  { identity: "companion_guide", confidence: "high", patterns: [/\bofficial guide\b/i, /\bcompanion\b/i, /\bfield guide\b/i, /\bguide to\b/i], evidenceLabel: "title/metadata contains companion/guide marker" },
  { identity: "reference_book", confidence: "high", patterns: [/\breference\b/i, /\bhandbook\b/i, /\bdirectory\b/i, /\balmanac\b/i], evidenceLabel: "title/metadata contains reference marker" },
  { identity: "movie_or_tv_tie_in", confidence: "high", patterns: [/\bmovie adaptation\b/i, /\btelevision adaptation\b/i, /\bmovie\b/i, /\btv\b/i, /\btelevision\b/i, /\bfilm adaptation\b/i, /\btie[-\s]?in\b/i], evidenceLabel: "title/metadata contains movie/TV tie-in marker" },
];

const COLLECTION_RULES: IdentityRule[] = [
  { identity: "omnibus", confidence: "high", patterns: [/\bomnibus\b/i], evidenceLabel: "title/metadata contains omnibus marker" },
  { identity: "compendium", confidence: "high", patterns: [/\bcompendium\b/i], evidenceLabel: "title/metadata contains compendium marker" },
  { identity: "deluxe_edition", confidence: "high", patterns: [/\bdeluxe\b/i, /\babsolute edition\b/i], evidenceLabel: "title/metadata contains deluxe marker" },
  { identity: "trade_paperback", confidence: "high", patterns: [/\btrade paperback\b/i, /\btpb\b/i], evidenceLabel: "title/metadata contains trade paperback marker" },
  { identity: "hardcover_collection", confidence: "high", patterns: [/\bhardcover\b/i, /\bhc\b/i, /\blibrary edition\b/i], evidenceLabel: "title/metadata contains hardcover marker" },
  { identity: "collected_edition", confidence: "high", patterns: [/\bcollect(?:ed|s|ing)\b/i, /\bcollection edition\b/i, /\bvol(?:ume)?\.?\s*\d+\b/i, /\bbook\s+(?:one|two|three|four|five|six|\d+)\b/i], evidenceLabel: "title/metadata contains collected-edition marker" },
  { identity: "graphic_novel", confidence: "medium", patterns: [/\bgraphic novel\b/i, /\bgn\b/i], evidenceLabel: "title/metadata contains graphic novel marker" },
];

const SERIES_RULES: IdentityRule[] = [
  { identity: "story_arc", confidence: "medium", patterns: [/\bstory arc\b/i, /\bstoryline\b/i], evidenceLabel: "title/metadata contains story-arc marker" },
  { identity: "limited_series", confidence: "high", patterns: [/\blimited series\b/i, /\bmini[-\s]?series\b/i, /\bmaxi[-\s]?series\b/i, /\b\d+\s*[- ]issue mini[-\s]?series\b/i], evidenceLabel: "title/metadata contains limited-series marker" },
  { identity: "ongoing_series", confidence: "medium", patterns: [/\bongoing series\b/i, /\bon[-\s]?going\b/i], evidenceLabel: "title/metadata contains ongoing-series marker" },
];

const OTHER_RULES: IdentityRule[] = [
  { identity: "magazine", confidence: "high", patterns: [/\bmagazine\b/i], evidenceLabel: "title/metadata contains magazine marker" },
  { identity: "prose_novel", confidence: "medium", patterns: [/\bnovelization\b/i, /\bprose novel\b/i], evidenceLabel: "title/metadata contains prose marker" },
];

function safeString(value: unknown): string {
  return String(value || "").trim();
}

function uniqueStrings(values: unknown[], limit = 50): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const text = safeString(value);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= limit) break;
  }
  return out;
}

function parsePositiveInt(value: unknown): number | undefined {
  const match = safeString(value).match(/\d+/);
  if (!match) return undefined;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function aliasesForClassification(value: unknown): string[] {
  if (Array.isArray(value)) return uniqueStrings(value, 20);
  const text = safeString(value);
  if (!text) return [];
  return uniqueStrings(text.split(/[\r\n|;]+/g), 20);
}

function textCorpusForClassification(input: {
  title?: unknown;
  subtitle?: unknown;
  issueNumber?: unknown;
  deck?: unknown;
  description?: unknown;
  aliases?: unknown;
  resourceType?: unknown;
  publisher?: unknown;
  volumeName?: unknown;
}): string {
  return [
    safeString(input.title),
    safeString(input.subtitle),
    safeString(input.issueNumber),
    safeString(input.deck),
    safeString(input.description),
    safeString(input.resourceType),
    safeString(input.publisher),
    safeString(input.volumeName),
    ...aliasesForClassification(input.aliases),
  ].join(" ").toLowerCase();
}

function normalizedTitleRoot(value: string): string {
  return safeString(value)
    .toLowerCase()
    .replace(/[\(\[\{].*?[\)\]\}]/g, " ")
    .replace(/#\s*\d+/g, " ")
    .replace(/\b(annual|one[-\s]?shot|omnibus|compendium|deluxe|edition|collect(?:ed|ion|ing|s)|graphic novel|trade paperback|tpb|hardcover|hc|story arc|limited series|mini[-\s]?series|ongoing series|vol(?:ume)?|book)\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedSeriesRoot(value: string): string {
  return normalizedTitleRoot(value)
    .replace(/\b\d+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractCollectionIssueRange(text: string): ComicVineRange | undefined {
  const normalized = safeString(text).toLowerCase();
  if (!normalized) return undefined;
  const matches = [
    normalized.match(/\bcollect(?:s|ed|ing)?\s+(?:issues?\s*)?#?\s*(\d+)\s*[-–]\s*#?\s*(\d+)/i),
    normalized.match(/\bcontains?\s+(?:issues?\s*)?#?\s*(\d+)\s*[-–]\s*#?\s*(\d+)/i),
    normalized.match(/\bfrom\s+issues?\s+#?\s*(\d+)\s*[-–]\s*#?\s*(\d+)/i),
    normalized.match(/\bissues?\s+#?\s*(\d+)\s*[-–]\s*#?\s*(\d+)/i),
  ];
  for (const match of matches) {
    if (!match) continue;
    const start = Number(match[1]);
    const end = Number(match[2]);
    if (Number.isFinite(start) && Number.isFinite(end) && start > 0 && end >= start && end - start <= 300) {
      return { start, end };
    }
  }
  return undefined;
}

function extractCollectionVolumeRange(text: string): ComicVineRange | undefined {
  const normalized = safeString(text).toLowerCase();
  if (!normalized) return undefined;
  const matches = [
    normalized.match(/\b(?:collects?|contains?)\s+vol(?:s|umes?)?\.?\s*(\d+)\s*[-–]\s*(\d+)/i),
    normalized.match(/\bvol(?:s|umes?)?\.?\s*(\d+)\s*[-–]\s*(\d+)/i),
    normalized.match(/\bbook[s]?\s*(\d+)\s*[-–]\s*(\d+)/i),
  ];
  for (const match of matches) {
    if (!match) continue;
    const start = Number(match[1]);
    const end = Number(match[2]);
    if (Number.isFinite(start) && Number.isFinite(end) && start > 0 && end >= start && end - start <= 50) {
      return { start, end };
    }
  }
  return undefined;
}

function extractVolumeNumber(text: string): number | undefined {
  const match = safeString(text).match(/\b(?:vol(?:ume)?|book)\.?\s*(\d+)\b/i);
  if (!match) return undefined;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function issueAccessibility(identity: ComicVinePublicationIdentity, issueNumber?: number): ComicVineIssueAccessibility {
  if (identity === "annual") return "annual";
  if (identity === "one_shot") return "one_shot";
  if (!issueNumber) return "not_issue_like";
  if (issueNumber === 1) return "issue_one";
  if (issueNumber > 1) return "middle_issue";
  return "unknown_issue_position";
}

export function comicVineEntityTypeForIdentity(identity: ComicVinePublicationIdentity): ComicVineEntityType {
  switch (identity) {
    case "graphic_novel":
      return "graphic_novel";
    case "trade_paperback":
      return "trade_paperback";
    case "hardcover_collection":
    case "collected_edition":
    case "deluxe_edition":
    case "compendium":
      return "collected_edition";
    case "omnibus":
      return "omnibus";
    case "story_arc":
      return "story_arc";
    case "limited_series":
      return "limited_series";
    case "ongoing_series":
      return "ongoing_series";
    case "single_issue":
      return "single_issue";
    case "annual":
      return "annual";
    case "one_shot":
      return "one_shot";
    case "reference_book":
      return "reference";
    case "encyclopedia":
      return "encyclopedia";
    case "art_book":
      return "art_book";
    case "companion_guide":
      return "companion_guide";
    case "movie_or_tv_tie_in":
      return "movie_or_tv_tie_in";
    default:
      return "other_or_unknown";
  }
}

export function comicVinePolicyBucketForIdentity(identity: ComicVinePublicationIdentity): ComicVinePolicyBucket {
  switch (identity) {
    case "graphic_novel":
    case "trade_paperback":
    case "hardcover_collection":
    case "collected_edition":
    case "deluxe_edition":
    case "omnibus":
    case "compendium":
      return "preferred";
    case "story_arc":
    case "limited_series":
    case "ongoing_series":
      return "allowed";
    case "single_issue":
    case "annual":
    case "one_shot":
      return "fallback_only";
    case "encyclopedia":
    case "companion_guide":
    case "coloring_book":
    case "activity_book":
    case "rpg_supplement":
    case "trading_card_guide":
    case "toy_guide":
      return "excluded";
    default:
      return "restricted";
  }
}

function matchRule(text: string, rules: IdentityRule[]): IdentityRule | undefined {
  return rules.find((rule) => rule.patterns.some((pattern) => pattern.test(text)));
}

export function classifyComicVineIdentity(input: {
  title?: unknown;
  subtitle?: unknown;
  issueNumber?: unknown;
  deck?: unknown;
  description?: unknown;
  aliases?: unknown;
  resourceType?: unknown;
  publisher?: unknown;
  volumeName?: unknown;
}): ComicVineIdentityClassification {
  const issueNumber = safeString(input.issueNumber);
  const resourceType = safeString(input.resourceType).toLowerCase();
  const text = textCorpusForClassification(input);
  const semanticOverIssueEvidence = issueNumber ? [`issue_number present: ${issueNumber}`] : [];

  const hardRejectRule = matchRule(text, HARD_REJECT_RULES);
  if (hardRejectRule) {
    const evidence = uniqueStrings([
      hardRejectRule.evidenceLabel,
      resourceType ? `ComicVine resource type is ${resourceType}` : "",
      ...semanticOverIssueEvidence,
    ], 10);
    return {
      identity: hardRejectRule.identity,
      entityType: comicVineEntityTypeForIdentity(hardRejectRule.identity),
      policyBucket: comicVinePolicyBucketForIdentity(hardRejectRule.identity),
      confidence: hardRejectRule.confidence,
      evidence,
      precedenceRule: issueNumber ? "hard_reject_semantic_marker_over_issue_number" : "hard_reject_semantic_marker",
    };
  }

  const semanticRule = matchRule(text, SEMANTIC_PRIORITY_RULES);
  if (semanticRule) {
    const evidence = uniqueStrings([
      semanticRule.evidenceLabel,
      resourceType ? `ComicVine resource type is ${resourceType}` : "",
      ...semanticOverIssueEvidence,
    ], 10);
    return {
      identity: semanticRule.identity,
      entityType: comicVineEntityTypeForIdentity(semanticRule.identity),
      policyBucket: comicVinePolicyBucketForIdentity(semanticRule.identity),
      confidence: semanticRule.confidence,
      evidence,
      precedenceRule: issueNumber ? "semantic_marker_over_issue_number" : "semantic_marker",
    };
  }

  const collectionRule = matchRule(text, COLLECTION_RULES);
  if (collectionRule) {
    const evidence = uniqueStrings([
      collectionRule.evidenceLabel,
      resourceType ? `ComicVine resource type is ${resourceType}` : "",
      ...semanticOverIssueEvidence,
    ], 10);
    return {
      identity: collectionRule.identity,
      entityType: comicVineEntityTypeForIdentity(collectionRule.identity),
      policyBucket: comicVinePolicyBucketForIdentity(collectionRule.identity),
      confidence: collectionRule.confidence,
      evidence,
      precedenceRule: issueNumber ? "collection_marker_over_issue_number" : "collection_marker",
    };
  }

  const seriesRule = !issueNumber ? matchRule(text, SERIES_RULES) : undefined;
  if (seriesRule) {
    const evidence = uniqueStrings([
      seriesRule.evidenceLabel,
      resourceType ? `ComicVine resource type is ${resourceType}` : "",
      ...semanticOverIssueEvidence,
    ], 10);
    return {
      identity: seriesRule.identity,
      entityType: comicVineEntityTypeForIdentity(seriesRule.identity),
      policyBucket: comicVinePolicyBucketForIdentity(seriesRule.identity),
      confidence: seriesRule.confidence,
      evidence,
      precedenceRule: issueNumber ? "series_marker_over_issue_number" : "series_marker",
    };
  }

  const otherRule = matchRule(text, OTHER_RULES);
  if (otherRule) {
    const evidence = uniqueStrings([
      otherRule.evidenceLabel,
      resourceType ? `ComicVine resource type is ${resourceType}` : "",
      ...semanticOverIssueEvidence,
    ], 10);
    return {
      identity: otherRule.identity,
      entityType: comicVineEntityTypeForIdentity(otherRule.identity),
      policyBucket: comicVinePolicyBucketForIdentity(otherRule.identity),
      confidence: otherRule.confidence,
      evidence,
      precedenceRule: issueNumber ? "other_semantic_marker_over_issue_number" : "other_semantic_marker",
    };
  }

  if (issueNumber) {
    const evidence = uniqueStrings([
      `issue_number present: ${issueNumber}`,
      resourceType ? `ComicVine resource type is ${resourceType}` : "issue metadata present",
      /\bannual\b/i.test(text) ? "title/metadata contains annual" : "",
      /\bone[-\s]?shot\b/i.test(text) ? "title/metadata contains one-shot" : "",
    ], 10);
    const identity = /\bannual\b/i.test(text)
      ? "annual"
      : /\bone[-\s]?shot\b/i.test(text)
        ? "one_shot"
        : "single_issue";
    return {
      identity,
      entityType: comicVineEntityTypeForIdentity(identity),
      policyBucket: comicVinePolicyBucketForIdentity(identity),
      confidence: "high",
      evidence,
      precedenceRule: "issue_number_default",
    };
  }

  if (resourceType === "volume") {
    return {
      identity: "ongoing_series",
      entityType: "ongoing_series",
      policyBucket: "allowed",
      confidence: "low",
      evidence: ["ComicVine resource type is volume", "no stronger collection or restricted marker matched"],
      precedenceRule: "resource_type_volume_default",
    };
  }

  return {
    identity: "unknown",
    entityType: "other_or_unknown",
    policyBucket: "restricted",
    confidence: "low",
    evidence: [
      resourceType ? `ComicVine resource type is ${resourceType}` : "resource type unavailable",
      "no decisive publication identity markers matched",
    ],
    precedenceRule: "unknown_default",
  };
}

export function buildComicVineEntityMetadata(input: {
  sourceId?: unknown;
  title?: unknown;
  subtitle?: unknown;
  issueNumber?: unknown;
  deck?: unknown;
  description?: unknown;
  aliases?: unknown;
  resourceType?: unknown;
  publisher?: unknown;
  volumeId?: unknown;
  volumeName?: unknown;
}): ComicVineEntityMetadata {
  const classification = classifyComicVineIdentity(input);
  const title = safeString(input.title);
  const subtitle = safeString(input.subtitle);
  const volumeName = safeString(input.volumeName);
  const volumeId = safeString(input.volumeId);
  const issueNumber = parsePositiveInt(input.issueNumber);
  const corpus = [title, subtitle, safeString(input.deck), safeString(input.description), volumeName, ...aliasesForClassification(input.aliases)].join(" ");
  const titleRoot = normalizedTitleRoot(title || subtitle || volumeName);
  const seriesRoot = normalizedSeriesRoot(volumeName || subtitle || title);
  const familyKey = volumeId
    ? `volume_id:${volumeId}`
    : seriesRoot
      ? `series_root:${seriesRoot}`
      : titleRoot
        ? `title_root:${titleRoot}`
        : safeString(input.sourceId)
          ? `source_id:${safeString(input.sourceId)}`
          : undefined;

  return {
    sourceId: safeString(input.sourceId) || undefined,
    identity: classification.identity,
    entityType: classification.entityType,
    policyBucket: classification.policyBucket,
    confidence: classification.confidence,
    classificationEvidence: classification.evidence,
    precedenceRule: classification.precedenceRule,
    resourceType: safeString(input.resourceType).toLowerCase() || undefined,
    publisher: safeString(input.publisher) || undefined,
    aliases: aliasesForClassification(input.aliases),
    volumeId: volumeId || undefined,
    volumeName: volumeName || undefined,
    issueNumber,
    seriesRoot: seriesRoot || undefined,
    titleRoot: titleRoot || undefined,
    familyKey,
    collectionIssueRange: extractCollectionIssueRange(corpus),
    collectionVolumeRange: extractCollectionVolumeRange(corpus),
    volumeNumber: extractVolumeNumber(title || volumeName),
    issueAccessibility: issueAccessibility(classification.identity, issueNumber),
    fallbackEligible: classification.policyBucket !== "fallback_only" ? undefined : false,
    fallbackState: classification.policyBucket === "fallback_only" ? "withheld" : "not_applicable",
  };
}

function pct(part: number, total: number): number {
  if (!total) return 0;
  return Math.round((part / total) * 10000) / 100;
}

export function buildComicVineIdentityReport(candidates: NormalizedCandidate[]): {
  rawCandidates: number;
  normalizedCandidates: number;
  histogram: Record<string, number>;
  entityTypeHistogram: Record<string, number>;
  policyBucketHistogram: Record<string, number>;
  titlesByIdentity: Record<string, string[]>;
  unknownPercentage: number;
  singleIssuePercentage: number;
  nonReadingArtifactPercentage: number;
  lowConfidencePercentage: number;
} {
  const histogram: Record<string, number> = {};
  const entityTypeHistogram: Record<string, number> = {};
  const policyBucketHistogram: Record<string, number> = {};
  const titlesByIdentity: Record<string, string[]> = {};
  let lowConfidenceCount = 0;
  let singleIssueCount = 0;
  let nonReadingArtifactCount = 0;
  const nonReadingArtifacts = new Set<ComicVinePublicationIdentity>([
    "coloring_book",
    "activity_book",
    "rpg_supplement",
    "trading_card_guide",
    "toy_guide",
    "movie_or_tv_tie_in",
    "companion_guide",
    "encyclopedia",
    "reference_book",
    "art_book",
    "magazine",
  ]);

  for (const candidate of candidates) {
    const identity = String(candidate.comicVine?.identity || candidate.diagnostics?.publicationIdentity || "unknown");
    const entityType = String(candidate.comicVine?.entityType || "other_or_unknown");
    const policyBucket = String(candidate.comicVine?.policyBucket || "restricted");
    const confidence = String(candidate.comicVine?.confidence || candidate.diagnostics?.publicationIdentityConfidence || "low");
    histogram[identity] = Number(histogram[identity] || 0) + 1;
    entityTypeHistogram[entityType] = Number(entityTypeHistogram[entityType] || 0) + 1;
    policyBucketHistogram[policyBucket] = Number(policyBucketHistogram[policyBucket] || 0) + 1;
    if (!titlesByIdentity[identity]) titlesByIdentity[identity] = [];
    titlesByIdentity[identity].push(candidate.title);
    if (confidence === "low") lowConfidenceCount += 1;
    if (entityType === "single_issue" || entityType === "annual" || entityType === "one_shot") singleIssueCount += 1;
    if (nonReadingArtifacts.has(identity as ComicVinePublicationIdentity)) nonReadingArtifactCount += 1;
  }

  const total = candidates.length;
  return {
    rawCandidates: total,
    normalizedCandidates: total,
    histogram,
    entityTypeHistogram,
    policyBucketHistogram,
    titlesByIdentity,
    unknownPercentage: pct(Number(histogram.unknown || 0), total),
    singleIssuePercentage: pct(singleIssueCount, total),
    nonReadingArtifactPercentage: pct(nonReadingArtifactCount, total),
    lowConfidencePercentage: pct(lowConfidenceCount, total),
  };
}
