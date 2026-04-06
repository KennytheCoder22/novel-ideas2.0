import type { DeckKey, RecommendationDoc, TasteProfile } from './types';
import type { Candidate } from './normalizeCandidate';
import { laneFromDeckKey, recommenderProfiles, type RecommenderLane, type RecommenderProfile } from './recommenderProfiles';
import { estimateCandidateSophistication, estimateReaderSophisticationFromTaste, scoreSophisticationAlignment } from './taste/sophisticationModel';

export type FinalRecommenderOptions = {
  lane?: RecommenderLane;
  deckKey?: DeckKey;
  tasteProfile?: TasteProfile;
  profileOverride?: Partial<RecommenderProfile>;
  priorRecommendedIds?: string[];
  priorRecommendedKeys?: string[];
  priorAuthors?: string[];
  priorSeriesKeys?: string[];
  priorRejectedIds?: string[];
  priorRejectedKeys?: string[];
};

type CandidateDiagnostics = {
  source: string;
  preFilterScore?: number;
  postFilterScore?: number;
  rejectionReason?: string;
};

type CandidateWithDiagnostics = Candidate & {
  diagnostics?: CandidateDiagnostics;
};

type RecommendationDocWithDiagnostics = RecommendationDoc & {
  diagnostics?: CandidateDiagnostics;
};

const DOC_TASTE_SIGNAL_PATTERNS = {
  humorous: /\b(humor|humorous|funny|comic|comedic|satire|satirical|witty|laugh[-\s]?out[-\s]?loud)\b/i,
  warm: /\b(warm|heartwarming|hopeful|uplifting|tender|empathetic|gentle|kindness|life[-\s]?affirming)\b/i,
  character: /\b(character[-\s]?driven|character[-\s]?focused|relationship[-\s]?driven|interpersonal|family saga|coming[-\s]?of[-\s]?age)\b/i,
  dark: /\b(dark|bleak|grim|haunting|disturbing|macabre|gothic|tragic|brooding)\b/i,
  complex: /\b(complex|layered|intricate|nuanced|multi[-\s]?layered|dense|challenging)\b/i,
  idea: /\b(idea[-\s]?driven|thought[-\s]?provoking|philosophical|conceptual|big ideas?|speculative|intellectual)\b/i,
  romantic: /\b(romance|romantic|love story|relationship fiction)\b/i,
  adventurous: /\b(adventure|adventurous|quest|journey|expedition|survival|action[-\s]?packed|swashbuckling)\b/i,
  cozy: /\b(cozy|cosy|comfort read|small town|found family|gentle mystery)\b/i,
  mysterious: /\b(mystery|mysterious|investigation|detective|whodunit|suspense)\b/i,
  hopeful: /\b(hopeful|uplifting|optimistic|redemptive|inspiring)\b/i,
  tense: /\b(tense|thrilling|suspenseful|high[-\s]?stakes|gripping|edge[-\s]?of[-\s]?your[-\s]?seat)\b/i,
  literary: /\b(literary|lyrical|elegant prose|award[-\s]?winning|booker|pulitzer)\b/i,
  fast: /\b(page[-\s]?turner|fast[-\s]?paced|propulsive|unputdownable|quick read)\b/i,
} as const;

const TASTE_KEY_ALIASES = {
  humorous: /(humou?r|funny|comic|comedic|satire|witty)/i,
  warm: /(warm|heartwarm|uplift|tender|gentle|kind)/i,
  character: /(character|relationship|people[-_\s]?focused|interpersonal)/i,
  dark: /(dark|bleak|grim|gothic|tragic|brood)/i,
  complex: /(complex|layered|intricate|nuanced|dense|challenging)/i,
  idea: /(idea|concept|philosoph|thought|speculative|intellectual|theme)/i,
  romantic: /(romance|romantic|love)/i,
  adventurous: /(adventure|quest|journey|survival|action)/i,
  cozy: /(cozy|cosy|comfort|found family|small town)/i,
  mysterious: /(mystery|mysterious|detective|investigat|whodunit|suspense)/i,
  hopeful: /(hopeful|optimistic|uplift|redemptive|inspiring)/i,
  tense: /(tense|thrill|suspenseful|high[-_\s]?stakes|gripping)/i,
  literary: /(literary|lyric|prose|booker|pulitzer|award)/i,
  fast: /(fast|pace|page[-_\s]?turner|propulsive|quick)/i,
} as const;

