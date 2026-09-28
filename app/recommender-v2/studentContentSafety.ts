import type { AgeBandV2, ScoredCandidate, SourceIdV2 } from "./types";

export const STUDENT_CONTENT_SAFETY_POLICY_VERSION = "student-content-safety-v1";

export type StudentContentSafetyRuleId =
  | "explicit_adult_maturity"
  | "erotica_or_pornography"
  | "explicit_sexual_content"
  | "explicit_sexual_violence"
  | "graphic_or_extreme_violence"
  | "extreme_gore_or_torture"
  | "adult_only_sexual_subject"
  | "younger_student_sexual_content"
  | "younger_student_intense_violence";

export interface StudentContentSafetyRejectionDiagnostic {
  title: string;
  source: SourceIdV2;
  ageBand: Exclude<AgeBandV2, "adult">;
  rejectionReason: string;
  ruleId: StudentContentSafetyRuleId;
  matchedSignals: string[];
}

export interface StudentContentSafetyDiagnostics {
  policyVersion: string;
  applied: boolean;
  ageBand: AgeBandV2;
  evaluatedCount: number;
  eligibleCount: number;
  rejectedCount: number;
  missingMetadataAllowedCount: number;
  rejectionReasonHistogram: Record<string, number>;
  rejectionRuleHistogram: Partial<Record<StudentContentSafetyRuleId, number>>;
  rejectedCandidates: StudentContentSafetyRejectionDiagnostic[];
}

export interface StudentContentSafetyGateResult {
  eligibleCandidates: ScoredCandidate[];
  diagnostics: StudentContentSafetyDiagnostics;
}

type MetadataEntry = {
  field: string;
  value: string;
};

type Rule = {
  id: StudentContentSafetyRuleId;
  reason: string;
  patterns: { signal: string; regex: RegExp }[];
};

const INSPECTED_METADATA_KEYS = new Set([
  "title",
  "subtitle",
  "description",
  "displaydescription",
  "summary",
  "synopsis",
  "annotation",
  "category",
  "categories",
  "subject",
  "subjects",
  "genre",
  "genres",
  "theme",
  "themes",
  "tone",
  "tones",
  "characterdynamics",
  "tag",
  "tags",
  "keyword",
  "keywords",
  "contentwarning",
  "contentwarnings",
  "warning",
  "warnings",
  "publisher",
  "publishers",
  "imprint",
  "label",
  "labels",
  "demographic",
  "audience",
  "agerating",
  "rating",
  "maturity",
  "maturityrating",
  "maturityband",
  "contentmaturity",
  "sourcematurityrating",
  "explicitcontent",
  "nsfw",
  "aversion",
  "aversions",
  "avoidsignal",
  "avoidsignals",
]);

const MATURITY_METADATA_KEYS = new Set([
  "audience",
  "agerating",
  "rating",
  "maturity",
  "maturityrating",
  "maturityband",
  "contentmaturity",
  "sourcematurityrating",
  "explicitcontent",
  "nsfw",
]);

