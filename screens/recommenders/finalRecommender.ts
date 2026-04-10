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
  tasteAlignment?: number;
  queryAlignment?: number;
  rungBoost?: number;
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
  /\b(summary|analysis|student edition|teacher guide|study guide|workbook|lesson plan|book club kit|companion|critical essays|history and criticism|literary criticism|encyclopedia|handbook)\b/i,
];

const WEAK_METADATA_PATTERNS = [
  /\b(annotated|complete works|selected works|collection|anthology|omnibus|box set|boxed set|illustrated edition|stories of the year)\b/i,
];

const ANTHOLOGY_COLLECTION_PATTERNS = [
  /\b(short stories|short story collection|collection|anthology|omnibus|box set|boxed set|selected stories|complete stories|stories of the year|complete novels|illustrated edition)\b/i,
];

const INSTITUTIONAL_AUTHOR_PATTERNS = [
  /\b(public library|library|university|college|society|association|committee|department|press bureau|bulletin|museum|archive|archives|institute)\b/i,
];

const CATALOG_LIKE_TITLE_PATTERNS = [
  /^books?\s+for\b/i,
  /^among\s+our\s+books\b/i,
  /\bcatalog(?:ue)?\b/i,
  /\bbulletin\b/i,
  /\breport\b/i,
  /\bnews(letter|sheet)?\b/i,
  /\bbookseller\b/i,
  /\bnewsdealer\b/i,
  /\bstationer\b/i,
];

const FICTION_SHELF_POSITIVE_PATTERNS = [
  /\b(thriller|mystery|crime|detective|suspense|psychological thriller|police procedural|murder|serial killer|whodunit|investigation)\b/i,
  /\b(novel|fiction)\b/i,
];

const PLOT_SIGNAL_PATTERNS = [
  /\b(murder|investigation|detective|killer|police|case|missing|disappearance|conspiracy|survival|escape|pursuit|suspect|whodunit|crime|thriller|suspense)\b/i,
  /\b(protagonist|hero|heroine|journalist|inspector|sleuth|woman|man|family|couple|girl|boy)\b/i,
];

const GENERIC_CATEGORY_TITLE_PATTERNS = [
  /^(real\s+)?mystery\s+and\s+thrillers?$/i,
  /^mystery\s+and\s+thrillers?$/i,
  /^crime\s+and\s+mystery$/i,
  /^thrillers?\s*&\s*mysteries?$/i,
];

const REFERENCE_OR_CRITICISM_TITLE_PATTERNS = [
  /\bwhat do i read next\b/i,
  /\bwhodunit\b/i,
  /\barmchair detective\b/i,
  /\bfiction index\b/i,
  /\bbest new horror\b/i,
  /\bscience fiction[, ]+fantasy[, ]+&?\s*horror\b/i,
  /\bindex\b/i,
  /\bbibliograph(y|ies)\b/i,
  /\bencyclopedia\b/i,
  /\bhandbook\b/i,
  /\bcompanion\b/i,
  /\bguide\b/i,
  /\bstudy\b/i,
  /\bcriticism\b/i,
  /\bcritical\b/i,
  /\banalysis\b/i,
  /\bhistory and criticism\b/i,
  /\bliterary criticism\b/i,
  /\breader'?s guide\b/i,
  /\bteacher'?s guide\b/i,
  /\bstudent edition\b/i,
  /\bsummary\b/i,
  /\bmanual\b/i,
  /\btextbook\b/i,
  /\bessays?\b/i,
  /\bdrama\b/i,
  /\bstories of the year\b/i,
  /\bboxed set\b/i,
  /\billustrated edition\b/i,
  /\brise of\b/i,
  /\breference\b/i,
  /\bthe contemporary [a-z ]*novel\b/i,
  /\b[a-z ]+mystery and detective novels\b/i,
  /\b[a-z ]+detective novels?\b/i,
  /\b[a-z ]+fiction index\b/i,
];

