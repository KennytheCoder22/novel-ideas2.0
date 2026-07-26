import type { NormalizedCandidate } from "./types";

export type ComicVinePublicationIdentity =
  | "graphic_novel"
  | "trade_paperback"
  | "hardcover_collection"
  | "collected_edition"
  | "deluxe_edition"
  | "omnibus"
  | "compendium"
  | "single_issue"
  | "annual"
  | "one_shot"
  | "miniseries"
  | "magazine"
  | "art_book"
  | "reference_book"
  | "encyclopedia"
  | "coloring_book"
  | "activity_book"
  | "rpg_supplement"
  | "trading_card_guide"
  | "toy_guide"
  | "movie_or_tv_tie_in"
  | "prose_novel"
  | "unknown";

export type ComicVineIdentityConfidence = "high" | "medium" | "low";

export type ComicVineIdentityClassification = {
  identity: ComicVinePublicationIdentity;
  confidence: ComicVineIdentityConfidence;
  evidence: string[];
};

type IdentityRule = {
  identity: ComicVinePublicationIdentity;
  confidence: ComicVineIdentityConfidence;
  patterns: RegExp[];
  evidenceLabel: string;
};

const IDENTITY_RULES: IdentityRule[] = [
  { identity: "annual", confidence: "high", patterns: [/\bannual\b/i], evidenceLabel: "title/metadata contains annual" },
  { identity: "one_shot", confidence: "high", patterns: [/\bone[-\s]?shot\b/i], evidenceLabel: "title/metadata contains one-shot" },
  { identity: "single_issue", confidence: "high", patterns: [/\bissue\s*#?\s*\d+\b/i], evidenceLabel: "metadata includes issue number" },
  { identity: "omnibus", confidence: "high", patterns: [/\bomnibus\b/i], evidenceLabel: "title/metadata contains omnibus" },
  { identity: "compendium", confidence: "high", patterns: [/\bcompendium\b/i], evidenceLabel: "title/metadata contains compendium" },
  { identity: "deluxe_edition", confidence: "high", patterns: [/\bdeluxe\b/i, /\babsolute edition\b/i], evidenceLabel: "title/metadata contains deluxe marker" },
  { identity: "trade_paperback", confidence: "high", patterns: [/\btrade paperback\b/i, /\btpb\b/i], evidenceLabel: "title/metadata contains trade paperback marker" },
  { identity: "hardcover_collection", confidence: "high", patterns: [/\bhardcover\b/i, /\bhc\b/i], evidenceLabel: "title/metadata contains hardcover marker" },
  { identity: "collected_edition", confidence: "medium", patterns: [/\bcollect(ed|ion|s)\b/i, /\bvol\.?\s*\d+\b/i], evidenceLabel: "title/metadata contains collected-edition marker" },
  { identity: "graphic_novel", confidence: "medium", patterns: [/\bgraphic novel\b/i, /\bgn\b/i], evidenceLabel: "title/metadata contains graphic novel marker" },
  { identity: "miniseries", confidence: "medium", patterns: [/\bmini[-\s]?series\b/i, /\blimited series\b/i], evidenceLabel: "title/metadata contains miniseries marker" },
  { identity: "magazine", confidence: "high", patterns: [/\bmagazine\b/i], evidenceLabel: "title/metadata contains magazine marker" },
  { identity: "art_book", confidence: "high", patterns: [/\bart of\b/i, /\bart book\b/i, /\bsketchbook\b/i], evidenceLabel: "title/metadata contains art-book marker" },
  { identity: "encyclopedia", confidence: "high", patterns: [/\bencyclopedia\b/i], evidenceLabel: "title/metadata contains encyclopedia marker" },
  { identity: "coloring_book", confidence: "high", patterns: [/\bcolou?ring\b/i], evidenceLabel: "title/metadata contains coloring marker" },
  { identity: "activity_book", confidence: "high", patterns: [/\bactivity book\b/i, /\bactivities\b/i], evidenceLabel: "title/metadata contains activity marker" },
  { identity: "rpg_supplement", confidence: "high", patterns: [/\brpg\b/i, /\brole[-\s]?playing\b/i, /\bsourcebook\b/i], evidenceLabel: "title/metadata contains RPG marker" },
  { identity: "trading_card_guide", confidence: "high", patterns: [/\btrading card\b/i, /\bcard guide\b/i, /\bprice guide\b/i], evidenceLabel: "title/metadata contains trading-card marker" },
  { identity: "toy_guide", confidence: "high", patterns: [/\btoy guide\b/i, /\baction figure guide\b/i], evidenceLabel: "title/metadata contains toy-guide marker" },
  { identity: "movie_or_tv_tie_in", confidence: "medium", patterns: [/\btie[-\s]?in\b/i, /\bmovie\b/i, /\btv\b/i, /\btelevision\b/i], evidenceLabel: "title/metadata contains movie/TV tie-in marker" },
  { identity: "prose_novel", confidence: "medium", patterns: [/\bnovelization\b/i, /\bprose novel\b/i], evidenceLabel: "title/metadata contains prose marker" },
  { identity: "reference_book", confidence: "medium", patterns: [/\bguide\b/i, /\bhandbook\b/i, /\bcompanion\b/i, /\breference\b/i], evidenceLabel: "title/metadata contains reference marker" },
];

function safeString(value: unknown): string {
  return String(value || "").trim();
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
  const aliases = Array.isArray(input.aliases) ? input.aliases.map((alias) => safeString(alias)).filter(Boolean).join(" ") : "";
  return [
    safeString(input.title),
    safeString(input.subtitle),
    safeString(input.issueNumber),
    safeString(input.deck),
    safeString(input.description),
    safeString(input.resourceType),
    safeString(input.publisher),
    safeString(input.volumeName),
    aliases,
  ].join(" ").toLowerCase();
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

  if (issueNumber) {
    const evidence = [
      `issue_number present: ${issueNumber}`,
      resourceType ? `ComicVine resource type is ${resourceType}` : "issue metadata present",
    ];
    if (/\bannual\b/i.test(text)) {
      return { identity: "annual", confidence: "high", evidence: [...evidence, "title/metadata contains annual"] };
    }
    if (/\bone[-\s]?shot\b/i.test(text)) {
      return { identity: "one_shot", confidence: "high", evidence: [...evidence, "title/metadata contains one-shot"] };
    }
    return { identity: "single_issue", confidence: "high", evidence };
  }

  for (const rule of IDENTITY_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(text))) {
      const evidence = [rule.evidenceLabel];
      if (resourceType) evidence.push(`ComicVine resource type is ${resourceType}`);
      return { identity: rule.identity, confidence: rule.confidence, evidence };
    }
  }

  return {
    identity: "unknown",
    confidence: "low",
    evidence: [
      resourceType ? `ComicVine resource type is ${resourceType}` : "resource type unavailable",
      "no decisive publication identity markers matched",
    ],
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
  titlesByIdentity: Record<string, string[]>;
  unknownPercentage: number;
  singleIssuePercentage: number;
  nonReadingArtifactPercentage: number;
  lowConfidencePercentage: number;
} {
  const histogram: Record<string, number> = {};
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
  ]);

  for (const candidate of candidates) {
    const identity = String(candidate.diagnostics?.publicationIdentity || "unknown");
    const confidence = String(candidate.diagnostics?.publicationIdentityConfidence || "low");
    histogram[identity] = Number(histogram[identity] || 0) + 1;
    if (!titlesByIdentity[identity]) titlesByIdentity[identity] = [];
    titlesByIdentity[identity].push(candidate.title);
    if (confidence === "low") lowConfidenceCount += 1;
    if (identity === "single_issue") singleIssueCount += 1;
    if (nonReadingArtifacts.has(identity as ComicVinePublicationIdentity)) nonReadingArtifactCount += 1;
  }

  const total = candidates.length;
  return {
    rawCandidates: total,
    normalizedCandidates: total,
    histogram,
    titlesByIdentity,
    unknownPercentage: pct(Number(histogram.unknown || 0), total),
    singleIssuePercentage: pct(singleIssueCount, total),
    nonReadingArtifactPercentage: pct(nonReadingArtifactCount, total),
    lowConfidencePercentage: pct(lowConfidenceCount, total),
  };
}