type TasteSignalKey = keyof typeof DOC_TASTE_SIGNAL_PATTERNS;

type CompactHypothesis = {
  label: string;
  requiredPatterns: RegExp[];
  optionalPatterns: RegExp[];
};

const NONFICTION_PATTERNS = [
  /\b(philosophy|philosophical essays|history|biography|autobiography|memoir|self[-\s]?help|psychology|religion|spirituality|criticism|literary criticism|essays|reference|study guide|workbook|manual|textbook|companion|encyclopedia)\b/i,
  /\b(nonfiction|non-fiction)\b/i,
];

const SUMMARY_GUIDE_PATTERNS = [
  /\b(summary|analysis|student edition|teacher guide|study guide|workbook|lesson plan|book club kit|companion|critical essays)\b/i,
];

const WEAK_METADATA_PATTERNS = [
  /\b(annotated|complete works|selected works|collection|anthology|omnibus|box set)\b/i,
];

function normalizeKey(value: any): string {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function identityKey(candidate: Candidate): string {
  const title = normalizeKey(candidate.title);
  const author = normalizeKey(candidate.author);
  return title && author ? `${title}|${author}` : candidate.id;
}

function haystack(candidate: Candidate): string {
  return [
    candidate.title,
    candidate.subtitle || '',
    candidate.description || '',
    candidate.publisher || '',
    ...candidate.subjects,
    ...candidate.genres,
  ].filter(Boolean).join(' | ');
}

function metadataSignals(candidate: Candidate): number {
  let score = 0;
  if (candidate.title) score += 2;
  if (candidate.author && candidate.author !== 'Unknown') score += 2;
  if (candidate.description) score += 2;
  if (candidate.publisher) score += 1;
  if (candidate.hasCover) score += 1;
  if (candidate.publicationYear) score += 1;
  if (candidate.subjects.length) score += 1;
  if (candidate.ratingCount > 0) score += 2;
  if (candidate.averageRating > 0) score += 1;
  return score;
}

function dedupeCandidates(candidates: Candidate[]): Candidate[] {
  const byKey = new Map<string, Candidate>();
  for (const candidate of candidates) {
    const key = identityKey(candidate);
    const existing = byKey.get(key);
    if (!existing || metadataSignals(candidate) > metadataSignals(existing)) {
      byKey.set(key, candidate);
    }
  }
  return Array.from(byKey.values());
}

function collectNumericTasteSignals(value: any, path = '', out: Array<{ path: string; value: number }> = []): Array<{ path: string; value: number }> {
  if (value == null) return out;
  if (typeof value === 'number' && Number.isFinite(value)) {
    out.push({ path, value });
    return out;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) collectNumericTasteSignals(value[i], `${path}[${i}]`, out);
    return out;
  }
  if (typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) collectNumericTasteSignals(nested, path ? `${path}.${key}` : key, out);
  }
  return out;
}

function normalizeTastePreference(raw: number): number {
  if (!Number.isFinite(raw)) return 0;
  if (raw > 1) return Math.min(raw / 5, 1);
  if (raw < -1) return Math.max(raw / 5, -1);
  return raw;
}