const CORE_RULES: Rule[] = [
  {
    id: "erotica_or_pornography",
    reason: "Metadata identifies pornography, erotica, or an explicitly sexual publication category.",
    patterns: [
      { signal: "erotica", regex: /\berotica\b/i },
      { signal: "erotic_fiction", regex: /\berotic(?:a| fiction| romance)\b/i },
      { signal: "pornography", regex: /\bpornograph(?:y|ic)\b/i },
      { signal: "hentai", regex: /\bhentai\b/i },
      { signal: "sex_manual", regex: /\bsex(?:ual)? (?:manual|techniques?|positions?)\b/i },
      { signal: "explicit_adult_comic", regex: /\b(?:xxx|adults only) (?:comic|manga|fiction)\b/i },
    ],
  },
  {
    id: "explicit_sexual_content",
    reason: "Metadata explicitly describes graphic or explicit sexual content.",
    patterns: [
      { signal: "explicit_sexual_content", regex: /\bexplicit sexual content\b/i },
      { signal: "explicit_sex_scene", regex: /\bexplicit sex(?:ual)? scenes?\b/i },
      { signal: "graphic_sex_scene", regex: /\bgraphic sex(?:ual)? scenes?\b/i },
      { signal: "graphic_depiction_of_sex", regex: /\bgraphic depictions? of (?:sexual activity|sex)\b/i },
      { signal: "strong_sexual_content", regex: /\bstrong sexual content\b/i },
      { signal: "unsimulated_sex", regex: /\bunsimulated sex\b/i },
    ],
  },
  {
    id: "explicit_sexual_violence",
    reason: "Metadata explicitly describes graphic sexual violence.",
    patterns: [
      { signal: "graphic_sexual_violence", regex: /\b(?:graphic|explicit|detailed) (?:depictions? of )?sexual violence\b/i },
      { signal: "graphic_sexual_assault", regex: /\b(?:graphic|explicit|detailed) (?:depictions? of )?sexual assault\b/i },
      { signal: "graphic_rape", regex: /\b(?:graphic|explicit|detailed) (?:depictions? of )?rape\b/i },
      { signal: "sexual_torture", regex: /\bsexual torture\b/i },
      { signal: "rape_fantasy", regex: /\brape fantas(?:y|ies)\b/i },
    ],
  },
  {
    id: "graphic_or_extreme_violence",
    reason: "Metadata explicitly describes graphic or extreme violence.",
    patterns: [
      { signal: "graphic_violence", regex: /\bgraphic violence\b/i },
      { signal: "extreme_violence", regex: /\bextreme violence\b/i },
      { signal: "explicit_violence", regex: /\bexplicit violence\b/i },
      { signal: "graphic_depiction_of_violence", regex: /\bgraphic depictions? of violence\b/i },
      { signal: "ultraviolence", regex: /\bultra[- ]?violence\b/i },
      { signal: "splatterpunk", regex: /\bsplatterpunk\b/i },
    ],
  },
  {
    id: "extreme_gore_or_torture",
    reason: "Metadata explicitly describes extreme gore or graphic torture.",
    patterns: [
      { signal: "extreme_gore", regex: /\bextreme gore\b/i },
      { signal: "graphic_gore", regex: /\bgraphic gore\b/i },
      { signal: "visceral_gore", regex: /\bvisceral gore\b/i },
      { signal: "graphic_torture", regex: /\b(?:graphic|explicit|detailed|prolonged|sadistic) torture\b/i },
      { signal: "torture_porn", regex: /\btorture porn\b/i },
      { signal: "graphic_dismemberment", regex: /\bgraphic (?:dismemberment|evisceration|mutilation)\b/i },
    ],
  },
  {
    id: "adult_only_sexual_subject",
    reason: "Metadata identifies strongly adult-only sexual subject matter.",
    patterns: [
      { signal: "bdsm", regex: /\bBDSM\b/i },
      { signal: "fetish_content", regex: /\b(?:sexual )?fetish(?:es|ism)?\b/i },
      { signal: "bondage_and_discipline", regex: /\bbondage and discipline\b/i },
      { signal: "sex_party", regex: /\bsex parties?\b/i },
      { signal: "swinging_lifestyle", regex: /\bswingers?(?: lifestyle)?\b/i },
    ],
  },
];

const PRETEEN_ADDITIONAL_RULES: Rule[] = [
  {
    id: "younger_student_sexual_content",
    reason: "Metadata identifies sexual content beyond a Pre-Teen audience boundary.",
    patterns: [
      { signal: "sexual_content", regex: /\bsexual content\b/i },
      { signal: "sexual_situations", regex: /\bsexual situations\b/i },
      { signal: "full_nudity", regex: /\bfull nudity\b/i },
      { signal: "sexual_assault", regex: /\bsexual assault\b/i },
      { signal: "rape", regex: /\brape\b/i },
      { signal: "incest", regex: /\bincest\b/i },
    ],
  },
  {
    id: "younger_student_intense_violence",
    reason: "Metadata identifies gore, torture, or slasher content beyond a Pre-Teen audience boundary.",
    patterns: [
      { signal: "gore", regex: /\bgore\b/i },
      { signal: "gory", regex: /\bgory\b/i },
      { signal: "torture", regex: /\btorture\b/i },
      { signal: "slasher", regex: /\bslasher\b/i },
      { signal: "body_horror", regex: /\bbody horror\b/i },
      { signal: "brutal_violence", regex: /\bbrutal violence\b/i },
    ],
  },
];