function normalizeKey(value: unknown): string {
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

function collectNumericTasteSignals(
  value: unknown,
  path = '',
  out: Array<{ path: string; value: number }> = [],
): Array<{ path: string; value: number }> {
  if (value == null) return out;
  if (typeof value === 'number' && Number.isFinite(value)) {
    out.push({ path, value });
    return out;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      collectNumericTasteSignals(value[i], `${path}[${i}]`, out);
    }
    return out;
  }
  if (typeof value === 'object') {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      collectNumericTasteSignals(nested, path ? `${path}.${key}` : key, out);
    }
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
  const signals = collectNumericTasteSignals(taste as unknown);
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

function tokenSetFromText(value: string): Set<string> {
  return new Set(
    normalizeKey(value)
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 4)
  );
}

function scoreQueryAlignment(candidate: Candidate): number {
  const queryTerms = Array.isArray(candidate.queryTerms)
    ? candidate.queryTerms.filter((term) => String(term || '').trim().length >= 3)
    : [];

  if (!queryTerms.length && !candidate.queryText) return 0;

  const docTokens = tokenSetFromText(haystack(candidate));
  const queryTokens = new Set<string>();

  for (const term of queryTerms) {
    for (const token of tokenSetFromText(term)) queryTokens.add(token);
  }

  let overlap = 0;
  for (const token of queryTokens) {
    if (docTokens.has(token)) overlap += 1;
  }

  const overlapRatio = queryTokens.size ? overlap / queryTokens.size : 0;
  const rawQueryText = String(candidate.queryText || '').toLowerCase().trim();
  const phraseBonus = rawQueryText && haystack(candidate).toLowerCase().includes(rawQueryText) ? 0.35 : 0;

  return Math.max(0, Math.min(1.35, overlapRatio + phraseBonus));
}

function scoreRungBoost(candidate: Candidate): number {
  const rung = Number(candidate.queryRung);
  if (!Number.isFinite(rung)) return 0;
  if (rung <= 0) return 1.4;
  if (rung === 1) return 1.05;
  if (rung === 2) return 0.7;
  if (rung === 3) return 0.35;
  return 0.1;
}

function scorePopularity(candidate: Candidate): number {
  return Math.log10(candidate.ratingCount + 1) * ((candidate.averageRating > 0 ? candidate.averageRating : 4) / 5) * 3.5;
}

function scorePublisherBoost(candidate: Candidate): number {
  if (!candidate.publisher) return 0;
  if (/(penguin|random house|knopf|doubleday|viking|harper|macmillan|tor|simon\s*&?\s*schuster|hachette|scholastic)/i.test(candidate.publisher)) {
    return 0.7;
  }
  return 0;
}