function getTastePreferenceForKey(taste: TasteProfile | undefined, key: TasteSignalKey): number {
  if (!taste) return 0;
  const signals = collectNumericTasteSignals(taste as any);
  let total = 0;
  let matched = 0;
  for (const signal of signals) {
    if (!TASTE_KEY_ALIASES[key].test(signal.path)) continue;
    total += normalizeTastePreference(signal.value);
    matched += 1;
  }
  return matched ? Math.max(-1, Math.min(1, total / matched)) : 0;
}

function scoreDocTasteSignal(candidate: Candidate, key: TasteSignalKey): number {
  return DOC_TASTE_SIGNAL_PATTERNS[key].test(haystack(candidate)) ? 1 : 0;
}

function scoreTasteMatch(candidate: Candidate, taste?: TasteProfile): number {
  if (!taste) return 0;
  const keys = Object.keys(DOC_TASTE_SIGNAL_PATTERNS) as TasteSignalKey[];
  let total = 0;
  let matched = 0;
  for (const key of keys) {
    const pref = getTastePreferenceForKey(taste, key);
    if (Math.abs(pref) < 0.12) continue;
    const docSignal = scoreDocTasteSignal(candidate, key);
    if (!docSignal) continue;
    total += pref * docSignal;
    matched += 1;
  }
  if (!matched) return 0;
  return Math.max(-1.1, Math.min(1.1, (total / matched) * 1.1));
}

function scorePopularity(candidate: Candidate): number {
  return Math.log10(candidate.ratingCount + 1) * ((candidate.averageRating > 0 ? candidate.averageRating : 4) / 5) * 3.5;
}

function scorePublisherBoost(candidate: Candidate): number {
  if (!candidate.publisher) return 0;
  if (/(penguin|random house|knopf|doubleday|viking|harper|macmillan|tor|simon\s*&?\s*schuster|hachette|scholastic)/i.test(candidate.publisher)) return 0.7;
  return 0;
}

function scoreRecency(candidate: Candidate): number {
  if (!candidate.publicationYear) return 0;
  const currentYear = new Date().getFullYear();
  const age = currentYear - candidate.publicationYear;
  if (age <= 5) return 0.2;
  if (age <= 15) return 0.1;
  if (age <= 40) return 0;
  return -0.05;
}