const KIDS_ADDITIONAL_RULES: Rule[] = [
  {
    id: "younger_student_sexual_content",
    reason: "Metadata identifies sexual content or nudity beyond a Kids audience boundary.",
    patterns: [
      { signal: "sexual_content", regex: /\bsexual content\b/i },
      { signal: "sexual_situations", regex: /\bsexual situations\b/i },
      { signal: "nudity", regex: /\bnudity\b/i },
      { signal: "sexual_assault", regex: /\bsexual assault\b/i },
      { signal: "rape", regex: /\brape\b/i },
      { signal: "incest", regex: /\bincest\b/i },
    ],
  },
  {
    id: "younger_student_intense_violence",
    reason: "Metadata identifies gore, torture, slasher, or brutal violence beyond a Kids audience boundary.",
    patterns: [
      { signal: "gore", regex: /\bgore\b/i },
      { signal: "gory", regex: /\bgory\b/i },
      { signal: "torture", regex: /\btorture\b/i },
      { signal: "slasher", regex: /\bslasher\b/i },
      { signal: "body_horror", regex: /\bbody horror\b/i },
      { signal: "brutal_violence", regex: /\bbrutal violence\b/i },
      { signal: "bloody_violence", regex: /\bbloody violence\b/i },
      { signal: "brutal_murder", regex: /\bbrutal murders?\b/i },
    ],
  },
];

function primitiveStrings(value: unknown, depth = 0): string[] {
  if (depth > 3 || value == null) return [];
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    const text = String(value).trim();
    return text ? [text] : [];
  }
  if (Array.isArray(value)) return value.flatMap((item) => primitiveStrings(item, depth + 1));
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap((item) => primitiveStrings(item, depth + 1));
  }
  return [];
}

function collectNamedMetadata(
  value: unknown,
  prefix: string,
  entries: MetadataEntry[],
  depth = 0,
): void {
  if (depth > 4 || value == null || entries.length >= 300) return;
  if (Array.isArray(value)) {
    value.forEach((item) => collectNamedMetadata(item, prefix, entries, depth + 1));
    return;
  }
  if (typeof value !== "object") return;
  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    const field = prefix ? `${prefix}.${key}` : key;
    const normalizedKey = key.toLowerCase().replace(/[^a-z]/g, "");
    if (INSPECTED_METADATA_KEYS.has(normalizedKey)) {
      for (const text of primitiveStrings(nestedValue)) entries.push({ field, value: text });
    }
    collectNamedMetadata(nestedValue, field, entries, depth + 1);
    if (entries.length >= 300) return;
  }
}

function candidateMetadata(candidate: ScoredCandidate): MetadataEntry[] {
  const entries: MetadataEntry[] = [];
  const directValues: [string, unknown][] = [
    ["title", candidate.title],
    ["subtitle", candidate.subtitle],
    ["description", candidate.description],
    ["displayDescription", candidate.displayDescription],
    ["genres", candidate.genres],
    ["themes", candidate.themes],
    ["tones", candidate.tones],
    ["characterDynamics", candidate.characterDynamics],
    ["maturityBand", candidate.maturityBand],
    ["matchedSignals", candidate.matchedSignals],
  ];
  for (const [field, value] of directValues) {
    for (const text of primitiveStrings(value)) entries.push({ field, value: text });
  }
  collectNamedMetadata(candidate.raw, "raw", entries);
  collectNamedMetadata(candidate.diagnostics, "diagnostics", entries);
  return entries;
}

function explicitMaturitySignal(entries: MetadataEntry[]): string | null {
  const matureValue = /^(?:mature|explicit mature|adult|adult only|adults only|general adult|18\+|18 plus|r18|r18\+|rx|nc[- ]?17|nsfw|explicit)$/i;
  const maturePhrase = /\b(?:rated mature|mature audiences? only|for adults only|not suitable for minors|ages? 18 and (?:over|up)|explicit mature|adult only|adults only|r18\+?)\b/i;
  for (const entry of entries) {
    const terminalField = entry.field.split(".").pop()?.toLowerCase().replace(/[^a-z]/g, "") || "";
    if (!MATURITY_METADATA_KEYS.has(terminalField)) continue;
    if (matureValue.test(entry.value.trim()) || maturePhrase.test(entry.value)) {
      return `${entry.field}:explicit_adult_or_mature_classification`;
    }
  }
  return null;
}

function rulesFor(ageBand: Exclude<AgeBandV2, "adult">): Rule[] {
  if (ageBand === "kids") return [...CORE_RULES, ...KIDS_ADDITIONAL_RULES];
  if (ageBand === "preteens") return [...CORE_RULES, ...PRETEEN_ADDITIONAL_RULES];
  return CORE_RULES;
}