function scoreRecency(candidate: Candidate): number {
  if (!candidate.publicationYear) return 0;

  const currentYear = new Date().getFullYear();
  const age = currentYear - candidate.publicationYear;
  const firstYear = niFirstPublishYear(candidate);
  const isModernReprint =
    Boolean(firstYear) &&
    Boolean(candidate.publicationYear) &&
    firstYear < 1980 &&
    candidate.publicationYear >= 2000;

  if (isModernReprint) return 0.03;
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

function niFirstPublishYear(candidate: Candidate): number | null {
  const raw =
    (candidate.rawDoc as any)?.first_publish_year ??
    (candidate.rawDoc as any)?.doc?.first_publish_year ??
    null;

  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;

  const match = String(raw || '').match(/\b(18|19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

function niEditionCountFromCandidate(candidate: Candidate): number {
  const raw =
    (candidate.rawDoc as any)?.edition_count ??
    (candidate.rawDoc as any)?.doc?.edition_count ??
    (candidate as any)?.editionCount ??
    0;

  const num = Number(raw);
  return Number.isFinite(num) ? num : 0;
}

function isStillActivelyPublished(candidate: Candidate): boolean {
  const firstYear = niFirstPublishYear(candidate);
  const currentEditionYear = candidate.publicationYear ?? null;
  const editionCount = niEditionCountFromCandidate(candidate);
  const hasPublisher = Boolean(String(candidate.publisher || '').trim());
  const hasCover = Boolean(candidate.hasCover);

  if (currentEditionYear && currentEditionYear >= 2000) return true;
  if (editionCount >= 8) return true;
  if (hasPublisher && firstYear && currentEditionYear && currentEditionYear - firstYear >= 20) return true;
  if (hasCover && editionCount >= 4) return true;

  return false;
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
    const isOldClassic = typeof effectiveYear === 'number' && effectiveYear > 0 && effectiveYear < 1950;
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

function isInstitutionalOrCatalogCandidate(candidate: Candidate): boolean {
  const title = String(candidate.title || '');
  const author = String(candidate.author || '');
  const publisher = String(candidate.publisher || '');
  const text = haystack(candidate);

  if (!author || /^(unknown|anonymous|various)$/i.test(author.trim())) return false;

  if (INSTITUTIONAL_AUTHOR_PATTERNS.some((pattern) => pattern.test(author))) return true;
  if (INSTITUTIONAL_AUTHOR_PATTERNS.some((pattern) => pattern.test(publisher))) return true;
  if (CATALOG_LIKE_TITLE_PATTERNS.some((pattern) => pattern.test(title))) return true;

  if (
    /\b(library|catalog(?:ue)?|bulletin|report|pamphlet|circular)\b/i.test(text) &&
    !/\b(thriller|mystery|crime|detective|suspense|novel|fiction)\b/i.test(text)
  ) {
    return true;
  }

  return false;
}

function hasReferenceOrCriticismTitle(candidate: Candidate): boolean {
  const title = String(candidate.title || '');
  const subtitle = String(candidate.subtitle || '');
  const combined = `${title} ${subtitle}`.trim();
  if (GENERIC_CATEGORY_TITLE_PATTERNS.some((pattern) => pattern.test(combined))) return true;
  return REFERENCE_OR_CRITICISM_TITLE_PATTERNS.some((pattern) => pattern.test(combined));
}

function hasPlotLikeSignal(candidate: Candidate): boolean {
  const text = haystack(candidate);
  return PLOT_SIGNAL_PATTERNS.some((pattern) => pattern.test(text));
}

function looksLikeActualFictionBook(candidate: Candidate): boolean {
  const text = haystack(candidate);
  const hasShelfSignal = FICTION_SHELF_POSITIVE_PATTERNS.some((pattern) => pattern.test(text));
  const hasSubjectGenreSignal =
    candidate.subjects.some((s) => /\b(thriller|mystery|crime|detective|suspense|fiction|novel)\b/i.test(String(s))) ||
    candidate.genres.some((s) => /\b(thriller|mystery|crime|detective|suspense|fiction|novel)\b/i.test(String(s)));

  if (!hasShelfSignal && !hasSubjectGenreSignal) return false;
  if (hasReferenceOrCriticismTitle(candidate)) return false;

  const hasNarrativeSignal = hasPlotLikeSignal(candidate);
  const hasDescription = String(candidate.description || '').trim().length >= 80;

  if (hasNarrativeSignal) return true;
  if (hasDescription && /\b(novel|fiction)\b/i.test(text) && !/\b(criticism|analysis|guide|index|bibliograph|history and criticism|reference)\b/i.test(text)) {
    return true;
  }

  return false;
}

function isUnknownAuthor(candidate: Candidate): boolean {
  const author = normalizeKey(candidate.author);
  return !author || author === 'unknown' || author === 'various' || author === 'anonymous';
}

function isSummaryOrGuide(candidate: Candidate): boolean {
  const text = haystack(candidate);
  return hasReferenceOrCriticismTitle(candidate) || SUMMARY_GUIDE_PATTERNS.some((pattern) => pattern.test(text));
}

function isNonFictionBleed(candidate: Candidate): boolean {
  const text = haystack(candidate);
  return hasReferenceOrCriticismTitle(candidate) || NONFICTION_PATTERNS.some((pattern) => pattern.test(text));
}

function isHardNonFiction(candidate: Candidate): boolean {
  const text = haystack(candidate);

  if (/\b(nonfiction|non-fiction|biography|memoir|history|philosophy|criticism|literary criticism|essays|analysis)\b/i.test(text)) {
    return true;
  }

  if (!candidate.genres?.length && /\b(study|guide|analysis|criticism|theory)\b/i.test(text)) {
    return true;
  }

  return false;
}

function isWeakMetadataObject(candidate: Candidate): boolean {
  const text = haystack(candidate);
  const metadataScore = metadataSignals(candidate);
  if (WEAK_METADATA_PATTERNS.some((pattern) => pattern.test(text))) return true;
  return metadataScore <= 4 && !candidate.description && candidate.subjects.length === 0 && candidate.genres.length === 0;
}

function isLowConfidenceCandidate(candidate: Candidate): boolean {
  const score = metadataSignals(candidate);
  const text = haystack(candidate);

  if (score < 5) return true;
  if (!candidate.description && candidate.subjects.length === 0) return true;
  if (text.length < 40) return true;

  return false;
}

function hasAnyHardcover429(candidate: Candidate): boolean {
  const raw = (candidate as any)?.rawDoc;
  const blobs = [raw, raw?.raw, raw?.diagnostics, raw?.hardcover, raw?.doc];

  const joined = blobs
    .map((v) => {
      try {
        return typeof v === 'string' ? v : JSON.stringify(v || {});
      } catch {
        return '';
      }
    })
    .join(' ')
    .toLowerCase();

  return joined.includes('hardcover api request failed') || joined.includes('status":429') || joined.includes('status:429');
}

function hasFallbackFictionMetadata(candidate: Candidate): boolean {
  return Boolean(
    candidate.hasCover ||
    candidate.publicationYear ||
    (candidate.subjects?.length || 0) > 0 ||
    (candidate.genres?.length || 0) > 0 ||
    ((candidate.description || '').length >= 60)
  );
}

function isMetadataFragileButViable(candidate: Candidate): boolean {
  return looksLikeActualFictionBook(candidate) && !isInstitutionalOrCatalogCandidate(candidate) && hasFallbackFictionMetadata(candidate);
}

function isHardRejectReason(reason: string | null | undefined): boolean {
  if (!reason) return false;
  return [
    'missing title',
    'unknown author',
    'institutional-or-catalog',
    'anthology-or-collection',
    'summary-or-guide',
    'hard-nonfiction',
    'nonfiction-bleed',
    'public-domain-noise',
    'not-actual-fiction-book',
    'ineligible-for-shelf',
  ].includes(reason);
}

function softMetadataPenalty(candidate: Candidate): number {
  let penalty = 0;
  if (isWeakMetadataObject(candidate)) penalty += 1.15;
  if (isLowConfidenceCandidate(candidate)) penalty += 1.35;
  if (hasAnyHardcover429(candidate)) penalty -= 0.4;
  if (isMetadataFragileButViable(candidate)) penalty -= 0.35;
  return Math.max(0, penalty);
}

function isPublicDomainNoise(candidate: Candidate, lane: RecommenderLane): boolean {
  const editionYear = niYearFromCandidate(candidate);
  const firstYear = niFirstPublishYear(candidate) ?? editionYear;
  if (!firstYear && !editionYear) return false;

  const text = haystack(candidate);
  const hasStrongThrillerLikeSignal = /\b(thriller|mystery|crime|detective|investigation|suspense|psychological thriller|serial killer|police procedural|murder|novel|fiction)\b/i.test(text);
  const hasAnyGenreSignal = /\b(thriller|mystery|crime|detective|fantasy|horror|science fiction|romance|dystopian|speculative|novel|fiction)\b/i.test(text);
  const activelyPublished = isStillActivelyPublished(candidate);
  const effectiveYear = firstYear || editionYear || 0;

  if (isInstitutionalOrCatalogCandidate(candidate)) return true;
  if (lane === 'adult' && effectiveYear < 1960 && !activelyPublished) return true;
  if (lane === 'adult' && effectiveYear < 1980 && !hasStrongThrillerLikeSignal && !activelyPublished) return true;
  if (lane === 'teen' && effectiveYear < 1950 && !hasAnyGenreSignal && !activelyPublished) return true;
  if (effectiveYear < 1935 && candidate.ratingCount < 500 && !activelyPublished) return true;

  return false;
}

function isAnthologyOrCollection(candidate: Candidate): boolean {
  const text = haystack(candidate);
  const title = String(candidate.title || '');
  if (GENERIC_CATEGORY_TITLE_PATTERNS.some((pattern) => pattern.test(title))) return true;
  return ANTHOLOGY_COLLECTION_PATTERNS.some((pattern) => pattern.test(text));
}

function normalizedCandidateText(candidate: Candidate): string {
  return haystack(candidate).toLowerCase();
}

function hasStrongThrillerSignal(candidate: Candidate): boolean {
  const text = normalizedCandidateText(candidate);
  return (
    /\b(thriller|crime|mystery|detective|suspense)\b/i.test(text) ||
    /\b(murder|investigation|investigat|serial killer|police procedural|police|case)\b/i.test(text)
  );
}

function hasStrongRomanceSignal(candidate: Candidate): boolean {
  const text = normalizedCandidateText(candidate);
  return (
    /\b(romance|romantic|love story|relationship fiction)\b/i.test(text) ||
    /\b(friends to lovers|fake dating|marriage of convenience)\b/i.test(text)
  );
}

function hasStrongSpeculativeSignal(candidate: Candidate): boolean {
  const text = normalizedCandidateText(candidate);
  return (
    /\b(science fiction|sci fi|fantasy|horror|dystopian|speculative)\b/i.test(text) ||
    /\b(space opera|time travel|magic|haunted|ghost|monster)\b/i.test(text)
  );
}

function hasStrongHistoricalSignal(candidate: Candidate): boolean {
  const text = normalizedCandidateText(candidate);
  return /\b(historical fiction|world war|ancient rome|ancient greece|19th century|war of the roses|crusades)\b/i.test(text);
}

function hasStrongTitleCaseNarrativeSignal(candidate: Candidate): boolean {
  const title = String(candidate.title || '');
  const subtitle = String(candidate.subtitle || '');
  const combined = `${title} ${subtitle}`.trim();
  return /(thriller|mystery|crime|detective|suspense|novel|missing|murder|killer|investigation|dark|girl|wife|secret|house|wood)/i.test(combined);
}

function looksLikeLooseLiteraryOrPoetryTitle(candidate: Candidate): boolean {
  const title = String(candidate.title || '').trim();
  if (!title) return false;
  if (/[:?]/.test(title)) return false;
  if (/(thriller|mystery|crime|detective|suspense|novel|murder|killer|investigation)/i.test(title)) return false;
  if (/(words|heart|peace|war|song|poems?|verse|prayer|dreams?)/i.test(title)) return true;
  return false;
}

function candidateEligibleForHypothesis(candidate: Candidate, hypothesis: CompactHypothesis | null): boolean {
  if (!hypothesis) return true;

  const label = hypothesis.label.toLowerCase();

  if (label.includes('thriller') || label.includes('mystery')) {
    return hasStrongThrillerSignal(candidate) && looksLikeActualFictionBook(candidate) && !isInstitutionalOrCatalogCandidate(candidate) && !looksLikeLooseLiteraryOrPoetryTitle(candidate);
  }

  if (label.includes('romantic')) return hasStrongRomanceSignal(candidate);
  if (label.includes('adventurous')) return hasStrongSpeculativeSignal(candidate);
  if (label.includes('historical')) return hasStrongHistoricalSignal(candidate);
  if (label.includes('literary') || label.includes('character-driven')) return true;

  return true;
}

function candidateMatchesHypothesis(candidate: Candidate, hypothesis: CompactHypothesis | null): boolean {
  if (!hypothesis) return true;

  const text = haystack(candidate);
  const requiredMatch = hypothesis.requiredPatterns.some((pattern) => pattern.test(text));
  if (!requiredMatch) return false;

  const optionalHits = hypothesis.optionalPatterns.filter((pattern) => pattern.test(text)).length;
  const label = hypothesis.label.toLowerCase();

  if (label.includes('thriller') || label.includes('mystery')) {
    return hasStrongThrillerSignal(candidate) && (optionalHits >= 1 || hasStrongTitleCaseNarrativeSignal(candidate));
  }
  if (label.includes('romantic')) return hasStrongRomanceSignal(candidate);
  if (label.includes('adventurous')) return hasStrongSpeculativeSignal(candidate);
  if (label.includes('historical')) return hasStrongHistoricalSignal(candidate);

  return true;
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
  if (isInstitutionalOrCatalogCandidate(candidate)) return 'institutional-or-catalog';
  if (isAnthologyOrCollection(candidate)) return 'anthology-or-collection';
  if (isSummaryOrGuide(candidate)) return 'summary-or-guide';
  if (isHardNonFiction(candidate)) return 'hard-nonfiction';
  if (isNonFictionBleed(candidate)) return 'nonfiction-bleed';
  if (isPublicDomainNoise(candidate, lane)) return 'public-domain-noise';
  if (!looksLikeActualFictionBook(candidate)) return 'not-actual-fiction-book';
  if (!candidateEligibleForHypothesis(candidate, hypothesis)) return 'ineligible-for-shelf';
  if (!candidateMatchesHypothesis(candidate, hypothesis)) return 'weak hypothesis match';

  // IMPORTANT:
  // Weak metadata / low confidence are NOT hard rejects in the 20Q model
  // if the book still looks like viable fiction. They should be penalized,
  // not removed from the shelf.
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

  const tasteAlignment = scoreTasteMatch(candidate, options.tasteProfile);
  const queryAlignment = scoreQueryAlignment(candidate);
  const rungBoost = scoreRungBoost(candidate);

  score += tasteAlignment * 3.9;
  score += scoreHypothesisAlignment(candidate, hypothesis) * 1.1;
  score += queryAlignment * 2.6;
  score += rungBoost * 1.75;
  score -= softMetadataPenalty(candidate);

  if (candidate.hasCover) score += 0.12;
  if (hasAnyHardcover429(candidate)) score += 0.3;
  if (isMetadataFragileButViable(candidate)) score += 0.2;

  if (candidate.formatCategory === 'manga' || candidate.formatCategory === 'comic') {
    score += lane === 'teen' ? 0.18 : -0.08;
  }

  const candSoph = estimateCandidateSophistication(candidate, lane);
  score += scoreSophisticationAlignment(readerSoph, candSoph) * 2.6;

  const titleKey = identityKey(candidate);
  const authorKey = normalizeKey(candidate.author);
  const seriesKey = deriveSeriesKey(candidate.title);

  if (inList(candidate.id, options.priorRejectedIds) || inList(titleKey, options.priorRejectedKeys)) {
    score -= 5 * profile.negativeSignalPenalty;
  }
  if (inList(candidate.id, options.priorRecommendedIds) || inList(titleKey, options.priorRecommendedKeys)) {
    score -= 3.2;
  }
  if (inList(authorKey, options.priorAuthors)) {
    score -= 0.9 * profile.authorPenaltyStrength;
  }
  if (seriesKey && inList(seriesKey, options.priorSeriesKeys)) {
    score -= 1.1;
  }

  if (lane === 'adult' && /\b(juvenile fiction|young readers|beginning reader|chapter book)\b/i.test(haystack(candidate))) {
    score -= 3;
  }
  if (/\b(study guide|workbook|analysis|criticism|manual|textbook)\b/i.test(haystack(candidate))) {
    score -= 4;
  }
  if (!candidate.description && candidate.subjects.length === 0 && candidate.genres.length === 0) {
    score -= 2.5;
  }

  // --- MAINSTREAM / QUALITY SIGNAL LAYER (NEW) ---

  const title = String(candidate.title || '').toLowerCase();

  // 1. Penalize over-serialized / KU-style titles
  if (/\b(book|volume|series)\s*\d+\b/i.test(title)) {
    score -= 1.25;
  }

  // 2. Penalize generic KU naming patterns
  if (
    /\b(fbi|detective|crime thriller|suspense thriller)\b/i.test(title) &&
    title.length < 45
  ) {
    score -= 0.9;
  }

  // 3. Penalize excessive series clustering (already partially handled later, this reinforces early)
  if (/\b(series|book\s*\d+)\b/i.test(title)) {
    score -= 0.6;
  }

  // 4. Boost cleaner standalone titles
  if (!/\b(book\s*\d+|series|volume)\b/i.test(title)) {
    score += 0.45;
  }

  // 5. Slight boost for established (older but not ancient) works
  if (candidate.publicationYear && candidate.publicationYear < 2015) {
    score += 0.3;
  }

  // 6. Strong boost for actual popularity (you already compute ratingCount — use it more)
  if (candidate.ratingCount > 5000) {
    score += 1.2;
  } else if (candidate.ratingCount > 1000) {
    score += 0.7;
  } else if (candidate.ratingCount > 200) {
    score += 0.3;
  }

  // --- END PATCH ---

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
  const basePool = applyMinimalYaFilter(
    dedupeCandidates(candidates).filter((candidate) => !!candidate.title),
    deckKey
  );

  // 20Q shelf rule:
  // hard rejects only for clearly wrong-shelf books.
  const filtered = basePool.filter((candidate) => !rejectionReason(candidate, lane, hypothesis));

  // Safety fallback only if the hard shelf over-tightens.
  const unique =
    filtered.length >= Math.max(profile.minKeep, 6)
      ? filtered
      : basePool.filter((candidate) => !isHardRejectReason(rejectionReason(candidate, lane, hypothesis)));

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
          tasteAlignment: scoreTasteMatch(candidate, options.tasteProfile),
          queryAlignment: scoreQueryAlignment(candidate),
          rungBoost: scoreRungBoost(candidate),
        },
      };

      return {
        candidate: candidateWithDiagnostics,
        score: preFilterScore,
      };
    })
    .filter((entry) => Number.isFinite(entry.score))
    .sort((a, b) => b.score - a.score);

  const targetMin = Math.max(profile.minKeep, 6);
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

    const currentRung = Number(candidate.queryRung);
    if (Number.isFinite(currentRung)) {
      const betterRungExists = selected.some((item) => {
        const itemRung = Number(item.queryRung);
        return Number.isFinite(itemRung) && itemRung < currentRung;
      });

      if (betterRungExists && currentRung >= 3) {
        penalty += 1.25;
      }
      if (betterRungExists && currentRung === 2) {
        penalty += 0.35;
      }
      const selectedSameOrWorseRung = selected.filter((item) => {
        const itemRung = Number(item.queryRung);
        return Number.isFinite(itemRung) && itemRung >= currentRung;
      }).length;

      if (currentRung >= 2 && selectedSameOrWorseRung >= 3) {
        penalty += (selectedSameOrWorseRung - 2) * 0.35;
      }
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
      remaining.set(identityKey(entry.candidate), {
        candidate: entry.candidate,
        baseScore: entry.score,
      });
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

  // Safety valve:
  // if we somehow still collapse too far, backfill from the best remaining scored pool
  // even if metadata is weak, as long as shelf eligibility is not hard-rejected.
  if (kept.length < targetMin) {
    for (const entry of scored) {
      if (kept.length >= targetMin) break;
      addCandidateIfAllowed(entry.candidate);
    }
  }

  return kept.map((candidate) => ({
    ...(candidate.rawDoc as RecommendationDoc),
    diagnostics: candidate.diagnostics,
  } as RecommendationDocWithDiagnostics));
}