function deriveSeriesKey(title: string): string {
  return String(title || '')
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .split(':')[0]
    .replace(/,?\s+(book|bk|vol(?:ume)?|part|#)\s*\d+.*$/i, '')
    .replace(/\s+\d+\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function inList(value: string | undefined, items?: string[]): boolean {
  if (!value || !items?.length) return false;
  const needle = value.trim().toLowerCase();
  return items.some((item) => String(item || '').trim().toLowerCase() === needle);
}

const YA_POSITIVE_SUBJECTS = [
  'young adult',
  'young adult fiction',
  'teen fiction',
  'adolescent fiction',
  'juvenile fiction',
];

const YA_NEGATIVE_SUBJECTS = [
  'history',
  'biography',
  'autobiography',
  'memoir',
  'criticism',
  'literary criticism',
  'essays',
  'philosophy',
  'religion',
  'anthology',
  'collection',
  'short stories',
  'omnibus',
  'box set',
];

const CHILD_ONLY_SUBJECTS = [
  'children',
  "children's books",
  'picture books',
  'early reader',
  'early readers',
  'middle grade',
  'chapter books',
];

const CLASSIC_TITLE_PAT = /\b(huckleberry finn|catcher in the rye|great expectations|wuthering heights|les miserables|moby dick|scarlet letter)\b/i;
const CLASSIC_AUTHOR_PAT = /\b(mark twain|jerome david salinger|charles dickens|emily bronte|victor hugo|herman melville|nathaniel hawthorne)\b/i;

function niNorm(v: unknown): string {
  return String(v || '').toLowerCase().trim();
}

function niSubjectsFromCandidate(candidate: Candidate): string[] {
  const subject =
    (candidate.rawDoc as any)?.subject ??
    (candidate.rawDoc as any)?.doc?.subject ??
    (candidate.rawDoc as any)?.volumeInfo?.categories ??
    (candidate.rawDoc as any)?.categories ??
    candidate.subjects ??
    candidate.genres ??
    [];

  return Array.isArray(subject) ? subject.map(niNorm).filter(Boolean) : [];
}

function niTitleFromCandidate(candidate: Candidate): string {
  return niNorm(candidate.title ?? (candidate.rawDoc as any)?.title ?? (candidate.rawDoc as any)?.doc?.title);
}

function niAuthorFromCandidate(candidate: Candidate): string {
  return niNorm(
    candidate.author ??
    (candidate.rawDoc as any)?.author ??
    (candidate.rawDoc as any)?.author_name?.[0] ??
    (candidate.rawDoc as any)?.doc?.author_name?.[0] ??
    (candidate.rawDoc as any)?.volumeInfo?.authors?.[0] ??
    (candidate.rawDoc as any)?.authors?.[0] ??
    ''
  );
}

function niYearFromCandidate(candidate: Candidate): number | null {
  const raw =
    candidate.publicationYear ??
    (candidate.rawDoc as any)?.first_publish_year ??
    (candidate.rawDoc as any)?.doc?.first_publish_year ??
    (candidate.rawDoc as any)?.publishedYear ??
    (candidate.rawDoc as any)?.volumeInfo?.publishedDate ??
    null;

  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;

  const match = String(raw || '').match(/\b(18|19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

function niHasAny(subjects: string[], needles: string[]): boolean {
  return needles.some((needle) => subjects.some((s) => s.includes(needle)));
}

function applyMinimalYaFilter(candidates: Candidate[], deckKey: DeckKey): Candidate[] {
  if (deckKey !== 'ms_hs') return candidates;

  return candidates.filter((candidate) => {
    const subjects = niSubjectsFromCandidate(candidate);
    const title = niTitleFromCandidate(candidate);
    const author = niAuthorFromCandidate(candidate);
    const year = niYearFromCandidate(candidate);

    const hasYaSignal = niHasAny(subjects, YA_POSITIVE_SUBJECTS);
    const hasNegativeSubject = niHasAny(subjects, YA_NEGATIVE_SUBJECTS);
    const hasChildOnlySignal = niHasAny(subjects, CHILD_ONLY_SUBJECTS);
    const looksLikeKnownClassic = CLASSIC_TITLE_PAT.test(title) || CLASSIC_AUTHOR_PAT.test(author);

    const originalYear =
      (candidate.rawDoc as any)?.first_publish_year ??
      (candidate.rawDoc as any)?.doc?.first_publish_year ??
      null;

    const effectiveYear = originalYear ?? year;

    const isOldClassic =
      typeof effectiveYear === 'number' && effectiveYear > 0 && effectiveYear < 1950;

    const isModern = typeof year === 'number' && year >= 2000;

    if (hasNegativeSubject) return false;
    if (hasChildOnlySignal && !hasYaSignal) return false;
    if (isOldClassic && !hasYaSignal) return false;
    if (!hasYaSignal && (looksLikeKnownClassic || isOldClassic)) return false;
    if (hasYaSignal) return true;

    const hasGenreSignal =
      subjects.some((s) =>
        s.includes('fantasy') ||
        s.includes('science fiction') ||
        s.includes('romance') ||
        s.includes('thriller') ||
        s.includes('mystery') ||
        s.includes('dystopian') ||
        s.includes('paranormal')
      );

    return isModern && hasGenreSignal;
  });
}

function compactHypothesisFromTaste(taste: TasteProfile | undefined): CompactHypothesis | null {
  if (!taste) return null;

  const mysterious = getTastePreferenceForKey(taste, 'mysterious');
  const tense = getTastePreferenceForKey(taste, 'tense');
  const dark = getTastePreferenceForKey(taste, 'dark');
  const cozy = getTastePreferenceForKey(taste, 'cozy');
  const adventurous = getTastePreferenceForKey(taste, 'adventurous');
  const romantic = getTastePreferenceForKey(taste, 'romantic');
  const warm = getTastePreferenceForKey(taste, 'warm');
  const literary = getTastePreferenceForKey(taste, 'literary');
  const idea = getTastePreferenceForKey(taste, 'idea');
  const character = getTastePreferenceForKey(taste, 'character');

  if (mysterious > 0.2 && tense > 0.2) {
    return {
      label: dark > 0.18 ? 'dark thriller/mystery' : 'thriller/mystery',
      requiredPatterns: [/\b(thriller|mystery|crime|detective|investigation|suspense|psychological thriller)\b/i],
      optionalPatterns: [
        /\b(psychological|serial killer|murder|police procedural|noir|gripping|tense)\b/i,
        /\b(dark|gritty|bleak)\b/i,
      ],
    };
  }

  if (cozy > 0.22 && mysterious > 0.12) {
    return {
      label: 'cozy mystery',
      requiredPatterns: [/\b(mystery|detective|whodunit|investigation)\b/i],
      optionalPatterns: [/\b(cozy|small town|gentle|comfort read|found family)\b/i],
    };
  }

  if (adventurous > 0.22 && character > 0.12) {
    return {
      label: 'adventurous character fiction',
      requiredPatterns: [/\b(adventure|quest|journey|survival|expedition|epic|fantasy|science fiction)\b/i],
      optionalPatterns: [/\b(character[-\s]?driven|relationship|found family)\b/i],
    };
  }

  if (romantic > 0.22) {
    return {
      label: 'romantic fiction',
      requiredPatterns: [/\b(romance|romantic|love story|relationship fiction)\b/i],
      optionalPatterns: [/\b(character[-\s]?driven|heartwarming|hopeful|emotional)\b/i],
    };
  }

  if (literary > 0.18 || idea > 0.18) {
    return {
      label: 'literary / idea-driven fiction',
      requiredPatterns: [/\b(fiction|novel|literary|speculative)\b/i],
      optionalPatterns: [/\b(layered|nuanced|complex|philosophical|thought[-\s]?provoking)\b/i],
    };
  }

  if (warm > 0.2 || character > 0.2) {
    return {
      label: 'character-driven fiction',
      requiredPatterns: [/\b(fiction|novel|character[-\s]?driven|relationship[-\s]?driven|family saga)\b/i],
      optionalPatterns: [/\b(warm|hopeful|tender|gentle|uplifting)\b/i],
    };
  }

  return null;
}

function isUnknownAuthor(candidate: Candidate): boolean {
  const author = normalizeKey(candidate.author);
  return !author || author === 'unknown' || author === 'various' || author === 'anonymous';
}

function isSummaryOrGuide(candidate: Candidate): boolean {
  const text = haystack(candidate);
  return SUMMARY_GUIDE_PATTERNS.some((pattern) => pattern.test(text));
}

function isNonFictionBleed(candidate: Candidate): boolean {
  const text = haystack(candidate);
  return NONFICTION_PATTERNS.some((pattern) => pattern.test(text));
}

function isWeakMetadataObject(candidate: Candidate): boolean {
  const text = haystack(candidate);
  const metadataScore = metadataSignals(candidate);
  if (WEAK_METADATA_PATTERNS.some((pattern) => pattern.test(text))) return true;
  return metadataScore <= 4 && !candidate.description && candidate.subjects.length === 0 && candidate.genres.length === 0;
}

function isPublicDomainNoise(candidate: Candidate, lane: RecommenderLane): boolean {
  const year = niYearFromCandidate(candidate);
  if (!year) return false;
  const text = haystack(candidate);
  const hasGenreSignal = /\b(thriller|mystery|crime|detective|fantasy|horror|science fiction|romance|dystopian|speculative)\b/i.test(text);
  if (lane === 'teen' && year < 1950 && !hasGenreSignal) return true;
  if (year < 1925 && candidate.ratingCount < 200 && !hasGenreSignal) return true;
  return false;
}

function candidateMatchesHypothesis(candidate: Candidate, hypothesis: CompactHypothesis | null): boolean {
  if (!hypothesis) return true;
  const text = haystack(candidate);
  return hypothesis.requiredPatterns.some((pattern) => pattern.test(text));
}

function scoreHypothesisAlignment(candidate: Candidate, hypothesis: CompactHypothesis | null): number {
  if (!hypothesis) return 0;
  const text = haystack(candidate);
  let score = 0;
  if (hypothesis.requiredPatterns.some((pattern) => pattern.test(text))) score += 2.8;
  for (const pattern of hypothesis.optionalPatterns) {
    if (pattern.test(text)) score += 0.8;
  }
  return score;
}

function rejectionReason(candidate: Candidate, lane: RecommenderLane, hypothesis: CompactHypothesis | null): string | null {
  if (!candidate.title) return 'missing title';
  if (isUnknownAuthor(candidate)) return 'unknown author';
  if (isSummaryOrGuide(candidate)) return 'summary-or-guide';
  if (isNonFictionBleed(candidate)) return 'nonfiction-bleed';
  if (isWeakMetadataObject(candidate)) return 'weak metadata';
  if (isPublicDomainNoise(candidate, lane)) return 'public-domain-noise';
  if (!candidateMatchesHypothesis(candidate, hypothesis)) return 'weak hypothesis match';
  return null;
}

function scoreCandidate(
  candidate: Candidate,
  lane: RecommenderLane,
  profile: RecommenderProfile,
  options: FinalRecommenderOptions,
  readerSoph: ReturnType<typeof estimateReaderSophisticationFromTaste>,
  hypothesis: CompactHypothesis | null,
): number {
  let score = 0;

  score += metadataSignals(candidate) * 0.16;
  score += scorePopularity(candidate) * 0.18 * profile.popularityWeight;
  score += scorePublisherBoost(candidate) * 0.8;
  score += scoreRecency(candidate) * (profile.recencyWeight * 0.7);
  score += scoreTasteMatch(candidate, options.tasteProfile) * 3.6;
  score += scoreHypothesisAlignment(candidate, hypothesis);

  if (candidate.hasCover) score += 0.12;

  if (candidate.formatCategory === 'manga' || candidate.formatCategory === 'comic') {
    score += lane === 'teen' ? 0.18 : -0.08;
  }

  const candSoph = estimateCandidateSophistication(candidate, lane);
  score += scoreSophisticationAlignment(readerSoph, candSoph) * 2.6;

  const titleKey = identityKey(candidate);
  const authorKey = normalizeKey(candidate.author);
  const seriesKey = deriveSeriesKey(candidate.title);

  if (inList(candidate.id, options.priorRejectedIds) || inList(titleKey, options.priorRejectedKeys)) score -= 5 * profile.negativeSignalPenalty;
  if (inList(candidate.id, options.priorRecommendedIds) || inList(titleKey, options.priorRecommendedKeys)) score -= 3.2;
  if (inList(authorKey, options.priorAuthors)) score -= 0.9 * profile.authorPenaltyStrength;
  if (seriesKey && inList(seriesKey, options.priorSeriesKeys)) score -= 1.1;

  if (lane === 'adult' && /\b(juvenile fiction|young readers|beginning reader|chapter book)\b/i.test(haystack(candidate))) score -= 3;
  if (/\b(study guide|workbook|analysis|criticism|manual|textbook)\b/i.test(haystack(candidate))) score -= 4;
  if (!candidate.description && candidate.subjects.length === 0 && candidate.genres.length === 0) score -= 2.5;

  return score;
}

export function finalRecommenderForDeck(
  candidates: Candidate[],
  deckKey: DeckKey,
  options: FinalRecommenderOptions = {}
): RecommendationDoc[] {
  const lane = options.lane ?? laneFromDeckKey(options.deckKey ?? deckKey);
  const profile: RecommenderProfile = {
    ...recommenderProfiles[lane],
    ...(options.profileOverride || {}),
  };

  const hypothesis = compactHypothesisFromTaste(options.tasteProfile);
  const basePool = applyMinimalYaFilter(dedupeCandidates(candidates).filter((candidate) => !!candidate.title), deckKey);
  const filtered = basePool.filter((candidate) => !rejectionReason(candidate, lane, hypothesis));
  const unique = filtered.length >= Math.max(profile.minKeep, 6) ? filtered : basePool;
  const readerSoph = estimateReaderSophisticationFromTaste(options.tasteProfile, lane);

  const scored = unique
    .map((candidate) => {
      const reject = rejectionReason(candidate, lane, hypothesis);
      const preFilterScore = reject ? Number.NEGATIVE_INFINITY : scoreCandidate(candidate, lane, profile, options, readerSoph, hypothesis);
      const candidateWithDiagnostics: CandidateWithDiagnostics = {
        ...candidate,
        diagnostics: {
          ...(candidate as CandidateWithDiagnostics).diagnostics,
          source: candidate.source || 'unknown',
          preFilterScore,
          rejectionReason: reject || undefined,
        },
      };

      return {
        candidate: candidateWithDiagnostics,
        score: preFilterScore,
      };
    })
    .filter((entry) => Number.isFinite(entry.score))
    .sort((a, b) => b.score - a.score);

  const targetMax = Math.max(profile.minKeep, 10);
  const kept: CandidateWithDiagnostics[] = [];
  const selected = kept;
  const seen = new Set<string>();
  const sourceCounts: Record<string, number> = {};

  const addCandidateIfAllowed = (candidate: CandidateWithDiagnostics): boolean => {
    const key = identityKey(candidate);
    if (seen.has(key)) return false;

    const authorKey = normalizeKey(candidate.author);
    const currentAuthorCount = kept.filter((item) => normalizeKey(item.author) === authorKey).length;
    if (authorKey && currentAuthorCount >= profile.authorRepeatLimit) return false;

    kept.push(candidate);
    seen.add(key);

    const source = candidate.source || 'unknown';
    sourceCounts[source] = (sourceCounts[source] || 0) + 1;
    return true;
  };

  const countSelectedBy = (getKey: (candidate: CandidateWithDiagnostics) => string): Map<string, number> => {
    const counts = new Map<string, number>();
    for (const candidate of selected) {
      const key = getKey(candidate);
      if (!key) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
  };

  const publisherKey = (candidate: Candidate): string => normalizeKey(candidate.publisher);

  const titleFamilyKey = (candidate: Candidate): string =>
    normalizeKey(candidate.title)
      .replace(/\b(book|volume|vol|part|episode|season)\b\s*(?:#|no\.?|number)?\s*(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/gi, ' ')
      .replace(/\b(girl|dark|murder|death|blood|shadow|secret|wife|daughter|house|heart)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const tokenSetForCandidate = (candidate: Candidate): Set<string> => {
    const tokens = normalizeKey([
      candidate.title,
      candidate.subtitle || '',
      ...(candidate.subjects || []),
      ...(candidate.genres || []),
    ].join(' '))
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 4);

    return new Set(tokens);
  };

  const tokenOverlap = (left: Set<string>, right: Set<string>): number => {
    let overlap = 0;
    for (const token of left) {
      if (right.has(token)) overlap += 1;
    }
    return overlap;
  };

  const hasSeriesSignals = (candidate: Candidate): boolean =>
    /\bseries\b/i.test(haystack(candidate)) || /\bbook\s*\d+\b/i.test(candidate.title);

  const dynamicSelectionPenalty = (candidate: CandidateWithDiagnostics): number => {
    let penalty = 0;

    const authorCounts = countSelectedBy((item) => normalizeKey(item.author));
    const seriesCounts = countSelectedBy((item) => deriveSeriesKey(item.title));
    const publisherCounts = countSelectedBy((item) => publisherKey(item));
    const titleFamilyCounts = countSelectedBy((item) => titleFamilyKey(item));

    const authorKey = normalizeKey(candidate.author);
    const seriesKey = deriveSeriesKey(candidate.title);
    const pubKey = publisherKey(candidate);
    const familyKey = titleFamilyKey(candidate);

    const authorCount = authorKey ? (authorCounts.get(authorKey) || 0) : 0;
    const seriesCount = seriesKey ? (seriesCounts.get(seriesKey) || 0) : 0;
    const publisherCount = pubKey ? (publisherCounts.get(pubKey) || 0) : 0;
    const familyCount = familyKey ? (titleFamilyCounts.get(familyKey) || 0) : 0;

    penalty += authorCount * (2.25 * profile.authorPenaltyStrength);
    penalty += seriesCount * 3.5;
    penalty += familyCount * 1.6;
    penalty += publisherCount * 0.85;

    const currentSourceCount = sourceCounts[candidate.source || 'unknown'] || 0;
    if (candidate.source === 'googleBooks' && currentSourceCount >= 4) {
      penalty += (currentSourceCount - 3) * 0.45;
    }
    if (candidate.source === 'openLibrary' && currentSourceCount >= 4) {
      penalty += (currentSourceCount - 3) * 0.2;
    }

    const candidateTokens = tokenSetForCandidate(candidate);
    for (const existing of selected) {
      const overlap = tokenOverlap(candidateTokens, tokenSetForCandidate(existing));
      if (overlap >= 5) penalty += 2.6;
      else if (overlap >= 3) penalty += 1.35;
      else if (overlap >= 2) penalty += 0.6;
    }

    if (hasSeriesSignals(candidate)) {
      const existingSeriesLike = selected.filter((item) => hasSeriesSignals(item)).length;
      if (existingSeriesLike >= 3) penalty += (existingSeriesLike - 2) * 0.4;
    }

    return penalty;
  };

  const addRanked = (pool: Array<{ candidate: CandidateWithDiagnostics; score: number }>) => {
    const remaining = new Map<string, { candidate: CandidateWithDiagnostics; baseScore: number }>();
    for (const entry of pool) {
      remaining.set(identityKey(entry.candidate), { candidate: entry.candidate, baseScore: entry.score });
    }

    while (selected.length < targetMax && remaining.size > 0) {
      let bestKey = '';
      let bestAdjustedScore = Number.NEGATIVE_INFINITY;
      let bestCandidate: CandidateWithDiagnostics | null = null;

      for (const [key, entry] of remaining.entries()) {
        const { candidate, baseScore } = entry;

        if (seen.has(key)) continue;

        const penalty = dynamicSelectionPenalty(candidate);
        const adjustedScore = baseScore - penalty;

        candidate.diagnostics = {
          ...candidate.diagnostics,
          source: candidate.diagnostics?.source || candidate.source || 'unknown',
          preFilterScore: candidate.diagnostics?.preFilterScore ?? baseScore,
          postFilterScore: adjustedScore,
        };

        if (adjustedScore > bestAdjustedScore) {
          bestAdjustedScore = adjustedScore;
          bestKey = key;
          bestCandidate = candidate;
        }
      }

      if (!bestCandidate || !bestKey) break;

      if (!addCandidateIfAllowed(bestCandidate)) {
        remaining.delete(bestKey);
        continue;
      }

      remaining.delete(bestKey);
    }
  };

  addRanked(scored);

  return kept.map((candidate) => ({
    ...(candidate.rawDoc as RecommendationDoc),
    diagnostics: candidate.diagnostics,
  } as RecommendationDocWithDiagnostics));
}