function evaluateStudentCandidate(
  candidate: ScoredCandidate,
  ageBand: Exclude<AgeBandV2, "adult">,
): StudentContentSafetyRejectionDiagnostic | null {
  const entries = candidateMetadata(candidate);
  const maturitySignal = explicitMaturitySignal(entries);
  if (maturitySignal) {
    return {
      title: candidate.title,
      source: candidate.source,
      ageBand,
      rejectionReason: "A source or normalized field explicitly classifies this work as mature or adult-only.",
      ruleId: "explicit_adult_maturity",
      matchedSignals: [maturitySignal],
    };
  }

  for (const rule of rulesFor(ageBand)) {
    const matchedSignals = new Set<string>();
    for (const entry of entries) {
      for (const pattern of rule.patterns) {
        if (pattern.regex.test(entry.value)) matchedSignals.add(`${entry.field}:${pattern.signal}`);
      }
    }
    if (matchedSignals.size > 0) {
      return {
        title: candidate.title,
        source: candidate.source,
        ageBand,
        rejectionReason: rule.reason,
        ruleId: rule.id,
        matchedSignals: [...matchedSignals].slice(0, 12),
      };
    }
  }
  return null;
}

function hasMeaningfulSafetyMetadata(candidate: ScoredCandidate): boolean {
  return candidateMetadata(candidate).some((entry) => {
    const field = entry.field.toLowerCase();
    return !field.endsWith("title") && entry.value.trim().length >= 8;
  });
}

export function applyFinalStudentContentSafetyGate(
  candidates: ScoredCandidate[],
  ageBand: AgeBandV2,
): StudentContentSafetyGateResult {
  if (ageBand === "adult") {
    return {
      eligibleCandidates: candidates,
      diagnostics: {
        policyVersion: STUDENT_CONTENT_SAFETY_POLICY_VERSION,
        applied: false,
        ageBand,
        evaluatedCount: 0,
        eligibleCount: candidates.length,
        rejectedCount: 0,
        missingMetadataAllowedCount: 0,
        rejectionReasonHistogram: {},
        rejectionRuleHistogram: {},
        rejectedCandidates: [],
      },
    };
  }

  const eligibleCandidates: ScoredCandidate[] = [];
  const rejectedCandidates: StudentContentSafetyRejectionDiagnostic[] = [];
  const rejectionReasonHistogram: Record<string, number> = {};
  const rejectionRuleHistogram: Partial<Record<StudentContentSafetyRuleId, number>> = {};
  let missingMetadataAllowedCount = 0;

  for (const candidate of candidates) {
    const rejection = evaluateStudentCandidate(candidate, ageBand);
    if (!rejection) {
      eligibleCandidates.push(candidate);
      if (!hasMeaningfulSafetyMetadata(candidate)) missingMetadataAllowedCount += 1;
      continue;
    }
    rejectedCandidates.push(rejection);
    rejectionReasonHistogram[rejection.rejectionReason] = Number(rejectionReasonHistogram[rejection.rejectionReason] || 0) + 1;
    rejectionRuleHistogram[rejection.ruleId] = Number(rejectionRuleHistogram[rejection.ruleId] || 0) + 1;
    const legacyGoogleBooksMaturityReason = candidate.source === "googleBooks" && rejection.ruleId === "explicit_adult_maturity"
      ? ageBand === "kids"
        ? "googlebooks_mature_content_not_allowed_for_kids"
        : ageBand === "preteens"
          ? "googlebooks_mature_content_not_allowed_for_preteens"
          : null
      : null;
    if (legacyGoogleBooksMaturityReason && !candidate.rejectedReasons.includes(legacyGoogleBooksMaturityReason)) {
      candidate.rejectedReasons.push(legacyGoogleBooksMaturityReason);
    }
    const candidateReason = `student_content_safety:${rejection.ruleId}`;
    if (!candidate.rejectedReasons.includes(candidateReason)) candidate.rejectedReasons.push(candidateReason);
  }

  return {
    eligibleCandidates,
    diagnostics: {
      policyVersion: STUDENT_CONTENT_SAFETY_POLICY_VERSION,
      applied: true,
      ageBand,
      evaluatedCount: candidates.length,
      eligibleCount: eligibleCandidates.length,
      rejectedCount: rejectedCandidates.length,
      missingMetadataAllowedCount,
      rejectionReasonHistogram,
      rejectionRuleHistogram,
      rejectedCandidates,
    },
  };
}
