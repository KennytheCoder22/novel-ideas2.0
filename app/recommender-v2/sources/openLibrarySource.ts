import type { SourceAdapterV2, SourceDiagnosticV2, SourceFetchDiagnosticV2, SourcePlan, SourceResult, TasteProfile } from "../types";
import { DEFAULT_OPEN_LIBRARY_PROFILE, openLibraryArtifactReasonLabels, openLibraryProfileForAgeBand, type OpenLibraryAgeProfile } from "./openLibraryProfiles";

const RESPONSE_BODY_PREFIX_LIMIT = 240;
const ADULT_OPEN_LIBRARY_FIRST_RUN_TIMEOUT_MS = 4_500;
const ADULT_OPEN_LIBRARY_FIRST_RUN_RETRY_TIMEOUT_MS = 2_500;
const ADULT_OPEN_LIBRARY_PROXY_CLIENT_TIMEOUT_MS = 19_000;
const TEEN_OPEN_LIBRARY_PROXY_CLIENT_TIMEOUT_MS = 4_500;
const TEEN_OPEN_LIBRARY_TIMEOUT_CASCADE_SPECIFIC_QUERY_CAP_MS = 1_500;
const TEEN_OPEN_LIBRARY_TIMEOUT_CASCADE_SPECIFIC_QUERY_FLOOR_MS = 500;
const TEEN_OPEN_LIBRARY_DELAYED_RETRY_MIN_BUDGET_MS = 1_000;
const TEEN_OPEN_LIBRARY_TIMEOUT_CIRCUIT_BREAKER_LIMIT = 3;
const MIDDLE_GRADES_OPEN_LIBRARY_PROXY_CLIENT_TIMEOUT_MS = 1_500;
const K2_OPEN_LIBRARY_PROXY_CLIENT_TIMEOUT_MS = 1_500;
const MIDDLE_GRADES_OPEN_LIBRARY_INITIAL_QUERY_TIMEOUT_MS = 1_500;
const MIDDLE_GRADES_OPEN_LIBRARY_TARGETED_QUERY_CAP_MS = 1_500;
const MIDDLE_GRADES_OPEN_LIBRARY_MIN_PLANNED_QUERY_ATTEMPTS = 5;
const MIDDLE_GRADES_OPEN_LIBRARY_TIMEOUT_CIRCUIT_BREAKER_LIMIT = 3;
const K2_OPEN_LIBRARY_TIMEOUT_CIRCUIT_BREAKER_LIMIT = 3;
const MIDDLE_GRADES_OPEN_LIBRARY_TIMEOUT_CASCADE_QUERY_CAP_MS = 1_500;
const MIDDLE_GRADES_OPEN_LIBRARY_TIMEOUT_CASCADE_QUERY_FLOOR_MS = 1_000;
const MIDDLE_GRADES_OPEN_LIBRARY_DELAYED_RETRY_MIN_BUDGET_MS = 1_000;
const MIDDLE_GRADES_OPEN_LIBRARY_FINAL_SAFE_RECOVERY_MIN_BUDGET_MS = 1_000;
const MIDDLE_GRADES_OPEN_LIBRARY_POST_FALLBACK_ROUTE_RECOVERY_MIN_BUDGET_MS = 1_000;
const MIDDLE_GRADES_OPEN_LIBRARY_TOTAL_BUDGET_MS = 24_000;
const MIDDLE_GRADES_OPEN_LIBRARY_DEBUG_TOTAL_BUDGET_MS = 180_000;
const MIDDLE_GRADES_OPEN_LIBRARY_DEBUG_PER_QUERY_BUDGET_MS = 20_000;
const MIDDLE_GRADES_OPEN_LIBRARY_DEBUG_CANDIDATE_POOL_LIMIT = 60;
const OPEN_LIBRARY_SEARCH_FIELDS = [
  "key",
  "title",
  "subtitle",
  "author_name",
  "first_publish_year",
  "cover_i",
  "edition_key",
  "subject",
  "subject_key",
  "subject_facet",
  "first_sentence",
  "description",
].join(",");

type OpenLibraryQueryPlan = {
  query: string;
  originalPlannedQuery: string;
  queryCascadeIndex: number;
  queryFamily: string;
  facets: string[];
  routingReason?: string;
  routingDominance?: Record<string, number | string | boolean>;
  emergencyFallback?: boolean;
  fallbackAlignment?: "route_aligned" | "anti_zero";
  profileSpecific?: boolean;
};

type MiddleGradesAgeShapeDiagnosticSample = {
  stage: string;
  query: string;
  title: string;
  firstPublishYear?: number;
  keep: boolean;
  reason: "accepted" | "middle_grades_age_shape_mismatch";
  evidence: {
    hasExplicitMiddleGradesEvidence: boolean;
    queryIsAgeAnchored: boolean;
    hasSubjectGenreShape: boolean;
    hasQueryGenreShape: boolean;
    hasTitleGenreShape: boolean;
    hasGenreShape: boolean;
    hasAdultLeakageShape: boolean;
    isBroadFunnyBooksQuery?: boolean;
  };
  subjectPreview: string[];
};

type MiddleGradesDeepTrace = {
  plannedQueries: Record<string, unknown>[];
  fetchTrace: Record<string, unknown>[];
  rawDocTrace: Record<string, unknown>[];
  normalizedCandidateTrace: Record<string, unknown>[];
  selectionTrace: Record<string, unknown>[];
};
const ABSTRACT_OPEN_LIBRARY_TERMS = new Set([
  "identity",
  "family",
  "friendship",
  "community",
  "coming of age",
  "emotional growth",
  "kindness",
  "hopeful",
  "warm",
  "gentle",
  "cozy",
  "quirky",
  "playful",
  "uplifting",
]);
const MEDIA_FORMAT_TERMS = new Set(["anime", "game", "games", "gaming", "tv", "television", "movie", "movies", "film", "films"]);
const GENRE_QUERY_HINT = /\b(fantasy|romance|historical|history|mystery|thriller|horror|adventure|action|comedy|humor|science fiction|sci-fi|speculative|dystopia|dystopian|paranormal|supernatural|western|sports|memoir|biography|realistic|contemporary|literary|drama|coming of age|graphic novel|manga|comic|heist|sandbox)\b/i;
const RELEVANCE_DRIFT_QUERY_HINT = /\b(classic|classics|shakespeare|twain|dickens|austen|wells|public domain|literary)\b/i;
const RELEVANCE_DRIFT_TITLE_HINT = /\b(complete works|selected works|collected works|works of|public domain)\b/i;
const ARTIFACT_QUERY_HINT = /\b(coloring|colouring|activity|activities|workbook|worksheet|lesson|classroom|teacher|writing|write)\b/i;
const ARTIFACT_TITLE_HINT = /\b(coloring|colouring|activity|activities|workbook|worksheet|lesson plan|lesson plans|classroom|teacher'?s? guide|study guide|kids write|writing prompts?|write!)\b/i;
const PROGRAMMING_GUIDE_ARTIFACT_HINT = /\b(library programs? for teens|library programming|programs? for teens|teen programs?|genre guide|curriculum|classroom|lesson plans?|activity book|activities for teens|teacher'?s? guide|study guide|reader'?s? advisory|book lists? for teens|guides?[^.]{0,40}for teens|for teens[^.]{0,40}(guides?|nonfiction|curriculum|programming|activities))\b/i;
const SURVIVAL_GUIDE_ARTIFACT_HINT = /\b(survival guide|survival handbook|survival manual|field guide|handbook|choose your own adventure|mountain survival|star trek survival|kane chronicles survival guide|survival of the richest|cultural survival|survival culture|survival skills?)\b/i;
const ADULT_DARK_ROMANCE_ARTIFACT_HINT = /\b(king of flesh and bone|married to a pirate|flesh and bone|dark romance|dark romantasy|monster romance|alien sex|alien romance|alien lover|pirate romance|captive bride|reverse harem|why choose|possessive alpha|mafia romance)\b/i;
const LITERARY_ANALYSIS_ARTIFACT_HINT = /\b(literary criticism|literary studies|literary analysis|critical studies|critical study|critical essays?|critical perspectives?|critical approaches?|criticism|analysis|analyses|case studies|essays on|companion to|guide to|teaching literature|teaching young adult literature|about literature|curriculum|consumption and identity|young adult fantasy fiction|young adult literature|adolescent literature|literature for young adults|fiction\s*-\s*history and criticism|history and criticism)\b/i;
const LITERARY_ANALYSIS_TITLE_ARTIFACT_HINT = /\b(death,?\s+gender,?\s+and sexuality in contemporary adolescent literature|in contemporary adolescent literature|discovering their voices|teaching young adult literature|guide to young adult literature|companion to young adult literature|critical perspectives?|critical approaches?|critical essays?|literary analysis|literary studies)\b/i;
const LITERARY_ANALYSIS_SUBJECT_ARTIFACT_HINT = /\b(young adult fiction|young adult literature|adolescent literature|children'?s literature|fiction|literature)\b[^.]{0,80}\b(history and criticism|criticism|analysis|analyses|study|studies|essays|teaching|curriculum|study guide|teacher'?s? guide)\b|\b(history and criticism|criticism|analysis|analyses|study|studies|essays|teaching|curriculum|study guide|teacher'?s? guide)\b[^.]{0,80}\b(young adult fiction|young adult literature|adolescent literature|children'?s literature|fiction|literature)\b/i;
const KEYWORD_STUFFED_MARKETING_TITLE_HINT = /\b(teen romance\s*-|teen books?|ya books?|books for teens?|love story|romantic suspense|surfing action adventure|action adventure romance|romance for teens?|teen fiction books?)\b/i;
const MEDIA_STUDY_ARTIFACT_HINT = /\b(introspective realist crime film|interplay of realistic and flamboyant art elements|film studies?|film criticism|media studies?|cinema studies?|art criticism|art analysis|realist crime film|flamboyant art elements|aesthetic analysis|visual culture|screen studies?)\b/i;
const SCHOLARLY_CATALOG_ARTIFACT_HINT = /\b(corpus of ancient near eastern seals|catalog(?:ue)? of (?:ancient|near eastern|seals|collections)|museum collections?|archaeological catalog(?:ue)?|numismatic catalog(?:ue)?|inscriptions? catalog(?:ue)?)\b/i;
const ADULT_ROMANCE_DRIFT_HINT = /\b(king of flesh and bone|married to a pirate|flesh and bone|dark romance|dark romantasy|pirate romance|monster romance|alien romance|captive bride|reverse harem|why choose|possessive alpha|mafia romance)\b/i;
const WRITING_GUIDE_CRITICISM_ARTIFACT_HINT = /\b(writing guides?|how to write|writer'?s? guide|craft of writing|horror criticism|horror genre history|genre history|literary criticism|critical history|guide to writing|teaching horror|study guide)\b/i;
const ADULT_NOTES_CRITICISM_NONFICTION_ARTIFACT_HINT = /\b(crime and punishment notes|the poet and the murderer|mystery in the mainstream|wizardry and wild romance|study notes?|cliffs?notes|sparknotes|book notes?|notes on|study aids?|study guides?|teacher'?s? guides?|reader'?s? guides?|companions? to|critical companions?|criticism|critical essays?|essays on|literary history|bibliograph(?:y|ies)|true crime nonfiction|true crime|nonfiction)\b/i;
const ADULT_LOW_TEEN_FIT_HINT = /\b(my secret garden|sexual fantasies|women\s+sexual fantasies|erotic|erotica|adult romance|new adult|college romance|college athletes?|seduction|sensual|dark lover|demoness|vixen|bret easton ellis|the informers|icebreaker|midnight fantasies|blaze|harlequin|silhouette desire|temptation|passion)\b/i;

function nowIso(): string {
  return new Date().toISOString();
}

function uniqueStrings(values: unknown[], limit = 24): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(normalized);
    if (output.length >= limit) break;
  }
  return output;
}

function dedupeOpenLibraryTerms(value: string): string {
  const protectedPhrases: [RegExp, string][] = [
    [/\bscience\s+fiction\b/g, "science-fiction"],
    [/\bgraphic\s+novel\b/g, "graphic-novel"],
    [/\bsci\s+fi\b/g, "sci-fi"],
  ];
  let protectedValue = value;
  for (const [pattern, replacement] of protectedPhrases) protectedValue = protectedValue.replace(pattern, replacement);
  const terms = protectedValue.split(/\s+/).filter(Boolean);
  return uniqueStrings(terms, 6).join(" ").replace(/science-fiction/g, "science fiction").replace(/graphic-novel/g, "graphic novel");
}

function finalOpenLibraryQueryDedupe(value: string): string {
  return dedupeOpenLibraryTerms(cleanOpenLibraryQueryPart(value));
}

function cleanOpenLibraryQueryPart(value: unknown): string {
  const normalized = String(value || "")
    .toLowerCase()
    .replace(/\b(indie\s+genre|mshs|middle\s+school\s+high\s+school|genre|genres|teen|teens|teenage|ya|young\s+adult|reader\s+discovery)\b/g, " ")
    .replace(/\b(identity|family|friendship|emotional\s+growth|emotional|growth|self\s+discovery|relationships?|belonging)\b/g, " ")
    .replace(/\b(anime|games?|gaming|tv|television|movies?|films?)\b/g, " ")
    .replace(/\b(book|books|story|stories|novel|novels)\b/g, " ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return dedupeOpenLibraryTerms(normalized);
}

function isUsefulOpenLibraryQueryPart(value: string): boolean {
  if (!value) return false;
  if (value.length < 3) return false;
  if (/^(and|or|the|with|for|adult|kids|preteens|children)$/.test(value)) return false;
  if (ABSTRACT_OPEN_LIBRARY_TERMS.has(value)) return false;
  if (MEDIA_FORMAT_TERMS.has(value)) return false;
  return true;
}

function isGenreLikeOpenLibraryPart(value: string): boolean {
  return isUsefulOpenLibraryQueryPart(value) && GENRE_QUERY_HINT.test(value);
}

function queryFamilyForOpenLibraryQuery(query: string): string {
  const q = query.toLowerCase();
  if (/\b(horror|paranormal|supernatural|dark fantasy)\b/.test(q)) return "horror_paranormal";
  if (/\bmystery|thriller|suspense\b/.test(q)) return "mystery_thriller";
  if (/\b(contemporary|realistic|coming of age)\b/.test(q)) return "contemporary_drama";
  if (/\bfantasy\b/.test(q)) return "fantasy";
  if (/\bscience fiction|sci-fi|speculative|dystopia|dystopian\b/.test(q)) return "speculative";
  if (/\badventure|action|survival\b/.test(q)) return "adventure";
  if (/\bdrama\b/.test(q)) return "contemporary_drama";
  if (/\bromance|historical\b/.test(q)) return "romance_historical";
  if (/\bcomedy|humor\b/.test(q)) return "comedy";
  if (/\bgraphic novel|manga|comic\b/.test(q)) return "graphic";
  return "open_library_broad";
}

function nonSkipSignalWeight(rows: { value: string; weight: number; evidence?: string[] }[], pattern: RegExp): number {
  return rows.reduce((sum, row) => {
    if (!pattern.test(String(row.value || "").toLowerCase())) return sum;
    const evidence = Array.isArray(row.evidence) ? row.evidence : [];
    const allSkip = evidence.length > 0 && evidence.every((item) => String(item || "").startsWith("skip:"));
    return sum + Math.abs(Number(row.weight || 0)) * (allSkip ? 0.2 : 1);
  }, 0);
}

function likedSignalWeight(rows: { value: string; weight: number; evidence?: string[] }[], pattern: RegExp): number {
  return rows.reduce((sum, row) => {
    if (!pattern.test(String(row.value || "").toLowerCase())) return sum;
    const evidence = Array.isArray(row.evidence) ? row.evidence : [];
    const hasLike = evidence.some((item) => String(item || "").startsWith("like:"));
    return hasLike ? sum + Math.abs(Number(row.weight || 0)) : sum;
  }, 0);
}

function hasNonSkipSignal(rows: { value: string; weight: number; evidence?: string[] }[], pattern: RegExp): boolean {
  return rows.some((row) => pattern.test(String(row.value || "").toLowerCase()) && !(Array.isArray(row.evidence) && row.evidence.length > 0 && row.evidence.every((item) => String(item || "").startsWith("skip:"))));
}

function combineOpenLibraryQueryParts(primary: string, modifier?: string): string {
  const parts = [primary, modifier || ""].map(cleanOpenLibraryQueryPart).filter(isUsefulOpenLibraryQueryPart);
  const uniqueParts = uniqueStrings(parts, 2);
  return finalOpenLibraryQueryDedupe(uniqueParts.join(" ").trim());
}

function isTeenBroadFallbackOpenLibraryQuery(query: string): boolean {
  return /^(young adult fantasy|fantasy|mystery novel)$/i.test(String(query || "").trim());
}

function buildTeenOpenLibraryQueryPlans(plan: SourcePlan, profile: TasteProfile, ageProfile: OpenLibraryAgeProfile): OpenLibraryQueryPlan[] {
  const plannedIntents = plan.intents.length ? plan.intents : [{ query: ageProfile.diagnosticProbeQuery, facets: [], id: "open-library-fallback", priority: 0, rationale: [] }];
  const originalPlannedQuery = finalOpenLibraryQueryDedupe(String(plannedIntents[0]?.query || ""));
  const genres = uniqueStrings(profile.genreFamily.map((row) => cleanOpenLibraryQueryPart(row.value)).filter(isGenreLikeOpenLibraryPart), 3);
  const plannedGenreFallbacks = uniqueStrings(plannedIntents
    .flatMap((intent) => [intent.query, ...(intent.facets || [])])
    .map(cleanOpenLibraryQueryPart)
    .filter(isGenreLikeOpenLibraryPart), 3);
  const genreTerms = uniqueStrings([...genres, ...plannedGenreFallbacks], 3);
  const fallbackTerms = uniqueStrings(plannedIntents
    .flatMap((intent) => [intent.query, ...(intent.facets || [])])
    .map(cleanOpenLibraryQueryPart)
    .filter(isUsefulOpenLibraryQueryPart)
    .map((query) => query.split(" ").filter(isUsefulOpenLibraryQueryPart).slice(0, 2).join(" "))
    .filter(isUsefulOpenLibraryQueryPart), 2);

  const profileText = [
    ...profile.genreFamily.map((row) => row.value),
    ...profile.themes.map((row) => row.value),
    originalPlannedQuery,
  ].join(" ").toLowerCase();
  const facetText = [...genreTerms, ...fallbackTerms, originalPlannedQuery].join(" ").toLowerCase();
  const signalRows = [...profile.genreFamily, ...profile.themes];
  const hasFantasy = /\b(fantasy|paranormal|supernatural)\b/.test(facetText);
  const hasParanormal = /\b(paranormal|supernatural)\b/.test(facetText);
  const hasAdventure = /\b(adventure|action|survival)\b/.test(facetText);
  const hasAction = /\b(action)\b/.test(facetText);
  const hasComedy = /\b(comedy|humor)\b/.test(facetText);
  const hasDystopian = /\b(dystopia|dystopian)\b/.test(facetText);
  const hasSciFi = /\b(science fiction|sci-fi|speculative)\b/.test(facetText);
  const hasSpeculative = hasDystopian || hasSciFi;
  const hasMystery = /\b(mystery|thriller|horror|suspense)\b/.test(facetText);
  const hasHorror = /\b(horror)\b/.test(facetText);
  const hasDarkFantasy = /\bdark fantasy\b/.test(facetText);
  const hasHistorical = /\b(historical|history)\b/.test(facetText);
  const hasDrama = /\b(drama)\b/.test(facetText);
  const hasThriller = /\b(thriller|suspense)\b/.test(facetText);
  const hasRomance = /\b(romance|romantic)\b/.test(facetText);
  const hasHeist = /\b(heist|caper|thief|thieves|sandbox)\b/.test(facetText);
  const hasSchool = /\b(school|academy|campus|boarding school|magic school|magical school)\b/.test(profileText);
  const hasPsychological = /\b(psychological|mind games?|mental|trauma|grief|unreliable|therapy)\b/.test(profileText);
  const fantasyWeight = nonSkipSignalWeight(signalRows, /\b(fantasy|paranormal|supernatural)\b/);
  const contemporaryWeight = nonSkipSignalWeight(signalRows, /\b(contemporary|realistic|coming of age)\b/);
  const mysteryWeight = nonSkipSignalWeight(signalRows, /\b(mystery|thriller|horror|suspense)\b/);
  const actionComedyWeight = nonSkipSignalWeight(signalRows, /\b(action|adventure|comedy|humor)\b/);
  const romanceWeight = nonSkipSignalWeight(signalRows, /\b(romance|romantic)\b/);
  const heistWeight = nonSkipSignalWeight(signalRows, /\b(heist|caper|thief|thieves|sandbox)\b/);
  const historicalWeight = nonSkipSignalWeight(signalRows, /\b(historical|history)\b/);
  const dystopianWeight = nonSkipSignalWeight(signalRows, /\b(dystopia|dystopian|science fiction|sci-fi|speculative)\b/);
  const survivalWeight = nonSkipSignalWeight(signalRows, /\b(survival)\b/);
  const hasNonSkipSciFi = hasNonSkipSignal(signalRows, /\b(science fiction|sci-fi|speculative|space)\b/);
  const dominanceScores = { fantasy: fantasyWeight, contemporary: contemporaryWeight, mystery: mysteryWeight, actionComedy: actionComedyWeight, romance: romanceWeight, heist: heistWeight, historical: historicalWeight, dystopian: dystopianWeight, survival: survivalWeight };
  const sortedDominance = Object.entries(dominanceScores).sort((a, b) => b[1] - a[1]);
  const dominantFamily = sortedDominance[0]?.[0] || "generic";
  const dominantWeight = Number(sortedDominance[0]?.[1] || 0);
  const runnerUpWeight = Number(sortedDominance[1]?.[1] || 0);
  const dominanceRatio = runnerUpWeight > 0 ? dominantWeight / runnerUpWeight : dominantWeight > 0 ? 99 : 0;
  const hasStrongGenreSpecific = hasFantasy || hasAdventure || hasSpeculative || hasMystery || hasComedy || hasRomance || hasHeist;
  const hasClearContemporarySignal = /\b(contemporary|realistic|coming of age)\b/.test(profileText);
  const paranormalFantasyHorrorWeight = Math.max(fantasyWeight, hasHorror || hasParanormal ? mysteryWeight : 0, romanceWeight);
  const wantsContemporaryDrama = hasClearContemporarySignal && contemporaryWeight > 0 && (dominantFamily === "contemporary" || contemporaryWeight >= Math.max(fantasyWeight, mysteryWeight, dystopianWeight) * 1.15) && contemporaryWeight > paranormalFantasyHorrorWeight * 1.2;
  const wantsFantasy = hasFantasy && fantasyWeight > 0 && dominantFamily === "fantasy" && dominanceRatio >= 1.2;
  const wantsSurvival = /\bsurvival\b/.test(facetText) && survivalWeight > 0 && dominantFamily === "survival" && dominanceRatio >= 1.25;
  const wantsHistorical = hasHistorical && historicalWeight > 0 && dominantFamily === "historical" && dominanceRatio >= 1.2;
  const wantsHorrorSurvivalPsychological = hasHorror && (survivalWeight > 0 || /\bsurvival\b/.test(profileText)) && (hasMystery || hasPsychological || hasThriller) && mysteryWeight + survivalWeight + fantasyWeight >= Math.max(contemporaryWeight, dystopianWeight, historicalWeight);
  const wantsHistoricalSciFiAdventure = !wantsHorrorSurvivalPsychological && hasHistorical && hasAdventure && hasSciFi && historicalWeight + dystopianWeight + actionComedyWeight >= Math.max(contemporaryWeight, mysteryWeight, romanceWeight);
  const wantsFantasySchoolActionDystopian = !wantsHorrorSurvivalPsychological && !wantsHistoricalSciFiAdventure && hasFantasy && !hasParanormal && hasSchool && fantasyWeight + actionComedyWeight + dystopianWeight >= Math.max(contemporaryWeight, mysteryWeight, historicalWeight);
  const wantsPsychologicalMysteryDrama = !wantsHorrorSurvivalPsychological && hasMystery && (hasPsychological || hasDrama || hasClearContemporarySignal) && mysteryWeight + contemporaryWeight >= Math.max(fantasyWeight, dystopianWeight, historicalWeight) * 0.8;
  const wantsContemporaryRomanceFantasy = hasFantasy && !wantsFantasySchoolActionDystopian && !hasSpeculative && !hasAction && !hasComedy && !hasParanormal && !hasHorror && (contemporaryWeight > 0 || romanceWeight > 0 || hasDrama) && fantasyWeight + contemporaryWeight + romanceWeight >= Math.max(mysteryWeight, dystopianWeight, historicalWeight);
  const wantsMysteryHeist = hasMystery && hasHeist && dystopianWeight <= Math.max(1, mysteryWeight + heistWeight) * 1.5;
  const wantsDystopianHistoricalThriller = hasDystopian && !wantsMysteryHeist && (hasThriller || hasHistorical) && dystopianWeight > 0 && dystopianWeight + mysteryWeight + historicalWeight >= Math.max(contemporaryWeight, fantasyWeight) * 1.15;
  const wantsFantasyAdventureSurvival = hasFantasy && hasAdventure && !hasParanormal && (fantasyWeight + actionComedyWeight + survivalWeight >= Math.max(mysteryWeight, contemporaryWeight, dystopianWeight));
  const wantsParanormalHorrorRomance = hasParanormal && (hasHorror || hasRomance || romanceWeight > 0) && fantasyWeight + mysteryWeight + romanceWeight >= contemporaryWeight;
  const wantsHorrorThrillerFantasy = hasHorror && hasThriller && hasFantasy && (fantasyWeight + mysteryWeight >= Math.max(contemporaryWeight, dystopianWeight, historicalWeight) * 1.1);
  const wantsActionComedyMystery = hasMystery && (hasAction || hasComedy) && !wantsFantasyAdventureSurvival && !wantsMysteryHeist && (mysteryWeight + actionComedyWeight >= Math.max(fantasyWeight, dystopianWeight, contemporaryWeight));
  const genreSpecificQueries = wantsHorrorSurvivalPsychological
    ? [
        "young adult horror",
        "survival horror",
        "psychological thriller",
        "dark fantasy",
      ]
    : wantsHistoricalSciFiAdventure
      ? [
          "historical adventure",
          "science fiction adventure",
          "teen adventure",
          "alternate history fiction",
        ]
      : wantsFantasySchoolActionDystopian
      ? [
          "fantasy school",
          "young adult fantasy",
          hasNonSkipSciFi || hasSpeculative ? "science fiction dystopian" : "",
          "action adventure",
        ]
      : wantsPsychologicalMysteryDrama
      ? [
          "young adult mystery",
          "psychological mystery",
          "teen mystery thriller",
          "realistic mystery",
        ]
      : wantsContemporaryRomanceFantasy
        ? [
            "young adult contemporary fantasy",
            "contemporary fantasy teen",
            "coming of age fantasy",
            "young adult romance fantasy",
            "fantasy adventure",
          ]
        : wantsMysteryHeist
      ? [
          "teen mystery",
          "heist novel",
          "mystery adventure",
          "young adult thriller",
        ]
      : wantsFantasyAdventureSurvival
        ? [
            "young adult fantasy",
            hasSchool ? "fantasy school" : "action adventure",
            hasNonSkipSciFi ? "science fiction adventure" : "",
            hasNonSkipSciFi ? "space adventure" : "",
            "fantasy adventure",
            "magical adventure",
            "fantasy survival",
          ]
    : wantsParanormalHorrorRomance
      ? [
          "paranormal romance",
          "young adult paranormal",
          "supernatural romance",
          "paranormal mystery",
        ]
      : wantsDystopianHistoricalThriller
    ? [
        "young adult dystopian fiction",
        "dystopian thriller",
        "historical thriller",
        "teen historical fiction",
        "dystopian survival",
        "dystopian adventure",
      ]
    : wantsHorrorThrillerFantasy
      ? [
        "young adult horror",
        "horror thriller",
        "paranormal mystery",
        "dark fantasy",
        "fantasy mystery",
        "supernatural mystery",
      ]
    : wantsActionComedyMystery
      ? [
          "mystery adventure",
          "young adult mystery",
          "mystery thriller",
          "teen detective fiction",
          hasThriller ? "suspense mystery" : "",
          wantsSurvival ? "survival fiction" : "",
        ]
      : wantsContemporaryDrama
        ? []
        : [
          hasDystopian ? "young adult dystopian fiction" : "",
          hasDystopian ? "teen dystopian" : "",
          hasDystopian ? "dystopian survival" : "",
          hasDystopian ? "dystopian adventure" : "",
          hasDystopian && hasMystery ? "dystopian mystery" : "",
          wantsSurvival ? "survival fiction" : "",
          wantsHistorical && hasDrama ? "historical drama novel" : "",
          wantsHistorical ? "teen historical fiction" : "",
          hasParanormal || hasHorror ? "paranormal mystery" : "",
          hasFantasy && (hasMystery || hasParanormal || hasHorror) ? "fantasy mystery" : "",
          hasParanormal || hasHorror ? "supernatural mystery" : "",
          hasHorror || hasParanormal || hasDarkFantasy ? "dark fantasy" : "",
          hasSciFi && hasThriller ? "sci-fi thriller" : "",
          hasAction && hasComedy && hasAdventure ? "action comedy adventure" : "",
          wantsFantasy && hasFantasy && hasDystopian ? "fantasy dystopian" : "",
          hasDystopian ? "dystopian fiction" : "",
          hasDystopian ? "dystopian novel" : "",
          hasHorror ? "young adult horror" : "",
          wantsFantasy && hasFantasy && hasAdventure ? "fantasy adventure" : "",
          wantsFantasy && hasFantasy && hasDrama ? "fantasy coming of age" : "",
          wantsFantasy && hasFantasy && hasAdventure ? "magical adventure" : "",
          hasMystery && hasAdventure ? "mystery adventure" : "",
          hasMystery ? "mystery novel" : "",
          combineOpenLibraryQueryParts(genreTerms[0] || fallbackTerms[0] || "", genreTerms[1]),
          wantsFantasy ? "young adult fantasy" : "",
          wantsFantasy ? "fantasy" : "",
        ];
  const contemporaryQueries = [
    "teen realistic fiction",
    "young adult contemporary",
    "coming of age novel",
    combineOpenLibraryQueryParts(genreTerms[0] || fallbackTerms[0] || "", genreTerms[1]),
  ];
  const genericQueries = [
    combineOpenLibraryQueryParts(genreTerms[0] || fallbackTerms[0] || "", genreTerms[1]),
    combineOpenLibraryQueryParts(genreTerms[1] || "", genreTerms[2]),
    genreTerms[0] || fallbackTerms[0] || ageProfile.diagnosticProbeQuery,
  ];
  const queryCandidates = wantsHorrorSurvivalPsychological || wantsHistoricalSciFiAdventure || wantsFantasySchoolActionDystopian || wantsPsychologicalMysteryDrama || wantsContemporaryRomanceFantasy || wantsMysteryHeist || wantsFantasyAdventureSurvival || wantsParanormalHorrorRomance || wantsDystopianHistoricalThriller
    ? genreSpecificQueries
    : wantsContemporaryDrama
      ? [...contemporaryQueries, ...genreSpecificQueries]
      : hasStrongGenreSpecific
        ? genreSpecificQueries
        : genericQueries;

  const preservedKnownGoodQueries = /^(young adult contemporary drama|teen realistic fiction|young adult contemporary|coming of age novel|young adult fantasy|science fiction dystopian|action adventure|young adult contemporary fantasy|contemporary fantasy teen|coming of age fantasy|young adult romance fantasy|young adult dystopian|young adult dystopian fiction|teen dystopian|dystopian thriller|historical thriller|dystopian survival|dystopian adventure|fantasy adventure|fantasy school|science fiction adventure|space adventure|fantasy survival|magical adventure|paranormal romance|young adult paranormal|supernatural romance|mystery novel|teen mystery|heist novel|young adult thriller|young adult mystery|psychological mystery|teen mystery thriller|realistic mystery|mystery thriller|teen detective fiction|humorous mystery|suspense mystery|paranormal mystery|fantasy mystery|supernatural mystery|dark fantasy|horror thriller|dystopian fiction|dystopian novel|survival fiction|historical drama novel|teen historical fiction|young adult horror|survival horror|psychological thriller|historical adventure|teen adventure|alternate history fiction)$/;
  const preparedQueries = queryCandidates.map((query) => preservedKnownGoodQueries.test(query) ? query : finalOpenLibraryQueryDedupe(query));
  const usefulQueries = preparedQueries.filter(isUsefulOpenLibraryQueryPart);
  const orderedQueries = [
    ...usefulQueries.filter((query) => !isTeenBroadFallbackOpenLibraryQuery(query)),
    ...usefulQueries.filter(isTeenBroadFallbackOpenLibraryQuery),
  ];
  const uniqueQueries = uniqueStrings(orderedQueries, ageProfile.queryLimit);
  const specificQueryCount = uniqueQueries.filter((query) => !isTeenBroadFallbackOpenLibraryQuery(query)).length;
  const broadFallbackUsed = uniqueQueries.some(isTeenBroadFallbackOpenLibraryQuery);
  const routingReason = wantsHorrorSurvivalPsychological
    ? "dominant_horror_survival_psychological"
    : wantsHistoricalSciFiAdventure
      ? "dominant_historical_scifi_adventure"
      : wantsFantasySchoolActionDystopian
      ? "dominant_fantasy_school_action_dystopian"
      : wantsPsychologicalMysteryDrama
      ? "dominant_psychological_mystery_drama"
      : wantsContemporaryRomanceFantasy
        ? "dominant_contemporary_romance_fantasy"
        : wantsMysteryHeist
      ? "dominant_mystery_heist"
      : wantsFantasyAdventureSurvival
        ? "dominant_fantasy_adventure_survival"
        : wantsParanormalHorrorRomance
          ? "dominant_paranormal_horror_romance"
          : wantsDystopianHistoricalThriller
            ? "dominant_dystopian_historical_thriller"
            : wantsContemporaryDrama
              ? "dominant_contemporary"
              : wantsActionComedyMystery
                ? "dominant_action_comedy_mystery"
                : wantsFantasy
                  ? "dominant_fantasy"
                  : wantsSurvival
                    ? "dominant_survival"
                    : hasStrongGenreSpecific
                      ? broadFallbackUsed && specificQueryCount > 0
                        ? "top_facets_first_then_broad_fallback"
                        : "top_facets_preserved"
                      : broadFallbackUsed
                        ? "no_specific_mixed_facets_broad_fallback"
                        : "generic_facets";
  const routingDominance = { openLibraryPlanner: "teen_locked_baseline", ageProfile: ageProfile.key, lockedBaseline: ageProfile.lockedBaseline, dominantFamily, dominantWeight, runnerUpWeight, dominanceRatio, wantsFantasy, wantsSurvival, wantsHistorical, wantsHorrorSurvivalPsychological, wantsHistoricalSciFiAdventure, wantsFantasySchoolActionDystopian, wantsPsychologicalMysteryDrama, wantsContemporaryRomanceFantasy, wantsMysteryHeist, hasNonSkipSciFi, wantsFantasyAdventureSurvival, wantsParanormalHorrorRomance, wantsDystopianHistoricalThriller, wantsHorrorThrillerFantasy, wantsContemporaryDrama, wantsActionComedyMystery };
  return uniqueQueries.map((query, index) => ({
    query,
    originalPlannedQuery,
    queryCascadeIndex: index,
    queryFamily: queryFamilyForOpenLibraryQuery(query),
    facets: uniqueStrings([...(plannedIntents[index]?.facets || []), ...genreTerms].map(cleanOpenLibraryQueryPart).filter(isUsefulOpenLibraryQueryPart), 6),
    routingReason,
    routingDominance,
  }));
}


function buildAdultOpenLibraryQueryPlans(plan: SourcePlan, profile: TasteProfile, ageProfile: OpenLibraryAgeProfile): OpenLibraryQueryPlan[] {
  const plannedIntents = plan.intents.length ? plan.intents : [{ query: ageProfile.diagnosticProbeQuery, facets: [], id: "adult-open-library-fallback", priority: 0, rationale: [] }];
  const originalPlannedQuery = finalOpenLibraryQueryDedupe(String(plannedIntents[0]?.query || ageProfile.diagnosticProbeQuery));
  const profileText = [
    ...profile.genreFamily.map((row) => row.value),
    ...profile.themes.map((row) => row.value),
    originalPlannedQuery,
  ].join(" ").toLowerCase();
  const plannedTerms = uniqueStrings(plannedIntents
    .flatMap((intent) => [intent.query, ...(intent.facets || [])])
    .map(cleanOpenLibraryQueryPart)
    .filter(isUsefulOpenLibraryQueryPart), 4);
  const hasMysteryThriller = /\b(mystery|thriller|suspense|crime|detective|noir)\b/.test(profileText);
  const hasHorror = /\b(horror|supernatural|ghost|occult)\b/.test(profileText);
  const hasGothic = /\b(gothic|gothic horror|gothic fiction|dark academia)\b/.test(profileText);
  const hasFantasy = /\b(fantasy|magic|magical|epic fantasy|dark fantasy)\b/.test(profileText);
  const hasScienceFiction = /\b(science fiction|sci-fi|speculative|space|dystopia|dystopian|alternate history)\b/.test(profileText);
  const hasDystopian = /\b(dystopia|dystopian|post-apocalyptic|apocalyptic)\b/.test(profileText);
  const hasRomance = /\b(romance|romantic|love story)\b/.test(profileText);
  const hasMythology = /\b(myth|mythology|mythological|gods?|legend|folklore)\b/.test(profileText);
  const hasHistorical = /\b(historical|history|period)\b/.test(profileText);
  const hasAdventure = /\b(adventure|action|quest|survival)\b/.test(profileText);
  const hasWarPolitical = /\b(war|military|battle|revolution|political|empire|kingdom)\b/.test(profileText);
  const hasCozy = /\b(cozy|cosy|comfort|whimsical|slice of life|low stakes|lighthearted)\b/.test(profileText);
  const hasLightFantasy = /\b(light fantasy|romantasy|magical realism|hopeful fantasy)\b/.test(profileText);
  const hasContemporaryDrama = /\b(contemporary|realistic|literary|drama|family|relationships|book club)\b/.test(profileText);
  const signalRows = [...profile.genreFamily, ...profile.themes];
  const adultCrimeWeight = nonSkipSignalWeight(signalRows, /\b(crime|thriller|mystery|detective|noir|suspense)\b/);
  const adultCrimePositiveWeight = nonSkipSignalWeight(signalRows, /\b(crime|detective|noir)\b/);
  const adultMysteryThrillerPositiveWeight = nonSkipSignalWeight(signalRows, /\b(mystery|thriller|suspense)\b/);
  const adultHorrorWeight = nonSkipSignalWeight(signalRows, /\b(horror|ghost|occult|supernatural|gothic)\b/);
  const adultFantasyWeight = nonSkipSignalWeight(signalRows, /\b(fantasy|magic|magical|dark fantasy|magical realism)\b/);
  const adultScienceFictionWeight = nonSkipSignalWeight(signalRows, /\b(science fiction|sci-fi|speculative|space|dystopia|dystopian|alternate history)\b/);
  const adultDystopianWeight = likedSignalWeight(signalRows, /\b(dystopia|dystopian|post-apocalyptic|post apocalyptic)\b/);
  const adultHistoricalWeight = nonSkipSignalWeight(signalRows, /\b(historical|history|period)\b/);
  const adultAdventureWeight = nonSkipSignalWeight(signalRows, /\b(adventure|action|quest|survival)\b/);
  const adultMythologyWeight = nonSkipSignalWeight(signalRows, /\b(myth|mythology|mythological|gods?|legend|folklore)\b/);
  const adultSurvivalWeight = nonSkipSignalWeight(signalRows, /\b(survival|survive|survivor)\b/);
  const adultRomanceWeight = nonSkipSignalWeight(signalRows, /\b(romance|romantic|love story)\b/);
  const adultWarWeight = nonSkipSignalWeight(signalRows, /\b(war|military|battle|revolution|political)\b/);
  const adultCozyWeight = nonSkipSignalWeight(signalRows, /\b(cozy|cosy|comfort|whimsical|slice of life|low stakes|lighthearted|light fantasy|romantasy|romance|romantic)\b/);
  const adultDramaWeight = nonSkipSignalWeight(signalRows, /\b(drama|literary|family|relationships|book club|realistic)\b/);
  const adultMixedSpeculativeWeight = adultFantasyWeight + adultScienceFictionWeight + adultHistoricalWeight + adultCozyWeight + adultDramaWeight;
  const adultDramaRealisticDominant = adultDramaWeight >= Math.max(2, adultScienceFictionWeight * 1.2) && (adultCrimeWeight > 0 || hasContemporaryDrama);
  const adultMixedSpeculativeCompanionSignalCount = [
    hasDystopian,
    hasAdventure || adultAdventureWeight >= 1,
    hasContemporaryDrama || adultDramaWeight >= 1,
    adultSurvivalWeight > 0,
    hasMysteryThriller || adultMysteryThrillerPositiveWeight > 0,
  ].filter(Boolean).length;
  const wantsAdultFantasyWarCrime = hasFantasy && hasMysteryThriller && (hasWarPolitical || adultWarWeight > 0) && adultFantasyWeight + adultCrimeWeight + adultWarWeight >= Math.max(1, adultHorrorWeight);
  const wantsAdultDystopianFantasySurvival = hasDystopian && hasAdventure && adultAdventureWeight >= adultScienceFictionWeight && (adultAdventureWeight >= 2 || adultSurvivalWeight > 0);
  const hasAdultHistoricalCrimeActivationEvidence = adultCrimePositiveWeight > 0 || (adultMysteryThrillerPositiveWeight >= 2 && adultHistoricalWeight >= 1.5 && adultScienceFictionWeight <= adultMysteryThrillerPositiveWeight + adultHistoricalWeight);
  const adultFantasyRomanceAdventureSignalCount = [
    hasRomance || adultRomanceWeight >= 0.75,
    hasMythology || adultMythologyWeight >= 0.75,
    hasAdventure || adultAdventureWeight >= 0.75,
  ].filter(Boolean).length;
  const adultMixedSpeculativeHasMeaningfulCounterEvidence = adultScienceFictionWeight >= 1
    || adultDystopianWeight > 0
    || adultMysteryThrillerPositiveWeight >= 1
    || adultSurvivalWeight > 0;
  const wantsAdultFantasyRomanceAdventure = hasFantasy
    && adultFantasyWeight >= Math.max(1.5, adultScienceFictionWeight * 1.05, adultMysteryThrillerPositiveWeight * 1.1, adultHorrorWeight * 1.1)
    && adultFantasyRomanceAdventureSignalCount >= 2;
  const wantsAdultMixedSpeculative = hasScienceFiction
    && !(wantsAdultFantasyRomanceAdventure && !adultMixedSpeculativeHasMeaningfulCounterEvidence)
    && (hasDystopian || hasFantasy || hasAdventure || hasContemporaryDrama || hasMysteryThriller)
    && (
      (adultScienceFictionWeight >= 1.25 && adultMixedSpeculativeCompanionSignalCount >= 2)
      || Math.max(hasDystopian ? 1.5 : 0, adultFantasyWeight, adultAdventureWeight, adultDramaWeight, adultCrimeWeight) >= adultScienceFictionWeight * 0.6
    );
  const adultHistoricalCrimeBlockedByMixedSpeculative = wantsAdultMixedSpeculative && adultHistoricalWeight <= 1.5 && adultCrimePositiveWeight < 1;
  const wantsAdultHistoricalCrimeDrama = hasHistorical && !adultHistoricalCrimeBlockedByMixedSpeculative && hasAdultHistoricalCrimeActivationEvidence && (hasContemporaryDrama || adultDramaWeight > 0) && adultHistoricalWeight + adultCrimeWeight + adultDramaWeight >= Math.max(1.5, adultRomanceWeight * 1.25, adultFantasyWeight * 0.9);
  const wantsAdultDystopianFirstMixedSpeculativeQueries = wantsAdultMixedSpeculative && adultDystopianWeight > 0;
  const wantsAdultGothicHorrorFantasy = (hasGothic || hasHorror) && !wantsAdultDystopianFantasySurvival && !wantsAdultHistoricalCrimeDrama && (hasFantasy || hasContemporaryDrama || adultHorrorWeight >= adultScienceFictionWeight * 0.8) && adultHorrorWeight >= Math.max(1, adultCrimeWeight * 0.9, adultScienceFictionWeight * 0.9, adultAdventureWeight * 0.9) && adultHorrorWeight + adultFantasyWeight + adultDramaWeight >= Math.max(1, adultScienceFictionWeight);
  const wantsAdultFantasyHistoricalSurvival = hasFantasy && hasHistorical && adultHistoricalWeight >= 1 && !wantsAdultHistoricalCrimeDrama && (hasAdventure || /\b(survival|quest|journey)\b/.test(profileText)) && adultFantasyWeight >= 1 && adultFantasyWeight + adultHistoricalWeight >= Math.max(1, adultScienceFictionWeight * 0.8, adultCrimeWeight * 0.75);
  const wantsAdultFantasyAdventureMystery = hasFantasy && hasAdventure && hasMysteryThriller && adultHistoricalWeight < 1 && adultFantasyWeight >= 1;
  const wantsAdultCozyFantasy = hasFantasy && (hasCozy || hasRomance || hasLightFantasy) && adultCozyWeight >= Math.max(0.75, adultScienceFictionWeight * 0.75);
  const wantsAdultSciFi = hasScienceFiction && !wantsAdultMixedSpeculative && !adultDramaRealisticDominant && !wantsAdultDystopianFantasySurvival && !wantsAdultGothicHorrorFantasy && !wantsAdultFantasyHistoricalSurvival && adultScienceFictionWeight >= Math.max(1.25, adultFantasyWeight * 1.1, adultHistoricalWeight * 1.1, adultHorrorWeight * 1.1);
  const wantsAdultHistoricalSpeculativeThriller = hasHistorical && hasScienceFiction && !wantsAdultMixedSpeculative && (hasMysteryThriller || hasContemporaryDrama) && !wantsAdultFantasyHistoricalSurvival && adultHistoricalWeight + adultScienceFictionWeight + adultDramaWeight >= Math.max(1, adultCrimeWeight * 0.75);
  const wantsAdultLiteraryCrime = adultCrimeWeight >= 1.25 && adultDramaWeight >= 1 && /\b(literary|literary crime|crime drama)\b/.test(profileText);
  const wantsAdultCrimeThriller = hasMysteryThriller
    && !wantsAdultGothicHorrorFantasy
    && !wantsAdultFantasyHistoricalSurvival
    && !wantsAdultSciFi
    && !wantsAdultHistoricalSpeculativeThriller
    && adultCrimeWeight >= 1.25
    && adultCrimeWeight >= Math.max(adultHorrorWeight * 1.1, adultMixedSpeculativeWeight * 0.9);
  const wantsAdultHorror = hasHorror && !wantsAdultFantasyWarCrime && !wantsAdultGothicHorrorFantasy && !wantsAdultFantasyHistoricalSurvival && !wantsAdultSciFi && !wantsAdultHistoricalSpeculativeThriller && !wantsAdultCrimeThriller && adultHorrorWeight >= Math.max(0.5, adultCrimeWeight * 1.25);
  const queryCandidates = (() => {
    if (wantsAdultFantasyWarCrime) return ["dark fantasy", "fantasy war", "political fantasy", "crime thriller"];
    if (wantsAdultDystopianFantasySurvival) return ["dystopian adventure", "post-apocalyptic fiction", "survival fiction", "adventure fiction"];
    if (wantsAdultHistoricalCrimeDrama) return ["crime drama", "historical thriller", "historical mystery", wantsAdultLiteraryCrime ? "literary crime" : "realistic drama"];
    if (wantsAdultGothicHorrorFantasy) return ["gothic horror", "supernatural horror", "dark fantasy", "contemporary gothic fiction"];
    if (wantsAdultFantasyHistoricalSurvival) return adultRomanceWeight >= Math.max(1.25, adultCrimeWeight)
      ? ["historical romance", "fantasy romance", "historical fiction", "fantasy adventure"]
      : ["historical fiction", "fantasy adventure", "survival fiction", "historical adventure"];
    if (wantsAdultFantasyRomanceAdventure) return ["fantasy romance", "fantasy adventure", "mythological fantasy", "romantic fantasy"];
    if (wantsAdultFantasyAdventureMystery) return ["fantasy adventure", "dark fantasy", "speculative mystery", "science fiction mystery"];
    if (wantsAdultMixedSpeculative) return wantsAdultDystopianFirstMixedSpeculativeQueries
      ? ["dystopian adventure", "science fiction adventure", "post-apocalyptic fiction", "survival fiction"]
      : ["speculative thriller", "science fiction thriller", "fantasy romance", "mystery drama"];
    if (wantsAdultSciFi) return ["science fiction thriller", "speculative fiction", "science fiction adventure"];
    if (wantsAdultCozyFantasy) return ["cozy fantasy", "contemporary fantasy", "fantasy fiction", "romance fantasy"];
    if (wantsAdultHistoricalSpeculativeThriller) return ["historical fiction", "historical thriller", "literary fiction", "speculative fiction"];
    if (wantsAdultCrimeThriller) return ["psychological thriller", "mystery thriller", "crime fiction", wantsAdultLiteraryCrime ? "literary crime" : "crime thriller"];
    if (wantsAdultHorror) return ["horror fiction", "psychological horror", "supernatural horror", "dark fantasy"];
    if (hasScienceFiction && hasHistorical) return ["speculative thriller", "dystopian drama", "historical fiction", "survival fiction"];
    if (hasScienceFiction) return ["speculative thriller", "dystopian drama", "survival fiction", "science fiction"];
    if (hasFantasy) return ["fantasy fiction", "epic fantasy", "dark fantasy", "historical fantasy"];
    if (hasRomance && hasHistorical) return ["historical romance", "romance novel", "romantic suspense", "historical fiction"];
    if (hasRomance) return ["contemporary romance", "romance novel", "romantic suspense", "women fiction"];
    if (hasHistorical && hasAdventure) return ["historical adventure", "historical fiction", "adventure fiction", "alternate history fiction"];
    if (hasHistorical) return ["historical fiction", "literary fiction", "historical mystery", "biographical fiction"];
    if (hasAdventure) return ["adventure fiction", "action adventure", "survival fiction", "thriller"];
    if (hasContemporaryDrama) return ["literary fiction", "contemporary fiction", "family drama fiction", "book club fiction"];
    return [
      combineOpenLibraryQueryParts(plannedTerms[0] || ageProfile.diagnosticProbeQuery, plannedTerms[1]),
      "literary fiction",
      "contemporary fiction",
      ageProfile.diagnosticProbeQuery,
    ];
  })();
  const preservedAdultQueries = /^(gothic horror|contemporary gothic fiction|horror fiction|psychological horror|supernatural horror|dark fantasy|fantasy war|political fantasy|fantasy adventure|fantasy romance|mythological fantasy|romantic fantasy|romance fantasy|science fiction thriller|science fiction adventure|science fiction mystery|cozy fantasy|contemporary fantasy|dystopian adventure|dystopian drama|post-apocalyptic fiction|speculative thriller|speculative mystery|historical thriller|crime drama|realistic drama|mystery drama|crime thriller|noir thriller|literary crime|mystery thriller|crime fiction|psychological thriller|detective fiction|alternate history fiction|science fiction|historical fiction|speculative fiction|space opera|dystopian fiction|fantasy fiction|epic fantasy|historical fantasy|historical romance|romance novel|romantic suspense|contemporary romance|women fiction|historical adventure|adventure fiction|historical mystery|biographical fiction|action adventure|survival fiction|thriller|literary fiction|contemporary fiction|family drama fiction|book club fiction|fiction)$/;
  const preparedQueries = queryCandidates.map((query) => preservedAdultQueries.test(query) ? query : finalOpenLibraryQueryDedupe(query));
  const uniqueQueries = uniqueStrings(preparedQueries.filter(isUsefulOpenLibraryQueryPart), ageProfile.queryLimit);
  const queries = uniqueQueries.length ? uniqueQueries : [ageProfile.diagnosticProbeQuery];
  const routingReason = (() => {
    if (wantsAdultFantasyWarCrime) return "adult_fantasy_war_crime";
    if (wantsAdultDystopianFantasySurvival) return "adult_dystopian_fantasy_survival";
    if (wantsAdultHistoricalCrimeDrama) return "adult_historical_crime_drama";
    if (wantsAdultGothicHorrorFantasy) return "adult_gothic_horror_fantasy";
    if (wantsAdultFantasyHistoricalSurvival) return "adult_fantasy_historical_survival";
    if (wantsAdultFantasyRomanceAdventure) return "adult_fantasy_romance_adventure";
    if (wantsAdultFantasyAdventureMystery) return "adult_fantasy_adventure_mystery";
    if (wantsAdultMixedSpeculative) return "adult_mixed_speculative";
    if (wantsAdultSciFi) return "adult_scifi";
    if (wantsAdultCozyFantasy) return "adult_cozy_fantasy";
    if (wantsAdultHistoricalSpeculativeThriller) return "adult_historical_speculative_thriller";
    if (wantsAdultCrimeThriller) return "adult_crime_thriller";
    if (wantsAdultHorror) return "adult_horror";
    if (hasScienceFiction) return "adult_mixed_speculative_fallback";
    if (hasFantasy) return "adult_fantasy";
    if (hasRomance) return "adult_romance";
    if (hasHistorical) return "adult_historical";
    if (hasAdventure) return "adult_adventure";
    if (hasContemporaryDrama) return "adult_contemporary_literary";
    return "adult_broad_reliable";
  })();
  const routingDominance = { openLibraryPlanner: "adult_locked_baseline", ageProfile: ageProfile.key, behaviorLabel: ageProfile.behaviorLabel, lockedBaseline: ageProfile.lockedBaseline, hasMysteryThriller, hasHorror, hasGothic, hasFantasy, hasScienceFiction, hasDystopian, hasRomance, hasMythology, hasHistorical, hasAdventure, hasWarPolitical, hasCozy, hasLightFantasy, hasContemporaryDrama, adultCrimeWeight, adultCrimePositiveWeight, adultMysteryThrillerPositiveWeight, adultHorrorWeight, adultFantasyWeight, adultScienceFictionWeight, adultDystopianWeight, adultHistoricalWeight, adultAdventureWeight, adultMythologyWeight, adultSurvivalWeight, adultRomanceWeight, adultWarWeight, adultCozyWeight, adultDramaWeight, adultMixedSpeculativeWeight, adultMixedSpeculativeCompanionSignalCount, adultFantasyRomanceAdventureSignalCount, adultMixedSpeculativeHasMeaningfulCounterEvidence, adultDramaRealisticDominant, wantsAdultFantasyWarCrime, wantsAdultDystopianFantasySurvival, hasAdultHistoricalCrimeActivationEvidence, adultHistoricalCrimeBlockedByMixedSpeculative, wantsAdultHistoricalCrimeDrama, wantsAdultDystopianFirstMixedSpeculativeQueries, wantsAdultGothicHorrorFantasy, wantsAdultFantasyHistoricalSurvival, wantsAdultFantasyRomanceAdventure, wantsAdultFantasyAdventureMystery, wantsAdultMixedSpeculative, wantsAdultSciFi, wantsAdultCozyFantasy, wantsAdultHistoricalSpeculativeThriller, wantsAdultLiteraryCrime, wantsAdultCrimeThriller, wantsAdultHorror };
  return queries.map((query, index) => ({
    query,
    originalPlannedQuery,
    queryCascadeIndex: index,
    queryFamily: queryFamilyForOpenLibraryQuery(query),
    facets: uniqueStrings((plannedIntents[index]?.facets || plannedTerms).map(cleanOpenLibraryQueryPart).filter(isUsefulOpenLibraryQueryPart), 6),
    routingReason,
    routingDominance,
  }));
}

function buildMiddleGradesOpenLibraryQueryPlans(plan: SourcePlan, profile: TasteProfile, ageProfile: OpenLibraryAgeProfile): OpenLibraryQueryPlan[] {
  const plannedIntents = plan.intents.length ? plan.intents : [{ query: ageProfile.diagnosticProbeQuery, facets: [], id: "middle-grades-open-library-fallback", priority: 0, rationale: [] }];
  const originalPlannedQuery = finalOpenLibraryQueryDedupe(String(plannedIntents[0]?.query || ageProfile.diagnosticProbeQuery));
  const genres = uniqueStrings(profile.genreFamily.map((row) => cleanOpenLibraryQueryPart(row.value)).filter(isGenreLikeOpenLibraryPart), 3);
  const plannedGenreFallbacks = uniqueStrings(plannedIntents
    .flatMap((intent) => [intent.query, ...(intent.facets || [])])
    .map(cleanOpenLibraryQueryPart)
    .filter(isGenreLikeOpenLibraryPart), 3);
  const genreTerms = uniqueStrings([...genres, ...plannedGenreFallbacks], 3);
  const fallbackTerms = uniqueStrings(plannedIntents
    .flatMap((intent) => [intent.query, ...(intent.facets || [])])
    .map(cleanOpenLibraryQueryPart)
    .filter(isUsefulOpenLibraryQueryPart)
    .map((query) => query.split(" ").filter(isUsefulOpenLibraryQueryPart).slice(0, 2).join(" "))
    .filter(isUsefulOpenLibraryQueryPart), 2);
  const profileText = [
    ...profile.genreFamily.map((row) => row.value),
    ...profile.themes.map((row) => row.value),
    originalPlannedQuery,
  ].join(" ").toLowerCase();
  const facetText = [...genreTerms, ...fallbackTerms, originalPlannedQuery].join(" ").toLowerCase();
  const signalRows = [...profile.genreFamily, ...profile.themes];
  const hasFantasy = /\b(fantasy|magic|magical|paranormal|supernatural)\b/.test(facetText);
  const hasAdventure = /\b(adventure|action|quest|survival)\b/.test(facetText);
  const hasMystery = /\b(mystery|detective|puzzle|investigation|suspense)\b/.test(facetText);
  const hasHistorical = /\b(historical|history)\b/.test(facetText);
  const hasSciFi = /\b(science fiction|sci-fi|space|robot|speculative|dystopia|dystopian)\b/.test(facetText);
  const hasContemporary = /\b(contemporary|realistic|school|friendship|family|coming of age)\b/.test(`${facetText} ${profileText}`);
  const hasHumor = /\b(humor|humorous|comedy|funny|playful)\b/.test(`${facetText} ${profileText}`);
  const fantasyWeight = nonSkipSignalWeight(signalRows, /\b(fantasy|magic|magical|paranormal|supernatural)\b/);
  const adventureWeight = nonSkipSignalWeight(signalRows, /\b(adventure|action|quest|survival)\b/);
  const mysteryWeight = nonSkipSignalWeight(signalRows, /\b(mystery|detective|puzzle|investigation|suspense)\b/);
  const historicalWeight = nonSkipSignalWeight(signalRows, /\b(historical|history)\b/);
  const sciFiWeight = nonSkipSignalWeight(signalRows, /\b(science fiction|sci-fi|space|robot|speculative|dystopia|dystopian)\b/);
  const contemporaryWeight = nonSkipSignalWeight(signalRows, /\b(contemporary|realistic|school|friendship|family|coming of age)\b/);
  const humorWeight = nonSkipSignalWeight(signalRows, /\b(humor|humorous|comedy|funny|playful)\b/);
  const dominanceScores = { fantasy: fantasyWeight, adventure: adventureWeight, mystery: mysteryWeight, historical: historicalWeight, sciFi: sciFiWeight, contemporary: contemporaryWeight, humor: humorWeight };
  const sortedDominance = Object.entries(dominanceScores).sort((a, b) => b[1] - a[1]);
  const dominantFamily = sortedDominance[0]?.[0] || "generic";
  const dominantWeight = Number(sortedDominance[0]?.[1] || 0);
  const runnerUpWeight = Number(sortedDominance[1]?.[1] || 0);
  const dominanceRatio = runnerUpWeight > 0 ? dominantWeight / runnerUpWeight : dominantWeight > 0 ? 99 : 0;
  const wantsFantasyMystery = hasFantasy && hasMystery;
  const wantsFantasyHumor = hasFantasy && hasHumor;
  const wantsFantasySchoolFamily = hasFantasy && hasContemporary && (/\b(school|friendship|family|realistic|contemporary)\b/.test(profileText) || contemporaryWeight >= Math.max(1, fantasyWeight * 0.5));
  const wantsFantasyAdventure = hasFantasy && !wantsFantasyMystery && !wantsFantasyHumor && !wantsFantasySchoolFamily && (hasAdventure || dominantFamily === "fantasy" || dominantFamily === "adventure");
  const wantsMysteryAdventure = hasMystery && (hasAdventure || dominantFamily === "mystery");
  const wantsHistoricalAdventure = hasHistorical && (hasAdventure || hasMystery || dominantFamily === "historical");
  const sciFiDominant = sciFiWeight > 0 && sciFiWeight >= Math.max(1, fantasyWeight, adventureWeight, mysteryWeight, historicalWeight, contemporaryWeight, humorWeight);
  const wantsSciFiAdventure = hasSciFi && (dominantFamily === "sciFi" || (sciFiDominant && hasAdventure));
  const wantsContemporarySchool = hasContemporary && !wantsFantasyAdventure && !wantsMysteryAdventure && !wantsHistoricalAdventure && !wantsSciFiAdventure && !(hasHumor && humorWeight >= Math.max(1, contemporaryWeight));
  const wantsHumor = hasHumor && !wantsMysteryAdventure && !wantsFantasyAdventure;
  const preliminaryRoutingReason = wantsFantasyMystery
    ? "middle_grades_fantasy_mystery"
    : wantsFantasyHumor
      ? "middle_grades_fantasy_humor"
      : wantsFantasySchoolFamily
        ? "middle_grades_fantasy_school_family"
        : wantsFantasyAdventure
          ? "middle_grades_fantasy_adventure"
          : wantsMysteryAdventure
            ? "middle_grades_mystery_adventure"
            : wantsHistoricalAdventure
              ? "middle_grades_historical_adventure"
              : wantsSciFiAdventure
                ? "middle_grades_scifi_adventure"
                : wantsContemporarySchool
                  ? "middle_grades_contemporary_school"
                  : wantsHumor
                    ? "middle_grades_humor"
                    : "middle_grades_generic_facets";
  const profileSpecificQueries = middleGradesProfileSpecificQueries(profile);
  const queryCandidates = wantsFantasyMystery
    ? ["middle grade fantasy mystery", "middle grade mystery", "school mystery", "middle grade adventure"]
    : wantsFantasyHumor
      ? ["middle grade humor", "funny fantasy", "children's funny books", "middle grade adventure"]
      : wantsFantasySchoolFamily
        ? ["magic school", "middle grade school story", "middle grade friendship", "middle grade adventure"]
        : wantsFantasyAdventure
          ? ["middle grade fantasy", "fantasy adventure", "magic school", "middle grade adventure"]
          : wantsMysteryAdventure
            ? ["middle grade mystery", "mystery adventure", "school mystery", "detective fiction"]
            : wantsHistoricalAdventure
              ? ["middle grade historical fiction", "historical adventure", "historical mystery", "middle grade adventure"]
              : wantsSciFiAdventure
                ? ["middle grade science fiction", "science fiction adventure", "space adventure", hasAdventure ? "survival fiction" : "dystopian adventure"]
                : wantsContemporarySchool
                  ? ["middle grade realistic fiction", "middle grade school story", "middle grade friendship", "middle grade adventure"]
                  : wantsHumor
                    ? ["middle grade humor", "middle grade school story", "humorous fiction", "middle grade adventure"]
                    : [
                        combineOpenLibraryQueryParts(genreTerms[0] || fallbackTerms[0] || "", genreTerms[1]),
                        genreTerms[0] || fallbackTerms[0] || "middle grade fiction",
                        ageProfile.diagnosticProbeQuery,
                        "middle grade adventure",
                      ];
  const preservedKnownGoodQueries = /^(middle grade fantasy|middle grade fantasy mystery|fantasy adventure|funny fantasy|magic school|children'?s funny books|middle grade mystery|mystery adventure|school mystery|detective fiction|middle grade historical fiction|historical adventure|historical mystery|middle grade science fiction|science fiction adventure|space adventure|survival fiction|dystopian adventure|middle grade realistic fiction|middle grade school story|middle grade friendship|middle grade humor|humorous fiction|middle grade fiction|middle grade adventure)$/;
  const preparedQueries = [
    ...profileSpecificQueries,
    ...queryCandidates.map((query) => preservedKnownGoodQueries.test(query) ? query : finalOpenLibraryQueryDedupe(query)),
  ];
  const uniqueQueries = uniqueStrings(preparedQueries.filter(isUsefulOpenLibraryQueryPart), ageProfile.queryLimit);
  const routingReason = preliminaryRoutingReason;
  const routingDominance = { openLibraryPlanner: "middle_grades_profile_candidate", ageProfile: ageProfile.key, behaviorLabel: ageProfile.behaviorLabel, lockedBaseline: ageProfile.lockedBaseline, dominantFamily, dominantWeight, runnerUpWeight, dominanceRatio, wantsFantasyMystery, wantsFantasyHumor, wantsFantasySchoolFamily, wantsFantasyAdventure, wantsMysteryAdventure, wantsHistoricalAdventure, wantsSciFiAdventure, wantsContemporarySchool, wantsHumor };
  return uniqueQueries.map((query, index) => ({
    query,
    originalPlannedQuery,
    queryCascadeIndex: index,
    queryFamily: queryFamilyForOpenLibraryQuery(query),
    facets: uniqueStrings([...(plannedIntents[index]?.facets || []), ...genreTerms].map(cleanOpenLibraryQueryPart).filter(isUsefulOpenLibraryQueryPart), 6),
    routingReason,
    routingDominance,
    profileSpecific: profileSpecificQueries.some((profileQuery) => profileQuery.toLowerCase() === query.toLowerCase()),
  }));
}

function buildKidsOpenLibraryQueryPlans(plan: SourcePlan, profile: TasteProfile, ageProfile: OpenLibraryAgeProfile): OpenLibraryQueryPlan[] {
  const plannedIntents = plan.intents.length ? plan.intents : [{ query: ageProfile.diagnosticProbeQuery, facets: [], id: `${ageProfile.key}-open-library-fallback`, priority: 0, rationale: [] }];
  const originalPlannedQuery = finalOpenLibraryQueryDedupe(String(plannedIntents[0]?.query || ageProfile.diagnosticProbeQuery));
  const positiveRows = [
    ...profile.genreFamily,
    ...profile.themes,
    ...profile.tone,
    ...profile.characterDynamics,
  ].filter((row) => Number(row.weight || 0) > 0);
  const likedRows = positiveRows.filter((row) => Array.isArray(row.evidence) && row.evidence.some((item) => String(item || "").startsWith("like:")));
  const likedText = (likedRows.length ? likedRows : positiveRows).map((row) => String(row.value || "").toLowerCase()).join(" ");
  const avoidText = (profile.avoidSignals || []).map((row) => String(row.value || "").toLowerCase()).join(" ");
  const queries: string[] = [];
  const add = (query: string) => {
    const clean = finalOpenLibraryQueryDedupe(query);
    if (isUsefulOpenLibraryQueryPart(clean)) queries.push(clean);
  };
  const addFallback = (query: string) => {
    if (queries.length < 5) add(query);
  };
  const forceSemanticExpansion = Boolean((profile.diagnostics as Record<string, unknown>)?.forceKidsCleanCandidateShortfallExpansion);
  if (forceSemanticExpansion) {
    if (/cozy|calm/.test(likedText) && /adventure|wonder|magic|explor/.test(likedText)) add("cozy adventure picture books");
    if (/cozy|life sim|calm/.test(likedText) && !(/folklore|folk tale|folktale|classic|winter|mitten/.test(likedText) && /animals?/.test(likedText))) add("cozy everyday picture books");
    if (/cozy|calm/.test(likedText) && /adventure|wonder|magic|explor/.test(likedText)) add("gentle adventure picture books");
    if (/cozy|life sim/.test(likedText) && !(/folklore|folk tale|folktale|classic|winter|mitten/.test(likedText) && /animals?/.test(likedText))) add("cozy animal village picture books");
    if (/reading|literacy|letters?|words?|problem[_ ]solving|problem solving|puzzles?|solve|super why/.test(likedText)) add("reading problem solving picture books");
    if (/problem[_ ]solving|problem solving|puzzles?|solve/.test(likedText)) add("problem solving early reader books");
    if (/reading|literacy|letters?|words?|stories/.test(likedText) && /adventure|problem[_ ]solving|problem solving|series/.test(likedText)) add("reading adventure picture books");
    if (/animals?|monkeys?|dogs?|playful|silly/.test(likedText) && /mischief|humou?r|funny|silly|playful|community/.test(likedText)) add("funny animal picture books");
    if (/monkeys?/.test(likedText) && /mischief|repetition|call and response/.test(likedText)) add("mischievous monkey picture books");
    if (/teamwork|helping|courage|brave|heroic|heroes?|rescue|kindness|uplifting/.test(likedText)) add("teamwork helping picture books");
    if (/helping|kindness|caring/.test(likedText) && /teamwork|courage|brave|heroic|heroes?|rescue|community/.test(likedText)) add("helping teamwork picture books");
    if (/courage|brave|heroic|heroes?|rescue/.test(likedText)) add("brave rescue picture books");
    if (/pooh|bear/.test(likedText)) add("gentle bear picture books");
    if (/folklore|folk tale|folktale|classic|winter|mitten/.test(likedText) && /animals?/.test(likedText)) add("folklore animal picture books");
    if (/winter|snow|cozy|calm|nature|woodland|forest|puffin/.test(likedText) && /animals?/.test(likedText)) add("woodland animal picture books");
    if (/calm|nature|puffin/.test(likedText)) add("calm nature picture books");
    if (/animals?/.test(likedText) && !/humou?r|funny|silly|playful/.test(likedText)) add("woodland animal picture books");
    if (/mischief|humou?r|funny|silly/.test(likedText)) add("funny mischief picture books");
    if (/mischief|trouble|naughty|david/.test(likedText)) add("mischief picture books");
    if (/big feelings?|feelings?|simple/.test(likedText)) add("big feelings picture books");
    if (/simple|humou?r|funny|silly/.test(likedText)) add("simple funny picture books");
    if (/imagination|creative|creativity|pretend|box|curious|curiosity/.test(likedText)) add("imaginative picture books");
    if (/imagination|pretend|creative|box/.test(likedText)) add("pretend play picture books");
    if (/learning|songs?|music|school|letters|numbers/.test(likedText)) add("learning picture books");
    if (/songs?|music/.test(likedText)) add("sing along picture books");
    if (/fantasy|magic|wonder|adventure/.test(likedText)) add("imaginative adventure picture books");
    if (/science|curiosity|experiment|space|robots?|robotics|science_fiction|sci fi|animation/.test(likedText)) add("science story picture books");
    if (/robots?|robotics|wall e|space/.test(likedText)) add("robot picture books");
    if (!queries.length) {
      add("imaginative picture books");
      add("early reader stories");
    }
  } else if (/cozy|calm/.test(likedText) && /adventure|wonder|magic|explor/.test(likedText)) add("cozy adventure picture books");
  if (!forceSemanticExpansion && /cozy|life sim|calm/.test(likedText) && !(/folklore|folk tale|folktale|classic|winter|mitten/.test(likedText) && /animals?/.test(likedText))) add("cozy everyday picture books");
  if (!forceSemanticExpansion && /cozy|calm/.test(likedText) && /adventure|wonder|magic|explor/.test(likedText)) add("gentle adventure picture books");
  if (!forceSemanticExpansion && /cozy|life sim/.test(likedText) && !(/folklore|folk tale|folktale|classic|winter|mitten/.test(likedText) && /animals?/.test(likedText))) add("cozy animal village picture books");
  if (!forceSemanticExpansion && /reading|literacy|letters?|words?|problem[_ ]solving|problem solving|puzzles?|solve|super why/.test(likedText)) add("reading problem solving picture books");
  if (!forceSemanticExpansion && /problem[_ ]solving|problem solving|puzzles?|solve/.test(likedText)) add("problem solving early reader books");
  if (!forceSemanticExpansion && /reading|literacy|letters?|words?|stories/.test(likedText) && /adventure|problem[_ ]solving|problem solving|series/.test(likedText)) add("reading adventure picture books");
  if (!forceSemanticExpansion && /animals?|monkeys?|dogs?|playful|silly/.test(likedText) && /mischief|humou?r|funny|silly|playful|community/.test(likedText)) add("funny animal picture books");
  if (!forceSemanticExpansion && /monkeys?/.test(likedText) && /mischief|repetition|call and response/.test(likedText)) add("mischievous monkey picture books");
  if (!forceSemanticExpansion && /teamwork|helping|courage|brave|heroic|heroes?|rescue|kindness|uplifting/.test(likedText)) add("teamwork helping picture books");
  if (!forceSemanticExpansion && /helping|kindness|caring/.test(likedText) && /teamwork|courage|brave|heroic|heroes?|rescue|community/.test(likedText)) add("helping teamwork picture books");
  if (!forceSemanticExpansion && /courage|brave|heroic|heroes?|rescue/.test(likedText)) add("brave rescue picture books");
  if (!forceSemanticExpansion && /pooh|bear/.test(likedText)) add("gentle bear picture books");
  if (!forceSemanticExpansion && /folklore|folk tale|folktale|classic|winter|mitten/.test(likedText) && /animals?/.test(likedText)) add("folklore animal picture books");
  if (!forceSemanticExpansion && /winter|snow|cozy|calm|nature|woodland|forest|puffin/.test(likedText) && /animals?/.test(likedText)) add("woodland animal picture books");
  if (!forceSemanticExpansion && /calm|nature|puffin/.test(likedText)) add("calm nature picture books");
  if (!forceSemanticExpansion && /animals?/.test(likedText) && !/humou?r|funny|silly|playful/.test(likedText)) add("woodland animal picture books");
  if (!forceSemanticExpansion && /imagination|creative|creativity|curious|curiosity|drawing|art/.test(likedText)) add("imagination picture books");
  if (!forceSemanticExpansion && /learning|songs?|music|school|letters|numbers/.test(likedText)) add("learning picture books");
  if (!forceSemanticExpansion && /fantasy|magic|imagination|wonder/.test(likedText)) add("fantasy picture books");
  if (!forceSemanticExpansion && /cozy|gentle|calm/.test(likedText) && /adventure|wonder|magic/.test(likedText)) add("cozy adventure picture books");
  if (!forceSemanticExpansion && /science|curiosity|experiment|space|robots?|robotics|science_fiction|sci fi|animation/.test(likedText)) add("science fiction picture books");
  if (!forceSemanticExpansion && /science|curiosity|experiment|space|robots?|robotics|science_fiction|sci fi/.test(likedText)) add("science easy reader");
  if (!forceSemanticExpansion && /robots?|robotics|wall e|space/.test(likedText)) add("robot picture books");
  if (!forceSemanticExpansion && /feelings?|kindness|empathy|emotional|warm/.test(likedText)) add("picture books feelings kindness");
  if (!forceSemanticExpansion && /friendship|friends?|growing up|growing_up|lessons?|school/.test(likedText)) add("early reader friends");
  if (!forceSemanticExpansion && /friendship|friends?|belonging|kindness/.test(likedText)) add("picture book friends kindness");
  if (!forceSemanticExpansion && /calm|gentle|cozy|bedtime|kindness|feelings?/.test(likedText)) add("gentle picture books");
  if (!forceSemanticExpansion && /calm|gentle|bedtime|kindness|feelings?/.test(likedText)) add("picture books calm friendship");
  if (!forceSemanticExpansion && /bear|bears|toy|toys/.test(likedText)) add("bear friendship picture book");
  if (!forceSemanticExpansion && /humou?r|funny|comedy|playful|silly/.test(likedText)) add("funny picture books");
  if (!forceSemanticExpansion && /science|curiosity|experiment|space|robots?|science_fiction/.test(likedText) && /humou?r|funny|comedy|playful|silly/.test(likedText)) add("funny science picture books");
  if (!forceSemanticExpansion && /fairy tale|fairytale|clever|twist|unreliable narrator|pigs?/.test(likedText)) add("fractured fairy tales picture books");
  if (!forceSemanticExpansion && /fairy tale|fairytale|clever|twist|unreliable narrator|pigs?/.test(likedText) && /humou?r|funny|comedy|playful|silly/.test(likedText)) add("funny fairy tale picture book");
  if (!forceSemanticExpansion && /clever|twist|wonder|curiosity/.test(likedText)) add("clever picture books");
  if (!forceSemanticExpansion && /adventure|wonder|fantasy|magic|animals?/.test(likedText) && !/mystery|scary|frightening/.test(avoidText)) add("children picture book adventure");
  if (!forceSemanticExpansion && /growing up|growing_up|family|friendship|lessons?/.test(likedText)) add("beginning reader growing up");
  if (!forceSemanticExpansion) {
    addFallback("easy reader");
    addFallback(ageProfile.diagnosticProbeQuery);
  }
  const uniqueQueries = uniqueStrings(queries, ageProfile.queryLimit);
  return uniqueQueries.map((query, index) => ({
    query,
    originalPlannedQuery,
    queryCascadeIndex: index,
    queryFamily: queryFamilyForOpenLibraryQuery(query),
    facets: uniqueStrings((plannedIntents[index]?.facets || []).map(cleanOpenLibraryQueryPart).filter(isUsefulOpenLibraryQueryPart), 6),
    routingReason: forceSemanticExpansion ? "k2_clean_candidate_shortfall_semantic_expansion" : "k2_openlibrary_picture_early_reader",
    routingDominance: { openLibraryPlanner: "k2_profile_candidate", ageProfile: ageProfile.key, behaviorLabel: ageProfile.behaviorLabel, lockedBaseline: ageProfile.lockedBaseline, likedSignalsUsedForQueries: uniqueStrings(likedRows.map((row) => row.value), 8).join("|"), semanticExpansion: forceSemanticExpansion },
    profileSpecific: index < uniqueQueries.length - 1,
  }));
}

function buildGenericOpenLibraryQueryPlans(plan: SourcePlan, ageProfile: OpenLibraryAgeProfile): OpenLibraryQueryPlan[] {
  const plannedIntents = plan.intents.length ? plan.intents : [{ query: ageProfile.diagnosticProbeQuery, facets: [], id: `${ageProfile.key}-open-library-fallback`, priority: 0, rationale: [] }];
  const rawQueries = plannedIntents.flatMap((intent) => [intent.query, ...(intent.facets || [])]);
  const uniqueQueries = uniqueStrings(rawQueries
    .map(cleanOpenLibraryQueryPart)
    .filter(isUsefulOpenLibraryQueryPart)
    .map(finalOpenLibraryQueryDedupe), ageProfile.queryLimit);
  const queries = uniqueQueries.length ? uniqueQueries : [ageProfile.diagnosticProbeQuery];
  return queries.map((query, index) => ({
    query,
    originalPlannedQuery: finalOpenLibraryQueryDedupe(String(plannedIntents[0]?.query || ageProfile.diagnosticProbeQuery)),
    queryCascadeIndex: index,
    queryFamily: queryFamilyForOpenLibraryQuery(query),
    facets: uniqueStrings((plannedIntents[index]?.facets || []).map(cleanOpenLibraryQueryPart).filter(isUsefulOpenLibraryQueryPart), 6),
    routingReason: `${ageProfile.key}_openlibrary_profile_pending`,
    routingDominance: { openLibraryPlanner: "generic_pending_profile", ageProfile: ageProfile.key, behaviorLabel: ageProfile.behaviorLabel, lockedBaseline: ageProfile.lockedBaseline },
  }));
}

function buildOpenLibraryQueryPlans(plan: SourcePlan, profile: TasteProfile, ageProfile: OpenLibraryAgeProfile): OpenLibraryQueryPlan[] {
  if (ageProfile.key === "teen") return buildTeenOpenLibraryQueryPlans(plan, profile, ageProfile);
  if (ageProfile.key === "adult") return buildAdultOpenLibraryQueryPlans(plan, profile, ageProfile);
  if (ageProfile.key === "middleGrades") return buildMiddleGradesOpenLibraryQueryPlans(plan, profile, ageProfile);
  if (ageProfile.key === "k2") return buildKidsOpenLibraryQueryPlans(plan, profile, ageProfile);
  return buildGenericOpenLibraryQueryPlans(plan, ageProfile);
}

export function buildOpenLibraryQueryPlansForRegression(plan: SourcePlan, profile: TasteProfile, ageProfile: OpenLibraryAgeProfile): OpenLibraryQueryPlan[] {
  return buildOpenLibraryQueryPlans(plan, profile, ageProfile);
}

function configuredOpenLibraryProxyBase(): string {
  const env = typeof process !== "undefined" ? (process as any)?.env || {} : {};
  const explicit = String(env.OPEN_LIBRARY_PROXY_BASE_URL || env.EXPO_PUBLIC_OPEN_LIBRARY_PROXY_BASE_URL || "").trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercelUrl = String(env.VERCEL_URL || "").trim();
  if (vercelUrl) return `https://${vercelUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  return "";
}

function openLibraryRequest(query: string, limit: number, forceDirect = false): { url: string; fetchPath: "direct" | "proxy" } {
  const params = `q=${encodeURIComponent(query)}&limit=${Math.max(1, Math.min(20, limit))}&fields=${encodeURIComponent(OPEN_LIBRARY_SEARCH_FIELDS)}`;
  if (!forceDirect && typeof window !== "undefined") return { url: `/api/openlibrary?${params}`, fetchPath: "proxy" };
  const proxyBase = configuredOpenLibraryProxyBase();
  if (!forceDirect && proxyBase) return { url: `${proxyBase}/api/openlibrary?${params}`, fetchPath: "proxy" };
  return { url: `https://openlibrary.org/search.json?${params}&language=eng`, fetchPath: "direct" };
}

function bodyPrefix(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, RESPONSE_BODY_PREFIX_LIMIT) : undefined;
}

function normalizeOpenLibraryDoc(doc: any, queryPlan: OpenLibraryQueryPlan) {
  const query = queryPlan.query;
  const key = String(doc?.key || doc?.cover_edition_key || doc?.edition_key?.[0] || "").trim();
  const title = String(doc?.title || "").trim();
  const authors = uniqueStrings(Array.isArray(doc?.author_name) ? doc.author_name : []);
  const subjects = uniqueStrings([
    ...(Array.isArray(doc?.subject) ? doc.subject : []),
    ...(Array.isArray(doc?.subject_facet) ? doc.subject_facet : []),
    ...(Array.isArray(doc?.subject_key) ? doc.subject_key : []),
  ]);
  const firstPublishYear = Number.isFinite(Number(doc?.first_publish_year)) ? Number(doc.first_publish_year) : undefined;
  const sourceUrl = key ? `https://openlibrary.org${key.startsWith("/") ? key : `/${key}`}` : undefined;
  const rawDescription = typeof doc?.description === "string" ? doc.description : typeof doc?.description?.value === "string" ? doc.description.value : "";
  const firstSentence = Array.isArray(doc?.first_sentence) ? doc.first_sentence.map(String).filter(Boolean) : typeof doc?.first_sentence === "string" ? [doc.first_sentence] : [];
  const description = rawDescription || firstSentence.join(" ") || undefined;
  return {
    id: key || `openlibrary:${title.toLowerCase()}`,
    sourceId: key || undefined,
    key: key || undefined,
    title,
    subtitle: String(doc?.subtitle || "").trim() || undefined,
    creators: authors,
    authors,
    author_name: authors,
    description,
    first_sentence: firstSentence,
    subject: subjects,
    subject_facet: subjects,
    subject_key: Array.isArray(doc?.subject_key) ? doc.subject_key : undefined,
    formats: ["book"],
    genres: subjects.slice(0, 12),
    themes: subjects.slice(0, 18),
    tones: [],
    characterDynamics: [],
    maturityBand: undefined,
    publicationYear: firstPublishYear,
    first_publish_year: firstPublishYear,
    sourceUrl,
    cover_i: doc?.cover_i,
    source: "openLibrary",
    queryText: query,
    originalPlannedQuery: queryPlan.originalPlannedQuery,
    simplifiedOpenLibraryQuery: query,
    queryCascadeIndex: queryPlan.queryCascadeIndex,
    queryFamily: queryPlan.queryFamily,
    routingReason: queryPlan.routingReason,
    facets: queryPlan.facets,
    emergencyFallback: Boolean(queryPlan.emergencyFallback),
    fallbackAlignment: queryPlan.fallbackAlignment,
    profileSpecific: queryPlan.profileSpecific,
    rawOpenLibraryDoc: doc,
  };
}

function emptyDiagnostics(plan: SourcePlan, status: SourceDiagnosticV2["status"], startedAt: string, extra?: Partial<SourceDiagnosticV2>): SourceDiagnosticV2 {
  const finishedAt = nowIso();
  return {
    source: "openLibrary",
    status,
    planned: plan.enabled,
    attempted: status !== "skipped",
    timedOut: status === "timed_out",
    startedAt,
    finishedAt,
    elapsedMs: Date.parse(finishedAt) - Date.parse(startedAt),
    rawCount: 0,
    normalizedCount: 0,
    queries: [],
    ...extra,
  };
}

function openLibraryProxyClientTimeoutMs(ageProfile: OpenLibraryAgeProfile): number | undefined {
  if (ageProfile.key === "adult") return ADULT_OPEN_LIBRARY_PROXY_CLIENT_TIMEOUT_MS;
  if (ageProfile.key === "teen") return TEEN_OPEN_LIBRARY_PROXY_CLIENT_TIMEOUT_MS;
  if (ageProfile.key === "middleGrades") return MIDDLE_GRADES_OPEN_LIBRARY_PROXY_CLIENT_TIMEOUT_MS;
  if (ageProfile.key === "k2") return K2_OPEN_LIBRARY_PROXY_CLIENT_TIMEOUT_MS;
  return undefined;
}

let openLibraryAbortControllerSequence = 0;

async function fetchOpenLibraryDocs(queryPlan: OpenLibraryQueryPlan, limit: number, signal?: AbortSignal, diagnosticOnly = false, timeoutMs = DEFAULT_OPEN_LIBRARY_PROFILE.perQueryTimeoutMs, attemptNumber = 1, proxyClientTimeoutMs?: number, forceDirect = false, sourceBudgetRemainingAtFetchStartMs?: number): Promise<{ docs: any[]; diagnostic: SourceFetchDiagnosticV2; responseBodyPrefix?: string }> {
  const query = queryPlan.query;
  const { url, fetchPath } = openLibraryRequest(query, limit, forceDirect);
  const proxyRetryWindowEnabled = Number.isFinite(Number(proxyClientTimeoutMs)) && fetchPath === "proxy";
  const effectiveTimeoutMs = proxyRetryWindowEnabled
    ? Math.max(timeoutMs, Number(proxyClientTimeoutMs))
    : timeoutMs;
  const fetchStartedAt = nowIso();
  const startedMs = Date.now();
  const controllerCreatedAtMs = startedMs;
  const abortControllerId = `openlibrary-fetch-${++openLibraryAbortControllerSequence}`;
  const diagnostic: SourceFetchDiagnosticV2 = {
    query,
    fetchStartedAt,
    requestStart: fetchStartedAt,
    attemptNumber,
    timedOut: false,
    fetchPath,
    clientTimeoutMs: effectiveTimeoutMs,
    abortControllerId,
    abortControllerCreatedAt: fetchStartedAt,
    abortControllerSharedWithPreviousFetch: false,
    parentSignalPresent: Boolean(signal),
    parentSignalAbortedAtStart: Boolean(signal?.aborted),
    timeoutBudgetRemainingAtFetchStartMs: timeoutMs,
    sourceBudgetRemainingAtFetchStartMs,
    proxyRetryWindowEnabled,
    diagnosticOnly,
    originalPlannedQuery: queryPlan.originalPlannedQuery,
    queryCascadeIndex: queryPlan.queryCascadeIndex,
    queryFamily: queryPlan.queryFamily,
    facets: queryPlan.facets,
  };

  const queryController = new AbortController();
  const markControllerAborted = (reason: string, origin: SourceFetchDiagnosticV2["abortOrigin"]): void => {
    abortReason = reason;
    diagnostic.abortOrigin = origin;
    diagnostic.abortControllerAbortedAt = nowIso();
    diagnostic.abortControllerLifetimeMs = Date.now() - controllerCreatedAtMs;
  };
  let abortReason = "";
  const timeout = setTimeout(() => {
    markControllerAborted("per_query_timeout", "local_timeout");
    queryController.abort("per_query_timeout");
  }, effectiveTimeoutMs);
  const abortFromParent = () => {
    markControllerAborted("source_timeout_or_parent_abort", "router_or_parent");
    queryController.abort("source_timeout_or_parent_abort");
  };
  if (signal?.aborted) {
    markControllerAborted("source_already_aborted", "parent_already_aborted");
    queryController.abort("source_already_aborted");
  }
  else signal?.addEventListener("abort", abortFromParent, { once: true });

  try {
    const response = await fetch(url, { signal: queryController.signal });
    diagnostic.httpStatus = response.status;
    diagnostic.responseHeadersReceived = nowIso();
    diagnostic.bodyStarted = nowIso();
    const text = await response.text();
    diagnostic.bodyCompleted = nowIso();
    diagnostic.fetchFinishedAt = nowIso();
    diagnostic.requestEnd = diagnostic.fetchFinishedAt;
    diagnostic.elapsedMs = Date.now() - startedMs;
    diagnostic.abortControllerLifetimeMs = diagnostic.abortControllerLifetimeMs ?? diagnostic.elapsedMs;
    diagnostic.parentSignalAbortedAtEnd = Boolean(signal?.aborted);

    if (!response.ok) {
      diagnostic.responseBodyPrefix = bodyPrefix(text);
      diagnostic.failedReason = `openlibrary_http_${response.status}`;
      return { docs: [], diagnostic, responseBodyPrefix: diagnostic.responseBodyPrefix };
    }

    try {
      const json = JSON.parse(text);
      if (!Array.isArray(json?.docs)) {
        diagnostic.responseShape = "missing_docs_array";
        diagnostic.docsReturned = 0;
        diagnostic.responseBodyPrefix = bodyPrefix(text);
        diagnostic.failedReason = "openlibrary_unexpected_response_shape_missing_docs";
        return { docs: [], diagnostic, responseBodyPrefix: diagnostic.responseBodyPrefix };
      }
      const docs = json.docs;
      if (Number.isFinite(Number(json?.proxyAttempts))) diagnostic.proxyAttempts = Number(json.proxyAttempts);
      diagnostic.responseShape = "docs_array";
      diagnostic.docsReturned = docs.length;
      diagnostic.firstReturnedTitles = uniqueStrings(docs.map((doc: any) => doc?.title), 5);
      return { docs, diagnostic };
    } catch (error: any) {
      diagnostic.responseBodyPrefix = bodyPrefix(text);
      diagnostic.failedReason = `openlibrary_json_parse_failed:${error?.message || String(error)}`;
      return { docs: [], diagnostic, responseBodyPrefix: diagnostic.responseBodyPrefix };
    }
  } catch (error: any) {
    const cause = error?.cause;
    const causeDetail = cause?.code || cause?.message || "";
    const message = [String(error?.message || error || "openlibrary_fetch_failed"), causeDetail ? `cause:${causeDetail}` : ""].filter(Boolean).join(" ");
    diagnostic.fetchFinishedAt = nowIso();
    diagnostic.requestEnd = diagnostic.fetchFinishedAt;
    diagnostic.elapsedMs = Date.now() - startedMs;
    diagnostic.timedOut = Boolean(queryController.signal.aborted || signal?.aborted || /aborted|abort|timeout/i.test(message));
    if (diagnostic.timedOut && !diagnostic.abortOrigin) diagnostic.abortOrigin = queryController.signal.aborted ? "unknown" : "fetch_abort_without_local_signal";
    diagnostic.abortReason = abortReason || (diagnostic.timedOut ? "abort_or_timeout" : undefined);
    diagnostic.abortControllerLifetimeMs = diagnostic.abortControllerLifetimeMs ?? diagnostic.elapsedMs;
    diagnostic.parentSignalAbortedAtEnd = Boolean(signal?.aborted);
    diagnostic.failedReason = message;
    return { docs: [], diagnostic };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromParent);
  }
}

function openLibraryEmptyReason(rawItems: unknown[], rawApiResultCount: number, dropReasons: Record<string, number>, fetches: SourceFetchDiagnosticV2[], failedReason: string): string | undefined {
  if (rawItems.length > 0) return undefined;
  const mainFetch = fetches.find((fetch) => !fetch.diagnosticOnly);
  const droppedBeforeDocCount = Object.values(dropReasons).reduce((sum, count) => sum + count, 0);
  if (!mainFetch) return "openlibrary_no_main_fetch_diagnostic";
  if (mainFetch.timedOut) return "openlibrary_main_fetch_timed_out";
  if (mainFetch.responseShape === "missing_docs_array") return "openlibrary_unexpected_response_shape";
  if (Number(mainFetch.docsReturned || 0) === 0) return "openlibrary_returned_zero_docs";
  if (rawApiResultCount > 0 && droppedBeforeDocCount >= rawApiResultCount) return "openlibrary_docs_dropped_before_normalization";
  if (rawApiResultCount > 0 && droppedBeforeDocCount > 0) return "openlibrary_docs_partially_dropped_before_normalization";
  if (failedReason) return `openlibrary_failed_before_normalized_rows:${failedReason}`;
  return "openlibrary_no_normalized_rows_after_fetch";
}

function isEnglishOpenLibraryDoc(doc: any): boolean {
  const languages = Array.isArray(doc?.language) ? doc.language.map((value: any) => String(value || "").toLowerCase()) : [];
  return languages.length === 0 || languages.includes("eng") || languages.includes("en");
}

function isRelevanceDriftOpenLibraryDoc(doc: any, query: string): boolean {
  if (RELEVANCE_DRIFT_QUERY_HINT.test(query)) return false;
  const title = String(doc?.title || "");
  const subjects = [
    ...(Array.isArray(doc?.subject) ? doc.subject : []),
    ...(Array.isArray(doc?.subject_facet) ? doc.subject_facet : []),
  ].join(" ");
  const firstPublishYear = Number(doc?.first_publish_year || 0);
  if (RELEVANCE_DRIFT_TITLE_HINT.test(`${title} ${subjects}`)) return true;
  return Boolean(firstPublishYear > 0 && firstPublishYear < 1900 && !/\bclassic|historical|history|literary\b/i.test(query) && !GENRE_QUERY_HINT.test(`${title} ${subjects}`));
}

function openLibraryDocText(doc: any): string {
  return [
    String(doc?.title || ""),
    String(doc?.subtitle || ""),
    Array.isArray(doc?.author_name) ? doc.author_name.join(" ") : "",
    ...(Array.isArray(doc?.subject) ? doc.subject : []),
    ...(Array.isArray(doc?.subject_facet) ? doc.subject_facet : []),
  ].join(" ");
}

function isOpenLibraryArtifactDoc(doc: any, query: string): boolean {
  if (ARTIFACT_QUERY_HINT.test(query)) return false;
  return ARTIFACT_TITLE_HINT.test(openLibraryDocText(doc));
}

function isLiteraryAnalysisArtifactDoc(doc: any, query: string): boolean {
  if (/\b(criticism|critical|analysis|study guide|literary study)\b/i.test(query)) return false;
  const titleText = [String(doc?.title || ""), String(doc?.subtitle || "")].join(" ");
  const subjectText = [
    ...(Array.isArray(doc?.subject) ? doc.subject : []),
    ...(Array.isArray(doc?.subject_facet) ? doc.subject_facet : []),
  ].join(" ");
  const fullText = openLibraryDocText(doc);
  if (LITERARY_ANALYSIS_TITLE_ARTIFACT_HINT.test(titleText)) return true;
  if (LITERARY_ANALYSIS_SUBJECT_ARTIFACT_HINT.test(subjectText)) return true;
  return LITERARY_ANALYSIS_ARTIFACT_HINT.test(fullText) && !hasFictionMetadataEvidence(doc);
}

function isKeywordStuffedMarketingArtifactDoc(doc: any): boolean {
  const titleText = [String(doc?.title || ""), String(doc?.subtitle || "")].join(" ").toLowerCase();
  const marketingMatches = titleText.match(/\b(teen books?|ya books?|books for teens?|love story|romantic suspense|action adventure|surfing|teen romance|romance|suspense)\b/g) || [];
  return KEYWORD_STUFFED_MARKETING_TITLE_HINT.test(titleText) && marketingMatches.length >= 3;
}

function isMediaStudyArtifactDoc(doc: any): boolean {
  return MEDIA_STUDY_ARTIFACT_HINT.test(openLibraryDocText(doc));
}

function isAdultProfileArtifactDoc(doc: any, profile: TasteProfile): boolean {
  if (profile.ageBand !== "adult") return false;
  const text = openLibraryDocText(doc).toLowerCase();
  const profileText = [
    ...profile.genreFamily.map((row) => row.value),
    ...profile.themes.map((row) => row.value),
    ...profile.formatPreference.map((row) => row.value),
  ].join(" ").toLowerCase();
  const explicitlyLikesRomance = /\b(romance|romantic|love story|dark romance|romantasy)\b/.test(profileText);
  const explicitlyLikesNonfiction = /\b(nonfiction|non-fiction|memoir|biography|history|essays?|criticism|academic|scholarly|true crime)\b/.test(profileText);
  if (SCHOLARLY_CATALOG_ARTIFACT_HINT.test(text)) return true;
  if (ADULT_ROMANCE_DRIFT_HINT.test(text) && !explicitlyLikesRomance) return true;
  if (WRITING_GUIDE_CRITICISM_ARTIFACT_HINT.test(text) && !explicitlyLikesNonfiction) return true;
  if (ADULT_NOTES_CRITICISM_NONFICTION_ARTIFACT_HINT.test(text) && !explicitlyLikesNonfiction) return true;
  return false;
}

function isProgrammingGuideArtifactDoc(doc: any): boolean {
  return PROGRAMMING_GUIDE_ARTIFACT_HINT.test(openLibraryDocText(doc));
}

function isSurvivalGuideArtifactDoc(doc: any): boolean {
  const text = openLibraryDocText(doc);
  if (!SURVIVAL_GUIDE_ARTIFACT_HINT.test(text)) return false;
  if (/\b(choose your own adventure|survival guide|survival handbook|survival manual|handbook|field guide|star trek survival|kane chronicles survival guide)\b/i.test(text)) return true;
  return !hasStrongTeenFictionMetadataEvidence(doc);
}

function isAdultDarkRomanceArtifactDoc(doc: any, profile: TasteProfile): boolean {
  if (profile.ageBand !== "teens") return false;
  const text = openLibraryDocText(doc);
  return ADULT_DARK_ROMANCE_ARTIFACT_HINT.test(text) && !hasStrongTeenFictionMetadataEvidence(doc);
}

function hasFictionMetadataEvidence(doc: any): boolean {
  const subjects = [
    ...(Array.isArray(doc?.subject) ? doc.subject : []),
    ...(Array.isArray(doc?.subject_facet) ? doc.subject_facet : []),
  ].join(" ").toLowerCase();
  return /young adult|juvenile|teen|adolescent|dystopian|horror|mystery|thriller|paranormal|fantasy|adventure|historical fiction|coming of age|fiction|novel/.test(subjects);
}

function hasStrongTeenFictionMetadataEvidence(doc: any): boolean {
  const text = openLibraryDocText(doc).toLowerCase();
  const subjects = [
    ...(Array.isArray(doc?.subject) ? doc.subject : []),
    ...(Array.isArray(doc?.subject_facet) ? doc.subject_facet : []),
  ].join(" ").toLowerCase();
  const teenEvidence = /\b(young adult|juvenile fiction|teen|adolescent|high school|coming of age)\b/.test(subjects);
  const fictionEvidence = /\b(fiction|novel|dystopian|science fiction|fantasy|horror|mystery|thriller|adventure)\b/.test(subjects);
  const workMetadataCount = (Array.isArray(doc?.subject) ? doc.subject.length : 0) + (Array.isArray(doc?.subject_facet) ? doc.subject_facet.length : 0);
  return teenEvidence && fictionEvidence && workMetadataCount >= 3 && !ADULT_LOW_TEEN_FIT_HINT.test(text);
}

function hasExplicitTeenOpenLibraryEvidence(doc: any): boolean {
  const text = openLibraryDocText(doc).toLowerCase();
  return /\b(young adult|ya fiction|juvenile fiction|juvenile literature|teen|teens|adolescent|high school|coming of age)\b/.test(text);
}

function isTeenBroadQueryClassicDriftDoc(doc: any, query: string, profile: TasteProfile): boolean {
  if (profile.ageBand !== "teens") return false;
  const normalizedQuery = cleanOpenLibraryQueryPart(query);
  if (!/^(historical adventure|science fiction adventure|alternate history fiction|paranormal mystery|psychological mystery)$/.test(normalizedQuery)) return false;
  if (hasExplicitTeenOpenLibraryEvidence(doc)) return false;
  const text = openLibraryDocText(doc).toLowerCase();
  const firstPublishYear = Number(doc?.first_publish_year || doc?.firstPublishYear || 0);
  const classicOrAdultShape = /\b(classic literature|classic fiction|adult fiction|literary fiction|pulp|short stories|anthology|collected|complete|omnibus)\b/.test(text);
  const broadGenreShape = /\b(science fiction|sci-fi|space|planet|adventure|historical|alternate history|paranormal|psychological|mystery|thriller|fiction|novel)\b/.test(text);
  return classicOrAdultShape || (firstPublishYear > 0 && firstPublishYear < 1990 && broadGenreShape);
}

function isTeenClassicOrAdultDriftDoc(doc: any, profile: TasteProfile): boolean {
  if (profile.ageBand !== "teens") return false;
  if (hasExplicitTeenOpenLibraryEvidence(doc)) return false;
  const title = String(doc?.title || "").trim().toLowerCase();
  const text = openLibraryDocText(doc).toLowerCase();
  const firstPublishYear = Number(doc?.first_publish_year || doc?.firstPublishYear || 0);
  const knownClassicTitleDrift = /\b(anne of green gables|ozma of oz)\b/.test(title);
  const knownAdultTitleDrift = /\b(the\s+)?housemaid\b/.test(title) && /\b(thriller|suspense|mystery|psychological|domestic|murder|adult fiction|fiction)\b/.test(text);
  const oldClassicShape = firstPublishYear > 0 && firstPublishYear < 1950 && /\b(classic literature|classic fiction|children'?s classics|children'?s literature|fairy tales?|public domain|l\.?\s*frank\s*baum|lucy maud montgomery|l\.?\s*m\.?\s*montgomery)\b/.test(text);
  return knownClassicTitleDrift || knownAdultTitleDrift || oldClassicShape;
}

function isWeakTeenFitOddTitleDoc(doc: any, profile: TasteProfile): boolean {
  if (profile.ageBand !== "teens") return false;
  const title = String(doc?.title || "").trim().toLowerCase();
  if (!/^(go to hell|hell|damned|damnation)\b/.test(title)) return false;
  return !hasStrongTeenFictionMetadataEvidence(doc);
}

function isAuthorNameTitleDriftDoc(doc: any): boolean {
  const title = String(doc?.title || "").trim().toLowerCase();
  if (!title) return false;
  const authors = Array.isArray(doc?.author_name) ? doc.author_name.map((name: any) => String(name || "").trim().toLowerCase()) : [];
  if (authors.includes(title)) return true;
  if (/^[a-z]+\s+[a-z]+$/.test(title) && !hasFictionMetadataEvidence(doc)) return true;
  return false;
}

function isLiteralTitleMatchArtifactDoc(doc: any, query: string): boolean {
  const title = String(doc?.title || "").toLowerCase();
  if (/\b(fantasy drama book|playing with fantasy)\b/.test(title)) return true;
  const queryTokens = cleanOpenLibraryQueryPart(query).split(" ").filter((token) => token.length >= 5 && !/^(young|adult|fiction|novel|story)$/.test(token));
  if (!queryTokens.length) return false;
  const titleMatches = queryTokens.filter((token) => title.includes(token)).length;
  if (titleMatches < Math.min(2, queryTokens.length)) return false;
  return !hasFictionMetadataEvidence(doc);
}

function openLibrarySeriesKey(doc: any): string {
  const title = String(doc?.title || "").toLowerCase();
  const hasSeriesMarker = /\b(volume|vol|book|chapter|episode|part)\s*[:.#-]?\s*\d+\b|\b\d+\b/.test(title);
  const cleaned = title
    .replace(/\b(volume|vol|book|chapter|episode|part)\s*[:.#-]?\s*\d+\b/g, " ")
    .replace(/\b(one piece|naruto|bleach|dragon ball|my hero academia|attack on titan|demon slayer|sailor moon|grande ritorno|diadem|chosen)\b.*$/i, "$1")
    .replace(/\b(chosen)\s+\w+\b/i, "$1")
    .replace(/\b\d+\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return hasSeriesMarker || /\b(one piece|naruto|bleach|dragon ball|my hero academia|attack on titan|demon slayer|sailor moon|grande ritorno|diadem|chosen)\b/.test(cleaned) ? cleaned : "";
}

function openLibraryCollectionRootKey(doc: any): string {
  const title = String(doc?.title || "").toLowerCase();
  if (!title) return "";
  const primaryTitle = title.split(/[:;(\[]/)[0] || title;
  const normalized = primaryTitle
    .replace(/\b(the|a|an)\b/g, " ")
    .replace(/\b(complete|collected|collection|collections|collector'?s|treasury|storybook|stories|tales|adventures|books?|chapter|chapters|volume|vol|omnibus|anthology|library|set|boxed|box)\b/g, " ")
    .replace(/\b\d+\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const hasCollectionMarker = /\b(complete|collected|collection|collections|collector'?s|treasury|storybook|stories|tales|adventures|books?|omnibus|anthology|library|set|boxed|box)\b/i.test(title);
  if (!normalized || normalized.split(" ").length < 2) return "";
  return hasCollectionMarker ? normalized : "";
}

function isTeenInappropriateOpenLibraryDoc(doc: any, profile: TasteProfile): boolean {
  if (profile.ageBand !== "teens") return false;
  const text = openLibraryDocText(doc).toLowerCase();
  if (/\b(lolita|nabokov|erotic|erotica|sexual abuse|incest|pornography)\b/.test(text)) return true;
  if (/\bnovels?\s+\d{4}\s*-\s*\d{4}\b/.test(text) && /\b(lolita|nabokov)\b/.test(text)) return true;
  if (ADULT_LOW_TEEN_FIT_HINT.test(text) && !/\b(young adult|juvenile|teen|adolescent)\b/.test(text)) return true;
  return false;
}

function isOmnibusBundleDriftOpenLibraryDoc(doc: any, query: string, profile: TasteProfile): boolean {
  if (profile.ageBand !== "teens") return false;
  if (/\bomnibus|collected|complete|screenplay|selected works|collection\b/i.test(query)) return false;
  const title = String(doc?.title || "");
  return /\b(omnibus|collected novels|complete novels|novels?\s+\d{4}\s*-\s*\d{4}|screenplay)\b/i.test(title);
}

function emergencyFallbackHasMeaningfulOverlap(doc: any, queryPlans: OpenLibraryQueryPlan[]): boolean {
  const docText = cleanOpenLibraryQueryPart(openLibraryDocText(doc));
  const genericTokens = new Set(["young", "adult", "teen", "fiction", "novel", "story", "book", "books", "mystery", "general", "literary"]);
  const sourceText = queryPlans.flatMap((plan) => [plan.originalPlannedQuery, plan.query, ...(plan.facets || [])]).join(" ");
  const tokens = uniqueStrings(cleanOpenLibraryQueryPart(sourceText)
    .split(" ")
    .filter((token) => token.length >= 5 && !genericTokens.has(token)), 12);
  return tokens.length > 0 && tokens.some((token) => docText.includes(token));
}

function hasAdultFantasyHistoricalFallbackOverlap(doc: any): boolean {
  const text = openLibraryDocText(doc).toLowerCase();
  return /\b(fantasy|magic|magical|historical|history|romance|romantic|adventure|action|comedy|humou?r)\b/.test(text);
}

function isAdultMixedHistoricalMysteryRomanceProfile(profile: TasteProfile): boolean {
  if (profile.ageBand !== "adult") return false;
  const profileText = [
    ...profile.genreFamily.map((row) => row.value),
    ...profile.themes.map((row) => row.value),
    ...profile.formatPreference.map((row) => row.value),
  ].join(" ").toLowerCase();
  return /\b(historical|history|period)\b/.test(profileText)
    && /\b(mystery|thriller|crime|suspense|detective)\b/.test(profileText)
    && /\b(romance|romantic|love|science fiction|sci-fi|speculative)\b/.test(profileText);
}

function hasAdultMixedHistoricalMysteryFallbackOverlap(doc: any): boolean {
  const text = openLibraryDocText(doc).toLowerCase();
  return /\b(mystery|crime|thriller|suspense|detective|historical|history|romance|romantic)\b/.test(text);
}

function adultUnderfillRecoveryQueries(queryPlans: OpenLibraryQueryPlan[]): string[] {
  const routingReason = String(queryPlans[0]?.routingReason || "");
  const plannedQueries = queryPlans.map((plan) => plan.query);
  const routeFallbacks = (() => {
    if (routingReason === "adult_fantasy_adventure_mystery") return ["fantasy mystery", "speculative fiction", "adventure fantasy"];
    if (routingReason === "adult_fantasy_romance_adventure") return ["romantic fantasy", "mythological fantasy", "adventure fantasy"];
    if (routingReason === "adult_horror" || routingReason === "adult_gothic_horror_fantasy") return ["horror fiction", "supernatural thriller", "dark suspense"];
    if (routingReason === "adult_mixed_speculative") return ["speculative fiction", "science fiction thriller", "speculative thriller"];
    if (routingReason === "adult_historical_crime_drama") return ["crime fiction", "historical mystery", "mystery thriller"];
    if (routingReason === "adult_crime_thriller") return ["crime fiction", "mystery thriller", "psychological thriller"];
    if (routingReason === "adult_fantasy_historical_survival") return ["fantasy adventure", "historical fantasy", "fantasy romance"];
    return [];
  })();
  return uniqueStrings([...plannedQueries, ...routeFallbacks], 8);
}

function teenUnderfillRecoveryQueries(queryPlans: OpenLibraryQueryPlan[]): string[] {
  const routingReason = String(queryPlans[0]?.routingReason || "");
  const plannedQueries = queryPlans.map((plan) => plan.query);
  const routeFallbacks = (() => {
    if (/dystopian|scifi|science/i.test(routingReason)) return ["young adult dystopian fiction", "dystopian adventure", "science fiction adventure"];
    if (/mystery|heist|psychological|thriller/i.test(routingReason)) return ["young adult mystery", "teen mystery", "mystery adventure"];
    if (/historical/i.test(routingReason)) return ["teen historical fiction", "historical adventure", "young adult mystery"];
    if (/horror|paranormal/i.test(routingReason)) return ["young adult horror", "paranormal mystery", "dark fantasy"];
    if (/contemporary|romance/i.test(routingReason)) return ["young adult contemporary", "teen realistic fiction", "coming of age novel"];
    if (/fantasy|adventure|survival/i.test(routingReason)) return ["young adult fantasy", "fantasy adventure", "magical adventure"];
    return ["young adult fantasy", "young adult mystery", "fantasy adventure", "mystery adventure"];
  })();
  return uniqueStrings([...plannedQueries.slice(1), ...routeFallbacks], 8);
}

function middleGradesProfileSpecificQueries(profile: TasteProfile): string[] {
  const targetedBatch = middleGradesTargetedQueryBatch(profile);
  const positiveRows = [...profile.genreFamily, ...profile.themes]
    .filter((row) => Number(row.weight || 0) > 0)
    .map((row) => ({ value: cleanOpenLibraryQueryPart(row.value), weight: Math.abs(Number(row.weight || 0)) }))
    .filter((row) => row.value);
  const avoidRows = profile.avoidSignals
    .filter((row) => Number(row.weight || 0) < 0)
    .map((row) => ({ value: cleanOpenLibraryQueryPart(row.value), weight: Math.abs(Number(row.weight || 0)) }))
    .filter((row) => row.value);
  const ageQueryPattern = /\b(middle grade|middle school|chapter book|children'?s)\b/i;
  const genreQueryPattern = /\b(fiction|novel|story|book|adventure|fantasy|mystery|comedy|school|science|technology|robot|ocean|sea|animal|nature|mythology|graphic|illustrated)\b/i;
  const score = (patterns: RegExp[]): number => {
    const positive = positiveRows
      .filter((row) => patterns.some((pattern) => pattern.test(row.value)))
      .reduce((sum, row) => sum + row.weight, 0);
    const avoided = avoidRows
      .filter((row) => patterns.some((pattern) => pattern.test(row.value)))
      .reduce((sum, row) => sum + row.weight, 0);
    const recurrence = positiveRows.filter((row) => patterns.some((pattern) => pattern.test(row.value))).length;
    return positive + Math.max(0, recurrence - 1) * 0.35 - avoided * 1.5;
  };
  const hasDistinctivePositiveSignal = (patterns: RegExp[]): boolean => positiveRows.some((row) => patterns.some((pattern) => pattern.test(row.value)));
  const candidates = [
    { query: "middle grade robot fiction", distinctive: [/\b(ai|artificial intelligence|robots?|robotics|technology)\b/i], support: [] },
    { query: "middle grade technology adventure", distinctive: [/\b(ai|artificial intelligence|robots?|robotics|technology)\b/i], support: [/\badventure\b/i] },
    { query: "funny robot chapter book", distinctive: [/\b(robots?|robotics|technology|ai|artificial intelligence)\b/i], support: [/\b(comedy|funny|humou?r|playful|silly)\b/i] },
    { query: "middle grade science fiction family", distinctive: [/\b(science fiction|sci-fi|sci fi|space|robots?|technology|ai|artificial intelligence)\b/i], support: [/\b(family|friendship|community)\b/i] },
    { query: "funny middle school novel", distinctive: [/\b(comedy|funny|humou?r|playful|silly)\b/i], support: [/\b(school|middle school|realistic)\b/i] },
    { query: "realistic middle grade school story", distinctive: [/\b(realistic|contemporary|school|middle school)\b/i], support: [] },
    { query: "middle grade friendship school novel", distinctive: [/\b(friendship|friends?|community|cozy)\b/i], support: [/\b(school|middle school|realistic)\b/i] },
    { query: "middle school comedy novel", distinctive: [/\b(comedy|funny|humou?r|playful|silly)\b/i], support: [/\b(school|middle school)\b/i] },
    { query: "middle grade ocean fantasy", distinctive: [/\b(ocean|sea|island|water|marine|music)\b/i], support: [/\b(fantasy|magic|magical)\b/i] },
    { query: "middle grade sea adventure fantasy", distinctive: [/\b(ocean|sea|island|water|marine)\b/i], support: [/\badventure\b/i, /\b(fantasy|magic|magical)\b/i] },
    { query: "middle grade mythology adventure", distinctive: [/\b(mythology|mythological|legend|dragon|creature)\b/i], support: [/\badventure\b/i] },
    { query: "middle grade dragon fantasy", distinctive: [/\b(dragon|creature|mythology|mythological)\b/i], support: [/\b(fantasy|magic|magical)\b/i] },
    { query: "middle grade treasure mystery", distinctive: [/\b(treasure|mystery|clue|detective|puzzle|investigation)\b/i], support: [] },
    { query: "middle grade mystery adventure", distinctive: [/\b(mystery|detective|puzzle|investigation|clue|treasure)\b/i], support: [/\badventure\b/i] },
    { query: "middle grade animal fantasy", distinctive: [/\b(animals?|nature|wildlife|creature)\b/i], support: [/\b(fantasy|magic|magical)\b/i] },
    { query: "middle grade animal adventure", distinctive: [/\b(animals?|nature|wildlife)\b/i], support: [/\badventure\b/i] },
    { query: "middle grade graphic novel silly", distinctive: [/\b(graphic novel|illustrated|silly|comics?)\b/i], support: [/\b(comedy|funny|humou?r|playful)\b/i] },
  ].map((candidate) => {
      const patterns = [...candidate.distinctive, ...candidate.support];
      return { query: candidate.query, patterns, score: score(patterns), hasDistinctiveSignal: hasDistinctivePositiveSignal(candidate.distinctive) };
    })
    .filter((candidate) => candidate.score > 0.65 && candidate.hasDistinctiveSignal && ageQueryPattern.test(candidate.query) && genreQueryPattern.test(candidate.query))
    .sort((a, b) => b.score - a.score);
  return uniqueStrings([...targetedBatch, ...candidates.map((candidate) => candidate.query)], 10);
}

type MiddleGradesTargetedQueryPlan = {
  queries: string[];
  scoreByFamily: Record<string, number>;
  likedEvidenceByFamily: Record<string, string[]>;
  skipEvidenceByFamily: Record<string, string[]>;
  avoidEvidenceByFamily: Record<string, string[]>;
  firstBatchChosenBecause?: string;
  skipOnlyFamilyPromotedToFirstBatch: boolean;
  likedEvidenceQueryFamilies: string[];
  familyByQuery: Record<string, string>;
  reliableVariantQueries: string[];
};

function middleGradesTargetedQueryPlan(profile: TasteProfile): MiddleGradesTargetedQueryPlan {
  const positiveRows = [...profile.genreFamily, ...profile.themes]
    .filter((row) => Number(row.weight || 0) > 0)
    .map((row) => ({ value: cleanOpenLibraryQueryPart(row.value), weight: Math.abs(Number(row.weight || 0)), evidence: Array.isArray(row.evidence) ? row.evidence.map(String) : [] }))
    .filter((row) => row.value);
  const avoidRows = profile.avoidSignals
    .filter((row) => Number(row.weight || 0) < 0)
    .map((row) => ({ value: cleanOpenLibraryQueryPart(row.value), weight: Math.abs(Number(row.weight || 0)), evidence: Array.isArray(row.evidence) ? row.evidence.map(String) : [] }))
    .filter((row) => row.value);
  const familyDefinitions = [
    {
      family: "comedy_friendship_music",
      queries: ["funny children books", "humorous fiction children", "funny friendship chapter book", "children friendship comedy", "middle grade music friendship", "middle grade music friendship fiction", "children music friendship story", "performing arts children fiction", "funny middle school friendship"],
      patterns: [/\b(comedy|funny|humou?r|playful|silly|friendship|friends?|music|middle school|school)\b/i],
    },
    {
      family: "comedy_family_kindness",
      queries: ["funny children books", "humorous fiction children", "children family comedy fiction", "middle grade family friendship story", "funny family chapter book", "kindness middle grade fiction"],
      patterns: [/\b(comedy|funny|humou?r|family|friendship|friends?|kindness|kind|community|gentle|warm)\b/i],
    },
    {
      family: "adventure_comedy_friendship",
      queries: ["funny adventure chapter book", "children friendship adventure", "middle grade music friendship", "middle grade friendship adventure fiction", "middle grade friendship school novel", "funny middle school adventure", "middle grade adventure friendship", "funny adventure children", "funny school adventure", "middle grade adventure chapter book", "middle grade school friendship fiction"],
      patterns: [/\b(playful|comedy|funny|humou?r|friendship|friends?|community|music|middle school)\b/i],
    },
    {
      family: "dinosaur_science_adventure",
      queries: ["dinosaur fiction children", "dinosaur adventure children", "children's science fiction adventure", "children adventure fiction", "mythology children fiction"],
      patterns: [/\b(dinosaurs?|science fiction|sci-fi|sci fi|space|science)\b/i],
    },
    {
      family: "science_robot",
      queries: ["children's science fiction adventure", "science fiction chapter book", "children adventure fiction", "robot adventure children", "middle grade robot fiction", "middle grade technology adventure"],
      patterns: [/\b(ai|artificial intelligence|robots?|robotics|technology|science fiction|sci-fi|sci fi|space|science)\b/i],
    },
    {
      family: "animal_nature",
      queries: ["animal fantasy children", "fantasy animals children", "children's animal adventure", "children's nature fiction", "middle grade animal story", "children's animal survival", "middle grade animal fantasy"],
      patterns: [/\b(animals?|nature|wildlife|forest|wolf|wolves)\b/i],
    },
    {
      family: "mystery",
      queries: ["middle grade mystery series", "children detective mystery", "children mystery adventure", "middle grade mystery adventure", "school mystery children", "fantasy mystery children", "children magical mystery", "funny mystery chapter book", "middle grade treasure mystery"],
      patterns: [/\b(mystery|detective|clue|treasure|puzzle|investigation)\b/i],
    },
    {
      family: "dragon_mythology",
      queries: ["middle grade dragon fantasy", "dragon fantasy children", "dragon adventure children", "children's dragon books", "mythology adventure children", "fantasy adventure children"],
      patterns: [/\b(dragon|mythology|mythological|creature|legend)\b/i],
    },
    {
      family: "fantasy_superhero_family",
      queries: ["middle grade superhero adventure", "children superhero adventure", "children fantasy family adventure", "magical family adventure children", "funny fantasy family children"],
      patterns: [/\b(superhero|super hero|hero|powers?)\b/i],
    },
    {
      family: "fantasy_family_friendship",
      queries: ["children fantasy adventure", "children fantasy family novel", "children fantasy friendship", "middle grade magical family", "middle grade fantasy mystery", "children magical adventure"],
      patterns: [/\b(fantasy|magic|magical|wizard|witch|dragon|portal)\b/i],
    },
    {
      family: "graphic_comedy",
      queries: ["graphic novel children", "funny graphic novel children", "humorous fiction children", "funny children books", "children adventure fiction"],
      patterns: [/\b(graphic novel|graphics?|illustrated|comic|comics|dog man|comedy|funny|humou?r)\b/i],
    },
    {
      family: "school_friendship_comedy",
      queries: ["funny children books", "humorous fiction children", "funny middle school fiction", "middle grade school friendship fiction", "children school friendship fiction", "funny school story children", "illustrated middle school fiction", "school friendship chapter book", "children school comedy", "funny chapter book school"],
      patterns: [/\b(school|middle school|friendship|friends?|community|comedy|funny|humou?r|graphic novel|illustrated|playful|realistic|contemporary)\b/i],
    },
  ];
  const scoreByFamily: Record<string, number> = {};
  const likedEvidenceByFamily: Record<string, string[]> = {};
  const skipEvidenceByFamily: Record<string, string[]> = {};
  const avoidEvidenceByFamily: Record<string, string[]> = {};
  const evidenceTitles = (row: { value: string; evidence: string[] }): string[] => row.evidence.length ? row.evidence : [row.value];
  const hasLikedPositiveRow = (pattern: RegExp): boolean => positiveRows.some((row) => {
    const liked = row.evidence.some((item) => item.startsWith("like:")) || !row.evidence.some((item) => item.startsWith("skip:"));
    return liked && pattern.test(row.value);
  });
  for (const def of familyDefinitions) {
    let liked = 0;
    let skip = 0;
    let avoid = 0;
    const likedEvidence: string[] = [];
    const skipEvidence: string[] = [];
    const avoidEvidence: string[] = [];
    for (const row of positiveRows) {
      if (!def.patterns.some((pattern) => pattern.test(row.value))) continue;
      const hasLike = row.evidence.some((item) => item.startsWith("like:"));
      const hasSkip = row.evidence.some((item) => item.startsWith("skip:"));
      if (hasLike) {
        liked += row.weight;
        likedEvidence.push(...evidenceTitles(row).filter((item) => item.startsWith("like:") || !item.includes(":")));
      }
      if (hasSkip && !hasLike) {
        skip += row.weight;
        skipEvidence.push(...evidenceTitles(row).filter((item) => item.startsWith("skip:") || !item.includes(":")));
      } else if (hasSkip) {
        skip += row.weight * 0.25;
        skipEvidence.push(...evidenceTitles(row).filter((item) => item.startsWith("skip:")));
      }
    }
    for (const row of avoidRows) {
      if (!def.patterns.some((pattern) => pattern.test(row.value))) continue;
      avoid += row.weight;
      avoidEvidence.push(...evidenceTitles(row));
    }
    const distinctiveLikedBoost = def.family === "graphic_comedy" && hasLikedPositiveRow(/\b(graphic novel|graphics?|illustrated|comic|comics|dog man)\b/i)
      ? 3
      : def.family === "adventure_comedy_friendship"
        && hasLikedPositiveRow(/\b(adventure|quest|survival)\b/i)
        && hasLikedPositiveRow(/\b(comedy|funny|humou?r|playful|friendship|friends?|community|music)\b/i)
        ? 3
      : def.family === "fantasy_superhero_family"
        && hasLikedPositiveRow(/\b(superhero|super hero|hero|powers?)\b/i)
        && hasLikedPositiveRow(/\b(fantasy|magic|magical|family|families|adventure)\b/i)
        ? 4
      : def.family === "fantasy_family_friendship"
        && hasLikedPositiveRow(/\b(fantasy|magic|magical)\b/i)
        && hasLikedPositiveRow(/\b(family|friendship|friends?|music|playful|community|ocean|sea|island|kindness)\b/i)
        ? 3
      : 0;
    const score = Math.round((liked + distinctiveLikedBoost - avoid + skip * 0.15) * 1000) / 1000;
    scoreByFamily[def.family] = score;
    likedEvidenceByFamily[def.family] = uniqueStrings(likedEvidence, 8);
    skipEvidenceByFamily[def.family] = uniqueStrings(skipEvidence, 8);
    avoidEvidenceByFamily[def.family] = uniqueStrings(avoidEvidence, 8);
  }
  const ranked = familyDefinitions
    .map((def, index) => ({ ...def, index, score: Number(scoreByFamily[def.family] || 0), likedEvidenceCount: likedEvidenceByFamily[def.family]?.length || 0, skipEvidenceCount: skipEvidenceByFamily[def.family]?.length || 0 }))
    .filter((def) => def.score > 0)
    .sort((a, b) => b.score - a.score || b.likedEvidenceCount - a.likedEvidenceCount || a.index - b.index);
  const likedRanked = ranked.filter((def) => def.likedEvidenceCount > 0);
  const chosen = likedRanked.length ? likedRanked : ranked;
  const skipOnlyFamilyPromotedToFirstBatch = chosen.length > 0 && chosen[0].likedEvidenceCount === 0 && chosen[0].skipEvidenceCount > 0;
  const queries = uniqueStrings(chosen.flatMap((def) => def.queries), 14);
  const familyByQuery: Record<string, string> = {};
  for (const def of chosen) for (const query of def.queries) familyByQuery[query] = def.family;
  const reliableVariantQueries = uniqueStrings(queries.filter((query) => /\b(funny children books|humorous fiction children|children adventure fiction|children fantasy adventure|dinosaur fiction children|dinosaur adventure children|mythology children fiction|graphic novel children|funny graphic novel children|funny adventure chapter book|children friendship adventure|middle grade music friendship|middle grade friendship adventure fiction|middle grade friendship school novel|middle grade adventure chapter book|middle grade music friendship fiction|children music friendship story|performing arts children fiction|funny middle school adventure|middle grade adventure friendship|funny adventure children|funny school adventure|middle grade school friendship fiction|children school friendship fiction|funny school story children|children mystery adventure|middle grade mystery adventure|school mystery children|fantasy mystery children|children magical mystery|middle grade superhero adventure|children superhero adventure|children fantasy family adventure|magical family adventure children|funny fantasy family children|animal fantasy children|fantasy animals children)\b/i.test(query)), 20);
  return {
    queries,
    scoreByFamily,
    likedEvidenceByFamily,
    skipEvidenceByFamily,
    avoidEvidenceByFamily,
    firstBatchChosenBecause: chosen[0] ? `${chosen[0].family}:score=${chosen[0].score}:liked=${chosen[0].likedEvidenceCount}:skip=${chosen[0].skipEvidenceCount}` : undefined,
    skipOnlyFamilyPromotedToFirstBatch,
    likedEvidenceQueryFamilies: likedRanked.map((def) => def.family),
    familyByQuery,
    reliableVariantQueries,
  };
}

function middleGradesTargetedQueryBatch(profile: TasteProfile): string[] {
  return middleGradesTargetedQueryPlan(profile).queries;
}

function middleGradesRecoveryQueries(queryPlans: OpenLibraryQueryPlan[]): string[] {
  const routingReason = String(queryPlans[0]?.routingReason || "");
  const plannedQueries = queryPlans.map((plan) => plan.query);
  const ageAnchoredUnderfillQueries = ["middle grade fiction", "middle grade adventure", "middle grade fantasy", "children's fantasy adventure", "children's school stories", "middle grade humor"];
  if (/humor|funny/i.test(routingReason)) {
    const nonAdventurePlannedQueries = plannedQueries.slice(1).filter((query) => !/\badventure\b/i.test(query));
    const fantasyAlignedQueries = /fantasy/i.test(routingReason) ? ["middle grade fantasy adventure"] : [];
    return uniqueStrings([
      ...nonAdventurePlannedQueries,
      "middle grade school story",
      "middle grade friendship",
      ...fantasyAlignedQueries,
      "middle grade adventure",
      "middle grade mystery",
      "middle grade fiction",
      "middle grade fantasy",
      "children's school stories",
      "children's fantasy adventure",
    ], 12);
  }
  if (/contemporary|school|friendship|realistic/i.test(routingReason)) {
    const nonAdventurePlannedQueries = plannedQueries.slice(1).filter((query) => !/\badventure\b/i.test(query));
    return uniqueStrings([
      ...nonAdventurePlannedQueries,
      "middle grade realistic fiction",
      "middle grade school story",
      "middle grade friendship",
      "middle grade family story",
      "middle grade friendship books",
      "children's school stories",
      "middle grade fiction",
      "middle grade adventure",
      "middle grade humor",
      "children's funny books",
      "children's fantasy adventure",
    ], 12);
  }
  const routeFallbacks = (() => {
    if (/scifi|science|dystopian/i.test(routingReason)) return ["middle grade adventure", "middle grade science fiction", "children's fantasy adventure", "middle grade fantasy", ...ageAnchoredUnderfillQueries];
    if (/fantasy_mystery|mystery/i.test(routingReason)) return ["middle grade mystery", "school mystery", "mystery adventure", "middle grade fantasy mystery"];
    if (/fantasy/i.test(routingReason)) return ["middle grade fantasy adventure", "middle grade fantasy", "children's fantasy adventure", "middle grade adventure", "middle grade fiction", "children's school stories", "middle grade humor"];
    return [...ageAnchoredUnderfillQueries, "children's funny books"];
  })();
  return uniqueStrings([...plannedQueries.slice(1), ...routeFallbacks], 12);
}

function middleGradesSignalShapedAntiZeroFallback(queryPlans: OpenLibraryQueryPlan[], attemptedQueries: Set<string>, profile: TasteProfile): {
  query: string;
  shapingSignals: string[];
  candidateQueries: string[];
  queryScores: Record<string, number>;
  positiveEvidenceByQuery: Record<string, string[]>;
  avoidEvidenceByQuery: Record<string, string[]>;
  reliabilityByQuery: Record<string, number>;
  selectedReason: string;
  whyHigherTasteFallbackLost?: string;
  specificityScore: number;
  strongerSignalDroppedFromFallbackQuery?: string;
} | undefined {
  const routingReason = String(queryPlans[0]?.routingReason || "");
  if (/fantasy_mystery|mystery/i.test(routingReason)) return undefined;
  const positiveRows = [...profile.genreFamily, ...profile.themes]
    .filter((row) => Number(row.weight || 0) > 0)
    .map((row) => ({ value: cleanOpenLibraryQueryPart(row.value), weight: Math.abs(Number(row.weight || 0)), evidence: Array.isArray(row.evidence) ? row.evidence : [] }))
    .filter((row) => row.value);
  const avoidRows = profile.avoidSignals
    .filter((row) => Number(row.weight || 0) < 0)
    .map((row) => ({ value: cleanOpenLibraryQueryPart(row.value), weight: Math.abs(Number(row.weight || 0)), evidence: Array.isArray(row.evidence) ? row.evidence : [] }))
    .filter((row) => row.value);
  const fallbackCandidates = [
    { query: "middle grade AI robot superhero comedy", family: "ai_robot_superhero_comedy", reliability: 0.45, patterns: [/\b(ai|artificial intelligence|robots?|robotics|technology|superheroes?|superhero|powers?)\b/i, /\b(comedy|funny|humor|humorous|playful)\b/i] },
    { query: "middle grade family fantasy", family: "family_fantasy", reliability: 0.8, patterns: [/\b(family|redemption|warm|kindness)\b/i, /\b(fantasy|magic|magical|heroic)\b/i] },
    { query: "middle grade funny family story", family: "funny_family", reliability: 0.75, patterns: [/\b(comedy|funny|humor|humorous|playful)\b/i, /\b(family|redemption|school|friendship|community)\b/i] },
    { query: "middle grade fantasy adventure", family: "fantasy_adventure", reliability: 0.65, patterns: [/\b(fantasy|magic|magical|heroic)\b/i, /\badventure\b/i] },
    { query: "middle grade school adventure", family: "school_adventure", reliability: 0.85, patterns: [/\b(school|classroom|community|family)\b/i, /\b(adventure|playful|friendship|mystery)\b/i] },
    { query: "children's nature adventure", family: "animal_adventure", reliability: 0.6, patterns: [/\b(animals?|nature|wildlife|nonfiction)\b/i] },
    { query: "middle grade animal adventure", family: "animal_adventure", reliability: 0.65, patterns: [/\b(animals?|nature|wildlife|nonfiction)\b/i] },
    { query: "middle grade dystopian adventure", family: "science_fiction_adventure", reliability: 0.55, patterns: [/\b(dystopian|dystopia|science fiction|sci fi|sci-fi|space|speculative)\b/i, /\badventure\b/i] },
    { query: "middle grade mystery adventure", family: "mystery_adventure", reliability: 0.85, patterns: [/\b(mystery|detective)\b/i, /\b(adventure|friendship)\b/i] },
    { query: "middle grade friendship adventure", family: "friendship_adventure", reliability: 0.65, patterns: [/\b(friendship|friends?|community)\b/i, /\b(adventure|playful|school)\b/i] },
    { query: "middle grade adventure", family: "generic_adventure", reliability: -0.15, patterns: [/\badventure\b/i] },
    { query: "middle grade science fiction", family: "science_fiction_adventure", reliability: -2.5, patterns: [/\b(science fiction|sci fi|sci-fi|space|dystopian|dystopia|speculative)\b/i, /\badventure\b/i] },
    { query: "middle grade dystopian science fiction", family: "science_fiction_adventure", reliability: -2.7, patterns: [/\b(dystopian|dystopia|science fiction|sci fi|sci-fi|space|speculative)\b/i, /\badventure\b/i] },
  ].filter((candidate) => !attemptedQueries.has(candidate.query.toLowerCase()));
  const candidateQueries = fallbackCandidates.map((candidate) => candidate.query);
  if (!fallbackCandidates.length) return undefined;
  const hasNonGenericIntersection = fallbackCandidates.some((candidate) => candidate.family !== "generic_adventure" && candidate.patterns.filter((pattern) => positiveRows.some((row) => pattern.test(row.value))).length >= 2);
  const unusualStrongSignals = positiveRows.filter((row) => /\b(ai|artificial intelligence|robots?|robotics|technology|superheroes?|superhero|powers?)\b/i.test(row.value));
  const queryScores: Record<string, number> = {};
  const positiveEvidenceByQuery: Record<string, string[]> = {};
  const avoidEvidenceByQuery: Record<string, string[]> = {};
  const reliabilityByQuery: Record<string, number> = {};
  const scored = fallbackCandidates.map((candidate) => {
    const positiveMatches = positiveRows.filter((row) => candidate.patterns.some((pattern) => pattern.test(row.value)));
    const avoidMatches = avoidRows.filter((row) => candidate.patterns.some((pattern) => pattern.test(row.value)));
    const matchedPatternCount = candidate.patterns.filter((pattern) => positiveRows.some((row) => pattern.test(row.value))).length;
    const positiveScore = positiveMatches.reduce((sum, row) => sum + row.weight, 0);
    const avoidScore = avoidMatches.reduce((sum, row) => sum + row.weight, 0);
    const recurrenceBoost = Math.max(0, positiveMatches.length - 1) * 0.35;
    const unusualSpecificityBoost = candidate.family === "ai_robot_superhero_comedy" && matchedPatternCount >= 1 ? 0.9 : 0;
    const intersectionBoost = matchedPatternCount >= 2 ? 1.2 : 0;
    const isolatedPenalty = positiveMatches.length <= 1 && matchedPatternCount < 2 ? 0.6 : 1;
    const tasteScore = (positiveScore * isolatedPenalty) + recurrenceBoost + intersectionBoost + unusualSpecificityBoost - (avoidScore * 1.4);
    const genericAdventurePenalty = candidate.family === "generic_adventure" && hasNonGenericIntersection ? 1.15 : 0;
    const missingRequiredAiSignalPenalty = candidate.family === "ai_robot_superhero_comedy" && !positiveRows.some((row) => /\b(ai|artificial intelligence|robots?|robotics|technology|superheroes?|superhero|powers?)\b/i.test(row.value)) ? 2.75 : 0;
    const missingRequiredFamilyFantasySignalPenalty = candidate.family === "family_fantasy" && !positiveRows.some((row) => /\b(fantasy|magic|magical|heroic)\b/i.test(row.value)) ? 2.5 : 0;
    const missingRequiredFunnyFamilySignalPenalty = candidate.family === "funny_family" && !positiveRows.some((row) => /\b(comedy|funny|humor|humorous|playful)\b/i.test(row.value)) ? 2.5 : 0;
    const score = tasteScore + candidate.reliability - genericAdventurePenalty - missingRequiredAiSignalPenalty - missingRequiredFamilyFantasySignalPenalty - missingRequiredFunnyFamilySignalPenalty;
    const roundedTasteScore = Math.round(tasteScore * 1000) / 1000;
    const roundedScore = Math.round(score * 1000) / 1000;
    queryScores[candidate.query] = roundedScore;
    reliabilityByQuery[candidate.query] = candidate.reliability;
    positiveEvidenceByQuery[candidate.query] = uniqueStrings(positiveMatches.map((row) => row.value), 6);
    avoidEvidenceByQuery[candidate.query] = uniqueStrings(avoidMatches.map((row) => row.value), 6);
    return { ...candidate, score: roundedScore, tasteScore: roundedTasteScore, positiveMatches, avoidMatches, matchedPatternCount };
  }).sort((a, b) => b.score - a.score || b.matchedPatternCount - a.matchedPatternCount || candidateQueries.indexOf(a.query) - candidateQueries.indexOf(b.query));
  const selected = scored[0];
  if (!selected) return undefined;
  const runnerUp = scored[1];
  const topTasteCandidate = [...scored].sort((a, b) => b.tasteScore - a.tasteScore)[0];
  const whyHigherTasteFallbackLost = topTasteCandidate && topTasteCandidate.query !== selected.query
    ? `${topTasteCandidate.query} had higher taste score ${topTasteCandidate.tasteScore} but lower reliability ${topTasteCandidate.reliability}; selected ${selected.query} with net score ${selected.score} and reliability ${selected.reliability}`
    : undefined;
  const specificityScore = selected.matchedPatternCount + Math.min(2, selected.positiveMatches.length * 0.25) + (selected.family === "generic_adventure" ? -0.75 : 0);
  const strongerSignalDroppedFromFallbackQuery = unusualStrongSignals.length > 0 && selected.family !== "ai_robot_superhero_comedy"
    ? `specific_signal_not_selected:${uniqueStrings(unusualStrongSignals.map((row) => row.value), 4).join("|")}`
    : undefined;
  const lowConfidence = selected.score <= 0.5 || (selected.positiveMatches.length <= 1 && runnerUp && selected.score - runnerUp.score < 1.25);
  return {
    query: selected.query,
    shapingSignals: positiveEvidenceByQuery[selected.query],
    candidateQueries,
    queryScores,
    reliabilityByQuery,
    positiveEvidenceByQuery,
    avoidEvidenceByQuery,
    selectedReason: lowConfidence ? `fallback_only_low_confidence:${selected.family}` : `net_positive:${selected.family}`,
    whyHigherTasteFallbackLost,
    specificityScore: Math.round(specificityScore * 1000) / 1000,
    strongerSignalDroppedFromFallbackQuery,
  };
}

function middleGradesRouteAlignedRecoveryQuery(queryPlans: OpenLibraryQueryPlan[], attemptedQueries = new Set<string>()): string | undefined {
  const routeText = queryPlans
    .map((plan) => [plan.routingReason, plan.query, plan.originalPlannedQuery, ...(plan.facets || [])].filter(Boolean).join(" "))
    .join(" ");
  const firstUnattempted = (queries: string[]): string | undefined => uniqueStrings(queries, queries.length)
    .find((query) => !attemptedQueries.has(query.toLowerCase()));
  if (/ai|robot|superhero/i.test(routeText)) {
    return firstUnattempted(["middle grade superhero adventure", "middle grade robot adventure", "middle grade science adventure"]);
  }
  if (/nonfiction|science|nature|animal/i.test(routeText)) {
    return firstUnattempted(["middle grade science adventure", "middle grade animal adventure", "children's science fiction"]);
  }
  if (/fantasy_mystery|mystery/i.test(routeText)) {
    return firstUnattempted(["middle grade mystery", "middle grade fantasy mystery", "middle grade mystery adventure"]);
  }
  if (/fantasy_humor|humor|funny/i.test(routeText)) {
    return firstUnattempted(["middle grade funny family story", "middle grade school story", "middle grade friendship", "middle grade fantasy humor"]);
  }
  if (/fantasy/i.test(routeText)) {
    return firstUnattempted(["middle grade fantasy adventure", "middle grade fantasy mystery"]);
  }
  if (/friendship|community|school|contemporary|realistic/i.test(routeText)) {
    return firstUnattempted(["middle grade friendship", "children's school stories", "middle grade school story"]);
  }
  return undefined;
}

function middleGradesZeroCandidateFallbackQuery(queryPlans: OpenLibraryQueryPlan[], attemptedQueries = new Set<string>()): string {
  const routingReason = String(queryPlans[0]?.routingReason || "");
  const firstUnattempted = (queries: string[]): string | undefined => uniqueStrings(queries, queries.length)
    .find((query) => !attemptedQueries.has(query.toLowerCase()));
  if (/humor|funny/i.test(routingReason)) {
    const primaryStable = /fantasy/i.test(routingReason) ? ["middle grade fantasy adventure", "middle grade adventure"] : ["middle grade adventure"];
    return firstUnattempted([...primaryStable, "middle grade school story", "middle grade friendship", "middle grade mystery"]) || primaryStable[0];
  }
  if (/fantasy_mystery|mystery/i.test(routingReason)) return firstUnattempted(["middle grade mystery", "school mystery", "mystery adventure", "middle grade fantasy mystery"]) || "middle grade mystery";
  if (/contemporary|school|friendship|realistic/i.test(routingReason)) return firstUnattempted(["middle grade realistic fiction", "middle grade school story", "middle grade friendship", "middle grade family story", "middle grade friendship books", "middle grade adventure", "children's funny books"]) || "middle grade realistic fiction";
  if (/fantasy/i.test(routingReason)) return firstUnattempted(["middle grade fantasy adventure", "middle grade fantasy", "children's fantasy adventure", "middle grade adventure"]) || "middle grade fantasy adventure";
  if (/scifi|science|dystopian|historical|adventure/i.test(routingReason)) return firstUnattempted(["middle grade adventure", "middle grade fantasy adventure", "middle grade school story"]) || "middle grade adventure";
  return queryPlans.find((plan) => /\b(middle grade|children'?s|school)\b/i.test(plan.query) && !attemptedQueries.has(plan.query.toLowerCase()))?.query
    || queryPlans.find((plan) => /\b(middle grade|children'?s|school)\b/i.test(plan.query))?.query
    || "middle grade adventure";
}


function middleGradesQueryOnlyContinuationQueries(queryPlans: OpenLibraryQueryPlan[], attemptedQueries = new Set<string>()): string[] {
  const routeText = queryPlans
    .map((plan) => [plan.routingReason, plan.query, plan.originalPlannedQuery, ...(plan.facets || [])].filter(Boolean).join(" "))
    .join(" ");
  const plannedSpecific = queryPlans
    .map((plan) => plan.query)
    .filter((query) => !attemptedQueries.has(query.toLowerCase()))
    .filter((query) => /\b(middle grade|middle school|school|friendship|mystery|detective|fantasy|magical|magic|funny)\b/i.test(query));
  const routeSpecific = /contemporary|school|friendship|realistic/i.test(routeText)
    ? ["middle grade realistic fiction", "middle grade school story", "middle grade friendship", "funny middle school novel", "middle school comedy novel"]
    : /fantasy_mystery|mystery|detective/i.test(routeText)
      ? ["middle grade mystery", "school mystery", "detective fiction", "mystery adventure"]
      : /fantasy|adventure/i.test(routeText)
        ? ["middle grade fantasy adventure", "middle grade magical adventure", "middle grade adventure"]
        : ["middle grade realistic fiction", "middle grade mystery", "middle grade school story", "middle grade fantasy adventure"];
  return uniqueStrings([...plannedSpecific, ...routeSpecific], 10)
    .filter((query) => !attemptedQueries.has(query.toLowerCase()));
}

function middleGradesEvidenceAwareRecoveryQueries(queryPlans: OpenLibraryQueryPlan[], profile: TasteProfile, attemptedQueries = new Set<string>()): string[] {
  const routeText = queryPlans
    .map((plan) => [plan.routingReason, plan.query, plan.originalPlannedQuery, ...(plan.facets || [])].filter(Boolean).join(" "))
    .join(" ");
  const positiveText = [...profile.genreFamily, ...profile.themes]
    .filter((row) => Number(row.weight || 0) > 0)
    .map((row) => row.value)
    .join(" ");
  const signalText = `${routeText} ${positiveText}`;
  const evidenceQueries = /dragon|myth|mythology|creature/i.test(positiveText)
    ? ["dragon fantasy children", "dragon adventure children", "children's dragon books", "mythology adventure children", "fantasy adventure children"]
    : /nonfiction|concise|quirky|explanation/i.test(signalText) && /science/i.test(signalText)
    ? ["nonfiction children science stories", "children science explanation", "middle grade nonfiction science", "children science books", "science stories children"]
    : /animal|nature|wildlife|wolf|wolves|forest/i.test(signalText)
    ? ["children's animal adventure", "wildlife adventure children", "animal chapter book", "nature adventure children", "robot animal adventure children"]
    : /fantasy|magic|magical/i.test(signalText) && /school|comedy|funny|humou?r/i.test(signalText)
      ? ["middle grade magical school story", "children fantasy school fiction", "funny magical school story", "middle grade school fantasy", "children magical school story"]
      : /dragon|myth|mythology|creature|fantasy|magic|magical/i.test(signalText)
        ? ["dragon fantasy children", "dragon adventure children", "children's dragon books", "mythology adventure children", "fantasy adventure children"]
      : /music|performing arts|band|song/i.test(signalText) && /friendship|friends?|comedy|funny|humou?r/i.test(signalText)
        ? ["middle grade music friendship fiction", "children music friendship story", "performing arts children fiction", "middle grade school music friendship", "middle grade performing arts friendship fiction"]
      : /community|cozy|neighborhood/i.test(signalText) && /friendship|friends?/i.test(signalText)
        ? ["middle grade school friendship fiction", "middle grade friendship school novel", "middle grade family friendship story", "children school friendship fiction", "middle grade friendship adventure fiction"]
      : /school|friendship|friends?|community|comedy|funny|humou?r|realistic|contemporary/i.test(signalText)
      ? ["middle grade school friendship fiction", "children school friendship fiction", "funny school story children", "funny middle school fiction", "school friendship chapter book", "realistic school friendship fiction", "illustrated middle school fiction"]
      : /science|space|robot|technology|sci-fi|sci fi|science fiction/i.test(signalText)
        ? ["children's science fiction adventure", "space adventure children", "robot adventure children", "science fiction chapter book"]
        : /mystery|detective|clue|puzzle|investigation/i.test(signalText)
          ? ["children's mystery books", "detective chapter book", "school mystery children", "mystery adventure children"]
          : ["children's adventure fiction", "chapter book adventure", "middle grade fiction"];
  return uniqueStrings(evidenceQueries, 8).filter((query) => !attemptedQueries.has(query.toLowerCase()));
}


type MiddleGradesRecoveryFamilyScore = {
  query: string;
  family: string;
  anchors: string[];
  score: number;
  reason: string;
  skippedReason?: string;
};

function middleGradesMeaningfulTasteRecoveryQueryPlans(
  profile: TasteProfile,
  attemptedQueries = new Set<string>(),
  sameRunLeakageByFamily: Record<string, number> = {},
): { queries: string[]; scores: MiddleGradesRecoveryFamilyScore[]; skippedByAvoid: Record<string, string>; skippedByLeakage: Record<string, string>; selectedReasons: Record<string, string> } {
  const likedRows = [...profile.genreFamily, ...profile.themes, ...profile.characterDynamics, ...profile.tone]
    .filter((row) => Number(row.weight || 0) > 0);
  const dislikedRows = [...profile.genreFamily, ...profile.themes, ...profile.characterDynamics, ...profile.tone]
    .filter((row) => Number(row.weight || 0) < 0);
  const likedText = likedRows.map((row) => row.value).join(" ").toLowerCase();
  const avoidText = [...profile.avoidSignals, ...dislikedRows].map((row) => row.value).join(" ").toLowerCase();
  const hasLiked = (pattern: RegExp): boolean => pattern.test(likedText);
  const hasAvoid = (pattern: RegExp): boolean => pattern.test(avoidText);
  const cleanShortfallExpansion = Boolean((profile.diagnostics as Record<string, unknown>)?.forceMiddleGradesCleanCandidateShortfallExpansion);
  const familyDefs: Array<{ family: string; query: string; anchors: string[]; leakageRisk?: number; broad?: boolean }> = cleanShortfallExpansion ? [
    { family: "robot_adventure", query: "middle grade robot adventure", anchors: ["robot", "adventure"] },
    { family: "science_fiction_adventure", query: "middle grade science fiction adventure", anchors: ["science", "adventure"] },
    { family: "ocean_adventure", query: "children ocean adventure", anchors: ["ocean", "adventure"], broad: true },
    { family: "survival_adventure", query: "middle grade survival adventure", anchors: ["survival", "adventure"] },
    { family: "family_adventure", query: "middle grade family adventure", anchors: ["family", "adventure"], broad: true },
    { family: "superhero_adventure", query: "middle grade superhero adventure", anchors: ["superhero", "adventure"] },
    { family: "school_mystery", query: "middle grade school mystery", anchors: ["school", "mystery"] },
    { family: "fantasy_quest", query: "middle grade fantasy quest", anchors: ["fantasy", "adventure"] },
  ] : [
    { family: "ocean_friendship", query: "middle grade ocean friendship fiction", anchors: ["ocean", "friendship"] },
    { family: "ocean_adventure", query: "children ocean adventure fiction", anchors: ["ocean", "adventure"] },
    { family: "family_school", query: "middle grade family school fiction", anchors: ["family", "school"] },
    { family: "school_friendship", query: "middle grade school friendship fiction", anchors: ["school", "friendship"] },
    { family: "superhero_family", query: "middle grade superhero family fiction", anchors: ["superhero", "family"] },
    { family: "superhero_friendship", query: "middle grade superhero friendship fiction", anchors: ["superhero", "friendship"] },
    { family: "fantasy_family", query: "middle grade fantasy family fiction", anchors: ["fantasy", "family"] },
    { family: "fantasy_friendship", query: "middle grade fantasy friendship fiction", anchors: ["fantasy", "friendship"] },
    { family: "dragon_heroic", query: "middle grade dragon heroic fiction", anchors: ["dragon", "heroic"] },
    { family: "mythology_adventure", query: "middle grade mythology adventure fiction", anchors: ["mythology", "adventure"] },
    { family: "dystopian_friendship", query: "middle grade dystopian friendship fiction", anchors: ["dystopian", "friendship"] },
    { family: "science_concise", query: "middle grade science concise nonfiction", anchors: ["science", "concise"] },
    { family: "science_adventure", query: "middle grade science adventure fiction", anchors: ["science", "adventure"] },
    { family: "robot_friendship", query: "middle grade robot friendship fiction", anchors: ["robot", "friendship"] },
    { family: "family_adventure", query: "middle grade family adventure fiction", anchors: ["family", "adventure"] },
    { family: "friendship_adventure", query: "middle grade friendship adventure fiction", anchors: ["friendship", "adventure"], broad: true },
    { family: "adventure_friendship_series", query: "children adventure friendship series", anchors: ["adventure", "friendship"], broad: true },
    { family: "fast_adventure", query: "middle grade fast paced adventure fiction", anchors: ["adventure", "fast paced"], broad: true },
  ];
  const anchorPattern = (anchor: string): RegExp => {
    switch (anchor) {
      case "superhero": return /\b(superhero|super hero|hero|heroes|powers?)\b/i;
      case "ocean": return /\b(ocean|sea|island|marine)\b/i;
      case "fantasy": return /\b(fantasy|magic|magical|wizard|witch|fairy|dragon)\b/i;
      case "dragon": return /\b(dragon|dragons)\b/i;
      case "heroic": return /\b(heroic|hero|heroes|quest)\b/i;
      case "mythology": return /\b(myth|myths|mythology|mythological)\b/i;
      case "dystopian": return /\b(dystopian|dystopia)\b/i;
      case "science": return /\b(science|scientist|experiment|nonfiction|technology|science fiction|sci fi|sci-fi)\b/i;
      case "concise": return /\b(concise|short|quick|clear|explanation|nonfiction)\b/i;
      case "robot": return /\b(robot|robots?|technology|invention)\b/i;
      case "family": return /\b(family|families|parent|parents|siblings?)\b/i;
      case "school": return /\b(school|classroom|class|student|teacher)\b/i;
      case "friendship": return /\b(friendship|friends?|team|classmates?)\b/i;
      case "adventure": return /\b(adventure|quest|journey|survival|exploration)\b/i;
      case "mystery": return /\b(mystery|detective|clue|case|secret|investigation)\b/i;
      case "survival": return /\b(survival|survive|wilderness|wild|forest|stranded)\b/i;
      case "fast paced": return /\b(fast paced|exciting|adventure|quest)\b/i;
      default: return new RegExp(`\\b${anchor.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`, "i");
    }
  };
  const skippedByAvoid: Record<string, string> = {};
  const skippedByLeakage: Record<string, string> = {};
  const selectedReasons: Record<string, string> = {};
  const scores: MiddleGradesRecoveryFamilyScore[] = familyDefs.map((def) => {
    const likedSupport = def.anchors.filter((anchor) => hasLiked(anchorPattern(anchor))).length;
    const avoidOverlap = def.anchors.filter((anchor) => hasAvoid(anchorPattern(anchor))).length;
    const comedyLeakageActive = sameRunLeakageByFamily.humor || sameRunLeakageByFamily.comedy;
    let score = likedSupport * 4 + def.anchors.length + (def.query.includes("fiction") ? 1 : 0) - avoidOverlap * 5 - Number(sameRunLeakageByFamily[def.family] || 0) * 4 - (def.leakageRisk || 0) - (def.broad ? 1 : 0);
    const reasons = [`liked=${likedSupport}`, `avoid=${avoidOverlap}`, `specificity=${def.anchors.length}`, `sameRunRejected=${Number(sameRunLeakageByFamily[def.family] || 0)}`];
    let skippedReason: string | undefined;
    if (attemptedQueries.has(def.query.toLowerCase())) skippedReason = "already_attempted";
    if (!skippedReason && comedyLeakageActive && /comedy|funny|humou?r|playful/i.test(def.query)) skippedReason = "same_run_comedy_leakage";
    if (!skippedReason && sameRunLeakageByFamily[def.family] >= 2) skippedReason = "same_run_family_leakage_or_query_only";
    if (!skippedReason && def.broad && likedSupport < 2) skippedReason = "broad_recovery_requires_two_liked_anchors";
    if (!skippedReason && def.family === "friendship_adventure" && hasAvoid(/\b(friendship|friends?)\b/i) && likedSupport < 2) skippedReason = "friendship_avoid_without_second_positive_anchor";
    if (!skippedReason && /fantasy|adventure/.test(def.family) && hasAvoid(/\b(fantasy|magic|magical|adventure|quest)\b/i) && likedSupport < 2) skippedReason = "fantasy_or_adventure_avoid_requires_second_positive_anchor";
    if (!skippedReason && cleanShortfallExpansion && likedSupport === 0) skippedReason = "no_liked_evidence_support_for_clean_expansion";
    if (!skippedReason && likedSupport === 0) score -= 6;
    return { query: def.query, family: def.family, anchors: def.anchors, score, reason: reasons.join(";"), skippedReason };
  });
  for (const row of scores) {
    if (row.skippedReason?.includes("avoid")) skippedByAvoid[row.family] = row.skippedReason;
    else if (row.skippedReason?.includes("leakage") || row.skippedReason?.includes("query_only")) skippedByLeakage[row.family] = row.skippedReason;
  }
  const selected = scores
    .filter((row) => !row.skippedReason)
    .sort((a, b) => b.score - a.score || b.anchors.length - a.anchors.length || a.query.localeCompare(b.query))
    .slice(0, 10);
  for (const [index, row] of selected.entries()) selectedReasons[row.family] = `rank=${index + 1};${row.reason};score=${row.score}`;
  return { queries: selected.map((row) => row.query), scores, skippedByAvoid, skippedByLeakage, selectedReasons };
}

function middleGradesMeaningfulTasteRecoveryQueries(profile: TasteProfile, attemptedQueries = new Set<string>()): string[] {
  return middleGradesMeaningfulTasteRecoveryQueryPlans(profile, attemptedQueries).queries;
}

function middleGradesRecoveryQueryAnchor(query: string): string {
  const text = query.toLowerCase();
  if (/\bsuperhero\b/.test(text)) return "superhero";
  if (/\bocean|sea|island\b/.test(text)) return "ocean";
  if (/\bsurvival|wilderness\b/.test(text)) return "survival";
  if (/\brobot|technology\b/.test(text)) return "robot";
  if (/\bfantasy|magic|mythology\b/.test(text)) return "fantasy";
  if (/\bfamily\b/.test(text)) return "family";
  if (/\bschool\b/.test(text)) return "school";
  if (/\bfriendship|friends?\b/.test(text)) return "friendship";
  if (/\badventure|fast paced\b/.test(text)) return "adventure";
  if (/\bcomedy|funny|humou?r\b/.test(text)) return "humor";
  return "general_fiction";
}

function middleGradesDocumentBackedTasteSignalsFromSourceDoc(doc: any, profile: TasteProfile): string[] {
  const rawDescription = typeof doc?.description === "string" ? doc.description : typeof doc?.description?.value === "string" ? doc.description.value : "";
  const documentText = [
    String(doc?.title || ""),
    String(doc?.subtitle || ""),
    ...(Array.isArray(doc?.subject) ? doc.subject : []),
    ...(Array.isArray(doc?.subject_facet) ? doc.subject_facet : []),
    rawDescription,
  ].join(" ").toLowerCase();
  const positiveText = [...profile.genreFamily, ...profile.themes]
    .filter((row) => Number(row.weight || 0) > 0)
    .map((row) => row.value)
    .join(" ").toLowerCase();
  const signalDefs: Array<[string, RegExp, RegExp]> = [
    ["comedy", /\b(comedy|funny|humou?r|playful|silly|joke|laugh)\b/i, /\b(comedy|funny|humou?r|playful|silly|joke|laugh)\b/i],
    ["family", /\b(family|families|parent|parents|sibling|siblings)\b/i, /\b(family|families|parent|parents|sibling|siblings)\b/i],
    ["friendship", /\b(friendship|friends?|team|classmates?)\b/i, /\b(friendship|friends?|team|classmates?)\b/i],
    ["school", /\b(school|classroom|class|student|students|teacher)\b/i, /\b(school|classroom|class|student|students|teacher)\b/i],
    ["fantasy", /\b(fantasy|magic|magical|wizard|witch|dragon|kingdom)\b/i, /\b(fantasy|magic|magical|wizard|witch|dragon|kingdom)\b/i],
    ["dragon", /\b(dragon|dragons)\b/i, /\b(dragon|dragons)\b/i],
    ["mythology", /\b(myth|myths|mythology|mythological|legend|gods?)\b/i, /\b(myth|myths|mythology|mythological|legend|gods?)\b/i],
    ["nonfiction", /\b(nonfiction|science|experiment|activities|activity|explanation|facts?)\b/i, /\b(nonfiction|science|experiment|activities|activity|explanation|facts?)\b/i],
    ["superhero", /\b(superhero|super hero|hero|powers?)\b/i, /\b(superhero|super hero|hero|powers?)\b/i],
    ["ocean", /\b(ocean|sea|island|marine)\b/i, /\b(ocean|sea|island|marine)\b/i],
    ["adventure", /\b(adventure|quest|journey|explor(?:e|ing|ation))\b/i, /\b(adventure|quest|journey|explor(?:e|ing|ation))\b/i],
  ];
  return uniqueStrings(signalDefs
    .filter(([, profilePattern, docPattern]) => profilePattern.test(positiveText) && docPattern.test(documentText))
    .map(([signal]) => signal), 12);
}

function middleGradesSourceMeaningfulTasteEligibility(doc: any, profile: TasteProfile): { allowed: boolean; reason?: "zero_doc_backed_taste_match" | "broad_adventure_only_taste_match"; signals: string[] } {
  const signals = middleGradesDocumentBackedTasteSignalsFromSourceDoc(doc, profile);
  if (!signals.length) return { allowed: false, reason: "zero_doc_backed_taste_match", signals };
  if (signals.every((signal) => signal === "adventure")) return { allowed: false, reason: "broad_adventure_only_taste_match", signals };
  return { allowed: true, signals };
}

function middleGradesSourceRouteEvidencePattern(query: string, routingReason = ""): RegExp | undefined {
  const routeText = String(`${routingReason} ${query}`).toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
  const sourceQueryText = String(query).toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
  if (/\b(dragon|mythology|mythological|creature)\b/.test(routeText)) return /\b(dragon|dragons|myth|myths|mythology|mythological|creature|creatures|magic|magical|fantasy|quest|adventure)\b/i;
  if (/\b(science adventure|science fiction|sci fi|sci-fi|space|dystopian|dystopia)\b/.test(routeText)) return /\b(science|scientist|experiment|space|planet|galaxy|robot|robots?|technology|invention|dystopian|dystopia|sci fi|sci-fi|science fiction|nonfiction|animals?|nature|wildlife|wolf|wolves)\b/i;
  if (/\b(robot|ai|artificial intelligence|superhero|superheroes)\b/.test(routeText)) return /\b(robot|robots?|ai|artificial intelligence|technology|invention|superhero|superheroes|powers?)\b/i;
  if (/\b(animal adventure|animals?|nature|wildlife)\b/.test(routeText)) return /\b(animal|animals|dog|cat|horse|wolf|wolves|wildlife|nature|forest|woods|survival|cozy|community|farm|creature|creatures)\b/i;
  if (/\b(school adventure|school story|school|classroom|children s school stories)\b/.test(routeText)) return /\b(school|class|classroom|teacher|student|students|friendship|friends?|community|family|comedy|funny|humor|humour)\b/i;
  if (/\b(superhero|super hero)\b/.test(sourceQueryText) && /\b(friendship|friends?|adventure)\b/.test(sourceQueryText)) return /\b(superhero|super hero|heroes|hero|powers?|friendship|friends?|team|adventure|quest)\b/i;
  if (/\bfamily\b/.test(sourceQueryText) && /\badventure\b/.test(sourceQueryText)) return /\b(family|families|parents?|siblings?|home|superhero|super hero|heroes|hero|powers?|adventure|quest|journey|wild)\b/i;
  if (/\b(ocean|sea|island)\b/.test(sourceQueryText) && /\b(friendship|friends?|adventure|fantasy)\b/.test(sourceQueryText)) return /\b(ocean|sea|island|marine|friendship|friends?|adventure|quest|fantasy|magic|magical)\b/i;
  if (/\b(science|robot|technology)\b/.test(sourceQueryText) && /\b(adventure|friendship|fiction)\b/.test(sourceQueryText)) return /\b(science|scientist|experiment|robot|robots?|technology|invention|friendship|friends?|adventure|quest)\b/i;
  if (/\b(fantasy|magic|magical|mythology)\b/.test(sourceQueryText) && /\b(friendship|friends?|adventure|family)\b/.test(sourceQueryText)) return /\b(fantasy|magic|magical|wizard|witch|fairy|fairies|dragon|quest|kingdom|hero|heroic|myth|myths|mythology|adventure|friendship|friends?|family|school)\b/i;
  if (/\b(friendship|community)\b/.test(routeText)) return /\b(friendship|friends?|community|school|family|team|classroom)\b/i;
  if (/\b(fantasy mystery|mystery adventure|mystery|detective)\b/.test(routeText)) return /\b(mystery|detective|clue|clues|case|secret|secrets|puzzle|investigate|investigation)\b/i;
  if (/\b(humor|funny|funny family|fantasy humor)\b/.test(routeText)) return /\b(humor|humour|funny|comedy|comic|joke|laugh|laughs|giggle|silly|school|friendship|friends?|family|quest|adventure|trail)\b/i;
  if (/\b(fantasy adventure|family fantasy|fantasy|magic|magical)\b/.test(routeText)) return /\b(fantasy|magic|magical|wizard|witch|dragon|quest|kingdom|hero|heroic|adventure)\b/i;
  if (/\b(contemporary|realistic)\b/.test(routeText)) return /\b(realistic|contemporary|school|classroom|friendship|friends?|family|community)\b/i;
  return undefined;
}

function middleGradesSourceDocumentRouteEvidenceFields(doc: any, query: string, routingReason = ""): string[] {
  const pattern = middleGradesSourceRouteEvidencePattern(query, routingReason);
  if (!pattern) return [];
  const rawDescription = typeof doc?.description === "string" ? doc.description : doc?.description?.value;
  const normalizeRouteEvidenceText = (value: unknown): string => String(value || "").toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
  const subjectText = normalizeRouteEvidenceText([
    ...(Array.isArray(doc?.subject) ? doc.subject : []),
    ...(Array.isArray(doc?.subjects) ? doc.subjects : []),
    ...(Array.isArray(doc?.subject_facet) ? doc.subject_facet : []),
  ].join(" "));
  const fields: Array<[string, string]> = [
    ["title", normalizeRouteEvidenceText(doc?.title)],
    ["subtitle", normalizeRouteEvidenceText(doc?.subtitle)],
    ["description", normalizeRouteEvidenceText(rawDescription)],
    ["subjects", subjectText],
  ];
  const matched = fields.filter(([, value]) => pattern.test(value)).map(([field]) => field);
  const humorRoute = /humor|funny|comedy/i.test(`${query} ${routingReason}`);
  const titleOnly = matched.length > 0 && matched.every((field) => ["title", "subtitle"].includes(field));
  const hasPreteenFictionEvidence = /\b(middle grade|juvenile fiction|juvenile literature|children'?s fiction|children fiction|children'?s stories|children'?s literature|school stories?|humorous stories|adventure stories|fantasy fiction, juvenile)\b/i.test(subjectText);
  const titleText = [fields.find(([field]) => field === "title")?.[1] || "", fields.find(([field]) => field === "subtitle")?.[1] || ""].join(" ");
  const humorOnlyTitle = /\b(funny|humor|humour|comedy|comic|joke|laugh|giggle)\b/i.test(titleText) && !/\b(adventure|friendship|friends?|community|survival|school|family|quest|team)\b/i.test(titleText);
  if (humorRoute && titleOnly && humorOnlyTitle && !hasPreteenFictionEvidence) return [];
  return matched;
}

function middleGradesSourceMediumStrongEvidence(doc: any, query: string, routingReason = ""): boolean {
  const fields = middleGradesSourceDocumentRouteEvidenceFields(doc, query, routingReason);
  if (fields.some((field) => ["subjects", "description"].includes(field))) return true;
  const titleOnly = fields.length > 0 && fields.every((field) => ["title", "subtitle"].includes(field));
  if (!titleOnly) return fields.length >= 2;
  return false;
}

function middleGradesUnderfillSafeRecoveryQueries(queryPlans: OpenLibraryQueryPlan[], attemptedQueries = new Set<string>()): string[] {
  const routeText = queryPlans
    .map((plan) => [plan.routingReason, plan.query, plan.originalPlannedQuery, ...(plan.facets || [])].filter(Boolean).join(" "))
    .join(" ");
  const preferred = /ai|robot|superhero/i.test(routeText)
    ? ["middle grade superhero adventure", "middle grade robot adventure", "middle grade science adventure", "middle grade fantasy adventure", "middle grade adventure"]
    : /nonfiction|science|nature|animal/i.test(routeText)
      ? ["middle grade science adventure", "middle grade animal adventure", "children's science fiction", "middle grade mystery", "middle grade adventure"]
      : /mystery/i.test(routeText)
        ? ["middle grade mystery", "middle grade fantasy mystery", "middle grade mystery adventure", "middle grade school story", "middle grade adventure"]
        : /fantasy/i.test(routeText)
          ? ["middle grade fantasy adventure", "middle grade fantasy mystery", "middle grade mystery", "middle grade school story", "middle grade adventure"]
          : /friendship|community|school|contemporary|humor|funny/i.test(routeText)
            ? ["middle grade friendship", "children's school stories", "middle grade school story", "middle grade mystery", "middle grade fantasy adventure", "middle grade adventure"]
            : ["middle grade mystery", "middle grade school story", "middle grade fantasy adventure", "middle grade adventure"];
  return uniqueStrings(preferred, 8).filter((query) => !attemptedQueries.has(query.toLowerCase()));
}

function middleGradesRejectedRowsAntiZeroFallbackQuery(queryPlans: OpenLibraryQueryPlan[], attemptedQueries: Set<string>, fetches: SourceFetchDiagnosticV2[]): string | undefined {
  const hadReturnedRejectedRows = fetches.some((fetch) => !fetch.diagnosticOnly && !fetch.timedOut && Number(fetch.docsReturned || 0) > 0);
  if (!hadReturnedRejectedRows) return undefined;
  const routingReason = String(queryPlans[0]?.routingReason || "");
  const firstUnattempted = (queries: string[]): string | undefined => uniqueStrings(queries, queries.length)
    .find((query) => !attemptedQueries.has(query.toLowerCase()));
  if (/fantasy_mystery|mystery/i.test(routingReason)) return firstUnattempted(["middle grade adventure"]);
  if (/humor|funny/i.test(routingReason)) {
    const primaryStable = /fantasy/i.test(routingReason) ? ["middle grade fantasy adventure", "middle grade adventure"] : ["middle grade adventure"];
    return firstUnattempted([...primaryStable, "middle grade school story", "middle grade friendship"]);
  }
  if (/contemporary|school|friendship|realistic/i.test(routingReason)) return firstUnattempted(["middle grade adventure"]);
  return firstUnattempted(["middle grade adventure", "middle grade fantasy adventure", "middle grade school story"]);
}

function isMiddleGradesFantasyHumorRoute(queryPlans: OpenLibraryQueryPlan[]): boolean {
  return /middle_grades_fantasy_humor/i.test(String(queryPlans[0]?.routingReason || ""));
}

function isMiddleGradesHumorDefaultQuery(query: string): boolean {
  return /\b(humor|funny)\b/i.test(query);
}

function hasMiddleGradesFantasyHumorAlignedQuery(rawItems: any[]): boolean {
  return rawItems.some((item) => /\b(adventure|fantasy adventure|friendship)\b/i.test(String(item?.queryText || "")));
}

function isTeenCompatibleOpenLibraryDoc(doc: any, profile: TasteProfile): boolean {
  if (profile.ageBand !== "teens") return true;
  const firstPublishYear = Number(doc?.first_publish_year || 0);
  if (!firstPublishYear || firstPublishYear >= 1950) return true;
  const subjects = [
    ...(Array.isArray(doc?.subject) ? doc.subject : []),
    ...(Array.isArray(doc?.subject_facet) ? doc.subject_facet : []),
  ].join(" ").toLowerCase();
  return /young adult|juvenile|teen|adolescent/.test(subjects);
}

function middleGradesAgeShapeDiagnostic(doc: any, query: string, profile: TasteProfile): Omit<MiddleGradesAgeShapeDiagnosticSample, "stage"> | undefined {
  if (profile.ageBand !== "preteens") return undefined;
  const title = String(doc?.title || "").toLowerCase();
  const subjectValues = [
    ...(Array.isArray(doc?.subject) ? doc.subject : []),
    ...(Array.isArray(doc?.subject_facet) ? doc.subject_facet : []),
  ];
  const subjects = subjectValues.join(" ").toLowerCase();
  const text = `${title} ${subjects}`;
  const hasExplicitMiddleGradesEvidence = /\b(middle grade|juvenile fiction|juvenile literature|children'?s fiction|children fiction|children'?s literature|children'?s stories|preteens?|pre-teens?|school stories?|schools? fiction|students? fiction|classmates? fiction|humorous stories|mystery and detective stories|adventure stories|fantasy fiction, juvenile|science fiction, juvenile)\b/.test(text);
  const queryIsAgeAnchored = /\b(middle grade|children|children'?s|chapter book|school story|school mystery|magic school)\b/i.test(query);
  const genreShapePattern = /\b(fantasy|magic|adventure|mystery|detective|school|students?|humor|humorous|funny|science fiction|sci-fi|space|survival|juvenile)\b/i;
  const hasSubjectGenreShape = genreShapePattern.test(subjects);
  const hasQueryGenreShape = genreShapePattern.test(query);
  const hasTitleGenreShape = genreShapePattern.test(title);
  const hasGenreShape = hasSubjectGenreShape || hasQueryGenreShape || hasTitleGenreShape;
  const isBroadFunnyBooksQuery = /\b(children'?s funny books|funny children'?s books)\b/i.test(query);
  const hasAdultLeakageShape = /\b(short stories|literary fiction|classic literature|adult fiction|booker prize|pulitzer|nobel|erotica|erotic|sex(?:ual|uality)?|sex education|puberty|dating|pregnancy|contraception|dark romance|new adult|young adult|ya fiction|adult humor)\b/.test(text);
  const keep = !hasAdultLeakageShape && (
    hasExplicitMiddleGradesEvidence
    || (!isBroadFunnyBooksQuery && queryIsAgeAnchored && hasGenreShape)
  );
  return {
    query,
    title: String(doc?.title || "").trim(),
    firstPublishYear: typeof doc?.first_publish_year === "number" ? doc.first_publish_year : undefined,
    keep,
    reason: keep ? "accepted" : "middle_grades_age_shape_mismatch",
    evidence: {
      hasExplicitMiddleGradesEvidence,
      queryIsAgeAnchored,
      hasSubjectGenreShape,
      hasQueryGenreShape,
      hasTitleGenreShape,
      hasGenreShape,
      hasAdultLeakageShape,
      isBroadFunnyBooksQuery,
    },
    subjectPreview: uniqueStrings(subjectValues, 8),
  };
}

function hasMiddleGradesAgeShapeEvidence(doc: any, query: string, profile: TasteProfile): boolean {
  const diagnostic = middleGradesAgeShapeDiagnostic(doc, query, profile);
  if (!diagnostic) return true;
  return diagnostic.keep;
}

function isTooYoungTeenOpenLibraryDoc(doc: any, profile: TasteProfile): boolean {
  if (profile.ageBand !== "teens") return false;
  if (hasStrongTeenFictionMetadataEvidence(doc)) return false;
  const text = openLibraryDocText(doc).toLowerCase();
  return /\b(rainbow magic|sophie the sapphire fairy|cinderella'?s magic adventure|rainbow fairies|jewel fairies|fairy books?|easy readers?|beginner books?)\b/.test(text);
}

function hasKidsAgeShapeEvidence(doc: any, query: string, profile: TasteProfile): boolean {
  if (profile.ageBand !== "kids") return true;
  const text = openLibraryDocText(doc).toLowerCase();
  const queryText = String(query || "").toLowerCase();
  const hasKidsEvidence = /\b(picture books?|juvenile fiction|juvenile literature|children'?s stories|children'?s books?|easy readers?|early readers?|beginning readers?|beginner books?|read-aloud|read aloud|ages?\s*(?:4|5|6|7|8)|grades?\s*(?:k|1|2)|kindergarten|preschool)\b/.test(text);
  const queryIsKidsAnchored = /\b(picture books?|early reader|easy reader|beginning reader|children)\b/.test(queryText);
  const hasKidFriendlyShape = /\b(friendship|friends?|feelings?|kindness|calm|gentle|cozy|growing up|family|school|animals?|adventure|humou?r|funny|bedtime|empathy|science|curiosity|curious|robots?|space|imagination|creative|creativity|fantasy|magic|learning|songs?|music|drawing|art|fairy tale|clever)\b/.test(text);
  const adultOrReferenceShape = /\b(adult|history of|politics|sociology|psychology|nineteen eighty-four|animal farm|dystopian|signed|cloth|archive|archives|literary criticism|reference|bibliograph|manual|handbook|university|college)\b/.test(text);
  const titleText = String(doc?.title || "").trim().toLowerCase();
  const genericNoAgeTitle = /^(?:the )?(?:friends|lantern archive|the lantern archive)$/i.test(titleText);
  const firstPublishYear = Number(doc?.first_publish_year || doc?.firstPublishYear || 0);
  const oldGenericAdventureTitle = firstPublishYear > 0 && firstPublishYear < 1980 && /\b(treasure|voyage|cove|ship|sail|island|adventure)\b/.test(titleText);
  if (!hasKidsEvidence && (genericNoAgeTitle || oldGenericAdventureTitle)) return false;
  if (hasKidsEvidence && !/\b(nineteen eighty-four|animal farm|adult)\b/.test(text)) return true;
  if (queryIsKidsAnchored && hasKidFriendlyShape && !adultOrReferenceShape) return true;
  return false;
}

function shouldKeepOpenLibraryDoc(doc: any, query: string, profile: TasteProfile): { keep: boolean; reason?: string } {
  if (!isEnglishOpenLibraryDoc(doc)) return { keep: false, reason: "non_english" };
  if (!Array.isArray(doc?.author_name) || doc.author_name.length === 0) return { keep: false, reason: "missing_author" };
  if (isRelevanceDriftOpenLibraryDoc(doc, query)) return { keep: false, reason: "relevance_drift" };
  if (isOpenLibraryArtifactDoc(doc, query)) return { keep: false, reason: "artifact_title" };
  if (isLiteraryAnalysisArtifactDoc(doc, query)) return { keep: false, reason: "literary_analysis_artifact" };
  if (isKeywordStuffedMarketingArtifactDoc(doc)) return { keep: false, reason: "keyword_stuffed_marketing_artifact" };
  if (isMediaStudyArtifactDoc(doc)) return { keep: false, reason: "media_study_artifact" };
  if (isAdultProfileArtifactDoc(doc, profile)) return { keep: false, reason: "adult_profile_artifact" };
  if (isProgrammingGuideArtifactDoc(doc)) return { keep: false, reason: "programming_guide_artifact" };
  if (isSurvivalGuideArtifactDoc(doc)) return { keep: false, reason: "survival_guide_artifact" };
  if (isAdultDarkRomanceArtifactDoc(doc, profile)) return { keep: false, reason: "adult_dark_romance_artifact" };
  if (isLiteralTitleMatchArtifactDoc(doc, query)) return { keep: false, reason: "literal_title_match_artifact" };
  if (isAuthorNameTitleDriftDoc(doc)) return { keep: false, reason: "author_name_title_drift" };
  if (isWeakTeenFitOddTitleDoc(doc, profile)) return { keep: false, reason: "weak_odd_title_teen_fit" };
  if (isTeenInappropriateOpenLibraryDoc(doc, profile)) return { keep: false, reason: "teen_inappropriate_content" };
  if (isTooYoungTeenOpenLibraryDoc(doc, profile)) return { keep: false, reason: "too_young_for_teen_artifact" };
  if (isTeenBroadQueryClassicDriftDoc(doc, query, profile)) return { keep: false, reason: "teen_broad_query_classic_drift" };
  if (isTeenClassicOrAdultDriftDoc(doc, profile)) return { keep: false, reason: "teen_classic_or_adult_drift" };
  if (isOmnibusBundleDriftOpenLibraryDoc(doc, query, profile)) return { keep: false, reason: "adult_literary_content" };
  if (!isTeenCompatibleOpenLibraryDoc(doc, profile)) return { keep: false, reason: "not_teen_compatible_publication_year" };
  if (!hasMiddleGradesAgeShapeEvidence(doc, query, profile)) return { keep: false, reason: "middle_grades_age_shape_mismatch" };
  if (!hasKidsAgeShapeEvidence(doc, query, profile)) return { keep: false, reason: "k2_age_shape_mismatch" };
  return { keep: true };
}

export const openLibrarySourceAdapter: SourceAdapterV2 = {
  source: "openLibrary",
  async search(plan: SourcePlan, context: { profile: TasteProfile; signal?: AbortSignal }): Promise<SourceResult> {
    const startedAt = nowIso();
    if (!plan.enabled) {
      return {
        source: "openLibrary",
        status: "skipped",
        rawItems: [],
        diagnostics: emptyDiagnostics(plan, "skipped", startedAt, {
          skippedReason: plan.skippedReason || "source_disabled",
          attempted: false,
        }),
      };
    }

    const ageProfile = openLibraryProfileForAgeBand(context.profile.ageBand);
    const artifactReasonLabels = openLibraryArtifactReasonLabels(ageProfile);
    const middleGradesDeepDebugActivationSourceRaw = String(context.profile.diagnostics?.middleGradesDeepDebugActivationSource || "");
    const debugMiddleGradesDeepTrace = ageProfile.key === "middleGrades" && Boolean(
      context.profile.diagnostics?.debugMiddleGradesNoTimeouts
      || context.profile.diagnostics?.debugMiddleGradesDeepTrace
      || context.profile.diagnostics?.middleGradesDeepDebugActive
      || context.profile.diagnostics?.middleGradesDeepDebugExpected
      || context.profile.diagnostics?.sessionReportHeader === "MIDDLE GRADES DEEP DEBUG: ACTIVE"
      || (middleGradesDeepDebugActivationSourceRaw && middleGradesDeepDebugActivationSourceRaw !== "none"),
    );
    const middleGradesDeepDebugActivationSource = debugMiddleGradesDeepTrace
      ? middleGradesDeepDebugActivationSourceRaw && middleGradesDeepDebugActivationSourceRaw !== "none" ? middleGradesDeepDebugActivationSourceRaw : "profile"
      : "none";
    const sourceBudgetMs = ageProfile.key === "middleGrades"
      ? debugMiddleGradesDeepTrace
        ? Math.max(plan.timeoutMs, MIDDLE_GRADES_OPEN_LIBRARY_DEBUG_TOTAL_BUDGET_MS)
        : Math.max(plan.timeoutMs, MIDDLE_GRADES_OPEN_LIBRARY_TOTAL_BUDGET_MS)
      : plan.timeoutMs;
    const middleGradesActualNetworkTimeoutMs = (remainingBudgetMs?: number): number => {
      const budgetMs = Number.isFinite(Number(remainingBudgetMs))
        ? Number(remainingBudgetMs)
        : sourceBudgetMs - (Date.now() - Date.parse(startedAt));
      return Math.min(MIDDLE_GRADES_OPEN_LIBRARY_PROXY_CLIENT_TIMEOUT_MS, Math.max(1, Math.floor(budgetMs)));
    };
    const forceMiddleGradesCleanCandidateShortfallExpansion = ageProfile.key === "middleGrades" && Boolean((context.profile.diagnostics as Record<string, unknown>)?.forceMiddleGradesCleanCandidateShortfallExpansion);
    const forceKidsCleanCandidateShortfallExpansion = ageProfile.key === "k2" && Boolean((context.profile.diagnostics as Record<string, unknown>)?.forceKidsCleanCandidateShortfallExpansion);
    const cleanCandidateShortfallExpansionActive = forceMiddleGradesCleanCandidateShortfallExpansion || forceKidsCleanCandidateShortfallExpansion;
    const baseQueryPlans = buildOpenLibraryQueryPlans(plan, context.profile, ageProfile);
    const cleanExpansionQueryPlan = forceMiddleGradesCleanCandidateShortfallExpansion
      ? middleGradesMeaningfulTasteRecoveryQueryPlans(context.profile, new Set<string>(), {})
      : undefined;
    const cleanExpansionQueries = cleanExpansionQueryPlan?.queries || [];
    const queryPlans = forceMiddleGradesCleanCandidateShortfallExpansion
      ? cleanExpansionQueries.map((query, index): OpenLibraryQueryPlan => ({
        query,
        originalPlannedQuery: baseQueryPlans[0]?.originalPlannedQuery || baseQueryPlans[0]?.query || query,
        queryCascadeIndex: index,
        queryFamily: queryFamilyForOpenLibraryQuery(query),
        facets: baseQueryPlans[0]?.facets || [],
        routingReason: "middle_grades_clean_candidate_shortfall_expansion",
        routingDominance: baseQueryPlans[0]?.routingDominance,
        fallbackAlignment: "route_aligned",
        profileSpecific: true,
      }))
      : baseQueryPlans;
    const queries = queryPlans.map((queryPlan) => queryPlan.query);
    const middleGradesProfileSpecificQuerySet = new Set(queryPlans.filter((queryPlan) => queryPlan.profileSpecific).map((queryPlan) => queryPlan.query.toLowerCase()));
    const middleGradesTargetedPlanForRun = ageProfile.key === "middleGrades" ? middleGradesTargetedQueryPlan(context.profile) : undefined;
    const middleGradesTargetedQueriesForRun = middleGradesTargetedPlanForRun?.queries || [];
    const middleGradesTargetedQuerySet = new Set(middleGradesTargetedQueriesForRun.map((query) => query.toLowerCase()));
    const middleGradesFirstBatchSkipOnlyFamilyBlocked = ageProfile.key === "middleGrades"
      ? Boolean((middleGradesTargetedPlanForRun?.likedEvidenceQueryFamilies.length || 0) > 0 && !middleGradesTargetedPlanForRun?.skipOnlyFamilyPromotedToFirstBatch)
      : undefined;
    const middleGradesSkippedFantasyPromotedToFirstBatch = ageProfile.key === "middleGrades"
      ? Boolean(middleGradesTargetedPlanForRun?.skipOnlyFamilyPromotedToFirstBatch && /^fantasy/i.test(String(middleGradesTargetedPlanForRun?.firstBatchChosenBecause || "")))
      : undefined;
    const middleGradesLikedEvidenceFirstBatchFamilies = ageProfile.key === "middleGrades"
      ? middleGradesTargetedPlanForRun?.likedEvidenceQueryFamilies || []
      : [];
    const middleGradesDebugTrace: MiddleGradesDeepTrace | undefined = debugMiddleGradesDeepTrace ? {
      plannedQueries: queryPlans.map((queryPlan) => {
        const family = middleGradesTargetedPlanForRun?.familyByQuery?.[queryPlan.query] || queryPlan.queryFamily;
        const queryLower = queryPlan.query.toLowerCase();
        const firstBatch = middleGradesTargetedQueriesForRun.slice(0, 5).some((query) => query.toLowerCase() === queryLower);
        const reliableVariant = (middleGradesTargetedPlanForRun?.reliableVariantQueries || []).some((query) => query.toLowerCase() === queryLower);
        return {
          query: queryPlan.query,
          family,
          routeReason: queryPlan.routingReason,
          queryCascadeIndex: queryPlan.queryCascadeIndex,
          priorityScore: middleGradesTargetedPlanForRun?.scoreByFamily?.[family],
          likedEvidence: middleGradesTargetedPlanForRun?.likedEvidenceByFamily?.[family] || [],
          skipEvidence: middleGradesTargetedPlanForRun?.skipEvidenceByFamily?.[family] || [],
          avoidEvidence: middleGradesTargetedPlanForRun?.avoidEvidenceByFamily?.[family] || [],
          stage: firstBatch ? "first_batch" : reliableVariant ? "same_family_reliable_variant" : queryPlan.emergencyFallback ? "fallback" : queryPlan.profileSpecific ? "profile_specific" : "planned_route_specific",
        };
      }),
      fetchTrace: [],
      rawDocTrace: [],
      normalizedCandidateTrace: [],
      selectionTrace: [],
    } : undefined;
    const openLibraryQueryRouting = {
      reason: queryPlans[0]?.routingReason || "unknown",
      ageProfile: ageProfile.key,
      profileLabel: ageProfile.behaviorLabel,
      lockedBaseline: ageProfile.lockedBaseline,
      dominance: queryPlans[0]?.routingDominance || {},
      broadFallbackQueries: queries.filter(isTeenBroadFallbackOpenLibraryQuery),
      specificQueries: queries.filter((query) => !isTeenBroadFallbackOpenLibraryQuery(query)),
      originalPlannedQuery: queryPlans[0]?.originalPlannedQuery || "",
    };
    if (!queryPlans.length) {
      return {
        source: "openLibrary",
        status: "skipped",
        rawItems: [],
        diagnostics: emptyDiagnostics(plan, "skipped", startedAt, {
          skippedReason: "no_search_intents",
          attempted: false,
          openLibraryAgeProfile: ageProfile.key,
          openLibraryProfileLabel: ageProfile.behaviorLabel,
        }),
      };
    }

    const rawItems: unknown[] = [];
    const middleGradesExpandedScoringPool: unknown[] = [];
    const middleGradesExpandedScoringKeys = new Set<string>();
    const rawTitles: string[] = [];
    const dropReasons: Record<string, number> = {};
    const expansionDroppedBeforeScoringByReason: Record<string, number> = {};
    const expansionDroppedBeforeScoringTitles: Record<string, string[]> = {};
    const fetches: SourceFetchDiagnosticV2[] = [];
    const acceptedSeriesKeys = new Set<string>();
    const acceptedCollectionRootKeys = new Set<string>();
    const acceptedDocKeys = new Set<string>();
    const artifactSuppressedTitles: string[] = [];
    const seriesSuppressedTitles: string[] = [];
    const sameRootCollectionCollapsedTitles: string[] = [];
    const duplicateRootBlockedReturnedTitle: string[] = [];
    let rawApiResultCount = 0;
    let failedReason = "";
    let openLibraryTopUpRan = false;
    let firstRunFetchTimeout = false;
    let retryAttempted = false;
    let retrySucceeded = false;
    let proxyColdStartSuspected = false;
    let adultPrimaryQueryTimedOutTwice = false;
    let middleGradesDelayedRetryAttempted = false;
    let middleGradesDelayedRetrySkippedReason = "";
    let middleGradesDelayedRetryTimeoutMs: number | undefined;
    let middleGradesTimeoutBudgetRemainingBeforeRetry: number | undefined;
    let middleGradesAntiZeroFallbackShapedQuery: string | undefined;
    let middleGradesAntiZeroFallbackShapingSignals: string[] | undefined;
    let middleGradesFallbackCandidateQueries: string[] | undefined;
    let middleGradesFallbackQueryScores: Record<string, number> | undefined;
    let middleGradesFallbackQueryReliability: Record<string, number> | undefined;
    let middleGradesPositiveEvidenceByFallbackQuery: Record<string, string[]> | undefined;
    let middleGradesAvoidEvidenceByFallbackQuery: Record<string, string[]> | undefined;
    let middleGradesSelectedFallbackQueryReason: string | undefined;
    let middleGradesWhyHigherTasteFallbackLost: string | undefined;
    const middleGradesFallbackAttemptOrder: string[] = [];
    const middleGradesRemainingBudgetBeforeEachFallback: Record<string, number> = {};
    const middleGradesFallbackOutcomes: string[] = [];
    let middleGradesFallbackSlateSpecificityScore: number | undefined;
    let middleGradesStrongerSignalDroppedFromFallbackQuery: string | undefined;
    let middleGradesWhyFallbackOnlyAcceptedAsFinal: string | undefined;
    let middleGradesRouteAlignedRecoveryAttemptedAfterFallback = false;
    let middleGradesRouteAlignedRecoverySkippedReason: string | undefined;
    let middleGradesUnderfillSafeRecoveryAttempted = false;
    const middleGradesUnderfillSafeRecoveryQueriesAttempted: string[] = [];
    let middleGradesUnderfillSafeRecoveryAcceptedCount = 0;
    let middleGradesUnderfillSafeRecoverySkippedReason: string | undefined;
    let middleGradesUnderfilledAtFourDespiteAlignedCandidates = false;
    let middleGradesUnderfillRecoveryAttemptedAfterFour = false;
    let middleGradesUnderfillRecoveryAcceptedAfterFour = 0;
    const middleGradesProfileSpecificQueriesAttempted: string[] = [];
    let middleGradesProfileSpecificQueriesTimedOut = 0;
    let middleGradesProfileSpecificQueriesAcceptedCount = 0;
    let middleGradesFallbackStartedOnlyAfterProfileQueriesExhausted: boolean | undefined;
    let middleGradesLockQualityRetryAttempted = false;
    const middleGradesLockQualityRetryQueries: string[] = [];
    let middleGradesLockQualityRetryAcceptedCount = 0;
    let middleGradesFinalReturnedDespiteLockQualityFailReason: string | undefined;
    let middleGradesRejectedAllRowsAsQueryOnly = false;
    let middleGradesQueryOnlyRejectionTriggeredContinuation = false;
    let middleGradesQueryOnlyFirstRejectionFetchCount: number | undefined;
    const middleGradesContinuedAfterQueryOnlyRejectionQueries: string[] = [];
    const middleGradesUnattemptedSpecificQueriesAfterQueryOnlyRejection: string[] = [];
    let middleGradesContinuedAfterQueryOnlyRejectionAcceptedCount = 0;
    let middleGradesRecoveryExhaustionReasonDetailed: string | undefined;
    const middleGradesEvidenceAwareRecoveryQueriesAttempted: string[] = [];
    let middleGradesEvidenceAwareRecoveryAttempted = false;
    let middleGradesEvidenceAwareRecoveryAcceptedCount = 0;
    const middleGradesMediumStrongEvidenceTargetCount = 5;
    let middleGradesMediumStrongEvidenceSearchContinued = false;
    const middleGradesMediumStrongEvidenceQueriesAttempted: string[] = [];
    const middleGradesMediumStrongEvidenceAcceptedTitles: string[] = [];
    let middleGradesWeakEvidenceFinalizedBecause: string | undefined;
    let middleGradesWeakEvidenceReturnedOnlyAfterEvidenceSearchExhausted = false;
    let middleGradesMeaningfulTasteRecoveryTriggered = false;
    const middleGradesMeaningfulTasteRecoveryQueriesAttempted: string[] = [];
    const middleGradesMeaningfulTasteRecoveryAcceptedTitles: string[] = [];
    const middleGradesMeaningfulTasteRecoveryRejectedTitlesByReason: Record<string, string[]> = {};
    const middleGradesRecoveryQueryAnchorByQuery: Record<string, string> = {};
    let middleGradesRecoveryHumorUsedAsAnchorBlocked = false;
    let middleGradesRecoveryConcreteFictionQueryUsed = false;
    const middleGradesRecoveryQueryFamilyRejectedForLeakageCount: Record<string, number> = {};
    let middleGradesRecoveryFamilyScores: MiddleGradesRecoveryFamilyScore[] = [];
    let middleGradesRecoveryFamiliesSkippedByAvoidEvidence: Record<string, string> = {};
    let middleGradesRecoveryFamiliesSkippedBySameRunLeakage: Record<string, string> = {};
    let middleGradesRecoveryFamilyExecutionOrderReason: Record<string, string> = {};
    const middleGradesRecoveryFamilyYieldByFamily: Record<string, number> = {};
    let middleGradesRecoveryEarlyFinalGateApplied = false;
    const middleGradesRecoveryEarlyFinalGateRejectedByReason: Record<string, string[]> = {};
    const middleGradesRecoveryAcceptedLikelyFinalSurvivorTitles: string[] = [];
    const middleGradesRecoveryAcceptedButPredictedDropTitles: string[] = [];
    let middleGradesMeaningfulTasteRecoveryFinalCount = 0;
    let middleGradesUnderfilledAfterMeaningfulTasteRecovery = false;
    let middleGradesBrittleQueryTimedOutThenShortQueryAttempted = false;
    const middleGradesPerQueryBudgetReserved: Record<string, number> = {};
    let middleGradesSkippedRemainingQueriesDueToBudgetExhaustion = false;
    const middleGradesPlannedSpecificQueriesUnattemptedAtTimeout: string[] = [];
    const middleGradesTargetedQueriesAttempted: string[] = [];
    let middleGradesTargetedQueriesAcceptedCount = 0;
    const middleGradesTargetedQueriesRejectedByReason: Record<string, number> = {};
    let middleGradesDocsReturnedButAllDropped = 0;
    const middleGradesAllDroppedContinuationQuery: string[] = [];
    const middleGradesReliableVariantAttempted: string[] = [];
    let middleGradesReliableVariantAcceptedCount = 0;
    let middleGradesFirstBatchSpecificQueryTimedOutCount = 0;
    let middleGradesFirstBatchReliableVariantUsed = false;
    const middleGradesFetchMode: "sequential" | "parallel" | "staggered" = "staggered";
    const middleGradesFirstBatchParallelQueries = middleGradesTargetedQueriesForRun.slice(0, 5);
    let middleGradesFirstBatchParallelAcceptedCount = 0;
    let middleGradesRepeatedProxyAbortCount = 0;
    let middleGradesDirectFallbackAttemptedAfterProxyAbort = false;
    let middleGradesProxyTimedOutThenDirectAttemptedSameQuery = false;
    let middleGradesDirectFetchReturnedRawButAllRejected = 0;
    let middleGradesSameFamilyContinuationAfterAllRejected = false;
    const middleGradesSameFamilyContinuationQueriesAttempted: string[] = [];
    const middleGradesSameFamilyContinuationQuerySet = new Set<string>();
    let middleGradesRawRejectedButContinuationSkippedReason: string | undefined;
    let middleGradesUnderfilledAfterDirectUsableDocs = false;
    let middleGradesDirectUsableDocsButRecoveryContinued = false;
    let middleGradesUnderfillStopReasonDetailed: string | undefined;
    let middleGradesRecoverySkippedInsufficientBudget = false;
    const middleGradesMinimumViableRecoveryBudgetMs = MIDDLE_GRADES_OPEN_LIBRARY_TIMEOUT_CASCADE_QUERY_FLOOR_MS;
    let middleGradesActualRemainingBudgetBeforeRecoveryMs: number | undefined;
    let middleGradesBroadFallbackStartedBeforeTargetedExhaustion = false;
    let middleGradesFinalUnderfillTargetedExhaustionReason: string | undefined;
    let teenTimeoutCircuitBreakerStage: string | undefined;
    let middleGradesTimeoutCircuitBreakerStage: string | undefined;
    let k2TimeoutCircuitBreakerStage: string | undefined;
    const middleGradesCandidatePoolLimit = ageProfile.key === "middleGrades" && debugMiddleGradesDeepTrace ? MIDDLE_GRADES_OPEN_LIBRARY_DEBUG_CANDIDATE_POOL_LIMIT : ageProfile.docLimit;
    let middleGradesOpenLibraryCandidatePoolBeforeEarlyCap = 0;
    let middleGradesOpenLibraryCandidatePoolAfterEarlyCap = 0;
    let middleGradesEarlyCandidateCapApplied = false;
    const middleGradesEarlyCandidateCapSuppressedTitles: string[] = [];
    const middleGradesMediumStrongRawItems = (): any[] => ageProfile.key === "middleGrades"
      ? rawItems.filter((item: any) => middleGradesSourceMediumStrongEvidence(item?.rawOpenLibraryDoc || item, String(item?.queryText || ""), String(item?.routingReason || "")))
      : [];
    const middleGradesMeaningfulTasteExpandedPoolItems = (): any[] => {
      if (ageProfile.key !== "middleGrades") return [];
      const byKey = new Map<string, any>();
      for (const item of [...middleGradesExpandedScoringPool, ...rawItems] as any[]) {
        const title = String(item?.title || "").trim();
        if (!title) continue;
        const key = String(item?.sourceId || item?.key || item?.workKey || `${title}:${Array.isArray(item?.authors) ? item.authors[0] : ""}`).toLowerCase();
        if (!byKey.has(key)) byKey.set(key, item);
      }
      return Array.from(byKey.values()).filter((item: any) => middleGradesSourceMeaningfulTasteEligibility(item?.rawOpenLibraryDoc || item, context.profile).allowed);
    };
    const middleGradesAttemptedQueries = (): Set<string> => new Set(fetches.filter((fetch) => !fetch.diagnosticOnly).map((fetch) => String(fetch.query || "").toLowerCase()).filter(Boolean));
    const teenTimeoutLikeFetch = (fetch: SourceFetchDiagnosticV2): boolean => Boolean(
      fetch.timedOut
      || /timeout|openlibrary_http_502/i.test(String(fetch.failedReason || "")),
    );
    const teenConsecutiveTimeoutLikeFetchCount = (): number => {
      if (ageProfile.key !== "teen") return 0;
      let count = 0;
      const realFetches = fetches.filter((fetch) => !fetch.diagnosticOnly);
      for (let index = realFetches.length - 1; index >= 0; index -= 1) {
        if (!teenTimeoutLikeFetch(realFetches[index])) break;
        count += 1;
      }
      return count;
    };
    const teenTimeoutCircuitOpen = (stage: string): boolean => {
      if (ageProfile.key !== "teen") return false;
      if (teenConsecutiveTimeoutLikeFetchCount() < TEEN_OPEN_LIBRARY_TIMEOUT_CIRCUIT_BREAKER_LIMIT) return false;
      if (!teenTimeoutCircuitBreakerStage) {
        teenTimeoutCircuitBreakerStage = stage;
        dropReasons.teen_timeout_circuit_breaker_open = Number(dropReasons.teen_timeout_circuit_breaker_open || 0) + 1;
      }
      return true;
    };
    const middleGradesTimeoutLikeFetch = (fetch: SourceFetchDiagnosticV2): boolean => Boolean(
      fetch.timedOut
      || /timeout|openlibrary_http_502/i.test(String(fetch.failedReason || "")),
    );
    const middleGradesConsecutiveTimeoutLikeFetchCount = (): number => {
      if (ageProfile.key !== "middleGrades") return 0;
      let count = 0;
      const realFetches = fetches.filter((fetch) => !fetch.diagnosticOnly);
      for (let index = realFetches.length - 1; index >= 0; index -= 1) {
        if (!middleGradesTimeoutLikeFetch(realFetches[index])) break;
        count += 1;
      }
      return count;
    };
    const middleGradesTimeoutCircuitOpen = (stage: string): boolean => {
      if (ageProfile.key !== "middleGrades") return false;
      if (middleGradesConsecutiveTimeoutLikeFetchCount() < MIDDLE_GRADES_OPEN_LIBRARY_TIMEOUT_CIRCUIT_BREAKER_LIMIT) return false;
      if (!middleGradesTimeoutCircuitBreakerStage) {
        middleGradesTimeoutCircuitBreakerStage = stage;
        dropReasons.middle_grades_timeout_circuit_breaker_open = Number(dropReasons.middle_grades_timeout_circuit_breaker_open || 0) + 1;
      }
      if (!middleGradesRecoveryExhaustionReasonDetailed) middleGradesRecoveryExhaustionReasonDetailed = `timeout_circuit_breaker:${stage}`;
      return true;
    };
    const k2TimeoutLikeFetch = (fetch: SourceFetchDiagnosticV2): boolean => Boolean(
      fetch.timedOut
      || /timeout|openlibrary_http_502/i.test(String(fetch.failedReason || "")),
    );
    const k2ConsecutiveTimeoutLikeFetchCount = (): number => {
      if (ageProfile.key !== "k2") return 0;
      let count = 0;
      const realFetches = fetches.filter((fetch) => !fetch.diagnosticOnly);
      for (let index = realFetches.length - 1; index >= 0; index -= 1) {
        if (!k2TimeoutLikeFetch(realFetches[index])) break;
        count += 1;
      }
      return count;
    };
    const k2TimeoutCircuitOpen = (stage: string): boolean => {
      if (ageProfile.key !== "k2") return false;
      if (k2ConsecutiveTimeoutLikeFetchCount() < K2_OPEN_LIBRARY_TIMEOUT_CIRCUIT_BREAKER_LIMIT) return false;
      if (!k2TimeoutCircuitBreakerStage) {
        k2TimeoutCircuitBreakerStage = stage;
        dropReasons.k2_timeout_circuit_breaker_open = Number(dropReasons.k2_timeout_circuit_breaker_open || 0) + 1;
      }
      return true;
    };
    const middleGradesUnattemptedSpecificQueries = (): string[] => ageProfile.key === "middleGrades" ? middleGradesQueryOnlyContinuationQueries(queryPlans, middleGradesAttemptedQueries()) : [];
    const middleGradesUnattemptedEvidenceAwareQueries = (): string[] => ageProfile.key === "middleGrades" ? middleGradesEvidenceAwareRecoveryQueries(queryPlans, context.profile, middleGradesAttemptedQueries()) : [];
    const middleGradesUnattemptedTargetedQueries = (): string[] => ageProfile.key === "middleGrades" ? middleGradesTargetedQueriesForRun.filter((query) => !middleGradesAttemptedQueries().has(query.toLowerCase())) : [];
    const middleGradesReliableVariantQuerySet = new Set((middleGradesTargetedPlanForRun?.reliableVariantQueries || []).map((query) => query.toLowerCase()));
    const middleGradesFirstBatchFamily = middleGradesTargetedPlanForRun?.firstBatchChosenBecause?.split(":")[0];
    const middleGradesUnattemptedReliableVariantQueries = (): string[] => ageProfile.key === "middleGrades" ? (middleGradesTargetedPlanForRun?.reliableVariantQueries || []).filter((query) => !middleGradesAttemptedQueries().has(query.toLowerCase())) : [];
    const middleGradesPlannedSpecificQueries = (): string[] => ageProfile.key === "middleGrades" ? uniqueStrings([
      ...queryPlans.filter((plan) => plan.profileSpecific).map((plan) => plan.query),
      ...middleGradesTargetedQueriesForRun,
      ...queryPlans.map((plan) => plan.query),
    ], 24) : [];
    const middleGradesUnattemptedPlannedSpecificQueries = (): string[] => {
      const attempted = middleGradesAttemptedQueries();
      return middleGradesPlannedSpecificQueries().filter((query) => !attempted.has(query.toLowerCase()));
    };
    const rememberMiddleGradesUnattemptedAtTimeout = (): void => {
      if (ageProfile.key !== "middleGrades") return;
      for (const query of middleGradesUnattemptedPlannedSpecificQueries()) {
        if (!middleGradesPlannedSpecificQueriesUnattemptedAtTimeout.includes(query)) middleGradesPlannedSpecificQueriesUnattemptedAtTimeout.push(query);
      }
    };
    const shouldAcceptMiddleGradesSourceDoc = (doc: any, query: string, queryPlan: OpenLibraryQueryPlan, stage: string): boolean => {
      if (ageProfile.key !== "middleGrades") return true;
      if (queryPlan.emergencyFallback || queryPlan.fallbackAlignment === "anti_zero") return true;
      const evidenceFields = middleGradesSourceDocumentRouteEvidenceFields(doc, query, String(queryPlan.routingReason || ""));
      if (evidenceFields.length > 0) return true;
      const title = String(doc?.title || "").trim();
      if (title) artifactSuppressedTitles.push(title);
      middleGradesRejectedAllRowsAsQueryOnly = true;
      if (middleGradesQueryOnlyFirstRejectionFetchCount === undefined) middleGradesQueryOnlyFirstRejectionFetchCount = fetches.filter((fetch) => !fetch.diagnosticOnly).length;
      dropReasons.middle_grades_query_only_source_rejected = Number(dropReasons.middle_grades_query_only_source_rejected || 0) + 1;
      dropReasons[`middle_grades_${stage}_query_only_source_rejected`] = Number(dropReasons[`middle_grades_${stage}_query_only_source_rejected`] || 0) + 1;
      return false;
    };
    const rememberRecoveryEarlyFinalGateRejection = (reason: string, title: string): void => {
      middleGradesRecoveryEarlyFinalGateApplied = true;
      if (title) {
        middleGradesRecoveryEarlyFinalGateRejectedByReason[reason] = uniqueStrings([...(middleGradesRecoveryEarlyFinalGateRejectedByReason[reason] || []), title], 20);
        middleGradesRecoveryAcceptedButPredictedDropTitles.push(title);
      }
      dropReasons[`middle_grades_meaningful_taste_recovery_early_${reason}`] = Number(dropReasons[`middle_grades_meaningful_taste_recovery_early_${reason}`] || 0) + 1;
    };
    const middleGradesRecoveryLikelyFinalRejectionReason = (doc: any, query: string, queryPlan: OpenLibraryQueryPlan, meaningfulTasteSignals: string[]): string | undefined => {
      const title = String(doc?.title || "").trim();
      const titleText = title.toLowerCase();
      const docText = openLibraryDocText(doc);
      const routeFields = middleGradesSourceDocumentRouteEvidenceFields(doc, query, String(queryPlan.routingReason || ""));
      const fictionAgeEvidence = /\b(juvenile fiction|children'?s fiction|middle grade|school stories|friendship|family|adventure stories|fantasy fiction)\b/i.test(docText);
      const nonHumorEvidence = /\b(adventure|friendship|friends?|family|school|team|quest|magic|magical|fantasy|dragon|science|robot|ocean|survival)\b/i.test(docText);
      if (/\b(funny|humor|humour|comedy|comic|joke|laugh|giggle)\b/i.test(titleText) && !fictionAgeEvidence && !nonHumorEvidence) return "humor_keyword_only_leakage";
      if (routeFields.length === 0) return "recovery_query_quality_query_only_cap";
      if (routeFields.every((field) => field === "title" || field === "subtitle") && meaningfulTasteSignals.length <= 1 && /\b(funny|humor|humour|comedy|comic|joke|laugh|giggle)\b/i.test(titleText)) return "humor_keyword_only_leakage";
      if (routeFields.every((field) => field === "title" || field === "subtitle") && meaningfulTasteSignals.every((signal) => signal === "adventure")) return "broad_adventure_only_taste_match";
      return undefined;
    };

    const reserveCollectionRoot = (doc: any, title: string, stage: string): boolean => {
      if (ageProfile.key !== "middleGrades") return true;
      const rootKey = openLibraryCollectionRootKey(doc);
      if (!rootKey) return true;
      if (acceptedCollectionRootKeys.has(rootKey)) {
        dropReasons[`middle_grades_${stage}_same_root_collection_duplicate`] = Number(dropReasons[`middle_grades_${stage}_same_root_collection_duplicate`] || 0) + 1;
        sameRootCollectionCollapsedTitles.push(title);
        duplicateRootBlockedReturnedTitle.push(title);
        return false;
      }
      acceptedCollectionRootKeys.add(rootKey);
      return true;
    };
    const rememberMiddleGradesAntiZeroFallbackShape = (fallback?: ReturnType<typeof middleGradesSignalShapedAntiZeroFallback>): void => {
      if (!fallback) return;
      middleGradesAntiZeroFallbackShapedQuery = fallback.query;
      middleGradesAntiZeroFallbackShapingSignals = fallback.shapingSignals;
      middleGradesFallbackCandidateQueries = fallback.candidateQueries;
      middleGradesFallbackQueryScores = fallback.queryScores;
      middleGradesFallbackQueryReliability = fallback.reliabilityByQuery;
      middleGradesPositiveEvidenceByFallbackQuery = fallback.positiveEvidenceByQuery;
      middleGradesAvoidEvidenceByFallbackQuery = fallback.avoidEvidenceByQuery;
      middleGradesSelectedFallbackQueryReason = fallback.selectedReason;
      middleGradesWhyHigherTasteFallbackLost = fallback.whyHigherTasteFallbackLost;
      middleGradesFallbackSlateSpecificityScore = fallback.specificityScore;
      middleGradesStrongerSignalDroppedFromFallbackQuery = fallback.strongerSignalDroppedFromFallbackQuery;
    };
    const markMiddleGradesFallbackStarted = (): void => {
      if (middleGradesFallbackStartedOnlyAfterProfileQueriesExhausted !== undefined) return;
      const requiredProfileAttempts = Math.min(3, middleGradesProfileSpecificQuerySet.size || 3);
      middleGradesFallbackStartedOnlyAfterProfileQueriesExhausted = middleGradesProfileSpecificQueriesAttempted.length >= requiredProfileAttempts;
    };
    const middleGradesAgeShapeSamples: MiddleGradesAgeShapeDiagnosticSample[] = [];
    let middleGradesAgeShapeObserved = 0;
    let middleGradesAgeShapeAccepted = 0;
    let middleGradesAgeShapeRejected = 0;
    const recordMiddleGradesAgeShapeDiagnostic = (doc: any, query: string, stage: string): void => {
      const diagnostic = middleGradesAgeShapeDiagnostic(doc, query, context.profile);
      if (!diagnostic) return;
      middleGradesAgeShapeObserved += 1;
      if (diagnostic.keep) middleGradesAgeShapeAccepted += 1;
      else middleGradesAgeShapeRejected += 1;
      if (middleGradesAgeShapeSamples.length < 12) {
        middleGradesAgeShapeSamples.push({ stage, ...diagnostic });
      }
    };
    const middleGradesAgeShapeDiagnostics = (): Record<string, unknown> | undefined => {
      if (middleGradesAgeShapeObserved === 0) return undefined;
      return {
        observed: middleGradesAgeShapeObserved,
        accepted: middleGradesAgeShapeAccepted,
        rejected: middleGradesAgeShapeRejected,
        mismatch: middleGradesAgeShapeRejected,
        samples: middleGradesAgeShapeSamples,
      };
    };
    const traceMiddleGradesFetch = (diagnostic: SourceFetchDiagnosticV2, stoppedReason?: string): void => {
      if (!middleGradesDebugTrace) return;
      middleGradesDebugTrace.fetchTrace.push({
        query: diagnostic.query,
        fetchPath: diagnostic.fetchPath,
        elapsedMs: diagnostic.elapsedMs,
        rawDocCount: diagnostic.docsReturned || 0,
        firstReturnedTitles: diagnostic.firstReturnedTitles || [],
        timedOut: diagnostic.timedOut,
        abortReason: diagnostic.abortReason,
        abortOrigin: diagnostic.abortOrigin,
        failedReason: diagnostic.failedReason,
        stoppedReason: stoppedReason || (diagnostic.timedOut ? "timeout_or_abort" : diagnostic.failedReason ? "failed" : "completed"),
        sourceBudgetRemainingAtFetchStartMs: diagnostic.sourceBudgetRemainingAtFetchStartMs,
        timeoutBudgetRemainingAtFetchStartMs: diagnostic.timeoutBudgetRemainingAtFetchStartMs,
      });
    };
    const traceMiddleGradesRawDoc = (doc: any, query: string, queryPlan: OpenLibraryQueryPlan, stage: string, accepted: boolean, reason: string): void => {
      if (!middleGradesDebugTrace) return;
      const title = String(doc?.title || "").trim();
      const routeEvidence = middleGradesSourceDocumentRouteEvidenceFields(doc, query, String(queryPlan.routingReason || ""));
      const text = openLibraryDocText(doc);
      middleGradesDebugTrace.rawDocTrace.push({
        stage,
        query,
        title,
        accepted,
        rejectionReason: accepted ? undefined : reason,
        ageShapeEvidence: middleGradesAgeShapeDiagnostic(doc, query, context.profile)?.evidence,
        routeEvidence,
        queryOnly: routeEvidence.length === 0,
        titleOnly: routeEvidence.length > 0 && routeEvidence.every((field) => field === "title" || field === "subtitle"),
        subjectEvidence: /\b(friendship|family|school|adventure|mystery|fantasy|humor|humorous|children|juvenile|middle grade)\b/i.test(Array.isArray(doc?.subject) ? doc.subject.join(" ") : ""),
        descriptionEvidence: /\b(friendship|family|school|adventure|mystery|fantasy|humor|humorous|children|juvenile|middle grade)\b/i.test(String(doc?.description || "")),
        artifactLocalHistoryReferenceRejection: /artifact|local_history|reference|study|guide|activity|workbook|nonfiction|adult_literary/i.test(reason),
        sameRootCollectionRoot: openLibraryCollectionRootKey(doc) || undefined,
        textPreview: text.slice(0, 180),
      });
    };
    const rememberMiddleGradesExpandedScoringCandidate = (doc: any, queryPlan: OpenLibraryQueryPlan, stage: string, meaningfulTasteSignals: string[] = []): void => {
      if (ageProfile.key !== "middleGrades" || !debugMiddleGradesDeepTrace) return;
      const title = String(doc?.title || "").trim();
      if (!title) return;
      const key = String(doc?.key || doc?.cover_edition_key || (Array.isArray(doc?.edition_key) ? doc.edition_key[0] : "") || `${title}:${Array.isArray(doc?.author_name) ? doc.author_name[0] : ""}`).toLowerCase();
      if (middleGradesExpandedScoringKeys.has(key)) return;
      middleGradesExpandedScoringKeys.add(key);
      const normalized = normalizeOpenLibraryDoc(doc, queryPlan);
      (normalized as any).scoringHandoffStage = stage;
      (normalized as any).scoringHandoffSource = "expanded_debug_pool";
      if (stage === "meaningful_taste_recovery") (normalized as any).meaningfulTasteRecovery = true;
      if (meaningfulTasteSignals.length) {
        (normalized as any).meaningfulTasteRecoveryDocumentSignals = meaningfulTasteSignals;
        (normalized as any).themes = uniqueStrings([...(Array.isArray((normalized as any).themes) ? (normalized as any).themes : []), ...meaningfulTasteSignals], 24);
      }
      middleGradesExpandedScoringPool.push(normalized);
    };

    const traceMiddleGradesNormalizedCandidate = (item: any, sourceDoc: any, queryPlan: OpenLibraryQueryPlan): void => {
      if (!middleGradesDebugTrace) return;
      middleGradesDebugTrace.normalizedCandidateTrace.push({
        title: item?.title,
        normalizedTitleRoot: openLibraryCollectionRootKey(sourceDoc) || openLibrarySeriesKey(sourceDoc) || String(item?.title || "").toLowerCase(),
        sourceQuery: queryPlan.query,
        routeReason: queryPlan.routingReason,
        routeAlignmentScore: middleGradesSourceDocumentRouteEvidenceFields(sourceDoc, queryPlan.query, String(queryPlan.routingReason || "")).length,
        documentEvidenceTier: middleGradesSourceDocumentRouteEvidenceFields(sourceDoc, queryPlan.query, String(queryPlan.routingReason || "")).length >= 2 ? "strong_or_medium" : "weak_or_query_only",
        genreFacetMatch: queryPlan.facets,
        tasteMatch: queryPlan.profileSpecific || middleGradesTargetedQuerySet.has(queryPlan.query.toLowerCase()),
        avoidPenalty: false,
        finalScoreComponents: { queryFamily: queryPlan.queryFamily, emergencyFallback: Boolean(queryPlan.emergencyFallback), fallbackAlignment: queryPlan.fallbackAlignment },
      });
    };
    const recordExpansionDroppedBeforeScoring = (reason: string, title: string): void => {
      if (!forceMiddleGradesCleanCandidateShortfallExpansion) return;
      const normalizedReason = reason || "unknown_pre_scoring_drop";
      expansionDroppedBeforeScoringByReason[normalizedReason] = Number(expansionDroppedBeforeScoringByReason[normalizedReason] || 0) + 1;
      if (!title) return;
      const titles = expansionDroppedBeforeScoringTitles[normalizedReason] || [];
      if (!titles.includes(title) && titles.length < 50) titles.push(title);
      expansionDroppedBeforeScoringTitles[normalizedReason] = titles;
    };
    const acceptMiddleGradesDoc = (doc: any, queryPlan: OpenLibraryQueryPlan, stage: string, requireMeaningfulTaste = false): boolean => {
      const cleanExpansionStage = forceMiddleGradesCleanCandidateShortfallExpansion && ageProfile.key === "middleGrades";
      const query = queryPlan.query;
      const title = String(doc?.title || "").trim();
      if (title) rawTitles.push(title);
      if (!title) {
        dropReasons[`${stage}_missing_title`] = Number(dropReasons[`${stage}_missing_title`] || 0) + 1;
        recordExpansionDroppedBeforeScoring(`${stage}_missing_title`, title);
        traceMiddleGradesRawDoc(doc, query, queryPlan, stage, false, "missing_title");
        return false;
      }
      recordMiddleGradesAgeShapeDiagnostic(doc, query, stage);
      const quality = shouldKeepOpenLibraryDoc(doc, query, context.profile);
      if (!quality.keep) {
        const reason = quality.reason || "quality_filter";
        dropReasons[reason] = Number(dropReasons[reason] || 0) + 1;
        if (middleGradesTargetedQuerySet.has(query.toLowerCase())) middleGradesTargetedQueriesRejectedByReason[reason] = Number(middleGradesTargetedQueriesRejectedByReason[reason] || 0) + 1;
        if (artifactReasonLabels.has(reason) || /artifact|inappropriate|middle_grades_age_shape/.test(reason)) artifactSuppressedTitles.push(title);
        recordExpansionDroppedBeforeScoring(reason, title);
        traceMiddleGradesRawDoc(doc, query, queryPlan, stage, false, reason);
        return false;
      }
      let meaningfulTasteSignals: string[] = [];
      if (requireMeaningfulTaste) {
        const tasteEligibility = middleGradesSourceMeaningfulTasteEligibility(doc, context.profile);
        if (!tasteEligibility.allowed && !cleanExpansionStage) {
          const reason = tasteEligibility.reason || "zero_doc_backed_taste_match";
          dropReasons[`middle_grades_${stage}_${reason}`] = Number(dropReasons[`middle_grades_${stage}_${reason}`] || 0) + 1;
          if (stage === "meaningful_taste_recovery") rememberRecoveryEarlyFinalGateRejection(reason, title);
          recordExpansionDroppedBeforeScoring(reason, title);
          traceMiddleGradesRawDoc(doc, query, queryPlan, stage, false, reason);
          return false;
        }
        meaningfulTasteSignals = tasteEligibility.allowed ? tasteEligibility.signals : [];
      }
      if (stage !== "meaningful_taste_recovery") rememberMiddleGradesExpandedScoringCandidate(doc, queryPlan, stage, meaningfulTasteSignals);
      const docKey = String(doc?.key || doc?.cover_edition_key || doc?.edition_key?.[0] || `${title}:${Array.isArray(doc?.author_name) ? doc.author_name[0] : ""}`).toLowerCase();
      if (acceptedDocKeys.has(docKey)) {
        dropReasons.duplicate_doc = Number(dropReasons.duplicate_doc || 0) + 1;
        if (stage === "meaningful_taste_recovery") rememberRecoveryEarlyFinalGateRejection("duplicate_doc", title);
        recordExpansionDroppedBeforeScoring("duplicate_doc", title);
        traceMiddleGradesRawDoc(doc, query, queryPlan, stage, false, "duplicate_doc");
        return false;
      }
      const seriesKey = openLibrarySeriesKey(doc);
      if (!cleanExpansionStage && seriesKey && acceptedSeriesKeys.has(seriesKey)) {
        dropReasons.series_duplicate = Number(dropReasons.series_duplicate || 0) + 1;
        seriesSuppressedTitles.push(title);
        if (stage === "meaningful_taste_recovery") rememberRecoveryEarlyFinalGateRejection("duplicate_root_or_series", title);
        traceMiddleGradesRawDoc(doc, query, queryPlan, stage, false, "series_duplicate");
        return false;
      }
      if (!cleanExpansionStage && !shouldAcceptMiddleGradesSourceDoc(doc, query, queryPlan, stage)) {
        if (middleGradesTargetedQuerySet.has(query.toLowerCase())) middleGradesTargetedQueriesRejectedByReason.query_only_or_missing_document_evidence = Number(middleGradesTargetedQueriesRejectedByReason.query_only_or_missing_document_evidence || 0) + 1;
        if (stage === "meaningful_taste_recovery") rememberRecoveryEarlyFinalGateRejection("recovery_query_quality_query_only_cap", title);
        traceMiddleGradesRawDoc(doc, query, queryPlan, stage, false, "query_only_or_missing_document_evidence");
        return false;
      }
      if (!cleanExpansionStage && !reserveCollectionRoot(doc, title, stage)) {
        if (stage === "meaningful_taste_recovery") rememberRecoveryEarlyFinalGateRejection("duplicate_root_or_series", title);
        traceMiddleGradesRawDoc(doc, query, queryPlan, stage, false, "same_root_collection_duplicate");
        return false;
      }
      if (stage === "meaningful_taste_recovery" && !cleanExpansionStage) {
        const likelyDropReason = middleGradesRecoveryLikelyFinalRejectionReason(doc, query, queryPlan, meaningfulTasteSignals);
        if (likelyDropReason) {
          rememberRecoveryEarlyFinalGateRejection(likelyDropReason, title);
          traceMiddleGradesRawDoc(doc, query, queryPlan, stage, false, likelyDropReason);
          return false;
        }
      }
      if (stage === "meaningful_taste_recovery") {
        rememberMiddleGradesExpandedScoringCandidate(doc, queryPlan, stage, meaningfulTasteSignals);
        if (!cleanExpansionStage) middleGradesRecoveryAcceptedLikelyFinalSurvivorTitles.push(title);
      }
      if (seriesKey && !cleanExpansionStage) acceptedSeriesKeys.add(seriesKey);
      acceptedDocKeys.add(docKey);
      const normalized = normalizeOpenLibraryDoc(doc, queryPlan);
      if (stage === "meaningful_taste_recovery") (normalized as any).meaningfulTasteRecovery = true;
      if (cleanExpansionStage) {
        (normalized as any).cleanCandidateShortfallExpansion = true;
        (normalized as any).scoringHandoffStage = "clean_candidate_shortfall_expansion";
        (normalized as any).scoringHandoffSource = "clean_candidate_shortfall_expansion";
      }
      if (meaningfulTasteSignals.length) {
        (normalized as any).meaningfulTasteRecoveryDocumentSignals = meaningfulTasteSignals;
        (normalized as any).themes = uniqueStrings([...(Array.isArray((normalized as any).themes) ? (normalized as any).themes : []), ...meaningfulTasteSignals], 24);
      }
      rawItems.push(normalized);
      traceMiddleGradesRawDoc(doc, query, queryPlan, stage, true, "accepted");
      traceMiddleGradesNormalizedCandidate(normalized, doc, queryPlan);
      return true;
    };

    for (const [queryPlanIndex, queryPlan] of queryPlans.entries()) {
      const query = queryPlan.query;
      const elapsedBeforeQueryMs = Date.now() - Date.parse(startedAt);
      const reserveProbeTimeMs = ageProfile.probeTimeoutMs + ageProfile.probeReserveBufferMs;
      const teenMainQueryTimedOut = ageProfile.key === "teen" && fetches.some((fetch) => !fetch.diagnosticOnly && fetch.timedOut);
      const middleGradesTimedOutFetchCount = ageProfile.key === "middleGrades" ? fetches.filter((fetch) => !fetch.diagnosticOnly && fetch.timedOut).length : 0;
      const middleGradesMainQueryTimedOut = middleGradesTimedOutFetchCount > 0;
      if (ageProfile.key === "teen" && teenMainQueryTimedOut && rawItems.length < Math.min(ageProfile.docLimit, 5) && elapsedBeforeQueryMs >= sourceBudgetMs) {
        dropReasons.teen_timeout_cascade_source_budget_exhausted = Number(dropReasons.teen_timeout_cascade_source_budget_exhausted || 0) + 1;
        break;
      }
      if (ageProfile.key === "teen" && teenMainQueryTimedOut && rawItems.length === 0 && elapsedBeforeQueryMs + TEEN_OPEN_LIBRARY_DELAYED_RETRY_MIN_BUDGET_MS >= sourceBudgetMs) {
        dropReasons.teen_delayed_final_retry_budget_reserved = Number(dropReasons.teen_delayed_final_retry_budget_reserved || 0) + 1;
        break;
      }
      const middleGradesProfileSpecificAttemptedCount = ageProfile.key === "middleGrades"
        ? fetches.filter((fetch) => middleGradesProfileSpecificQuerySet.has(String(fetch.query || "").toLowerCase())).length
        : 0;
      if (ageProfile.key === "middleGrades" && !debugMiddleGradesDeepTrace && middleGradesTimedOutFetchCount >= 2 && rawItems.length === 0 && middleGradesProfileSpecificAttemptedCount >= Math.min(3, middleGradesProfileSpecificQuerySet.size || 3)) {
        dropReasons.middle_grades_stable_fallback_after_repeated_timeouts = Number(dropReasons.middle_grades_stable_fallback_after_repeated_timeouts || 0) + 1;
        rememberMiddleGradesUnattemptedAtTimeout();
        break;
      }
      if (ageProfile.key === "middleGrades" && !debugMiddleGradesDeepTrace && middleGradesMainQueryTimedOut && rawItems.length === 0 && elapsedBeforeQueryMs + MIDDLE_GRADES_OPEN_LIBRARY_TIMEOUT_CASCADE_QUERY_FLOOR_MS + MIDDLE_GRADES_OPEN_LIBRARY_DELAYED_RETRY_MIN_BUDGET_MS >= sourceBudgetMs) {
        const unattemptedSpecific = middleGradesUnattemptedPlannedSpecificQueries();
        if (unattemptedSpecific.length > 0 && fetches.filter((fetch) => !fetch.diagnosticOnly).length < MIDDLE_GRADES_OPEN_LIBRARY_MIN_PLANNED_QUERY_ATTEMPTS) {
          dropReasons.middle_grades_continue_despite_delayed_retry_reserve_with_specific_queries_remaining = Number(dropReasons.middle_grades_continue_despite_delayed_retry_reserve_with_specific_queries_remaining || 0) + 1;
        } else {
          dropReasons.middle_grades_delayed_final_retry_budget_reserved = Number(dropReasons.middle_grades_delayed_final_retry_budget_reserved || 0) + 1;
          middleGradesSkippedRemainingQueriesDueToBudgetExhaustion = unattemptedSpecific.length > 0;
          rememberMiddleGradesUnattemptedAtTimeout();
          break;
        }
      }
      if (ageProfile.key === "teen" && teenTimeoutCircuitOpen("main_query")) break;
      if (ageProfile.key === "k2" && k2TimeoutCircuitOpen("main_query")) break;
      if (!rawItems.length && fetches.length > 0 && !(ageProfile.key === "adult" && adultPrimaryQueryTimedOutTwice) && !teenMainQueryTimedOut && !middleGradesMainQueryTimedOut && (!debugMiddleGradesDeepTrace || ageProfile.key !== "middleGrades") && elapsedBeforeQueryMs + ageProfile.perQueryTimeoutMs + reserveProbeTimeMs >= sourceBudgetMs) {
        if (ageProfile.key === "middleGrades" && middleGradesUnattemptedReliableVariantQueries().length > 0) {
          dropReasons.middle_grades_continue_despite_reliable_variants_remaining = Number(dropReasons.middle_grades_continue_despite_reliable_variants_remaining || 0) + 1;
        } else {
          dropReasons.main_query_reserved_probe_time = Number(dropReasons.main_query_reserved_probe_time || 0) + 1;
          break;
        }
      }
      if (context.signal?.aborted) {
        dropReasons.probe_skipped_due_to_source_timeout = Number(dropReasons.probe_skipped_due_to_source_timeout || 0) + 1;
        failedReason = failedReason || "openlibrary_aborted_before_query_start";
        break;
      }

      const isAdultFirstMainFetch = ageProfile.key === "adult" && fetches.filter((fetch) => !fetch.diagnosticOnly).length === 0;
      const firstAttemptTimeoutMs = isAdultFirstMainFetch ? ADULT_OPEN_LIBRARY_FIRST_RUN_TIMEOUT_MS : ageProfile.perQueryTimeoutMs;
      const middleGradesInitialTimeoutMs = ageProfile.key === "middleGrades" && fetches.filter((fetch) => !fetch.diagnosticOnly).length === 0
        ? Math.min(MIDDLE_GRADES_OPEN_LIBRARY_INITIAL_QUERY_TIMEOUT_MS, firstAttemptTimeoutMs)
        : undefined;
      const teenTimeoutCascadeRemainingMs = ageProfile.key === "teen" && teenMainQueryTimedOut
        ? Math.max(250, sourceBudgetMs - elapsedBeforeQueryMs - (rawItems.length === 0 ? TEEN_OPEN_LIBRARY_DELAYED_RETRY_MIN_BUDGET_MS : 0))
        : undefined;
      const teenSpecificTimeoutCascadeRemainingQueries = ageProfile.key === "teen" && teenMainQueryTimedOut && !isTeenBroadFallbackOpenLibraryQuery(query)
        ? queryPlans.slice(queryPlanIndex).filter((plan) => !isTeenBroadFallbackOpenLibraryQuery(plan.query)).length
        : 0;
      const teenDistributedSpecificTimeoutMs = teenTimeoutCascadeRemainingMs !== undefined && teenSpecificTimeoutCascadeRemainingQueries > 0
        ? Math.min(
          teenTimeoutCascadeRemainingMs,
          Math.max(
            TEEN_OPEN_LIBRARY_TIMEOUT_CASCADE_SPECIFIC_QUERY_FLOOR_MS,
            Math.min(
              TEEN_OPEN_LIBRARY_TIMEOUT_CASCADE_SPECIFIC_QUERY_CAP_MS,
              Math.floor(teenTimeoutCascadeRemainingMs / teenSpecificTimeoutCascadeRemainingQueries),
            ),
          ),
        )
        : undefined;
      const middleGradesTimeoutCascadeRemainingMs = ageProfile.key === "middleGrades" && middleGradesMainQueryTimedOut
        ? Math.max(250, sourceBudgetMs - elapsedBeforeQueryMs - (rawItems.length === 0 ? MIDDLE_GRADES_OPEN_LIBRARY_DELAYED_RETRY_MIN_BUDGET_MS + MIDDLE_GRADES_OPEN_LIBRARY_FINAL_SAFE_RECOVERY_MIN_BUDGET_MS : 0))
        : undefined;
      const middleGradesTimeoutCascadeRemainingQueries = ageProfile.key === "middleGrades" && middleGradesMainQueryTimedOut
        ? queryPlans.slice(queryPlanIndex).length
        : 0;
      const middleGradesDistributedTimeoutMs = middleGradesTimeoutCascadeRemainingMs !== undefined && middleGradesTimeoutCascadeRemainingQueries > 0
        ? Math.min(
          middleGradesTimeoutCascadeRemainingMs,
          Math.max(
            MIDDLE_GRADES_OPEN_LIBRARY_TIMEOUT_CASCADE_QUERY_FLOOR_MS,
            Math.min(
              MIDDLE_GRADES_OPEN_LIBRARY_TIMEOUT_CASCADE_QUERY_CAP_MS,
              Math.floor(middleGradesTimeoutCascadeRemainingMs / middleGradesTimeoutCascadeRemainingQueries),
            ),
          ),
        )
        : undefined;
      const middleGradesQueryIsProfileSpecific = ageProfile.key === "middleGrades" && middleGradesProfileSpecificQuerySet.has(query.toLowerCase());
      const middleGradesQueryIsTargeted = ageProfile.key === "middleGrades" && middleGradesTargetedQuerySet.has(query.toLowerCase());
      const mainFetchTimeoutMsUncapped = middleGradesDistributedTimeoutMs ?? teenDistributedSpecificTimeoutMs ?? middleGradesTimeoutCascadeRemainingMs ?? teenTimeoutCascadeRemainingMs ?? middleGradesInitialTimeoutMs ?? firstAttemptTimeoutMs;
      const mainProxyClientTimeoutMsUncapped = middleGradesDistributedTimeoutMs ?? teenDistributedSpecificTimeoutMs ?? middleGradesTimeoutCascadeRemainingMs ?? teenTimeoutCascadeRemainingMs ?? middleGradesInitialTimeoutMs ?? openLibraryProxyClientTimeoutMs(ageProfile);
      const middleGradesDebugNetworkTimeoutMs = debugMiddleGradesDeepTrace && ageProfile.key === "middleGrades"
        ? middleGradesActualNetworkTimeoutMs(sourceBudgetMs - elapsedBeforeQueryMs)
        : undefined;
      let mainFetchTimeoutMs = middleGradesDebugNetworkTimeoutMs ?? mainFetchTimeoutMsUncapped;
      let mainProxyClientTimeoutMs = middleGradesDebugNetworkTimeoutMs ?? mainProxyClientTimeoutMsUncapped;
      if (ageProfile.key === "middleGrades" && !debugMiddleGradesDeepTrace && (middleGradesQueryIsProfileSpecific || middleGradesQueryIsTargeted || queryPlanIndex < MIDDLE_GRADES_OPEN_LIBRARY_MIN_PLANNED_QUERY_ATTEMPTS)) {
        const remainingSpecificIncludingCurrent = Math.max(1, middleGradesUnattemptedPlannedSpecificQueries().length || (queryPlans.length - queryPlanIndex));
        const minimumAttemptsRemaining = Math.max(1, MIDDLE_GRADES_OPEN_LIBRARY_MIN_PLANNED_QUERY_ATTEMPTS - fetches.filter((fetch) => !fetch.diagnosticOnly).length);
        const reserveQueries = Math.max(remainingSpecificIncludingCurrent, minimumAttemptsRemaining);
        const usableBudget = Math.max(MIDDLE_GRADES_OPEN_LIBRARY_TIMEOUT_CASCADE_QUERY_FLOOR_MS, sourceBudgetMs - elapsedBeforeQueryMs - MIDDLE_GRADES_OPEN_LIBRARY_FINAL_SAFE_RECOVERY_MIN_BUDGET_MS);
        const distributedBudget = Math.max(MIDDLE_GRADES_OPEN_LIBRARY_TIMEOUT_CASCADE_QUERY_FLOOR_MS, Math.floor(usableBudget / reserveQueries));
        const cappedBudget = Math.max(MIDDLE_GRADES_OPEN_LIBRARY_TIMEOUT_CASCADE_QUERY_FLOOR_MS, Math.min(MIDDLE_GRADES_OPEN_LIBRARY_TARGETED_QUERY_CAP_MS, distributedBudget, mainFetchTimeoutMsUncapped));
        mainFetchTimeoutMs = cappedBudget;
        mainProxyClientTimeoutMs = cappedBudget;
        middleGradesPerQueryBudgetReserved[query] = cappedBudget;
      }
      if (ageProfile.key === "middleGrades" && !forceMiddleGradesCleanCandidateShortfallExpansion && !middleGradesQueryIsTargeted && middleGradesUnattemptedTargetedQueries().length > 0 && rawItems.length < Math.min(ageProfile.docLimit, 5)) {
        middleGradesBroadFallbackStartedBeforeTargetedExhaustion = true;
        dropReasons.middle_grades_broad_query_deferred_until_targeted_exhaustion = Number(dropReasons.middle_grades_broad_query_deferred_until_targeted_exhaustion || 0) + 1;
        continue;
      }
      if (ageProfile.key === "k2") {
        mainFetchTimeoutMs = Math.min(K2_OPEN_LIBRARY_PROXY_CLIENT_TIMEOUT_MS, mainFetchTimeoutMs);
        mainProxyClientTimeoutMs = Math.min(K2_OPEN_LIBRARY_PROXY_CLIENT_TIMEOUT_MS, mainProxyClientTimeoutMs ?? K2_OPEN_LIBRARY_PROXY_CLIENT_TIMEOUT_MS);
      }
      const acceptedBeforeThisQuery = rawItems.length;
      if (middleGradesQueryIsProfileSpecific) middleGradesProfileSpecificQueriesAttempted.push(query);
      if (middleGradesQueryIsTargeted) {
        if (middleGradesUnderfilledAfterDirectUsableDocs && rawItems.length < Math.min(ageProfile.docLimit, 5)) middleGradesDirectUsableDocsButRecoveryContinued = true;
        if (!middleGradesTargetedQueriesAttempted.includes(query)) middleGradesTargetedQueriesAttempted.push(query);
        if (middleGradesSameFamilyContinuationQuerySet.has(query.toLowerCase()) && !middleGradesSameFamilyContinuationQueriesAttempted.includes(query)) {
          middleGradesSameFamilyContinuationQueriesAttempted.push(query);
        }
        if (middleGradesReliableVariantQuerySet.has(query.toLowerCase()) && !middleGradesReliableVariantAttempted.includes(query)) {
          middleGradesReliableVariantAttempted.push(query);
          if (middleGradesFirstBatchFamily && middleGradesTargetedPlanForRun?.familyByQuery?.[query] === middleGradesFirstBatchFamily) middleGradesFirstBatchReliableVariantUsed = true;
        }
        if (!middleGradesEvidenceAwareRecoveryQueriesAttempted.includes(query)) middleGradesEvidenceAwareRecoveryQueriesAttempted.push(query);
        middleGradesEvidenceAwareRecoveryAttempted = true;
        if (middleGradesTimedOutFetchCount > 0 && /\b(children|chapter book)\b/i.test(query)) middleGradesBrittleQueryTimedOutThenShortQueryAttempted = true;
      }
      const sourceBudgetRemainingBeforeMainFetchMs = Math.max(0, sourceBudgetMs - (Date.now() - Date.parse(startedAt)));
      let { docs, diagnostic } = await fetchOpenLibraryDocs(queryPlan, ageProfile.docsPerQuery, context.signal, false, mainFetchTimeoutMs, 1, mainProxyClientTimeoutMs, false, sourceBudgetRemainingBeforeMainFetchMs);
      if (diagnostic.timedOut && isAdultFirstMainFetch && !context.signal?.aborted) {
        firstRunFetchTimeout = true;
        retryAttempted = true;
        proxyColdStartSuspected = diagnostic.fetchPath === "proxy" || Number(diagnostic.elapsedMs || 0) >= firstAttemptTimeoutMs - 50;
        diagnostic.firstRunFetchTimeout = true;
        diagnostic.retryAttempted = true;
        diagnostic.proxyColdStartSuspected = proxyColdStartSuspected;
        fetches.push(diagnostic);

        const retryResult = await fetchOpenLibraryDocs(queryPlan, ageProfile.docsPerQuery, context.signal, false, ADULT_OPEN_LIBRARY_FIRST_RUN_RETRY_TIMEOUT_MS, 2, openLibraryProxyClientTimeoutMs(ageProfile));
        docs = retryResult.docs;
        diagnostic = {
          ...retryResult.diagnostic,
          retryAttempted: true,
          retrySucceeded: retryResult.docs.length > 0 && !retryResult.diagnostic.timedOut && !retryResult.diagnostic.failedReason,
          proxyColdStartSuspected,
        };
        retrySucceeded = Boolean(diagnostic.retrySucceeded);
        adultPrimaryQueryTimedOutTwice = Boolean(retryResult.diagnostic.timedOut);
      }
      fetches.push(diagnostic);
      traceMiddleGradesFetch(diagnostic);
      if (ageProfile.key === "middleGrades" && diagnostic.timedOut && diagnostic.fetchPath === "proxy") {
        middleGradesRepeatedProxyAbortCount = fetches.filter((fetch) => !fetch.diagnosticOnly && fetch.fetchPath === "proxy" && fetch.timedOut).length;
        if (middleGradesRepeatedProxyAbortCount >= 1 && !context.signal?.aborted) {
          middleGradesDirectFallbackAttemptedAfterProxyAbort = true;
          middleGradesProxyTimedOutThenDirectAttemptedSameQuery = true;
          const directFallbackRemainingBudgetMs = Math.max(0, sourceBudgetMs - (Date.now() - Date.parse(startedAt)));
          const directFallbackTimeoutMs = debugMiddleGradesDeepTrace ? middleGradesActualNetworkTimeoutMs(directFallbackRemainingBudgetMs) : Math.min(MIDDLE_GRADES_OPEN_LIBRARY_PROXY_CLIENT_TIMEOUT_MS, directFallbackRemainingBudgetMs || MIDDLE_GRADES_OPEN_LIBRARY_PROXY_CLIENT_TIMEOUT_MS);
          const directFallback = await fetchOpenLibraryDocs(queryPlan, ageProfile.docsPerQuery, context.signal, false, directFallbackTimeoutMs, 2, undefined, true, directFallbackRemainingBudgetMs);
          directFallback.diagnostic.abortControllerSharedWithPreviousFetch = directFallback.diagnostic.abortControllerId === diagnostic.abortControllerId;
          fetches.push(directFallback.diagnostic);
          traceMiddleGradesFetch(directFallback.diagnostic, "same_query_direct_fallback_after_proxy_timeout");
          if (!directFallback.diagnostic.timedOut && !directFallback.diagnostic.failedReason) {
            docs = directFallback.docs;
            diagnostic = directFallback.diagnostic;
          }
        }
      }
      if (diagnostic.timedOut) {
        if (ageProfile.key === "middleGrades") {
          rememberMiddleGradesUnattemptedAtTimeout();
          if (middleGradesQueryIsTargeted && middleGradesFirstBatchFamily && middleGradesTargetedPlanForRun?.familyByQuery?.[query] === middleGradesFirstBatchFamily) middleGradesFirstBatchSpecificQueryTimedOutCount += 1;
        }
        if (middleGradesQueryIsProfileSpecific) middleGradesProfileSpecificQueriesTimedOut += 1;
        dropReasons.query_timeout = Number(dropReasons.query_timeout || 0) + 1;
        failedReason = diagnostic.failedReason || "openlibrary_fetch_timed_out";
        if (ageProfile.key === "teen" && teenTimeoutCircuitOpen("main_query")) break;
        if (ageProfile.key === "middleGrades" && middleGradesTimeoutCircuitOpen("main_query")) break;
        if (ageProfile.key === "k2" && k2TimeoutCircuitOpen("main_query")) break;
        if (retryAttempted && !retrySucceeded && firstRunFetchTimeout && isAdultMixedHistoricalMysteryRomanceProfile(context.profile) && !context.signal?.aborted) {
          const attemptedMainQueries = new Set(fetches.filter((fetch) => !fetch.diagnosticOnly).map((fetch) => String(fetch.query || "").toLowerCase()));
          for (const fallbackQuery of ["mystery thriller", "crime fiction", "historical mystery", "romantic suspense"].filter((query) => !attemptedMainQueries.has(query.toLowerCase()))) {
            const fallbackPlan: OpenLibraryQueryPlan = {
              query: fallbackQuery,
              originalPlannedQuery: queries[0] || "",
              queryCascadeIndex: queryPlans.length + fetches.filter((fetch) => !fetch.diagnosticOnly).length,
              queryFamily: queryFamilyForOpenLibraryQuery(fallbackQuery),
              facets: ["mystery", "crime", "thriller", "historical", "romance"],
              routingReason: "adult_mixed_historical_mystery_first_run_timeout_fallback",
            };
            const { docs: fallbackDocs, diagnostic: fallbackDiagnostic } = await fetchOpenLibraryDocs(fallbackPlan, ageProfile.docsPerQuery, context.signal, false, ageProfile.perQueryTimeoutMs, 1, openLibraryProxyClientTimeoutMs(ageProfile));
            fetches.push(fallbackDiagnostic);
            if (fallbackDiagnostic.timedOut) {
              dropReasons.adult_mixed_first_run_fallback_timeout = Number(dropReasons.adult_mixed_first_run_fallback_timeout || 0) + 1;
              if (context.signal?.aborted) break;
              continue;
            }
            if (fallbackDiagnostic.failedReason) {
              dropReasons.adult_mixed_first_run_fallback_failed = Number(dropReasons.adult_mixed_first_run_fallback_failed || 0) + 1;
              continue;
            }
            rawApiResultCount += fallbackDocs.length;
            for (const doc of fallbackDocs) {
              const title = String(doc?.title || "").trim();
              if (title) rawTitles.push(title);
              if (!title) {
                dropReasons.adult_mixed_first_run_fallback_missing_title = Number(dropReasons.adult_mixed_first_run_fallback_missing_title || 0) + 1;
                continue;
              }
              recordMiddleGradesAgeShapeDiagnostic(doc, fallbackQuery, "adult_mixed_first_run_fallback");
              const quality = shouldKeepOpenLibraryDoc(doc, fallbackQuery, context.profile);
              if (!quality.keep) {
                const reason = `adult_mixed_first_run_fallback_${quality.reason || "quality_filter"}`;
                dropReasons[reason] = Number(dropReasons[reason] || 0) + 1;
                if (/artifact|inappropriate/.test(reason)) artifactSuppressedTitles.push(title);
                continue;
              }
              if (!hasAdultMixedHistoricalMysteryFallbackOverlap(doc)) {
                dropReasons.adult_mixed_first_run_fallback_no_route_overlap = Number(dropReasons.adult_mixed_first_run_fallback_no_route_overlap || 0) + 1;
                continue;
              }
              const docKey = String(doc?.key || doc?.cover_edition_key || doc?.edition_key?.[0] || `${title}:${Array.isArray(doc?.author_name) ? doc.author_name[0] : ""}`).toLowerCase();
              if (acceptedDocKeys.has(docKey)) {
                dropReasons.adult_mixed_first_run_fallback_duplicate_doc = Number(dropReasons.adult_mixed_first_run_fallback_duplicate_doc || 0) + 1;
                continue;
              }
              const seriesKey = openLibrarySeriesKey(doc);
              if (seriesKey && acceptedSeriesKeys.has(seriesKey)) {
                dropReasons.adult_mixed_first_run_fallback_series_duplicate = Number(dropReasons.adult_mixed_first_run_fallback_series_duplicate || 0) + 1;
                seriesSuppressedTitles.push(title);
                continue;
              }
              if (seriesKey) acceptedSeriesKeys.add(seriesKey);
              acceptedDocKeys.add(docKey);
              if (!shouldAcceptMiddleGradesSourceDoc(doc, fallbackQuery, fallbackPlan, "fallback")) continue;
              rawItems.push(normalizeOpenLibraryDoc(doc, fallbackPlan));
              dropReasons.adult_mixed_first_run_fallback_accepted = Number(dropReasons.adult_mixed_first_run_fallback_accepted || 0) + 1;
              if (rawItems.length >= Math.min(ageProfile.docLimit, 5)) break;
            }
            const timeoutRecoveryTarget = adultPrimaryQueryTimedOutTwice ? Math.min(ageProfile.docLimit, 5) : 3;
            if (rawItems.length >= timeoutRecoveryTarget || rawItems.length >= Math.min(ageProfile.docLimit, 5)) break;
          }
          if (rawItems.length > 0) openLibraryTopUpRan = true;
        }
        const timeoutRecoveryTarget = ageProfile.key === "adult" && adultPrimaryQueryTimedOutTwice ? Math.min(ageProfile.docLimit, 5) : 3;
        if (rawItems.length >= timeoutRecoveryTarget || rawItems.length >= middleGradesCandidatePoolLimit) break;
        if (ageProfile.key === "adult" && adultPrimaryQueryTimedOutTwice && rawItems.length > 0) {
          openLibraryTopUpRan = true;
          dropReasons.adult_timeout_recovery_continued_underfilled = Number(dropReasons.adult_timeout_recovery_continued_underfilled || 0) + 1;
        }
        if (ageProfile.key === "teen" && rawItems.length < Math.min(ageProfile.docLimit, 5)) {
          dropReasons.teen_timeout_cascade_continued_underfilled = Number(dropReasons.teen_timeout_cascade_continued_underfilled || 0) + 1;
        }
        if (context.signal?.aborted) break;
        continue;
      }
      if (diagnostic.failedReason) {
        failedReason = diagnostic.failedReason;
        if (ageProfile.key === "teen" && teenTimeoutCircuitOpen("main_query")) break;
        if (ageProfile.key === "k2" && k2TimeoutCircuitOpen("main_query")) break;
        break;
      }

      rawApiResultCount += docs.length;
      for (const doc of docs) {
        if (ageProfile.key === "middleGrades") {
          const accepted = acceptMiddleGradesDoc(doc, queryPlan, "main");
          if (accepted) {
            if (middleGradesQueryIsTargeted) {
              middleGradesTargetedQueriesAcceptedCount += 1;
              middleGradesEvidenceAwareRecoveryAcceptedCount += 1;
              if (middleGradesReliableVariantQuerySet.has(query.toLowerCase())) middleGradesReliableVariantAcceptedCount += 1;
              if (middleGradesFirstBatchParallelQueries.map((candidate) => candidate.toLowerCase()).includes(query.toLowerCase())) middleGradesFirstBatchParallelAcceptedCount += 1;
            }
            if (middleGradesRejectedAllRowsAsQueryOnly) {
              if (!middleGradesContinuedAfterQueryOnlyRejectionQueries.includes(query)) middleGradesContinuedAfterQueryOnlyRejectionQueries.push(query);
              middleGradesContinuedAfterQueryOnlyRejectionAcceptedCount += 1;
            }
            if (rawItems.length >= middleGradesCandidatePoolLimit) break;
          }
          continue;
        }
        const title = String(doc?.title || "").trim();
        if (title) rawTitles.push(title);
        if (!title) {
          dropReasons.missing_title = Number(dropReasons.missing_title || 0) + 1;
          continue;
        }
        recordMiddleGradesAgeShapeDiagnostic(doc, query, "main");
        const quality = shouldKeepOpenLibraryDoc(doc, query, context.profile);
        if (!quality.keep) {
          const reason = quality.reason || "quality_filter";
          dropReasons[reason] = Number(dropReasons[reason] || 0) + 1;
          if (middleGradesQueryIsTargeted) middleGradesTargetedQueriesRejectedByReason[reason] = Number(middleGradesTargetedQueriesRejectedByReason[reason] || 0) + 1;
          if (artifactReasonLabels.has(reason)) artifactSuppressedTitles.push(title);
          continue;
        }
        const docKey = String(doc?.key || doc?.cover_edition_key || doc?.edition_key?.[0] || `${title}:${Array.isArray(doc?.author_name) ? doc.author_name[0] : ""}`).toLowerCase();
        if (acceptedDocKeys.has(docKey)) {
          dropReasons.duplicate_doc = Number(dropReasons.duplicate_doc || 0) + 1;
          continue;
        }
        const seriesKey = openLibrarySeriesKey(doc);
        if (seriesKey && acceptedSeriesKeys.has(seriesKey)) {
          dropReasons.series_duplicate = Number(dropReasons.series_duplicate || 0) + 1;
          seriesSuppressedTitles.push(title);
          continue;
        }
        if (isMiddleGradesFantasyHumorRoute(queryPlans) && isMiddleGradesHumorDefaultQuery(query) && !hasMiddleGradesFantasyHumorAlignedQuery(rawItems) && rawItems.length >= Math.min(5, ageProfile.docLimit)) {
          dropReasons.middle_grades_fantasy_humor_default_slate_soft_cap = Number(dropReasons.middle_grades_fantasy_humor_default_slate_soft_cap || 0) + 1;
          continue;
        }
        if (seriesKey) acceptedSeriesKeys.add(seriesKey);
        acceptedDocKeys.add(docKey);
        if (!shouldAcceptMiddleGradesSourceDoc(doc, query, queryPlan, "main")) {
          if (middleGradesQueryIsTargeted) middleGradesTargetedQueriesRejectedByReason.query_only_or_missing_document_evidence = Number(middleGradesTargetedQueriesRejectedByReason.query_only_or_missing_document_evidence || 0) + 1;
          continue;
        }
        if (!reserveCollectionRoot(doc, title, "main")) continue;
        rawItems.push(normalizeOpenLibraryDoc(doc, queryPlan));
        if (middleGradesQueryIsTargeted) {
          middleGradesTargetedQueriesAcceptedCount += 1;
          middleGradesEvidenceAwareRecoveryAcceptedCount += 1;
          if (middleGradesReliableVariantQuerySet.has(query.toLowerCase())) middleGradesReliableVariantAcceptedCount += 1;
          if (middleGradesFirstBatchParallelQueries.map((candidate) => candidate.toLowerCase()).includes(query.toLowerCase())) middleGradesFirstBatchParallelAcceptedCount += 1;
        }
        if (middleGradesRejectedAllRowsAsQueryOnly) {
          if (!middleGradesContinuedAfterQueryOnlyRejectionQueries.includes(query)) middleGradesContinuedAfterQueryOnlyRejectionQueries.push(query);
          middleGradesContinuedAfterQueryOnlyRejectionAcceptedCount += 1;
        }
        const acceptTarget = (ageProfile.key === "adult" && adultPrimaryQueryTimedOutTwice) || teenMainQueryTimedOut ? Math.min(ageProfile.docLimit, 5) : ageProfile.docLimit;
        if (rawItems.length >= acceptTarget) break;
      }
      if (ageProfile.key === "middleGrades" && docs.length > 0 && rawItems.length === acceptedBeforeThisQuery) {
        middleGradesDocsReturnedButAllDropped += 1;
        if (diagnostic.fetchPath === "direct") middleGradesDirectFetchReturnedRawButAllRejected += 1;
        const currentFamily = middleGradesTargetedPlanForRun?.familyByQuery?.[query];
        const continuation = middleGradesUnattemptedReliableVariantQueries().find((candidate) => middleGradesTargetedPlanForRun?.familyByQuery?.[candidate] === currentFamily)
          || middleGradesUnattemptedReliableVariantQueries()[0];
        if (continuation) {
          middleGradesSameFamilyContinuationAfterAllRejected = true;
          middleGradesSameFamilyContinuationQuerySet.add(continuation.toLowerCase());
          if (!middleGradesAllDroppedContinuationQuery.includes(continuation)) middleGradesAllDroppedContinuationQuery.push(continuation);
        } else {
          middleGradesRawRejectedButContinuationSkippedReason = "no_unattempted_same_family_reliable_variant";
        }
      }
      if (ageProfile.key === "middleGrades" && diagnostic.fetchPath === "direct" && rawItems.length > acceptedBeforeThisQuery && rawItems.length < Math.min(ageProfile.docLimit, 5)) {
        middleGradesUnderfilledAfterDirectUsableDocs = true;
      }
      if (ageProfile.key === "middleGrades" && middleGradesRejectedAllRowsAsQueryOnly && rawItems.length === acceptedBeforeThisQuery) {
        const remainingSpecificQueries = middleGradesUnattemptedSpecificQueries();
        if (remainingSpecificQueries.length > 0) {
          middleGradesQueryOnlyRejectionTriggeredContinuation = true;
          middleGradesUnattemptedSpecificQueriesAfterQueryOnlyRejection.push(...remainingSpecificQueries);
          middleGradesContinuedAfterQueryOnlyRejectionQueries.push(...remainingSpecificQueries.slice(0, 4));
        }
      }
      const cleanDocTarget = debugMiddleGradesDeepTrace && ageProfile.key === "middleGrades"
        ? middleGradesCandidatePoolLimit
        : (ageProfile.key === "adult" && adultPrimaryQueryTimedOutTwice) || teenMainQueryTimedOut ? Math.min(ageProfile.docLimit, 5) : ageProfile.minCleanDocs;
      if (middleGradesQueryIsProfileSpecific && rawItems.length > acceptedBeforeThisQuery) {
        middleGradesProfileSpecificQueriesAcceptedCount += rawItems.length - acceptedBeforeThisQuery;
      }
      if (rawItems.length >= cleanDocTarget || rawItems.length >= middleGradesCandidatePoolLimit) break;
      if (rawItems.length > 0) {
        openLibraryTopUpRan = true;
        if (ageProfile.key === "adult" && adultPrimaryQueryTimedOutTwice) {
          dropReasons.adult_timeout_recovery_continued_underfilled = Number(dropReasons.adult_timeout_recovery_continued_underfilled || 0) + 1;
        }
        if (teenMainQueryTimedOut) {
          dropReasons.teen_timeout_cascade_continued_underfilled = Number(dropReasons.teen_timeout_cascade_continued_underfilled || 0) + 1;
        }
      }
    }

    if (queryPlans[0]?.routingReason === "adult_fantasy_historical_survival" && rawItems.length < 3 && !context.signal?.aborted) {
      const attemptedMainQueries = new Set(fetches.filter((fetch) => !fetch.diagnosticOnly).map((fetch) => String(fetch.query || "").toLowerCase()));
      const fallbackQueries = ["historical romance", "fantasy romance", "historical fiction", "fantasy adventure"]
        .filter((query) => !attemptedMainQueries.has(query.toLowerCase()));
      for (const fallbackQuery of fallbackQueries) {
        const fallbackPlan: OpenLibraryQueryPlan = {
          query: fallbackQuery,
          originalPlannedQuery: queries[0] || "",
          queryCascadeIndex: queryPlans.length + fetches.filter((fetch) => !fetch.diagnosticOnly).length,
          queryFamily: queryFamilyForOpenLibraryQuery(fallbackQuery),
          facets: ["fantasy", "historical", "romance", "adventure", "comedy"],
          routingReason: "adult_fantasy_historical_survival_underfill_fallback",
        };
        const { docs: fallbackDocs, diagnostic } = await fetchOpenLibraryDocs(fallbackPlan, ageProfile.docsPerQuery, context.signal, false, ageProfile.perQueryTimeoutMs, 1, openLibraryProxyClientTimeoutMs(ageProfile));
        fetches.push(diagnostic);
        if (diagnostic.timedOut) {
          dropReasons.adult_fantasy_historical_survival_fallback_timeout = Number(dropReasons.adult_fantasy_historical_survival_fallback_timeout || 0) + 1;
          if (!failedReason) failedReason = diagnostic.failedReason || "openlibrary_fetch_timed_out";
          if (context.signal?.aborted) break;
          continue;
        }
        if (diagnostic.failedReason) {
          failedReason = diagnostic.failedReason;
          break;
        }
        rawApiResultCount += fallbackDocs.length;
        for (const doc of fallbackDocs) {
          const title = String(doc?.title || "").trim();
          if (title) rawTitles.push(title);
          if (!title) {
            dropReasons.adult_fantasy_historical_survival_fallback_missing_title = Number(dropReasons.adult_fantasy_historical_survival_fallback_missing_title || 0) + 1;
            continue;
          }
          recordMiddleGradesAgeShapeDiagnostic(doc, fallbackQuery, "adult_fantasy_historical_survival_fallback");
          const quality = shouldKeepOpenLibraryDoc(doc, fallbackQuery, context.profile);
          if (!quality.keep) {
            const reason = `adult_fantasy_historical_survival_fallback_${quality.reason || "quality_filter"}`;
            dropReasons[reason] = Number(dropReasons[reason] || 0) + 1;
            if (/artifact|inappropriate/.test(reason)) artifactSuppressedTitles.push(title);
            continue;
          }
          if (!hasAdultFantasyHistoricalFallbackOverlap(doc)) {
            dropReasons.adult_fantasy_historical_survival_fallback_no_route_overlap = Number(dropReasons.adult_fantasy_historical_survival_fallback_no_route_overlap || 0) + 1;
            continue;
          }
          const docKey = String(doc?.key || doc?.cover_edition_key || doc?.edition_key?.[0] || `${title}:${Array.isArray(doc?.author_name) ? doc.author_name[0] : ""}`).toLowerCase();
          if (acceptedDocKeys.has(docKey)) {
            dropReasons.adult_fantasy_historical_survival_fallback_duplicate_doc = Number(dropReasons.adult_fantasy_historical_survival_fallback_duplicate_doc || 0) + 1;
            continue;
          }
          const seriesKey = openLibrarySeriesKey(doc);
          if (seriesKey && acceptedSeriesKeys.has(seriesKey)) {
            dropReasons.adult_fantasy_historical_survival_fallback_series_duplicate = Number(dropReasons.adult_fantasy_historical_survival_fallback_series_duplicate || 0) + 1;
            seriesSuppressedTitles.push(title);
            continue;
          }
          if (seriesKey) acceptedSeriesKeys.add(seriesKey);
          acceptedDocKeys.add(docKey);
          if (!shouldAcceptMiddleGradesSourceDoc(doc, fallbackQuery, fallbackPlan, "fallback")) continue;
              rawItems.push(normalizeOpenLibraryDoc(doc, fallbackPlan));
          dropReasons.adult_fantasy_historical_survival_fallback_accepted = Number(dropReasons.adult_fantasy_historical_survival_fallback_accepted || 0) + 1;
          if (rawItems.length >= Math.min(ageProfile.docLimit, 5)) break;
        }
        if (rawItems.length >= 3 || rawItems.length >= Math.min(ageProfile.docLimit, 5)) break;
      }
      if (fallbackQueries.length > 0) openLibraryTopUpRan = true;
    }

    if (ageProfile.key === "teen" && rawItems.length > 0 && rawItems.length < Math.min(ageProfile.docLimit, 5) && !context.signal?.aborted) {
      const attemptedMainQueries = new Set(fetches.filter((fetch) => !fetch.diagnosticOnly).map((fetch) => String(fetch.query || "").toLowerCase()));
      const recoveryQueries = teenUnderfillRecoveryQueries(queryPlans)
        .filter((query) => !attemptedMainQueries.has(query.toLowerCase()));
      const recoveryTarget = Math.min(ageProfile.docLimit, 5);
      for (const recoveryQuery of recoveryQueries) {
        if (teenTimeoutCircuitOpen("underfill_recovery")) break;
        const elapsedBeforeRecoveryMs = Date.now() - Date.parse(startedAt);
        const remainingBudgetMs = sourceBudgetMs - elapsedBeforeRecoveryMs;
        if (remainingBudgetMs <= 250) {
          dropReasons.teen_underfill_recovery_source_budget_exhausted = Number(dropReasons.teen_underfill_recovery_source_budget_exhausted || 0) + 1;
          break;
        }
        const recoveryTimeoutMs = Math.max(500, Math.min(3_000, remainingBudgetMs));
        const recoveryPlan: OpenLibraryQueryPlan = {
          query: recoveryQuery,
          originalPlannedQuery: queries[0] || "",
          queryCascadeIndex: queryPlans.length + fetches.filter((fetch) => !fetch.diagnosticOnly).length,
          queryFamily: queryFamilyForOpenLibraryQuery(recoveryQuery),
          facets: queryPlans[0]?.facets || [],
          routingReason: `${queryPlans[0]?.routingReason || "teen"}_locked_underfill_recovery`,
          routingDominance: queryPlans[0]?.routingDominance,
        };
        const { docs: recoveryDocs, diagnostic } = await fetchOpenLibraryDocs(recoveryPlan, ageProfile.docsPerQuery, context.signal, false, recoveryTimeoutMs, 1, recoveryTimeoutMs);
        fetches.push(diagnostic);
        dropReasons.teen_underfill_recovery_query_attempted = Number(dropReasons.teen_underfill_recovery_query_attempted || 0) + 1;
        if (diagnostic.timedOut) {
          dropReasons.teen_underfill_recovery_timeout = Number(dropReasons.teen_underfill_recovery_timeout || 0) + 1;
          if (teenTimeoutCircuitOpen("underfill_recovery")) break;
          if (context.signal?.aborted) break;
          continue;
        }
        if (diagnostic.failedReason) {
          dropReasons.teen_underfill_recovery_failed = Number(dropReasons.teen_underfill_recovery_failed || 0) + 1;
          if (teenTimeoutCircuitOpen("underfill_recovery")) break;
          continue;
        }
        rawApiResultCount += recoveryDocs.length;
        for (const doc of recoveryDocs) {
          const title = String(doc?.title || "").trim();
          if (title) rawTitles.push(title);
          if (!title) {
            dropReasons.teen_underfill_recovery_missing_title = Number(dropReasons.teen_underfill_recovery_missing_title || 0) + 1;
            continue;
          }
          recordMiddleGradesAgeShapeDiagnostic(doc, recoveryQuery, "recovery");
          const quality = shouldKeepOpenLibraryDoc(doc, recoveryQuery, context.profile);
          if (!quality.keep) {
            const reason = `teen_underfill_recovery_${quality.reason || "quality_filter"}`;
            dropReasons[reason] = Number(dropReasons[reason] || 0) + 1;
            if (/artifact|inappropriate/.test(reason)) artifactSuppressedTitles.push(title);
            continue;
          }
          const docKey = String(doc?.key || doc?.cover_edition_key || doc?.edition_key?.[0] || `${title}:${Array.isArray(doc?.author_name) ? doc.author_name[0] : ""}`).toLowerCase();
          if (acceptedDocKeys.has(docKey)) {
            dropReasons.teen_underfill_recovery_duplicate_doc = Number(dropReasons.teen_underfill_recovery_duplicate_doc || 0) + 1;
            continue;
          }
          const seriesKey = openLibrarySeriesKey(doc);
          if (seriesKey && acceptedSeriesKeys.has(seriesKey)) {
            dropReasons.teen_underfill_recovery_series_duplicate = Number(dropReasons.teen_underfill_recovery_series_duplicate || 0) + 1;
            seriesSuppressedTitles.push(title);
            continue;
          }
          if (seriesKey) acceptedSeriesKeys.add(seriesKey);
          acceptedDocKeys.add(docKey);
          if (!shouldAcceptMiddleGradesSourceDoc(doc, recoveryQuery, recoveryPlan, "recovery")) continue;
          rawItems.push(normalizeOpenLibraryDoc(doc, recoveryPlan));
          dropReasons.teen_underfill_recovery_accepted = Number(dropReasons.teen_underfill_recovery_accepted || 0) + 1;
          if (rawItems.length >= recoveryTarget) break;
        }
        if (rawItems.length >= recoveryTarget) break;
      }
      if (recoveryQueries.length > 0) {
        openLibraryTopUpRan = true;
        if (rawItems.length < recoveryTarget) {
          dropReasons.teen_underfill_recovery_exhausted = Number(dropReasons.teen_underfill_recovery_exhausted || 0) + 1;
        }
      }
    }

    if (ageProfile.key === "middleGrades" && rawItems.length === 0 && !context.signal?.aborted && !middleGradesTimeoutCircuitOpen("delayed_final_retry")) {
      const mainFetches = fetches.filter((fetch) => !fetch.diagnosticOnly);
      const allAttemptedLaneQueriesTimedOut = mainFetches.length > 0 && mainFetches.every((fetch) => fetch.timedOut);
      const attemptedMainQueries = new Set(mainFetches.map((fetch) => String(fetch.query || "").toLowerCase()));
      const timedOutMainFetchCount = mainFetches.filter((fetch) => fetch.timedOut).length;
      const routeAlignedDelayedRetryQuery = timedOutMainFetchCount >= 2 ? undefined : middleGradesRouteAlignedRecoveryQuery(queryPlans, attemptedMainQueries);
      const signalShapedDelayedRetryFallback = routeAlignedDelayedRetryQuery ? undefined : middleGradesSignalShapedAntiZeroFallback(queryPlans, attemptedMainQueries, context.profile);
      const delayedRetryQuery = routeAlignedDelayedRetryQuery || signalShapedDelayedRetryFallback?.query || middleGradesZeroCandidateFallbackQuery(queryPlans, attemptedMainQueries);
      const delayedRetryIsAntiZeroFallback = !routeAlignedDelayedRetryQuery;
      if (delayedRetryIsAntiZeroFallback) rememberMiddleGradesAntiZeroFallbackShape(signalShapedDelayedRetryFallback);
      if (allAttemptedLaneQueriesTimedOut && delayedRetryQuery && !middleGradesTimeoutCircuitOpen("delayed_final_retry")) {
        const delayedRetryPlan: OpenLibraryQueryPlan = {
          query: delayedRetryQuery,
          originalPlannedQuery: queries[0] || "",
          queryCascadeIndex: queryPlans.length + mainFetches.length,
          queryFamily: queryFamilyForOpenLibraryQuery(delayedRetryQuery),
          facets: queryPlans[0]?.facets || [],
          routingReason: `${queryPlans[0]?.routingReason || "middle_grades"}_delayed_final_retry`,
          routingDominance: queryPlans[0]?.routingDominance,
          emergencyFallback: delayedRetryIsAntiZeroFallback,
          fallbackAlignment: delayedRetryIsAntiZeroFallback ? "anti_zero" : "route_aligned",
        };
        const elapsedBeforeDelayedRetryMs = Date.now() - Date.parse(startedAt);
        const delayedRetryRemainingBudgetMs = sourceBudgetMs - elapsedBeforeDelayedRetryMs;
        middleGradesTimeoutBudgetRemainingBeforeRetry = delayedRetryRemainingBudgetMs;
        if (delayedRetryIsAntiZeroFallback) {
          markMiddleGradesFallbackStarted();
          middleGradesFallbackAttemptOrder.push(delayedRetryQuery);
          middleGradesRemainingBudgetBeforeEachFallback[delayedRetryQuery] = delayedRetryRemainingBudgetMs;
        }
        if (!debugMiddleGradesDeepTrace && delayedRetryRemainingBudgetMs < MIDDLE_GRADES_OPEN_LIBRARY_DELAYED_RETRY_MIN_BUDGET_MS) {
          middleGradesDelayedRetrySkippedReason = "budget_exhausted_before_viable_recovery";
          middleGradesRecoverySkippedInsufficientBudget = true;
          middleGradesActualRemainingBudgetBeforeRecoveryMs = delayedRetryRemainingBudgetMs;
          dropReasons.middle_grades_delayed_final_retry_skipped_insufficient_budget = Number(dropReasons.middle_grades_delayed_final_retry_skipped_insufficient_budget || 0) + 1;
        } else {
          const attemptedAfterDelayedRetry = new Set([...attemptedMainQueries, delayedRetryQuery.toLowerCase()]);
          const finalSafeFallbackAfterDelayedRetry = middleGradesZeroCandidateFallbackQuery(queryPlans, attemptedAfterDelayedRetry);
          const reserveFinalSafeRecoveryBudgetMs = !debugMiddleGradesDeepTrace && finalSafeFallbackAfterDelayedRetry && !attemptedAfterDelayedRetry.has(finalSafeFallbackAfterDelayedRetry.toLowerCase())
            ? Math.min(
              MIDDLE_GRADES_OPEN_LIBRARY_FINAL_SAFE_RECOVERY_MIN_BUDGET_MS,
              Math.max(0, delayedRetryRemainingBudgetMs - MIDDLE_GRADES_OPEN_LIBRARY_TIMEOUT_CASCADE_QUERY_FLOOR_MS),
            )
            : 0;
          if (reserveFinalSafeRecoveryBudgetMs > 0) {
            dropReasons.middle_grades_final_safe_recovery_budget_reserved = Number(dropReasons.middle_grades_final_safe_recovery_budget_reserved || 0) + 1;
          }
          const delayedRetryBudgetAfterReserveMs = Math.max(
            MIDDLE_GRADES_OPEN_LIBRARY_TIMEOUT_CASCADE_QUERY_FLOOR_MS,
            delayedRetryRemainingBudgetMs - reserveFinalSafeRecoveryBudgetMs,
          );
          const delayedRetryTimeoutMs = debugMiddleGradesDeepTrace ? middleGradesActualNetworkTimeoutMs(delayedRetryBudgetAfterReserveMs) : Math.min(MIDDLE_GRADES_OPEN_LIBRARY_PROXY_CLIENT_TIMEOUT_MS, delayedRetryBudgetAfterReserveMs);
          middleGradesDelayedRetryAttempted = true;
          middleGradesDelayedRetryTimeoutMs = delayedRetryTimeoutMs;
          const { docs: delayedRetryDocs, diagnostic } = await fetchOpenLibraryDocs(delayedRetryPlan, ageProfile.docsPerQuery, context.signal, false, delayedRetryTimeoutMs, 3, delayedRetryTimeoutMs);
          fetches.push(diagnostic);
          dropReasons.middle_grades_delayed_final_retry_attempted = Number(dropReasons.middle_grades_delayed_final_retry_attempted || 0) + 1;
          openLibraryTopUpRan = true;
          if (diagnostic.timedOut) {
            if (delayedRetryIsAntiZeroFallback) middleGradesFallbackOutcomes.push(`${delayedRetryQuery}:timed_out`);
            dropReasons.middle_grades_delayed_final_retry_timeout = Number(dropReasons.middle_grades_delayed_final_retry_timeout || 0) + 1;
            if (!failedReason) failedReason = diagnostic.failedReason || "openlibrary_fetch_timed_out";
          } else if (diagnostic.failedReason) {
            if (delayedRetryIsAntiZeroFallback) middleGradesFallbackOutcomes.push(`${delayedRetryQuery}:failed:${diagnostic.failedReason}`);
            dropReasons.middle_grades_delayed_final_retry_failed = Number(dropReasons.middle_grades_delayed_final_retry_failed || 0) + 1;
            if (!failedReason) failedReason = diagnostic.failedReason;
          } else {
            if (delayedRetryIsAntiZeroFallback) middleGradesFallbackOutcomes.push(`${delayedRetryQuery}:succeeded:${delayedRetryDocs.length}`);
            rawApiResultCount += delayedRetryDocs.length;
            for (const doc of delayedRetryDocs) {
              const title = String(doc?.title || "").trim();
              if (title) rawTitles.push(title);
              if (!title) {
                dropReasons.middle_grades_delayed_final_retry_missing_title = Number(dropReasons.middle_grades_delayed_final_retry_missing_title || 0) + 1;
                continue;
              }
              recordMiddleGradesAgeShapeDiagnostic(doc, delayedRetryQuery, "middle_grades_delayed_retry");
              const quality = shouldKeepOpenLibraryDoc(doc, delayedRetryQuery, context.profile);
              if (!quality.keep) {
                const reason = `middle_grades_delayed_final_retry_${quality.reason || "quality_filter"}`;
                dropReasons[reason] = Number(dropReasons[reason] || 0) + 1;
                if (/artifact|inappropriate|middle_grades_age_shape/.test(reason)) artifactSuppressedTitles.push(title);
                continue;
              }
              const docKey = String(doc?.key || doc?.cover_edition_key || doc?.edition_key?.[0] || `${title}:${Array.isArray(doc?.author_name) ? doc.author_name[0] : ""}`).toLowerCase();
              if (acceptedDocKeys.has(docKey)) {
                dropReasons.middle_grades_delayed_final_retry_duplicate_doc = Number(dropReasons.middle_grades_delayed_final_retry_duplicate_doc || 0) + 1;
                continue;
              }
              const seriesKey = openLibrarySeriesKey(doc);
              if (seriesKey && acceptedSeriesKeys.has(seriesKey)) {
                dropReasons.middle_grades_delayed_final_retry_series_duplicate = Number(dropReasons.middle_grades_delayed_final_retry_series_duplicate || 0) + 1;
                seriesSuppressedTitles.push(title);
                continue;
              }
              if (seriesKey) acceptedSeriesKeys.add(seriesKey);
              acceptedDocKeys.add(docKey);
              if (!shouldAcceptMiddleGradesSourceDoc(doc, delayedRetryQuery, delayedRetryPlan, "delayed_retry")) continue;
            rawItems.push(normalizeOpenLibraryDoc(doc, delayedRetryPlan));
              dropReasons.middle_grades_delayed_final_retry_accepted = Number(dropReasons.middle_grades_delayed_final_retry_accepted || 0) + 1;
              if (rawItems.length >= Math.min(ageProfile.docLimit, 5)) break;
            }
            if (delayedRetryDocs.length > 0 && !dropReasons.middle_grades_delayed_final_retry_accepted) {
              dropReasons.middle_grades_delayed_final_retry_all_rejected = Number(dropReasons.middle_grades_delayed_final_retry_all_rejected || 0) + 1;
            }
          }
        }
      }
    }

    if (ageProfile.key === "middleGrades" && !forceMiddleGradesCleanCandidateShortfallExpansion && rawItems.length < Math.min(ageProfile.docLimit, 5) && !context.signal?.aborted && !middleGradesTimeoutCircuitOpen("underfill_recovery")) {
      const attemptedMainQueries = new Set(fetches.filter((fetch) => !fetch.diagnosticOnly).map((fetch) => String(fetch.query || "").toLowerCase()));
      const repeatedTimeoutsWithoutRows = rawItems.length === 0 && fetches.filter((fetch) => !fetch.diagnosticOnly && fetch.timedOut).length >= 2;
      const recoveryQueries = repeatedTimeoutsWithoutRows ? [] : middleGradesRecoveryQueries(queryPlans)
        .filter((query) => !attemptedMainQueries.has(query.toLowerCase()));
      if (repeatedTimeoutsWithoutRows) {
        dropReasons.middle_grades_underfill_recovery_skipped_for_stable_final_fallback = Number(dropReasons.middle_grades_underfill_recovery_skipped_for_stable_final_fallback || 0) + 1;
      }
      const recoveryTarget = Math.min(ageProfile.docLimit, 5);
      for (const recoveryQuery of recoveryQueries) {
        if (middleGradesTimeoutCircuitOpen("underfill_recovery")) break;
        const elapsedBeforeRecoveryMs = Date.now() - Date.parse(startedAt);
        const remainingBudgetMs = sourceBudgetMs - elapsedBeforeRecoveryMs;
        const reserveFinalSafeRecoveryMs = !debugMiddleGradesDeepTrace && rawItems.length === 0 ? MIDDLE_GRADES_OPEN_LIBRARY_FINAL_SAFE_RECOVERY_MIN_BUDGET_MS : 0;
        const recoveryUsableBudgetMs = remainingBudgetMs - reserveFinalSafeRecoveryMs;
        if (!debugMiddleGradesDeepTrace && recoveryUsableBudgetMs < MIDDLE_GRADES_OPEN_LIBRARY_TIMEOUT_CASCADE_QUERY_FLOOR_MS) {
          dropReasons.middle_grades_underfill_recovery_source_budget_exhausted = Number(dropReasons.middle_grades_underfill_recovery_source_budget_exhausted || 0) + 1;
          break;
        }
        const recoveryTimeoutMs = debugMiddleGradesDeepTrace ? middleGradesActualNetworkTimeoutMs(recoveryUsableBudgetMs) : Math.min(MIDDLE_GRADES_OPEN_LIBRARY_PROXY_CLIENT_TIMEOUT_MS, Math.max(MIDDLE_GRADES_OPEN_LIBRARY_TIMEOUT_CASCADE_QUERY_FLOOR_MS, recoveryUsableBudgetMs));
        const recoveryPlan: OpenLibraryQueryPlan = {
          query: recoveryQuery,
          originalPlannedQuery: queries[0] || "",
          queryCascadeIndex: queryPlans.length + fetches.filter((fetch) => !fetch.diagnosticOnly).length,
          queryFamily: queryFamilyForOpenLibraryQuery(recoveryQuery),
          facets: queryPlans[0]?.facets || [],
          routingReason: `${queryPlans[0]?.routingReason || "middle_grades"}_age_anchored_recovery`,
        };
        const { docs: recoveryDocs, diagnostic } = await fetchOpenLibraryDocs(recoveryPlan, ageProfile.docsPerQuery, context.signal, false, recoveryTimeoutMs, 1, recoveryTimeoutMs);
        fetches.push(diagnostic);
        dropReasons.middle_grades_recovery_query_attempted = Number(dropReasons.middle_grades_recovery_query_attempted || 0) + 1;
        if (diagnostic.timedOut) {
          dropReasons.middle_grades_recovery_timeout = Number(dropReasons.middle_grades_recovery_timeout || 0) + 1;
          if (context.signal?.aborted) break;
          continue;
        }
        if (diagnostic.failedReason) {
          dropReasons.middle_grades_recovery_failed = Number(dropReasons.middle_grades_recovery_failed || 0) + 1;
          continue;
        }
        rawApiResultCount += recoveryDocs.length;
        for (const doc of recoveryDocs) {
          const title = String(doc?.title || "").trim();
          if (title) rawTitles.push(title);
          if (!title) {
            dropReasons.middle_grades_recovery_missing_title = Number(dropReasons.middle_grades_recovery_missing_title || 0) + 1;
            continue;
          }
          recordMiddleGradesAgeShapeDiagnostic(doc, recoveryQuery, "recovery");
          const quality = shouldKeepOpenLibraryDoc(doc, recoveryQuery, context.profile);
          if (!quality.keep) {
            const reason = `middle_grades_recovery_${quality.reason || "quality_filter"}`;
            dropReasons[reason] = Number(dropReasons[reason] || 0) + 1;
            if (/artifact|inappropriate|middle_grades_age_shape/.test(reason)) artifactSuppressedTitles.push(title);
            continue;
          }
          const docKey = String(doc?.key || doc?.cover_edition_key || doc?.edition_key?.[0] || `${title}:${Array.isArray(doc?.author_name) ? doc.author_name[0] : ""}`).toLowerCase();
          if (acceptedDocKeys.has(docKey)) {
            dropReasons.middle_grades_recovery_duplicate_doc = Number(dropReasons.middle_grades_recovery_duplicate_doc || 0) + 1;
            continue;
          }
          const seriesKey = openLibrarySeriesKey(doc);
          if (seriesKey && acceptedSeriesKeys.has(seriesKey)) {
            dropReasons.middle_grades_recovery_series_duplicate = Number(dropReasons.middle_grades_recovery_series_duplicate || 0) + 1;
            seriesSuppressedTitles.push(title);
            continue;
          }
          if (seriesKey) acceptedSeriesKeys.add(seriesKey);
          acceptedDocKeys.add(docKey);
          if (!shouldAcceptMiddleGradesSourceDoc(doc, recoveryQuery, recoveryPlan, "recovery")) continue;
          rawItems.push(normalizeOpenLibraryDoc(doc, recoveryPlan));
          if (middleGradesRejectedAllRowsAsQueryOnly) {
            if (!middleGradesContinuedAfterQueryOnlyRejectionQueries.includes(recoveryQuery)) middleGradesContinuedAfterQueryOnlyRejectionQueries.push(recoveryQuery);
            middleGradesContinuedAfterQueryOnlyRejectionAcceptedCount += 1;
          }
          dropReasons.middle_grades_recovery_accepted = Number(dropReasons.middle_grades_recovery_accepted || 0) + 1;
          if (rawItems.length >= recoveryTarget) break;
        }
        if (rawItems.length >= recoveryTarget) break;
      }
      if (recoveryQueries.length > 0) {
        openLibraryTopUpRan = true;
        if (rawItems.length < recoveryTarget) {
          dropReasons.middle_grades_recovery_exhausted = Number(dropReasons.middle_grades_recovery_exhausted || 0) + 1;
        }
      }
    }

    if (ageProfile.key === "middleGrades" && rawItems.length === 0 && !context.signal?.aborted && !middleGradesTimeoutCircuitOpen("final_safe_recovery")) {
      const realFetches = fetches.filter((fetch) => !fetch.diagnosticOnly);
      const allRealFetchesTimedOut = realFetches.length > 0 && realFetches.every((fetch) => fetch.timedOut);
      const attemptedRealQueries = new Set(realFetches.map((fetch) => String(fetch.query || "").toLowerCase()));
      const rejectedRowsAntiZeroFallbackQuery = middleGradesRejectedRowsAntiZeroFallbackQuery(queryPlans, attemptedRealQueries, realFetches);
      const signalShapedFinalSafeFallback = middleGradesSignalShapedAntiZeroFallback(queryPlans, attemptedRealQueries, context.profile);
      const finalSafeQuery = signalShapedFinalSafeFallback?.query || rejectedRowsAntiZeroFallbackQuery || middleGradesZeroCandidateFallbackQuery(queryPlans, attemptedRealQueries);
      rememberMiddleGradesAntiZeroFallbackShape(signalShapedFinalSafeFallback);
      const shouldRunFinalSafeRecovery = allRealFetchesTimedOut || Boolean(rejectedRowsAntiZeroFallbackQuery);
      const elapsedBeforeFinalSafeRecoveryMs = Date.now() - Date.parse(startedAt);
      const remainingFinalSafeRecoveryBudgetMs = sourceBudgetMs - elapsedBeforeFinalSafeRecoveryMs;
      if (!debugMiddleGradesDeepTrace && shouldRunFinalSafeRecovery && finalSafeQuery && !attemptedRealQueries.has(finalSafeQuery.toLowerCase()) && remainingFinalSafeRecoveryBudgetMs < MIDDLE_GRADES_OPEN_LIBRARY_FINAL_SAFE_RECOVERY_MIN_BUDGET_MS) {
        middleGradesRecoverySkippedInsufficientBudget = true;
        middleGradesActualRemainingBudgetBeforeRecoveryMs = remainingFinalSafeRecoveryBudgetMs;
        dropReasons.budget_exhausted_before_viable_recovery = Number(dropReasons.budget_exhausted_before_viable_recovery || 0) + 1;
      }
      if (shouldRunFinalSafeRecovery && finalSafeQuery && !attemptedRealQueries.has(finalSafeQuery.toLowerCase()) && (debugMiddleGradesDeepTrace || remainingFinalSafeRecoveryBudgetMs >= MIDDLE_GRADES_OPEN_LIBRARY_FINAL_SAFE_RECOVERY_MIN_BUDGET_MS)) {
        markMiddleGradesFallbackStarted();
        middleGradesFallbackAttemptOrder.push(finalSafeQuery);
        middleGradesRemainingBudgetBeforeEachFallback[finalSafeQuery] = remainingFinalSafeRecoveryBudgetMs;
        const finalSafeTimeoutMs = debugMiddleGradesDeepTrace ? middleGradesActualNetworkTimeoutMs(remainingFinalSafeRecoveryBudgetMs) : Math.min(MIDDLE_GRADES_OPEN_LIBRARY_PROXY_CLIENT_TIMEOUT_MS, remainingFinalSafeRecoveryBudgetMs);
        const finalSafePlan: OpenLibraryQueryPlan = {
          query: finalSafeQuery,
          originalPlannedQuery: queries[0] || "",
          queryCascadeIndex: queryPlans.length + realFetches.length,
          queryFamily: queryFamilyForOpenLibraryQuery(finalSafeQuery),
          facets: queryPlans[0]?.facets || [],
          routingReason: `${queryPlans[0]?.routingReason || "middle_grades"}_final_safe_recovery`,
          routingDominance: queryPlans[0]?.routingDominance,
          emergencyFallback: true,
          fallbackAlignment: "anti_zero",
        };
        const { docs: finalSafeDocs, diagnostic } = await fetchOpenLibraryDocs(finalSafePlan, ageProfile.docsPerQuery, context.signal, false, finalSafeTimeoutMs, 1, finalSafeTimeoutMs);
        fetches.push(diagnostic);
        dropReasons.middle_grades_final_safe_recovery_attempted = Number(dropReasons.middle_grades_final_safe_recovery_attempted || 0) + 1;
        if (diagnostic.timedOut) {
          middleGradesFallbackOutcomes.push(`${finalSafeQuery}:timed_out`);
          dropReasons.middle_grades_final_safe_recovery_timeout = Number(dropReasons.middle_grades_final_safe_recovery_timeout || 0) + 1;
        } else if (diagnostic.failedReason) {
          middleGradesFallbackOutcomes.push(`${finalSafeQuery}:failed:${diagnostic.failedReason}`);
          dropReasons.middle_grades_final_safe_recovery_failed = Number(dropReasons.middle_grades_final_safe_recovery_failed || 0) + 1;
        } else {
          middleGradesFallbackOutcomes.push(`${finalSafeQuery}:succeeded:${finalSafeDocs.length}`);
          rawApiResultCount += finalSafeDocs.length;
          for (const doc of finalSafeDocs) {
            const title = String(doc?.title || "").trim();
            if (title) rawTitles.push(title);
            if (!title) continue;
            recordMiddleGradesAgeShapeDiagnostic(doc, finalSafeQuery, "middle_grades_final_safe_recovery");
            const quality = shouldKeepOpenLibraryDoc(doc, finalSafeQuery, context.profile);
            if (!quality.keep) {
              const reason = `middle_grades_final_safe_recovery_${quality.reason || "quality_filter"}`;
              dropReasons[reason] = Number(dropReasons[reason] || 0) + 1;
              if (/artifact|inappropriate|middle_grades_age_shape/.test(reason)) artifactSuppressedTitles.push(title);
              continue;
            }
            const docKey = String(doc?.key || doc?.cover_edition_key || doc?.edition_key?.[0] || `${title}:${Array.isArray(doc?.author_name) ? doc.author_name[0] : ""}`).toLowerCase();
            if (acceptedDocKeys.has(docKey)) {
              dropReasons.middle_grades_final_safe_recovery_duplicate_doc = Number(dropReasons.middle_grades_final_safe_recovery_duplicate_doc || 0) + 1;
              continue;
            }
            const seriesKey = openLibrarySeriesKey(doc);
            if (seriesKey && acceptedSeriesKeys.has(seriesKey)) {
              dropReasons.middle_grades_final_safe_recovery_series_duplicate = Number(dropReasons.middle_grades_final_safe_recovery_series_duplicate || 0) + 1;
              seriesSuppressedTitles.push(title);
              continue;
            }
            if (seriesKey) acceptedSeriesKeys.add(seriesKey);
            acceptedDocKeys.add(docKey);
            if (!shouldAcceptMiddleGradesSourceDoc(doc, finalSafeQuery, finalSafePlan, "final_safe_recovery")) continue;
            rawItems.push(normalizeOpenLibraryDoc(doc, finalSafePlan));
            dropReasons.middle_grades_final_safe_recovery_accepted = Number(dropReasons.middle_grades_final_safe_recovery_accepted || 0) + 1;
            if (rawItems.length >= Math.min(ageProfile.docLimit, 5)) break;
          }
        }
      }
    }

    if (ageProfile.key === "middleGrades" && debugMiddleGradesDeepTrace && rawItems.length > 0 && middleGradesMediumStrongRawItems().length < middleGradesMediumStrongEvidenceTargetCount && !context.signal?.aborted && !middleGradesTimeoutCircuitOpen("medium_strong_evidence_search")) {
      const evidenceQueries = uniqueStrings([
        ...middleGradesUnattemptedEvidenceAwareQueries(),
        ...middleGradesUnattemptedReliableVariantQueries(),
        ...middleGradesUnattemptedSpecificQueries(),
      ], 24);
      if (evidenceQueries.length > 0) {
        middleGradesMediumStrongEvidenceSearchContinued = true;
        middleGradesEvidenceAwareRecoveryAttempted = true;
      }
      for (const evidenceQuery of evidenceQueries) {
        if (middleGradesTimeoutCircuitOpen("medium_strong_evidence_search")) break;
        if (middleGradesMediumStrongRawItems().length >= middleGradesMediumStrongEvidenceTargetCount) break;
        if (!middleGradesMediumStrongEvidenceQueriesAttempted.includes(evidenceQuery)) middleGradesMediumStrongEvidenceQueriesAttempted.push(evidenceQuery);
        if (!middleGradesEvidenceAwareRecoveryQueriesAttempted.includes(evidenceQuery)) middleGradesEvidenceAwareRecoveryQueriesAttempted.push(evidenceQuery);
        const evidencePlan: OpenLibraryQueryPlan = {
          query: evidenceQuery,
          originalPlannedQuery: queries[0] || "",
          queryCascadeIndex: queryPlans.length + fetches.filter((fetch) => !fetch.diagnosticOnly).length,
          queryFamily: queryFamilyForOpenLibraryQuery(evidenceQuery),
          facets: queryPlans[0]?.facets || [],
          routingReason: `${queryPlans[0]?.routingReason || "middle_grades"}_medium_strong_evidence_search`,
          routingDominance: queryPlans[0]?.routingDominance,
          fallbackAlignment: "route_aligned",
          profileSpecific: true,
        };
        const evidenceTimeoutMs = middleGradesActualNetworkTimeoutMs();
        const { docs: evidenceDocs, diagnostic } = await fetchOpenLibraryDocs(evidencePlan, ageProfile.docsPerQuery, context.signal, false, evidenceTimeoutMs, 1, evidenceTimeoutMs);
        fetches.push(diagnostic);
        dropReasons.middle_grades_medium_strong_evidence_search_attempted = Number(dropReasons.middle_grades_medium_strong_evidence_search_attempted || 0) + 1;
        if (diagnostic.timedOut) {
          dropReasons.middle_grades_medium_strong_evidence_search_timeout = Number(dropReasons.middle_grades_medium_strong_evidence_search_timeout || 0) + 1;
          continue;
        }
        if (diagnostic.failedReason) {
          dropReasons.middle_grades_medium_strong_evidence_search_failed = Number(dropReasons.middle_grades_medium_strong_evidence_search_failed || 0) + 1;
          continue;
        }
        rawApiResultCount += evidenceDocs.length;
        for (const doc of evidenceDocs) {
          const title = String(doc?.title || "").trim();
          if (title) rawTitles.push(title);
          if (!title) continue;
          recordMiddleGradesAgeShapeDiagnostic(doc, evidenceQuery, "middle_grades_medium_strong_evidence_search");
          const quality = shouldKeepOpenLibraryDoc(doc, evidenceQuery, context.profile);
          if (!quality.keep) {
            const reason = `middle_grades_medium_strong_evidence_search_${quality.reason || "quality_filter"}`;
            dropReasons[reason] = Number(dropReasons[reason] || 0) + 1;
            if (/artifact|inappropriate|middle_grades_age_shape/.test(reason)) artifactSuppressedTitles.push(title);
            continue;
          }
          if (!middleGradesSourceMediumStrongEvidence(doc, evidenceQuery, String(evidencePlan.routingReason || ""))) {
            dropReasons.middle_grades_medium_strong_evidence_search_weak_doc = Number(dropReasons.middle_grades_medium_strong_evidence_search_weak_doc || 0) + 1;
            continue;
          }
          const docKey = String(doc?.key || doc?.cover_edition_key || doc?.edition_key?.[0] || `${title}:${Array.isArray(doc?.author_name) ? doc.author_name[0] : ""}`).toLowerCase();
          if (acceptedDocKeys.has(docKey)) {
            dropReasons.middle_grades_medium_strong_evidence_search_duplicate_doc = Number(dropReasons.middle_grades_medium_strong_evidence_search_duplicate_doc || 0) + 1;
            continue;
          }
          const seriesKey = openLibrarySeriesKey(doc);
          if (seriesKey && acceptedSeriesKeys.has(seriesKey)) {
            dropReasons.middle_grades_medium_strong_evidence_search_series_duplicate = Number(dropReasons.middle_grades_medium_strong_evidence_search_series_duplicate || 0) + 1;
            seriesSuppressedTitles.push(title);
            continue;
          }
          if (!shouldAcceptMiddleGradesSourceDoc(doc, evidenceQuery, evidencePlan, "medium_strong_evidence_search")) continue;
          if (!reserveCollectionRoot(doc, title, "medium_strong_evidence_search")) continue;
          if (seriesKey) acceptedSeriesKeys.add(seriesKey);
          acceptedDocKeys.add(docKey);
          rawItems.push(normalizeOpenLibraryDoc(doc, evidencePlan));
          middleGradesMediumStrongEvidenceAcceptedTitles.push(title);
          middleGradesEvidenceAwareRecoveryAcceptedCount += 1;
          dropReasons.middle_grades_medium_strong_evidence_search_accepted = Number(dropReasons.middle_grades_medium_strong_evidence_search_accepted || 0) + 1;
          if (middleGradesMediumStrongRawItems().length >= middleGradesMediumStrongEvidenceTargetCount) break;
          if (rawItems.length >= middleGradesCandidatePoolLimit && middleGradesMediumStrongRawItems().length >= middleGradesMediumStrongEvidenceTargetCount) break;
        }
      }
      if (middleGradesMediumStrongRawItems().length < middleGradesMediumStrongEvidenceTargetCount) {
        middleGradesWeakEvidenceFinalizedBecause = evidenceQueries.length > 0
          ? "medium_strong_evidence_queries_exhausted_before_target"
          : "no_unattempted_evidence_aware_queries_remaining";
        middleGradesWeakEvidenceReturnedOnlyAfterEvidenceSearchExhausted = true;
      }
    }

    if (ageProfile.key === "middleGrades" && !forceMiddleGradesCleanCandidateShortfallExpansion && rawItems.length > 0 && !context.signal?.aborted && !middleGradesTimeoutCircuitOpen("post_fallback_route_recovery")) {
      const fallbackOnlySoFar = rawItems.every((item: any) => item?.fallbackAlignment === "anti_zero" || item?.emergencyFallback);
      if (fallbackOnlySoFar) {
        const attemptedRealQueriesAfterFallback = new Set(fetches.filter((fetch) => !fetch.diagnosticOnly).map((fetch) => String(fetch.query || "").toLowerCase()));
        const routeAlignedAfterFallbackQuery = middleGradesRouteAlignedRecoveryQuery(queryPlans, attemptedRealQueriesAfterFallback);
        const elapsedBeforeRouteAlignedAfterFallbackMs = Date.now() - Date.parse(startedAt);
        const remainingRouteAlignedAfterFallbackBudgetMs = sourceBudgetMs - elapsedBeforeRouteAlignedAfterFallbackMs;
        if (!routeAlignedAfterFallbackQuery) {
          middleGradesRouteAlignedRecoverySkippedReason = "no_unattempted_route_aligned_query";
        } else if (!debugMiddleGradesDeepTrace && remainingRouteAlignedAfterFallbackBudgetMs < MIDDLE_GRADES_OPEN_LIBRARY_POST_FALLBACK_ROUTE_RECOVERY_MIN_BUDGET_MS) {
          middleGradesRouteAlignedRecoverySkippedReason = "insufficient_budget_after_fallback";
        } else {
          middleGradesRouteAlignedRecoveryAttemptedAfterFallback = true;
          const routeAlignedAfterFallbackTimeoutMs = debugMiddleGradesDeepTrace ? middleGradesActualNetworkTimeoutMs(remainingRouteAlignedAfterFallbackBudgetMs) : Math.min(MIDDLE_GRADES_OPEN_LIBRARY_PROXY_CLIENT_TIMEOUT_MS, remainingRouteAlignedAfterFallbackBudgetMs);
          const routeAlignedAfterFallbackPlan: OpenLibraryQueryPlan = {
            query: routeAlignedAfterFallbackQuery,
            originalPlannedQuery: queries[0] || "",
            queryCascadeIndex: queryPlans.length + fetches.filter((fetch) => !fetch.diagnosticOnly).length,
            queryFamily: queryFamilyForOpenLibraryQuery(routeAlignedAfterFallbackQuery),
            facets: queryPlans[0]?.facets || [],
            routingReason: `${queryPlans[0]?.routingReason || "middle_grades"}_post_fallback_route_recovery`,
            routingDominance: queryPlans[0]?.routingDominance,
            fallbackAlignment: "route_aligned",
          };
          const { docs: routeAlignedAfterFallbackDocs, diagnostic } = await fetchOpenLibraryDocs(routeAlignedAfterFallbackPlan, ageProfile.docsPerQuery, context.signal, false, routeAlignedAfterFallbackTimeoutMs, 1, routeAlignedAfterFallbackTimeoutMs);
          fetches.push(diagnostic);
          dropReasons.middle_grades_post_fallback_route_recovery_attempted = Number(dropReasons.middle_grades_post_fallback_route_recovery_attempted || 0) + 1;
          if (diagnostic.timedOut) {
            dropReasons.middle_grades_post_fallback_route_recovery_timeout = Number(dropReasons.middle_grades_post_fallback_route_recovery_timeout || 0) + 1;
          } else if (diagnostic.failedReason) {
            dropReasons.middle_grades_post_fallback_route_recovery_failed = Number(dropReasons.middle_grades_post_fallback_route_recovery_failed || 0) + 1;
          } else {
            rawApiResultCount += routeAlignedAfterFallbackDocs.length;
            for (const doc of routeAlignedAfterFallbackDocs) {
              const title = String(doc?.title || "").trim();
              if (title) rawTitles.push(title);
              if (!title) continue;
              recordMiddleGradesAgeShapeDiagnostic(doc, routeAlignedAfterFallbackQuery, "middle_grades_post_fallback_route_recovery");
              const quality = shouldKeepOpenLibraryDoc(doc, routeAlignedAfterFallbackQuery, context.profile);
              if (!quality.keep) {
                const reason = `middle_grades_post_fallback_route_recovery_${quality.reason || "quality_filter"}`;
                dropReasons[reason] = Number(dropReasons[reason] || 0) + 1;
                if (/artifact|inappropriate|middle_grades_age_shape/.test(reason)) artifactSuppressedTitles.push(title);
                continue;
              }
              const docKey = String(doc?.key || doc?.cover_edition_key || doc?.edition_key?.[0] || `${title}:${Array.isArray(doc?.author_name) ? doc.author_name[0] : ""}`).toLowerCase();
              if (acceptedDocKeys.has(docKey)) {
                dropReasons.middle_grades_post_fallback_route_recovery_duplicate_doc = Number(dropReasons.middle_grades_post_fallback_route_recovery_duplicate_doc || 0) + 1;
                continue;
              }
              const seriesKey = openLibrarySeriesKey(doc);
              if (seriesKey && acceptedSeriesKeys.has(seriesKey)) {
                dropReasons.middle_grades_post_fallback_route_recovery_series_duplicate = Number(dropReasons.middle_grades_post_fallback_route_recovery_series_duplicate || 0) + 1;
                seriesSuppressedTitles.push(title);
                continue;
              }
              if (seriesKey) acceptedSeriesKeys.add(seriesKey);
              acceptedDocKeys.add(docKey);
              if (!shouldAcceptMiddleGradesSourceDoc(doc, routeAlignedAfterFallbackQuery, routeAlignedAfterFallbackPlan, "post_fallback_route_recovery")) continue;
              if (!reserveCollectionRoot(doc, title, "post_fallback_route_recovery")) continue;
              rawItems.push(normalizeOpenLibraryDoc(doc, routeAlignedAfterFallbackPlan));
              dropReasons.middle_grades_post_fallback_route_recovery_accepted = Number(dropReasons.middle_grades_post_fallback_route_recovery_accepted || 0) + 1;
              if (rawItems.length >= Math.min(ageProfile.docLimit, 5)) break;
            }
          }
        }
      }
    }


    if (ageProfile.key === "middleGrades" && !forceMiddleGradesCleanCandidateShortfallExpansion && rawItems.length < Math.min(ageProfile.docLimit, 5) && !context.signal?.aborted && !middleGradesTimeoutCircuitOpen("underfill_safe_recovery")) {
      const underfillTarget = Math.min(ageProfile.docLimit, 5);
      const startedUnderfillAtFour = rawItems.length === 4;
      const attemptedQueries = new Set(fetches.filter((fetch) => !fetch.diagnosticOnly).map((fetch) => String(fetch.query || "").toLowerCase()));
      const targetedUnderfillQueries = middleGradesTargetedQueriesForRun.filter((query) => !attemptedQueries.has(query.toLowerCase()));
      const evidenceUnderfillQueries = middleGradesEvidenceAwareRecoveryQueries(queryPlans, context.profile, attemptedQueries);
      const safeRecoveryQueries = uniqueStrings([...targetedUnderfillQueries, ...evidenceUnderfillQueries, ...middleGradesUnderfillSafeRecoveryQueries(queryPlans, attemptedQueries)], 16);
      if (startedUnderfillAtFour && safeRecoveryQueries.length > 0) middleGradesUnderfilledAtFourDespiteAlignedCandidates = true;
      if (!safeRecoveryQueries.length) middleGradesUnderfillSafeRecoverySkippedReason = "no_unattempted_reliable_underfill_query";
      for (const underfillQuery of safeRecoveryQueries) {
        if (middleGradesTimeoutCircuitOpen("underfill_safe_recovery")) break;
        if (rawItems.length >= underfillTarget || context.signal?.aborted) break;
        const remainingUnderfillBudgetMs = sourceBudgetMs - (Date.now() - Date.parse(startedAt));
        if (!debugMiddleGradesDeepTrace && remainingUnderfillBudgetMs < MIDDLE_GRADES_OPEN_LIBRARY_FINAL_SAFE_RECOVERY_MIN_BUDGET_MS) {
          middleGradesUnderfillSafeRecoverySkippedReason = "insufficient_budget";
          break;
        }
        middleGradesUnderfillSafeRecoveryAttempted = true;
        if (middleGradesUnderfilledAfterDirectUsableDocs) middleGradesDirectUsableDocsButRecoveryContinued = true;
        if (startedUnderfillAtFour) middleGradesUnderfillRecoveryAttemptedAfterFour = true;
        middleGradesUnderfillSafeRecoveryQueriesAttempted.push(underfillQuery);
        if (middleGradesSameFamilyContinuationQuerySet.has(underfillQuery.toLowerCase()) && !middleGradesSameFamilyContinuationQueriesAttempted.includes(underfillQuery)) {
          middleGradesSameFamilyContinuationQueriesAttempted.push(underfillQuery);
        }
        const underfillQueryIsTargeted = middleGradesTargetedQuerySet.has(underfillQuery.toLowerCase());
        if (underfillQueryIsTargeted) {
          if (!middleGradesTargetedQueriesAttempted.includes(underfillQuery)) middleGradesTargetedQueriesAttempted.push(underfillQuery);
          if (!middleGradesEvidenceAwareRecoveryQueriesAttempted.includes(underfillQuery)) middleGradesEvidenceAwareRecoveryQueriesAttempted.push(underfillQuery);
          middleGradesEvidenceAwareRecoveryAttempted = true;
        }
        const underfillTimeoutMs = debugMiddleGradesDeepTrace ? middleGradesActualNetworkTimeoutMs(remainingUnderfillBudgetMs) : Math.min(MIDDLE_GRADES_OPEN_LIBRARY_PROXY_CLIENT_TIMEOUT_MS, remainingUnderfillBudgetMs);
        const underfillQueryIsLastResortGeneric = /^middle grade adventure$/i.test(underfillQuery);
        const underfillPlan: OpenLibraryQueryPlan = {
          query: underfillQuery,
          originalPlannedQuery: queries[0] || "",
          queryCascadeIndex: queryPlans.length + fetches.filter((fetch) => !fetch.diagnosticOnly).length,
          queryFamily: queryFamilyForOpenLibraryQuery(underfillQuery),
          facets: queryPlans[0]?.facets || [],
          routingReason: `${queryPlans[0]?.routingReason || "middle_grades"}_underfill_safe_recovery`,
          routingDominance: queryPlans[0]?.routingDominance,
          emergencyFallback: underfillQueryIsLastResortGeneric,
          fallbackAlignment: underfillQueryIsLastResortGeneric ? "anti_zero" : "route_aligned",
        };
        const { docs: underfillDocs, diagnostic } = await fetchOpenLibraryDocs(underfillPlan, ageProfile.docsPerQuery, context.signal, false, underfillTimeoutMs, 1, underfillTimeoutMs);
        fetches.push(diagnostic);
        dropReasons.middle_grades_underfill_safe_recovery_attempted = Number(dropReasons.middle_grades_underfill_safe_recovery_attempted || 0) + 1;
        if (diagnostic.timedOut) {
          dropReasons.middle_grades_underfill_safe_recovery_timeout = Number(dropReasons.middle_grades_underfill_safe_recovery_timeout || 0) + 1;
          continue;
        }
        if (diagnostic.failedReason) {
          dropReasons.middle_grades_underfill_safe_recovery_failed = Number(dropReasons.middle_grades_underfill_safe_recovery_failed || 0) + 1;
          continue;
        }
        rawApiResultCount += underfillDocs.length;
        for (const doc of underfillDocs) {
          const title = String(doc?.title || "").trim();
          if (title) rawTitles.push(title);
          if (!title) continue;
          recordMiddleGradesAgeShapeDiagnostic(doc, underfillQuery, "middle_grades_underfill_safe_recovery");
          const quality = shouldKeepOpenLibraryDoc(doc, underfillQuery, context.profile);
          if (!quality.keep) {
            const reason = `middle_grades_underfill_safe_recovery_${quality.reason || "quality_filter"}`;
            dropReasons[reason] = Number(dropReasons[reason] || 0) + 1;
            if (underfillQueryIsTargeted) middleGradesTargetedQueriesRejectedByReason[quality.reason || "quality_filter"] = Number(middleGradesTargetedQueriesRejectedByReason[quality.reason || "quality_filter"] || 0) + 1;
            if (/artifact|inappropriate|middle_grades_age_shape/.test(reason)) artifactSuppressedTitles.push(title);
            continue;
          }
          const docKey = String(doc?.key || doc?.cover_edition_key || doc?.edition_key?.[0] || `${title}:${Array.isArray(doc?.author_name) ? doc.author_name[0] : ""}`).toLowerCase();
          if (acceptedDocKeys.has(docKey)) {
            dropReasons.middle_grades_underfill_safe_recovery_duplicate_doc = Number(dropReasons.middle_grades_underfill_safe_recovery_duplicate_doc || 0) + 1;
            continue;
          }
          const seriesKey = openLibrarySeriesKey(doc);
          if (seriesKey && acceptedSeriesKeys.has(seriesKey)) {
            dropReasons.middle_grades_underfill_safe_recovery_series_duplicate = Number(dropReasons.middle_grades_underfill_safe_recovery_series_duplicate || 0) + 1;
            seriesSuppressedTitles.push(title);
            continue;
          }
          if (seriesKey) acceptedSeriesKeys.add(seriesKey);
          acceptedDocKeys.add(docKey);
          if (!shouldAcceptMiddleGradesSourceDoc(doc, underfillQuery, underfillPlan, "underfill_safe_recovery")) {
            if (underfillQueryIsTargeted) middleGradesTargetedQueriesRejectedByReason.query_only_or_missing_document_evidence = Number(middleGradesTargetedQueriesRejectedByReason.query_only_or_missing_document_evidence || 0) + 1;
            continue;
          }
          if (!reserveCollectionRoot(doc, title, "underfill_safe_recovery")) continue;
          rawItems.push(normalizeOpenLibraryDoc(doc, underfillPlan));
          if (underfillQueryIsTargeted) {
            middleGradesTargetedQueriesAcceptedCount += 1;
            middleGradesEvidenceAwareRecoveryAcceptedCount += 1;
          }
          if (middleGradesRejectedAllRowsAsQueryOnly) {
            if (!middleGradesContinuedAfterQueryOnlyRejectionQueries.includes(underfillQuery)) middleGradesContinuedAfterQueryOnlyRejectionQueries.push(underfillQuery);
            middleGradesContinuedAfterQueryOnlyRejectionAcceptedCount += 1;
          }
          middleGradesUnderfillSafeRecoveryAcceptedCount += 1;
          if (startedUnderfillAtFour) middleGradesUnderfillRecoveryAcceptedAfterFour += 1;
          dropReasons.middle_grades_underfill_safe_recovery_accepted = Number(dropReasons.middle_grades_underfill_safe_recovery_accepted || 0) + 1;
          if (rawItems.length >= underfillTarget) break;
        }
      }
      if (!middleGradesUnderfillSafeRecoverySkippedReason && rawItems.length < underfillTarget && middleGradesUnderfillSafeRecoveryAttempted) middleGradesUnderfillSafeRecoverySkippedReason = "reliable_underfill_queries_exhausted";
    }

    if (ageProfile.key === "middleGrades" && !forceMiddleGradesCleanCandidateShortfallExpansion && rawItems.length > 0 && !context.signal?.aborted && !middleGradesTimeoutCircuitOpen("lock_quality_retry")) {
      const routeAlignedCountNow = rawItems.filter((item: any) => item?.fallbackAlignment !== "anti_zero" && !item?.emergencyFallback).length;
      const fallbackOnlyNow = rawItems.length > 0 && routeAlignedCountNow === 0;
      const genericDefaultNow = rawItems.filter((item: any) => /\b(humor|funny|school story|school adventure|adventure)\b/i.test(String(item?.queryText || item?.queryFamily || "")) && !/\b(friendship|family|contemporary|realistic|mystery|ai|robot|superhero|science|ocean|animal|nature)\b/i.test([item?.title, item?.subtitle, item?.subjects, item?.description].flat().join(" "))).length >= Math.min(4, rawItems.length);
      const shouldRetryForLockQuality = fallbackOnlyNow || genericDefaultNow || routeAlignedCountNow < 3;
      if (shouldRetryForLockQuality) {
        const attemptedQueries = new Set(fetches.filter((fetch) => !fetch.diagnosticOnly).map((fetch) => String(fetch.query || "").toLowerCase()));
        const retryQueries = middleGradesProfileSpecificQueries(context.profile)
          .filter((query) => !attemptedQueries.has(query.toLowerCase()))
          .slice(0, 3);
        if (retryQueries.length === 0) {
          middleGradesFinalReturnedDespiteLockQualityFailReason = fallbackOnlyNow
            ? "fallback_only_no_unattempted_profile_specific_query"
            : genericDefaultNow
              ? "generic_default_no_unattempted_profile_specific_query"
              : "low_route_aligned_count_no_unattempted_profile_specific_query";
        }
        for (const retryQuery of retryQueries) {
          if (middleGradesTimeoutCircuitOpen("lock_quality_retry")) break;
          const remainingRetryBudgetMs = sourceBudgetMs - (Date.now() - Date.parse(startedAt));
          if (!debugMiddleGradesDeepTrace && remainingRetryBudgetMs < MIDDLE_GRADES_OPEN_LIBRARY_POST_FALLBACK_ROUTE_RECOVERY_MIN_BUDGET_MS) {
            middleGradesFinalReturnedDespiteLockQualityFailReason = "insufficient_budget_for_lock_quality_retry";
            break;
          }
          middleGradesLockQualityRetryAttempted = true;
          middleGradesLockQualityRetryQueries.push(retryQuery);
          middleGradesProfileSpecificQueriesAttempted.push(retryQuery);
          const retryQueryIsTargeted = middleGradesTargetedQuerySet.has(retryQuery.toLowerCase());
          if (retryQueryIsTargeted) {
            if (!middleGradesTargetedQueriesAttempted.includes(retryQuery)) middleGradesTargetedQueriesAttempted.push(retryQuery);
            if (!middleGradesEvidenceAwareRecoveryQueriesAttempted.includes(retryQuery)) middleGradesEvidenceAwareRecoveryQueriesAttempted.push(retryQuery);
            middleGradesEvidenceAwareRecoveryAttempted = true;
          }
          const retryPlan: OpenLibraryQueryPlan = {
            query: retryQuery,
            originalPlannedQuery: queries[0] || "",
            queryCascadeIndex: queryPlans.length + fetches.filter((fetch) => !fetch.diagnosticOnly).length,
            queryFamily: queryFamilyForOpenLibraryQuery(retryQuery),
            facets: queryPlans[0]?.facets || [],
            routingReason: `${queryPlans[0]?.routingReason || "middle_grades"}_lock_quality_retry`,
            routingDominance: queryPlans[0]?.routingDominance,
            fallbackAlignment: "route_aligned",
            profileSpecific: true,
          };
          const retryTimeoutMs = debugMiddleGradesDeepTrace ? middleGradesActualNetworkTimeoutMs(remainingRetryBudgetMs) : Math.min(MIDDLE_GRADES_OPEN_LIBRARY_PROXY_CLIENT_TIMEOUT_MS, remainingRetryBudgetMs);
          const { docs: retryDocs, diagnostic } = await fetchOpenLibraryDocs(retryPlan, ageProfile.docsPerQuery, context.signal, false, retryTimeoutMs, 1, retryTimeoutMs);
          fetches.push(diagnostic);
          dropReasons.middle_grades_lock_quality_retry_attempted = Number(dropReasons.middle_grades_lock_quality_retry_attempted || 0) + 1;
          if (diagnostic.timedOut) {
            dropReasons.middle_grades_lock_quality_retry_timeout = Number(dropReasons.middle_grades_lock_quality_retry_timeout || 0) + 1;
            continue;
          }
          if (diagnostic.failedReason) {
            dropReasons.middle_grades_lock_quality_retry_failed = Number(dropReasons.middle_grades_lock_quality_retry_failed || 0) + 1;
            continue;
          }
          rawApiResultCount += retryDocs.length;
          for (const doc of retryDocs) {
            const title = String(doc?.title || "").trim();
            if (title) rawTitles.push(title);
            if (!title) continue;
            recordMiddleGradesAgeShapeDiagnostic(doc, retryQuery, "middle_grades_lock_quality_retry");
            const quality = shouldKeepOpenLibraryDoc(doc, retryQuery, context.profile);
            if (!quality.keep) {
              const reason = `middle_grades_lock_quality_retry_${quality.reason || "quality_filter"}`;
              dropReasons[reason] = Number(dropReasons[reason] || 0) + 1;
              if (retryQueryIsTargeted) middleGradesTargetedQueriesRejectedByReason[quality.reason || "quality_filter"] = Number(middleGradesTargetedQueriesRejectedByReason[quality.reason || "quality_filter"] || 0) + 1;
              if (/artifact|inappropriate|middle_grades_age_shape/.test(reason)) artifactSuppressedTitles.push(title);
              continue;
            }
            const docKey = String(doc?.key || doc?.cover_edition_key || doc?.edition_key?.[0] || `${title}:${Array.isArray(doc?.author_name) ? doc.author_name[0] : ""}`).toLowerCase();
            if (acceptedDocKeys.has(docKey)) {
              dropReasons.middle_grades_lock_quality_retry_duplicate_doc = Number(dropReasons.middle_grades_lock_quality_retry_duplicate_doc || 0) + 1;
              continue;
            }
            const seriesKey = openLibrarySeriesKey(doc);
            if (seriesKey && acceptedSeriesKeys.has(seriesKey)) {
              dropReasons.middle_grades_lock_quality_retry_series_duplicate = Number(dropReasons.middle_grades_lock_quality_retry_series_duplicate || 0) + 1;
              seriesSuppressedTitles.push(title);
              continue;
            }
            if (seriesKey) acceptedSeriesKeys.add(seriesKey);
            acceptedDocKeys.add(docKey);
            if (!shouldAcceptMiddleGradesSourceDoc(doc, retryQuery, retryPlan, "lock_quality_retry")) {
              if (retryQueryIsTargeted) middleGradesTargetedQueriesRejectedByReason.query_only_or_missing_document_evidence = Number(middleGradesTargetedQueriesRejectedByReason.query_only_or_missing_document_evidence || 0) + 1;
              continue;
            }
            rawItems.push(normalizeOpenLibraryDoc(doc, retryPlan));
            middleGradesLockQualityRetryAcceptedCount += 1;
            middleGradesProfileSpecificQueriesAcceptedCount += 1;
            if (retryQueryIsTargeted) {
              middleGradesTargetedQueriesAcceptedCount += 1;
              middleGradesEvidenceAwareRecoveryAcceptedCount += 1;
            }
            dropReasons.middle_grades_lock_quality_retry_accepted = Number(dropReasons.middle_grades_lock_quality_retry_accepted || 0) + 1;
          }
          if (middleGradesLockQualityRetryAcceptedCount > 0 && rawItems.filter((item: any) => item?.fallbackAlignment !== "anti_zero" && !item?.emergencyFallback).length >= 3) break;
        }
        if (!middleGradesFinalReturnedDespiteLockQualityFailReason && middleGradesLockQualityRetryAttempted && middleGradesLockQualityRetryAcceptedCount === 0) {
          middleGradesFinalReturnedDespiteLockQualityFailReason = "lock_quality_retry_produced_no_accepted_rows";
        }
      }
    }


    const middleGradesHadProfileSpecificTimeout = ageProfile.key === "middleGrades" && fetches.some((fetch) => {
      const query = String(fetch.query || "").toLowerCase();
      return !fetch.diagnosticOnly && fetch.timedOut && (middleGradesProfileSpecificQuerySet.has(query) || /\b(dragon|mythology|mythological|middle grade|fantasy|school|friendship|science|space|robot)\b/i.test(query));
    });
    if (ageProfile.key === "middleGrades" && !forceMiddleGradesCleanCandidateShortfallExpansion && (middleGradesRejectedAllRowsAsQueryOnly || middleGradesHadProfileSpecificTimeout || rawItems.length > 0) && rawItems.length < Math.min(ageProfile.docLimit, 5) && !context.signal?.aborted && !middleGradesTimeoutCircuitOpen("query_only_continuation")) {
      const continuationTarget = Math.min(ageProfile.docLimit, 5);
      const targetedContinuationQueries = middleGradesUnattemptedTargetedQueries();
      const evidenceAwareQueries = middleGradesUnattemptedEvidenceAwareQueries();
      const continuationQueries = uniqueStrings([...targetedContinuationQueries, ...evidenceAwareQueries, ...middleGradesUnattemptedSpecificQueries()], 16);
      if (continuationQueries.length > 0) {
        middleGradesEvidenceAwareRecoveryAttempted = evidenceAwareQueries.length > 0;
        if (middleGradesHadProfileSpecificTimeout && evidenceAwareQueries.length > 0) middleGradesBrittleQueryTimedOutThenShortQueryAttempted = true;
        if (middleGradesRejectedAllRowsAsQueryOnly) middleGradesQueryOnlyRejectionTriggeredContinuation = true;
        middleGradesUnattemptedSpecificQueriesAfterQueryOnlyRejection.push(...continuationQueries);
        for (const continuationQuery of continuationQueries) {
          if (middleGradesTimeoutCircuitOpen("query_only_continuation")) break;
          if (rawItems.length >= continuationTarget) break;
          const remainingBudgetMs = sourceBudgetMs - (Date.now() - Date.parse(startedAt));
          if (!debugMiddleGradesDeepTrace && remainingBudgetMs < MIDDLE_GRADES_OPEN_LIBRARY_TIMEOUT_CASCADE_QUERY_FLOOR_MS) {
            middleGradesRecoveryExhaustionReasonDetailed = "insufficient_budget_after_query_only_rejection";
            break;
          }
          if (!middleGradesContinuedAfterQueryOnlyRejectionQueries.includes(continuationQuery)) middleGradesContinuedAfterQueryOnlyRejectionQueries.push(continuationQuery);
          const continuationQueryIsTargeted = middleGradesTargetedQuerySet.has(continuationQuery.toLowerCase());
          if (continuationQueryIsTargeted) {
            if (!middleGradesTargetedQueriesAttempted.includes(continuationQuery)) middleGradesTargetedQueriesAttempted.push(continuationQuery);
            if (!middleGradesEvidenceAwareRecoveryQueriesAttempted.includes(continuationQuery)) middleGradesEvidenceAwareRecoveryQueriesAttempted.push(continuationQuery);
            middleGradesEvidenceAwareRecoveryAttempted = true;
          }
          if (evidenceAwareQueries.includes(continuationQuery) && !middleGradesEvidenceAwareRecoveryQueriesAttempted.includes(continuationQuery)) middleGradesEvidenceAwareRecoveryQueriesAttempted.push(continuationQuery);
          const continuationPlan: OpenLibraryQueryPlan = {
            query: continuationQuery,
            originalPlannedQuery: queries[0] || "",
            queryCascadeIndex: queryPlans.length + fetches.filter((fetch) => !fetch.diagnosticOnly).length,
            queryFamily: queryFamilyForOpenLibraryQuery(continuationQuery),
            facets: queryPlans[0]?.facets || [],
            routingReason: `${queryPlans[0]?.routingReason || "middle_grades"}_query_only_continuation`,
            routingDominance: queryPlans[0]?.routingDominance,
            fallbackAlignment: "route_aligned",
            profileSpecific: middleGradesProfileSpecificQuerySet.has(continuationQuery.toLowerCase()),
          };
          const continuationTimeoutMs = debugMiddleGradesDeepTrace ? middleGradesActualNetworkTimeoutMs(remainingBudgetMs) : Math.min(MIDDLE_GRADES_OPEN_LIBRARY_PROXY_CLIENT_TIMEOUT_MS, Math.max(MIDDLE_GRADES_OPEN_LIBRARY_TIMEOUT_CASCADE_QUERY_FLOOR_MS, remainingBudgetMs));
          const { docs: continuationDocs, diagnostic } = await fetchOpenLibraryDocs(continuationPlan, ageProfile.docsPerQuery, context.signal, false, continuationTimeoutMs, 1, continuationTimeoutMs);
          fetches.push(diagnostic);
          dropReasons.middle_grades_query_only_continuation_attempted = Number(dropReasons.middle_grades_query_only_continuation_attempted || 0) + 1;
          if (diagnostic.timedOut) {
            dropReasons.middle_grades_query_only_continuation_timeout = Number(dropReasons.middle_grades_query_only_continuation_timeout || 0) + 1;
            continue;
          }
          if (diagnostic.failedReason) {
            dropReasons.middle_grades_query_only_continuation_failed = Number(dropReasons.middle_grades_query_only_continuation_failed || 0) + 1;
            continue;
          }
          rawApiResultCount += continuationDocs.length;
          for (const doc of continuationDocs) {
            const title = String(doc?.title || "").trim();
            if (title) rawTitles.push(title);
            if (!title) continue;
            recordMiddleGradesAgeShapeDiagnostic(doc, continuationQuery, "middle_grades_query_only_continuation");
            const quality = shouldKeepOpenLibraryDoc(doc, continuationQuery, context.profile);
            if (!quality.keep) {
              const reason = `middle_grades_query_only_continuation_${quality.reason || "quality_filter"}`;
              dropReasons[reason] = Number(dropReasons[reason] || 0) + 1;
              if (continuationQueryIsTargeted) middleGradesTargetedQueriesRejectedByReason[quality.reason || "quality_filter"] = Number(middleGradesTargetedQueriesRejectedByReason[quality.reason || "quality_filter"] || 0) + 1;
              if (/artifact|inappropriate|middle_grades_age_shape/.test(reason)) artifactSuppressedTitles.push(title);
              continue;
            }
            const docKey = String(doc?.key || doc?.cover_edition_key || doc?.edition_key?.[0] || `${title}:${Array.isArray(doc?.author_name) ? doc.author_name[0] : ""}`).toLowerCase();
            if (acceptedDocKeys.has(docKey)) {
              dropReasons.middle_grades_query_only_continuation_duplicate_doc = Number(dropReasons.middle_grades_query_only_continuation_duplicate_doc || 0) + 1;
              continue;
            }
            const seriesKey = openLibrarySeriesKey(doc);
            if (seriesKey && acceptedSeriesKeys.has(seriesKey)) {
              dropReasons.middle_grades_query_only_continuation_series_duplicate = Number(dropReasons.middle_grades_query_only_continuation_series_duplicate || 0) + 1;
              seriesSuppressedTitles.push(title);
              continue;
            }
            if (!shouldAcceptMiddleGradesSourceDoc(doc, continuationQuery, continuationPlan, "query_only_continuation")) {
              if (continuationQueryIsTargeted) middleGradesTargetedQueriesRejectedByReason.query_only_or_missing_document_evidence = Number(middleGradesTargetedQueriesRejectedByReason.query_only_or_missing_document_evidence || 0) + 1;
              continue;
            }
            if (seriesKey) acceptedSeriesKeys.add(seriesKey);
            acceptedDocKeys.add(docKey);
            rawItems.push(normalizeOpenLibraryDoc(doc, continuationPlan));
            if (continuationQueryIsTargeted) {
              middleGradesTargetedQueriesAcceptedCount += 1;
              middleGradesEvidenceAwareRecoveryAcceptedCount += 1;
            }
            middleGradesContinuedAfterQueryOnlyRejectionAcceptedCount += 1;
            if (evidenceAwareQueries.includes(continuationQuery) && !continuationQueryIsTargeted) middleGradesEvidenceAwareRecoveryAcceptedCount += 1;
            dropReasons.middle_grades_query_only_continuation_accepted = Number(dropReasons.middle_grades_query_only_continuation_accepted || 0) + 1;
            if (rawItems.length >= continuationTarget) break;
          }
        }
      } else {
        middleGradesRecoveryExhaustionReasonDetailed = "no_unattempted_specific_queries_after_query_only_rejection";
      }
      if (!middleGradesRecoveryExhaustionReasonDetailed && rawItems.length < continuationTarget) middleGradesRecoveryExhaustionReasonDetailed = "query_only_continuation_exhausted_before_target";
    }

    const forceMiddleGradesMeaningfulTasteRecovery = ageProfile.key === "middleGrades" && Boolean((context.profile.diagnostics as Record<string, unknown>)?.forceMiddleGradesMeaningfulTasteRecovery);
    if (ageProfile.key === "middleGrades" && debugMiddleGradesDeepTrace && !forceMiddleGradesCleanCandidateShortfallExpansion && !context.signal?.aborted && !middleGradesTimeoutCircuitOpen("meaningful_taste_recovery")) {
      const meaningfulTarget = Math.min(ageProfile.docLimit, 5);
      const meaningfulCountBeforeRecovery = middleGradesMeaningfulTasteExpandedPoolItems().length;
      const expandedPoolCountBeforeRecovery = new Set((([...middleGradesExpandedScoringPool, ...rawItems] as any[])
        .map((item: any) => String(item?.sourceId || item?.key || item?.workKey || `${String(item?.title || "").trim()}:${Array.isArray(item?.authors) ? item.authors[0] : ""}`).toLowerCase())
        .filter(Boolean))).size;
      if (forceMiddleGradesMeaningfulTasteRecovery || (expandedPoolCountBeforeRecovery >= 20 && meaningfulCountBeforeRecovery < meaningfulTarget)) {
        const priorRecoveryDiagnostics = ((context.profile.diagnostics as Record<string, any>)?.priorMiddleGradesRecoverySourceDiagnostics || {}) as Record<string, any>;
        const priorSelectionRejectedReasons = ((context.profile.diagnostics as Record<string, any>)?.priorMiddleGradesRecoveryRejectedReasons || {}) as Record<string, any>;
        const sameRunRecoveryFamilyFailures: Record<string, number> = {
          ...((priorRecoveryDiagnostics.recoveryQueryFamilyRejectedForLeakageCount || {}) as Record<string, number>),
          ...middleGradesRecoveryQueryFamilyRejectedForLeakageCount,
        };
        if (Array.isArray(priorSelectionRejectedReasons.humorKeywordOnlyRejectedTitles) && priorSelectionRejectedReasons.humorKeywordOnlyRejectedTitles.length) sameRunRecoveryFamilyFailures.humor = Number(sameRunRecoveryFamilyFailures.humor || 0) + priorSelectionRejectedReasons.humorKeywordOnlyRejectedTitles.length;
        if (Array.isArray(priorSelectionRejectedReasons.adultOrYaHumorLeakageRejectedTitles) && priorSelectionRejectedReasons.adultOrYaHumorLeakageRejectedTitles.length) sameRunRecoveryFamilyFailures.humor = Number(sameRunRecoveryFamilyFailures.humor || 0) + priorSelectionRejectedReasons.adultOrYaHumorLeakageRejectedTitles.length;
        if (Array.isArray(priorSelectionRejectedReasons.finalEligibilityRejectedQueryOnlyTitles) && priorSelectionRejectedReasons.finalEligibilityRejectedQueryOnlyTitles.length) {
          sameRunRecoveryFamilyFailures.friendship_adventure = Number(sameRunRecoveryFamilyFailures.friendship_adventure || 0) + 1;
          sameRunRecoveryFamilyFailures.adventure_friendship_series = Number(sameRunRecoveryFamilyFailures.adventure_friendship_series || 0) + 1;
          sameRunRecoveryFamilyFailures.fast_adventure = Number(sameRunRecoveryFamilyFailures.fast_adventure || 0) + 1;
        }
        const recoveryQueryPlan = middleGradesMeaningfulTasteRecoveryQueryPlans(context.profile, middleGradesAttemptedQueries(), sameRunRecoveryFamilyFailures);
        const recoveryQueries = recoveryQueryPlan.queries;
        middleGradesRecoveryFamilyScores = recoveryQueryPlan.scores;
        middleGradesRecoveryFamiliesSkippedByAvoidEvidence = recoveryQueryPlan.skippedByAvoid;
        middleGradesRecoveryFamiliesSkippedBySameRunLeakage = recoveryQueryPlan.skippedByLeakage;
        middleGradesRecoveryFamilyExecutionOrderReason = recoveryQueryPlan.selectedReasons;
        if (recoveryQueries.length > 0) middleGradesMeaningfulTasteRecoveryTriggered = true;
        for (const recoveryQuery of recoveryQueries) {
          if (middleGradesTimeoutCircuitOpen("meaningful_taste_recovery")) break;
          if (!forceMiddleGradesMeaningfulTasteRecovery && middleGradesMeaningfulTasteExpandedPoolItems().length >= meaningfulTarget) break;
          if (!middleGradesMeaningfulTasteRecoveryQueriesAttempted.includes(recoveryQuery)) middleGradesMeaningfulTasteRecoveryQueriesAttempted.push(recoveryQuery);
          const recoveryAnchor = middleGradesRecoveryQueryAnchor(recoveryQuery);
          middleGradesRecoveryQueryAnchorByQuery[recoveryQuery] = recoveryAnchor;
          if (recoveryAnchor === "humor") {
            middleGradesRecoveryHumorUsedAsAnchorBlocked = true;
            continue;
          }
          if (/\b(middle grade|children)\b/i.test(recoveryQuery) && /\bfiction|series\b/i.test(recoveryQuery)) middleGradesRecoveryConcreteFictionQueryUsed = true;
          const recoveryPlan: OpenLibraryQueryPlan = {
            query: recoveryQuery,
            originalPlannedQuery: queries[0] || "",
            queryCascadeIndex: queryPlans.length + fetches.filter((fetch) => !fetch.diagnosticOnly).length,
            queryFamily: queryFamilyForOpenLibraryQuery(recoveryQuery),
            facets: queryPlans[0]?.facets || [],
            routingReason: `${queryPlans[0]?.routingReason || "middle_grades"}_meaningful_taste_recovery`,
            routingDominance: queryPlans[0]?.routingDominance,
            fallbackAlignment: "route_aligned",
            profileSpecific: true,
          };
          const recoveryTimeoutMs = middleGradesActualNetworkTimeoutMs();
          const { docs: recoveryDocs, diagnostic } = await fetchOpenLibraryDocs(recoveryPlan, ageProfile.docsPerQuery, context.signal, false, recoveryTimeoutMs, 1, recoveryTimeoutMs);
          fetches.push(diagnostic);
          dropReasons.middle_grades_meaningful_taste_recovery_attempted = Number(dropReasons.middle_grades_meaningful_taste_recovery_attempted || 0) + 1;
          if (diagnostic.timedOut) {
            dropReasons.middle_grades_meaningful_taste_recovery_timeout = Number(dropReasons.middle_grades_meaningful_taste_recovery_timeout || 0) + 1;
            continue;
          }
          if (diagnostic.failedReason) {
            dropReasons.middle_grades_meaningful_taste_recovery_failed = Number(dropReasons.middle_grades_meaningful_taste_recovery_failed || 0) + 1;
            continue;
          }
          rawApiResultCount += recoveryDocs.length;
          for (const doc of recoveryDocs) {
            const beforeRawCount = rawItems.length;
            const beforeMeaningfulCount = middleGradesMeaningfulTasteExpandedPoolItems().length;
            const accepted = acceptMiddleGradesDoc(doc, recoveryPlan, "meaningful_taste_recovery", true);
            const title = String(doc?.title || "").trim();
            if (accepted) {
              if (title) middleGradesMeaningfulTasteRecoveryAcceptedTitles.push(title);
              middleGradesRecoveryFamilyYieldByFamily[recoveryAnchor] = Number(middleGradesRecoveryFamilyYieldByFamily[recoveryAnchor] || 0) + 1;
              dropReasons.middle_grades_meaningful_taste_recovery_accepted = Number(dropReasons.middle_grades_meaningful_taste_recovery_accepted || 0) + 1;
            } else if (title && rawItems.length === beforeRawCount && middleGradesMeaningfulTasteExpandedPoolItems().length === beforeMeaningfulCount) {
              const eligibility = middleGradesSourceMeaningfulTasteEligibility(doc, context.profile);
              const reason = eligibility.reason || "source_filter_or_duplicate";
              middleGradesMeaningfulTasteRecoveryRejectedTitlesByReason[reason] = uniqueStrings([...(middleGradesMeaningfulTasteRecoveryRejectedTitlesByReason[reason] || []), title], 20);
              if (/humor|leakage/i.test(reason)) middleGradesRecoveryQueryFamilyRejectedForLeakageCount[recoveryAnchor] = Number(middleGradesRecoveryQueryFamilyRejectedForLeakageCount[recoveryAnchor] || 0) + 1;
            }
            if (!forceMiddleGradesMeaningfulTasteRecovery && middleGradesMeaningfulTasteExpandedPoolItems().length >= meaningfulTarget) break;
          }
        }
        middleGradesMeaningfulTasteRecoveryFinalCount = middleGradesRecoveryAcceptedLikelyFinalSurvivorTitles.length;
        middleGradesUnderfilledAfterMeaningfulTasteRecovery = middleGradesMeaningfulTasteRecoveryTriggered && middleGradesMeaningfulTasteRecoveryFinalCount < meaningfulTarget;
      }
    }

    const adultUnderfillRecoveryTarget = Math.min(ageProfile.docLimit, 8);
    if (ageProfile.key === "adult" && rawItems.length > 0 && (rawItems.length < 5 || (!adultPrimaryQueryTimedOutTwice && rawItems.length < adultUnderfillRecoveryTarget)) && !context.signal?.aborted) {
      const attemptedMainQueries = new Set(fetches.filter((fetch) => !fetch.diagnosticOnly).map((fetch) => String(fetch.query || "").toLowerCase()));
      const recoveryQueries = adultUnderfillRecoveryQueries(queryPlans)
        .filter((query) => !attemptedMainQueries.has(query.toLowerCase()));
      const recoveryTarget = adultUnderfillRecoveryTarget;
      for (const recoveryQuery of recoveryQueries) {
        const recoveryPlan: OpenLibraryQueryPlan = {
          query: recoveryQuery,
          originalPlannedQuery: queries[0] || "",
          queryCascadeIndex: queryPlans.length + fetches.filter((fetch) => !fetch.diagnosticOnly).length,
          queryFamily: queryFamilyForOpenLibraryQuery(recoveryQuery),
          facets: queryPlans[0]?.facets || [],
          routingReason: `${queryPlans[0]?.routingReason || "adult"}_underfill_recovery`,
        };
        const { docs: recoveryDocs, diagnostic } = await fetchOpenLibraryDocs(recoveryPlan, ageProfile.docsPerQuery, context.signal, false, ageProfile.perQueryTimeoutMs, 1, openLibraryProxyClientTimeoutMs(ageProfile));
        fetches.push(diagnostic);
        dropReasons.adult_underfill_recovery_query_attempted = Number(dropReasons.adult_underfill_recovery_query_attempted || 0) + 1;
        if (diagnostic.timedOut) {
          dropReasons.adult_underfill_recovery_timeout = Number(dropReasons.adult_underfill_recovery_timeout || 0) + 1;
          if (context.signal?.aborted) break;
          continue;
        }
        if (diagnostic.failedReason) {
          dropReasons.adult_underfill_recovery_failed = Number(dropReasons.adult_underfill_recovery_failed || 0) + 1;
          continue;
        }
        rawApiResultCount += recoveryDocs.length;
        for (const doc of recoveryDocs) {
          const title = String(doc?.title || "").trim();
          if (title) rawTitles.push(title);
          if (!title) {
            dropReasons.adult_underfill_recovery_missing_title = Number(dropReasons.adult_underfill_recovery_missing_title || 0) + 1;
            continue;
          }
          recordMiddleGradesAgeShapeDiagnostic(doc, recoveryQuery, "recovery");
          const quality = shouldKeepOpenLibraryDoc(doc, recoveryQuery, context.profile);
          if (!quality.keep) {
            const reason = `adult_underfill_recovery_${quality.reason || "quality_filter"}`;
            dropReasons[reason] = Number(dropReasons[reason] || 0) + 1;
            if (/artifact|inappropriate/.test(reason)) artifactSuppressedTitles.push(title);
            continue;
          }
          const docKey = String(doc?.key || doc?.cover_edition_key || doc?.edition_key?.[0] || `${title}:${Array.isArray(doc?.author_name) ? doc.author_name[0] : ""}`).toLowerCase();
          if (acceptedDocKeys.has(docKey)) {
            dropReasons.adult_underfill_recovery_duplicate_doc = Number(dropReasons.adult_underfill_recovery_duplicate_doc || 0) + 1;
            continue;
          }
          const seriesKey = openLibrarySeriesKey(doc);
          if (seriesKey && acceptedSeriesKeys.has(seriesKey)) {
            dropReasons.adult_underfill_recovery_series_duplicate = Number(dropReasons.adult_underfill_recovery_series_duplicate || 0) + 1;
            seriesSuppressedTitles.push(title);
            continue;
          }
          if (seriesKey) acceptedSeriesKeys.add(seriesKey);
          acceptedDocKeys.add(docKey);
          if (!shouldAcceptMiddleGradesSourceDoc(doc, recoveryQuery, recoveryPlan, "recovery")) continue;
          rawItems.push(normalizeOpenLibraryDoc(doc, recoveryPlan));
          dropReasons.adult_underfill_recovery_accepted = Number(dropReasons.adult_underfill_recovery_accepted || 0) + 1;
          if (rawItems.length >= recoveryTarget) break;
        }
        if (rawItems.length >= recoveryTarget) break;
      }
      if (recoveryQueries.length > 0) {
        openLibraryTopUpRan = true;
        if (rawItems.length < recoveryTarget) {
          dropReasons.adult_underfill_recovery_exhausted = Number(dropReasons.adult_underfill_recovery_exhausted || 0) + 1;
        }
      }
    }

    if (ageProfile.key === "adult" && adultPrimaryQueryTimedOutTwice && rawItems.length < Math.min(ageProfile.docLimit, 5) && !context.signal?.aborted) {
      const delayedRetryQuery = queryPlans[0]?.query || adultUnderfillRecoveryQueries(queryPlans)[0] || "";
      if (delayedRetryQuery) {
        const delayedRetryPlan: OpenLibraryQueryPlan = {
          query: delayedRetryQuery,
          originalPlannedQuery: queries[0] || "",
          queryCascadeIndex: queryPlans.length + fetches.filter((fetch) => !fetch.diagnosticOnly).length,
          queryFamily: queryFamilyForOpenLibraryQuery(delayedRetryQuery),
          facets: queryPlans[0]?.facets || [],
          routingReason: `${queryPlans[0]?.routingReason || "adult"}_delayed_final_retry`,
        };
        const { docs: delayedRetryDocs, diagnostic } = await fetchOpenLibraryDocs(delayedRetryPlan, ageProfile.docsPerQuery, context.signal, false, ADULT_OPEN_LIBRARY_FIRST_RUN_TIMEOUT_MS, 3, openLibraryProxyClientTimeoutMs(ageProfile));
        fetches.push(diagnostic);
        dropReasons.adult_delayed_final_retry_attempted = Number(dropReasons.adult_delayed_final_retry_attempted || 0) + 1;
        openLibraryTopUpRan = true;
        if (diagnostic.timedOut) {
          dropReasons.adult_delayed_final_retry_timeout = Number(dropReasons.adult_delayed_final_retry_timeout || 0) + 1;
          if (!failedReason) failedReason = diagnostic.failedReason || "openlibrary_fetch_timed_out";
        } else if (diagnostic.failedReason) {
          dropReasons.adult_delayed_final_retry_failed = Number(dropReasons.adult_delayed_final_retry_failed || 0) + 1;
          if (!failedReason) failedReason = diagnostic.failedReason;
        } else {
          rawApiResultCount += delayedRetryDocs.length;
          for (const doc of delayedRetryDocs) {
            const title = String(doc?.title || "").trim();
            if (title) rawTitles.push(title);
            if (!title) {
              dropReasons.adult_delayed_final_retry_missing_title = Number(dropReasons.adult_delayed_final_retry_missing_title || 0) + 1;
              continue;
            }
            recordMiddleGradesAgeShapeDiagnostic(doc, delayedRetryQuery, "delayed_retry");
            const quality = shouldKeepOpenLibraryDoc(doc, delayedRetryQuery, context.profile);
            if (!quality.keep) {
              const reason = `adult_delayed_final_retry_${quality.reason || "quality_filter"}`;
              dropReasons[reason] = Number(dropReasons[reason] || 0) + 1;
              if (/artifact|inappropriate/.test(reason)) artifactSuppressedTitles.push(title);
              continue;
            }
            const docKey = String(doc?.key || doc?.cover_edition_key || doc?.edition_key?.[0] || `${title}:${Array.isArray(doc?.author_name) ? doc.author_name[0] : ""}`).toLowerCase();
            if (acceptedDocKeys.has(docKey)) {
              dropReasons.adult_delayed_final_retry_duplicate_doc = Number(dropReasons.adult_delayed_final_retry_duplicate_doc || 0) + 1;
              continue;
            }
            const seriesKey = openLibrarySeriesKey(doc);
            if (seriesKey && acceptedSeriesKeys.has(seriesKey)) {
              dropReasons.adult_delayed_final_retry_series_duplicate = Number(dropReasons.adult_delayed_final_retry_series_duplicate || 0) + 1;
              seriesSuppressedTitles.push(title);
              continue;
            }
            if (seriesKey) acceptedSeriesKeys.add(seriesKey);
            acceptedDocKeys.add(docKey);
            if (!shouldAcceptMiddleGradesSourceDoc(doc, delayedRetryQuery, delayedRetryPlan, "delayed_retry")) continue;
            rawItems.push(normalizeOpenLibraryDoc(doc, delayedRetryPlan));
            dropReasons.adult_delayed_final_retry_accepted = Number(dropReasons.adult_delayed_final_retry_accepted || 0) + 1;
            if (rawItems.length >= Math.min(ageProfile.docLimit, 5)) break;
          }
          if (delayedRetryDocs.length > 0 && !dropReasons.adult_delayed_final_retry_accepted) {
            dropReasons.adult_delayed_final_retry_all_rejected = Number(dropReasons.adult_delayed_final_retry_all_rejected || 0) + 1;
          }
        }
      }
    }

    if (ageProfile.key === "teen" && rawItems.length === 0 && !context.signal?.aborted && !teenTimeoutCircuitOpen("delayed_final_retry")) {
      const mainFetches = fetches.filter((fetch) => !fetch.diagnosticOnly);
      const allAttemptedLaneQueriesTimedOut = mainFetches.length > 0 && mainFetches.every((fetch) => fetch.timedOut);
      const delayedRetryQuery = queryPlans[0]?.query || "";
      if (allAttemptedLaneQueriesTimedOut && delayedRetryQuery && !teenTimeoutCircuitOpen("delayed_final_retry")) {
        const delayedRetryPlan: OpenLibraryQueryPlan = {
          query: delayedRetryQuery,
          originalPlannedQuery: queries[0] || "",
          queryCascadeIndex: queryPlans.length + mainFetches.length,
          queryFamily: queryFamilyForOpenLibraryQuery(delayedRetryQuery),
          facets: queryPlans[0]?.facets || [],
          routingReason: `${queryPlans[0]?.routingReason || "teen"}_delayed_final_retry`,
          routingDominance: queryPlans[0]?.routingDominance,
        };
        const elapsedBeforeDelayedRetryMs = Date.now() - Date.parse(startedAt);
        const delayedRetryRemainingBudgetMs = sourceBudgetMs - elapsedBeforeDelayedRetryMs;
        if (delayedRetryRemainingBudgetMs < TEEN_OPEN_LIBRARY_DELAYED_RETRY_MIN_BUDGET_MS) {
          dropReasons.teen_delayed_final_retry_skipped_insufficient_budget = Number(dropReasons.teen_delayed_final_retry_skipped_insufficient_budget || 0) + 1;
        } else {
          const delayedRetryTimeoutMs = Math.min(TEEN_OPEN_LIBRARY_PROXY_CLIENT_TIMEOUT_MS, delayedRetryRemainingBudgetMs);
          const { docs: delayedRetryDocs, diagnostic } = await fetchOpenLibraryDocs(delayedRetryPlan, ageProfile.docsPerQuery, context.signal, false, delayedRetryTimeoutMs, 3, delayedRetryTimeoutMs);
          fetches.push(diagnostic);
          dropReasons.teen_delayed_final_retry_attempted = Number(dropReasons.teen_delayed_final_retry_attempted || 0) + 1;
          openLibraryTopUpRan = true;
          if (diagnostic.timedOut) {
          dropReasons.teen_delayed_final_retry_timeout = Number(dropReasons.teen_delayed_final_retry_timeout || 0) + 1;
          if (!failedReason) failedReason = diagnostic.failedReason || "openlibrary_fetch_timed_out";
        } else if (diagnostic.failedReason) {
          dropReasons.teen_delayed_final_retry_failed = Number(dropReasons.teen_delayed_final_retry_failed || 0) + 1;
          if (!failedReason) failedReason = diagnostic.failedReason;
        } else {
          rawApiResultCount += delayedRetryDocs.length;
          for (const doc of delayedRetryDocs) {
            const title = String(doc?.title || "").trim();
            if (title) rawTitles.push(title);
            if (!title) {
              dropReasons.teen_delayed_final_retry_missing_title = Number(dropReasons.teen_delayed_final_retry_missing_title || 0) + 1;
              continue;
            }
            recordMiddleGradesAgeShapeDiagnostic(doc, delayedRetryQuery, "delayed_retry");
            const quality = shouldKeepOpenLibraryDoc(doc, delayedRetryQuery, context.profile);
            if (!quality.keep) {
              const reason = `teen_delayed_final_retry_${quality.reason || "quality_filter"}`;
              dropReasons[reason] = Number(dropReasons[reason] || 0) + 1;
              if (/artifact|inappropriate/.test(reason)) artifactSuppressedTitles.push(title);
              continue;
            }
            const docKey = String(doc?.key || doc?.cover_edition_key || doc?.edition_key?.[0] || `${title}:${Array.isArray(doc?.author_name) ? doc.author_name[0] : ""}`).toLowerCase();
            if (acceptedDocKeys.has(docKey)) {
              dropReasons.teen_delayed_final_retry_duplicate_doc = Number(dropReasons.teen_delayed_final_retry_duplicate_doc || 0) + 1;
              continue;
            }
            const seriesKey = openLibrarySeriesKey(doc);
            if (seriesKey && acceptedSeriesKeys.has(seriesKey)) {
              dropReasons.teen_delayed_final_retry_series_duplicate = Number(dropReasons.teen_delayed_final_retry_series_duplicate || 0) + 1;
              seriesSuppressedTitles.push(title);
              continue;
            }
            if (seriesKey) acceptedSeriesKeys.add(seriesKey);
            acceptedDocKeys.add(docKey);
            if (!shouldAcceptMiddleGradesSourceDoc(doc, delayedRetryQuery, delayedRetryPlan, "delayed_retry")) continue;
            rawItems.push(normalizeOpenLibraryDoc(doc, delayedRetryPlan));
            dropReasons.teen_delayed_final_retry_accepted = Number(dropReasons.teen_delayed_final_retry_accepted || 0) + 1;
            if (rawItems.length >= Math.min(ageProfile.docLimit, 5)) break;
          }
            if (delayedRetryDocs.length > 0 && !dropReasons.teen_delayed_final_retry_accepted) {
              dropReasons.teen_delayed_final_retry_all_rejected = Number(dropReasons.teen_delayed_final_retry_all_rejected || 0) + 1;
            }
          }
        }
      }
    }

    if (rawItems.length === 1 && queryPlans[0]?.routingReason === "dominant_horror_survival_psychological" && !context.signal?.aborted) {
      const fallbackQuery = "young adult survival horror";
      const fallbackPlan: OpenLibraryQueryPlan = { query: fallbackQuery, originalPlannedQuery: queries[0] || "", queryCascadeIndex: queryPlans.length, queryFamily: "horror_survival", facets: ["horror", "survival", "psychological"], emergencyFallback: true, routingReason: "horror_survival_underfill_fallback" };
      const { docs: fallbackDocs, diagnostic } = await fetchOpenLibraryDocs(fallbackPlan, ageProfile.docsPerQuery, context.signal, true, ageProfile.probeTimeoutMs, 1);
      fetches.push({ ...diagnostic, diagnosticOnly: true, failedReason: diagnostic.failedReason || (fallbackDocs.length ? "horror_survival_underfill_returned_docs" : undefined) });
      rawApiResultCount += fallbackDocs.length;
      let acceptedFallbackDocs = 0;
      for (const doc of fallbackDocs) {
        const title = String(doc?.title || "").trim();
        if (title) rawTitles.push(title);
        if (!title) continue;
        recordMiddleGradesAgeShapeDiagnostic(doc, fallbackQuery, "horror_survival_underfill");
        const quality = shouldKeepOpenLibraryDoc(doc, fallbackQuery, context.profile);
        if (!quality.keep) {
          const reason = `horror_survival_underfill_${quality.reason || "quality_filter"}`;
          dropReasons[reason] = Number(dropReasons[reason] || 0) + 1;
          if (/artifact|inappropriate/.test(reason)) artifactSuppressedTitles.push(title);
          continue;
        }
        const docKey = String(doc?.key || doc?.cover_edition_key || doc?.edition_key?.[0] || `${title}:${Array.isArray(doc?.author_name) ? doc.author_name[0] : ""}`).toLowerCase();
        if (acceptedDocKeys.has(docKey)) {
          dropReasons.horror_survival_underfill_duplicate_doc = Number(dropReasons.horror_survival_underfill_duplicate_doc || 0) + 1;
          continue;
        }
        const seriesKey = openLibrarySeriesKey(doc);
        if (seriesKey && acceptedSeriesKeys.has(seriesKey)) {
          dropReasons.horror_survival_underfill_series_duplicate = Number(dropReasons.horror_survival_underfill_series_duplicate || 0) + 1;
          seriesSuppressedTitles.push(title);
          continue;
        }
        if (seriesKey) acceptedSeriesKeys.add(seriesKey);
        acceptedDocKeys.add(docKey);
        if (!shouldAcceptMiddleGradesSourceDoc(doc, fallbackQuery, fallbackPlan, "fallback")) continue;
              rawItems.push(normalizeOpenLibraryDoc(doc, fallbackPlan));
        acceptedFallbackDocs += 1;
        dropReasons.horror_survival_underfill_accepted = Number(dropReasons.horror_survival_underfill_accepted || 0) + 1;
        if (rawItems.length >= Math.min(ageProfile.minCleanDocs, 3)) break;
      }
      if (fallbackDocs.length > 0 && acceptedFallbackDocs === 0) {
        dropReasons.horror_survival_underfill_all_rejected = Number(dropReasons.horror_survival_underfill_all_rejected || 0) + 1;
      }
    }

    if (!rawItems.length && context.signal?.aborted && !fetches.some((fetch) => fetch.diagnosticOnly)) {
      dropReasons.probe_skipped_due_to_source_timeout = Number(dropReasons.probe_skipped_due_to_source_timeout || 0) + 1;
      failedReason = failedReason || "probe_skipped_due_to_source_timeout";
    }

    const teenMainQueryTimedOutDuringRun = ageProfile.key === "teen" && fetches.some((fetch) => !fetch.diagnosticOnly && fetch.timedOut);
    const middleGradesAllRealFetchesTimedOutDuringRun = ageProfile.key === "middleGrades" && fetches.some((fetch) => !fetch.diagnosticOnly) && fetches.filter((fetch) => !fetch.diagnosticOnly).every((fetch) => fetch.timedOut);
    if (!rawItems.length && !forceMiddleGradesCleanCandidateShortfallExpansion && !context.signal?.aborted && !teenMainQueryTimedOutDuringRun && !middleGradesAllRealFetchesTimedOutDuringRun) {
      const probeQuery = context.profile.ageBand === "adult"
        ? (queryPlans[0]?.routingReason === "adult_scifi"
          ? "science fiction thriller"
          : queryPlans[0]?.routingReason === "adult_gothic_horror_fantasy"
            ? "supernatural horror"
            : queryPlans[0]?.routingReason === "adult_fantasy_historical_survival"
              ? "historical fantasy"
              : queryPlans[0]?.routingReason === "adult_historical_speculative_thriller"
                ? "historical thriller"
          : queries.some((query) => /\b(mystery|thriller|suspense|crime)\b/i.test(query))
            ? "psychological thriller"
            : queries.some((query) => /\b(contemporary|literary|drama)\b/i.test(query))
              ? "contemporary fiction"
              : ageProfile.diagnosticProbeQuery)
        : ageProfile.key === "middleGrades"
          ? queries.some((query) => /\b(science fiction|sci-fi|space|dystopian|dystopia)\b/i.test(query)) ? "middle grade adventure" : queries.some((query) => /\b(humor|funny|school|friendship|contemporary|realistic)\b/i.test(query)) ? middleGradesZeroCandidateFallbackQuery(queryPlans, new Set(fetches.filter((fetch) => !fetch.diagnosticOnly).map((fetch) => String(fetch.query || "").toLowerCase()))) : queries.some((query) => /\b(mystery|detective|suspense)\b/i.test(query)) ? "middle grade adventure" : "middle grade adventure"
          : queries.some((query) => /\bdystopian|dystopia\b/i.test(query)) ? "young adult dystopian" : queries.some((query) => /\bhorror|paranormal\b/i.test(query)) ? "young adult horror" : queries.some((query) => /\b(mystery|thriller|suspense)\b/i.test(query)) ? "young adult mystery" : queries.some((query) => /\byoung adult fantasy\b/i.test(query)) ? ageProfile.diagnosticProbeQuery : "young adult fantasy";
      const probePlan: OpenLibraryQueryPlan = { query: probeQuery, originalPlannedQuery: queries[0] || "", queryCascadeIndex: queryPlans.length, queryFamily: "emergency_fallback", facets: [], emergencyFallback: true, routingReason: "diagnostic_probe_emergency_fallback" };
      const { docs: probeDocs, diagnostic } = await fetchOpenLibraryDocs(probePlan, ageProfile.docsPerQuery, context.signal, true, ageProfile.probeTimeoutMs, 1);
      fetches.push({ ...diagnostic, diagnosticOnly: true, failedReason: diagnostic.failedReason || (probeDocs.length ? "emergency_fallback_probe_returned_docs" : undefined) });
      if (diagnostic.timedOut && !failedReason) failedReason = diagnostic.failedReason || "openlibrary_probe_timed_out";
      if (probeDocs.length) {
        dropReasons.emergency_fallback_probe_docs = Number(dropReasons.emergency_fallback_probe_docs || 0) + probeDocs.length;
        let acceptedProbeDocs = 0;
        for (const doc of probeDocs) {
          const title = String(doc?.title || "").trim();
          if (title) rawTitles.push(title);
          if (!title) continue;
          recordMiddleGradesAgeShapeDiagnostic(doc, probeQuery, "probe");
          const quality = shouldKeepOpenLibraryDoc(doc, probeQuery, context.profile);
          if (!quality.keep) {
            const reason = `emergency_fallback_${quality.reason || "quality_filter"}`;
            dropReasons[reason] = Number(dropReasons[reason] || 0) + 1;
            if (/artifact|inappropriate/.test(reason)) artifactSuppressedTitles.push(title);
            continue;
          }
          const hasEmergencyOverlap = isAdultMixedHistoricalMysteryRomanceProfile(context.profile)
            ? hasAdultMixedHistoricalMysteryFallbackOverlap(doc)
            : emergencyFallbackHasMeaningfulOverlap(doc, queryPlans);
          if (!hasEmergencyOverlap) {
            dropReasons.emergency_fallback_no_meaningful_overlap = Number(dropReasons.emergency_fallback_no_meaningful_overlap || 0) + 1;
            continue;
          }
          if (!shouldAcceptMiddleGradesSourceDoc(doc, probeQuery, probePlan, "emergency_probe")) continue;
          rawItems.push(normalizeOpenLibraryDoc(doc, probePlan));
          acceptedProbeDocs += 1;
          dropReasons.emergency_fallback_accepted = Number(dropReasons.emergency_fallback_accepted || 0) + 1;
          if (rawItems.length >= Math.min(ageProfile.minCleanDocs, 4)) break;
        }
        if (acceptedProbeDocs === 0) {
          dropReasons.probe_returned_docs_all_rejected = Number(dropReasons.probe_returned_docs_all_rejected || 0) + 1;
          failedReason = failedReason || "probe_returned_docs_all_rejected";
        }
      }
    }

    if (context.signal?.aborted) {
      return {
        source: "openLibrary",
        status: "timed_out",
        rawItems,
        diagnostics: emptyDiagnostics(plan, "timed_out", startedAt, {
          queries,
          rawCount: rawItems.length,
          normalizedCount: rawItems.length,
          rawTitles: uniqueStrings(rawTitles, 10),
          failedReason: failedReason || "openlibrary_aborted_after_query_complete",
          emptyReason: openLibraryEmptyReason(rawItems, rawApiResultCount, dropReasons, fetches, failedReason || "openlibrary_aborted_after_query_complete"),
          openLibraryProbeRan: fetches.some((fetch) => fetch.diagnosticOnly),
          rawApiResultCount,
          droppedBeforeDocCount: Object.values(dropReasons).reduce((sum, count) => sum + count, 0),
          dropReasons,
          openLibraryTopUpRan,
          openLibraryTopUpTarget: ageProfile.minCleanDocs,
          openLibraryFallbackQueriesExhausted: rawItems.length < ageProfile.minCleanDocs && fetches.filter((fetch) => !fetch.diagnosticOnly).length >= queryPlans.length,
          usableRowsAfterFiltering: rawItems.length,
          openLibraryQueryRouting,
          openLibraryAgeProfile: ageProfile.key,
          openLibraryProfileLabel: ageProfile.behaviorLabel,
          firstRunFetchTimeout,
          retryAttempted,
          retrySucceeded,
          proxyColdStartSuspected,
          middleGradesAgeShapeDiagnostics: middleGradesAgeShapeDiagnostics(),
          middleGradesDelayedRetryAttempted,
          middleGradesDelayedRetrySkippedReason: middleGradesDelayedRetrySkippedReason || undefined,
          middleGradesDelayedRetryTimeoutMs,
          middleGradesTimeoutBudgetRemainingBeforeRetry,
          fetches,
        }),
      };
    }

    const finishedAt = nowIso();
    const mainFetches = fetches.filter((fetch) => !fetch.diagnosticOnly);
    const allMainFetchesTimedOut = mainFetches.length > 0 && mainFetches.every((fetch) => fetch.timedOut);
    const middleGradesAntiZeroFallbackSuccessCount = ageProfile.key === "middleGrades"
      ? rawItems.filter((item: any) => item?.fallbackAlignment === "anti_zero" || item?.emergencyFallback).length
      : undefined;
    const middleGradesRouteAlignedSuccessCount = ageProfile.key === "middleGrades"
      ? rawItems.filter((item: any) => item?.fallbackAlignment !== "anti_zero" && !item?.emergencyFallback).length
      : undefined;
    const middleGradesFallbackOnlySlate = ageProfile.key === "middleGrades" && rawItems.length > 0
      ? Number(middleGradesAntiZeroFallbackSuccessCount || 0) > 0 && Number(middleGradesRouteAlignedSuccessCount || 0) === 0
      : undefined;
    const middleGradesGenericDefaultSlateDetected = ageProfile.key === "middleGrades" && rawItems.length > 0
      ? rawItems.filter((item: any) => /\b(humor|funny|school story|school adventure|adventure)\b/i.test(String(item?.queryText || item?.queryFamily || "")) && !/\b(friendship|family|contemporary|realistic|mystery|ai|robot|superhero)\b/i.test([item?.title, item?.subtitle, item?.subjects, item?.description].flat().join(" "))).length >= Math.min(4, rawItems.length)
      : undefined;
    const middleGradesGenericDefaultSlateReason = middleGradesGenericDefaultSlateDetected ? "query_text_default_family_without_doc_level_school_friendship_family_contemporary_specificity" : undefined;
    if (ageProfile.key === "middleGrades" && middleGradesFallbackOnlySlate) {
      middleGradesWhyFallbackOnlyAcceptedAsFinal = middleGradesRouteAlignedRecoveryAttemptedAfterFallback
        ? "post_fallback_route_aligned_recovery_produced_no_accepted_rows"
        : middleGradesRouteAlignedRecoverySkippedReason || "anti_zero_fallback_preserved_count_stability";
    }
    const middleGradesFinalCountContractStatus = ageProfile.key === "middleGrades"
      ? rawItems.length === 0
        ? "zero_result_failure"
        : rawItems.length >= Math.min(ageProfile.docLimit, 5)
          ? Number(middleGradesRouteAlignedSuccessCount || 0) >= Math.min(ageProfile.docLimit, 5)
            ? "full_route_aligned"
            : middleGradesFallbackOnlySlate
              ? "full_fallback_only"
              : "full_mixed_recovery"
          : middleGradesFallbackOnlySlate
            ? "underfilled_fallback_only"
            : "underfilled_mixed"
      : undefined;
    const middleGradesLockQualityStatus = ageProfile.key === "middleGrades"
      ? rawItems.length === 0
        ? "zero_result_failure"
        : middleGradesFallbackOnlySlate
          ? /fallback_only_low_confidence/.test(String(middleGradesSelectedFallbackQueryReason || "")) ? "fallback_only_low_confidence" : "fallback_only_success"
          : Number(middleGradesAntiZeroFallbackSuccessCount || 0) > 0
            ? "mixed_recovery_success"
            : "route_aligned_success"
      : undefined;
    const middleGradesRemainingTargetedQueries = ageProfile.key === "middleGrades" ? middleGradesUnattemptedTargetedQueries() : [];
    const middleGradesUnderfilledDespiteTargetedQueriesRemaining = ageProfile.key === "middleGrades" && rawItems.length < Math.min(ageProfile.docLimit, 5) && middleGradesRemainingTargetedQueries.length > 0;
    const middleGradesUnderfilledWithSameFamilyQueriesRemaining = ageProfile.key === "middleGrades"
      && rawItems.length < Math.min(ageProfile.docLimit, 5)
      && Array.from(middleGradesSameFamilyContinuationQuerySet).some((query) => !middleGradesAttemptedQueries().has(query));
    const selectedUniqueRootCount = ageProfile.key === "middleGrades"
      ? new Set(rawItems.map((item: any) => openLibraryCollectionRootKey(item) || String(item?.title || "").toLowerCase()).filter(Boolean)).size
      : undefined;
    if (ageProfile.key === "middleGrades" && rawItems.length < Math.min(ageProfile.docLimit, 5)) {
      middleGradesUnderfillStopReasonDetailed = rawApiResultCount === 0
        ? "no_raw_docs"
        : rawItems.length === 0 && middleGradesDocsReturnedButAllDropped > 0
          ? "raw_docs_all_rejected"
          : sameRootCollectionCollapsedTitles.length > 0
            ? "usable_docs_but_duplicate_root_collapsed"
            : middleGradesRecoverySkippedInsufficientBudget || middleGradesUnderfillSafeRecoverySkippedReason === "insufficient_budget"
              ? "usable_docs_but_budget_exhausted"
              : middleGradesUnderfillSafeRecoveryAttempted
                ? "usable_docs_but_underfill_recovery_exhausted"
                : "underfill_recovery_not_attempted";
    }
    if (ageProfile.key === "middleGrades" && rawItems.length < Math.min(ageProfile.docLimit, 5) && !middleGradesFinalUnderfillTargetedExhaustionReason) {
      middleGradesFinalUnderfillTargetedExhaustionReason = middleGradesRemainingTargetedQueries.length
        ? "underfilled_with_targeted_queries_remaining"
        : middleGradesTargetedQueriesAttempted.length
          ? "targeted_queries_exhausted_before_five"
          : "no_targeted_queries_generated_for_profile";
    }
    if (middleGradesDebugTrace) {
      const tracedFetchKeys = new Set(middleGradesDebugTrace.fetchTrace.map((row) => `${row.query}:${row.fetchPath}:${row.elapsedMs}`));
      for (const fetch of fetches) {
        const key = `${fetch.query}:${fetch.fetchPath}:${fetch.elapsedMs}`;
        if (!tracedFetchKeys.has(key)) traceMiddleGradesFetch(fetch);
      }
      middleGradesDebugTrace.selectionTrace.push(...rawItems.map((item: any) => ({
        title: item?.title,
        selected: true,
        rejectionReason: undefined,
        duplicateRootDecision: openLibraryCollectionRootKey(item) ? "collection_root_reserved" : "unique_or_no_collection_root",
        finalEligibilityDecision: "source_candidate_returned_to_selection",
        removedByFinalReturnedItemsRootCollapse: false,
        recoveryTopUpAttemptedAfterRemoval: false,
        queryText: item?.queryText,
        routingReason: item?.routingReason,
        fallbackAlignment: item?.fallbackAlignment,
      })));
    }
    const middleGradesDebugCompactSummary = middleGradesDebugTrace ? {
      best20RawDocsByQuery: middleGradesDebugTrace.rawDocTrace.slice(0, 20).map((row) => ({ query: row.query, title: row.title, accepted: row.accepted, rejectionReason: row.rejectionReason })),
      best20RejectedDocsWithReasons: middleGradesDebugTrace.rawDocTrace.filter((row) => !row.accepted).slice(0, 20).map((row) => ({ query: row.query, title: row.title, reason: row.rejectionReason })),
      best20SelectedEligibleDocs: rawItems.slice(0, 20).map((item: any) => ({ title: item?.title, query: item?.queryText, routingReason: item?.routingReason, fallbackAlignment: item?.fallbackAlignment })),
      finalUnderfillReason: rawItems.length < Math.min(ageProfile.docLimit, 5) ? (middleGradesUnderfillStopReasonDetailed || middleGradesFinalUnderfillTargetedExhaustionReason || "unknown") : undefined,
    } : undefined;
    const middleGradesHasUnattemptedSpecificAfterTimeout = ageProfile.key === "middleGrades" && middleGradesPlannedSpecificQueriesUnattemptedAtTimeout.length > 0;
    const status: SourceResult["status"] = rawItems.length ? "succeeded" : (allMainFetchesTimedOut && !middleGradesHasUnattemptedSpecificAfterTimeout) ? "timed_out" : failedReason ? "failed" : "empty";
    const emptyReason = !rawItems.length && (status === "empty" || status === "failed" || status === "timed_out") ? openLibraryEmptyReason(rawItems, rawApiResultCount, dropReasons, fetches, failedReason) : undefined;
    middleGradesOpenLibraryCandidatePoolBeforeEarlyCap = ageProfile.key === "middleGrades" ? rawItems.length : 0;
    middleGradesOpenLibraryCandidatePoolAfterEarlyCap = middleGradesOpenLibraryCandidatePoolBeforeEarlyCap;
    const middleGradesMediumStrongEvidenceAcceptedTitlesForDiagnostics = ageProfile.key === "middleGrades"
      ? uniqueStrings([
        ...middleGradesMediumStrongEvidenceAcceptedTitles,
        ...middleGradesMediumStrongRawItems().map((item: any) => String(item?.title || "")).filter(Boolean),
      ], 20)
      : [];
    const openLibraryScoringHandoffEligiblePool = ageProfile.key === "middleGrades" && debugMiddleGradesDeepTrace
      ? (() => {
        const byKey = new Map<string, unknown>();
        for (const item of [...middleGradesExpandedScoringPool, ...rawItems] as any[]) {
          const title = String(item?.title || "").trim();
          if (!title) continue;
          const key = String(item?.sourceId || item?.key || item?.workKey || `${title}:${Array.isArray(item?.authors) ? item.authors[0] : ""}`).toLowerCase();
          if (!byKey.has(key)) byKey.set(key, item);
        }
        const pooled = Array.from(byKey.values()).map((item: any) => {
          if (!middleGradesMeaningfulTasteRecoveryTriggered) return item;
          const eligibility = middleGradesSourceMeaningfulTasteEligibility(item?.rawOpenLibraryDoc || item, context.profile);
          if (!eligibility.allowed) return item;
          item.meaningfulTasteRecovery = true;
          item.scoringHandoffStage = item.scoringHandoffStage || "meaningful_taste_recovery";
          if (eligibility.signals.length) {
            item.meaningfulTasteRecoveryDocumentSignals = uniqueStrings([...(Array.isArray(item.meaningfulTasteRecoveryDocumentSignals) ? item.meaningfulTasteRecoveryDocumentSignals : []), ...eligibility.signals], 24);
            item.themes = uniqueStrings([...(Array.isArray(item.themes) ? item.themes : []), ...eligibility.signals], 24);
          }
          return item;
        });
        const recoveryItems = pooled.filter((item: any) => item?.meaningfulTasteRecovery || item?.scoringHandoffStage === "meaningful_taste_recovery");
        const nonRecoveryItems = pooled.filter((item: any) => !recoveryItems.includes(item));
        return [...recoveryItems, ...nonRecoveryItems];
      })()
      : rawItems;
    const openLibraryScoringHandoffItems = ageProfile.key === "middleGrades" && debugMiddleGradesDeepTrace
      ? openLibraryScoringHandoffEligiblePool.slice(0, MIDDLE_GRADES_OPEN_LIBRARY_DEBUG_CANDIDATE_POOL_LIMIT)
      : rawItems;
    const openLibraryScoringHandoffSuppressedTitles = ageProfile.key === "middleGrades"
      ? openLibraryScoringHandoffEligiblePool.slice(openLibraryScoringHandoffItems.length).map((item: any) => String(item?.title || "")).filter(Boolean)
      : [];
    const middleGradesMeaningfulTasteRecoveryItemsInHandoff = ageProfile.key === "middleGrades" && middleGradesMeaningfulTasteRecoveryTriggered
      ? openLibraryScoringHandoffItems.filter((item: any) => item?.meaningfulTasteRecovery || item?.scoringHandoffStage === "meaningful_taste_recovery")
      : [];
    const middleGradesMeaningfulTasteRecoveryFinalCountForDiagnostics = ageProfile.key === "middleGrades" && middleGradesMeaningfulTasteRecoveryTriggered
      ? Math.max(middleGradesMeaningfulTasteRecoveryFinalCount || 0, middleGradesMeaningfulTasteRecoveryItemsInHandoff.length)
      : 0;
    const openLibraryScoringHandoffSource: SourceDiagnosticV2["openLibraryScoringHandoffSource"] = ageProfile.key === "middleGrades"
      ? debugMiddleGradesDeepTrace ? "expanded_debug_pool" : "production_pool"
      : undefined;
    const openLibraryScoringHandoffLimitedToSourceFinal = ageProfile.key === "middleGrades"
      ? Boolean(!debugMiddleGradesDeepTrace && rawApiResultCount > openLibraryScoringHandoffItems.length && openLibraryScoringHandoffItems.length <= Math.min(ageProfile.docLimit, 5))
      : undefined;
    const middleGradesExpandedPoolHandoffFailed = ageProfile.key === "middleGrades"
      ? Boolean(debugMiddleGradesDeepTrace && rawApiResultCount > 20 && openLibraryScoringHandoffItems.length < 10)
      : undefined;
    const middleGradesExpandedPoolFailureReason = middleGradesExpandedPoolHandoffFailed
      ? openLibraryScoringHandoffLimitedToSourceFinal
        ? "source_handoff_limited_to_source_final_5"
        : openLibraryScoringHandoffEligiblePool.length < 10
          ? "fetched_docs_rejected_before_scoring_eligibility"
          : "expanded_pool_handoff_under_minimum_scoring_count"
      : undefined;
    const expansionPreCapCandidateCount = ageProfile.key === "middleGrades" && forceMiddleGradesCleanCandidateShortfallExpansion
      ? openLibraryScoringHandoffEligiblePool.length
      : undefined;
    const expansionPostCapCandidateCount = ageProfile.key === "middleGrades" && forceMiddleGradesCleanCandidateShortfallExpansion
      ? openLibraryScoringHandoffItems.length
      : undefined;
    const expansionCapApplied = ageProfile.key === "middleGrades" && forceMiddleGradesCleanCandidateShortfallExpansion
      ? Number(expansionPostCapCandidateCount || 0) < Number(expansionPreCapCandidateCount || 0)
      : undefined;
    const expansionCapReason = ageProfile.key === "middleGrades" && forceMiddleGradesCleanCandidateShortfallExpansion
      ? expansionCapApplied
        ? debugMiddleGradesDeepTrace
          ? "expanded_debug_pool_candidate_limit"
          : "production_pool_candidate_limit"
        : "none"
      : undefined;
    const cleanExpansionAttemptedQueries = cleanCandidateShortfallExpansionActive
      ? uniqueStrings(queries, 20)
      : uniqueStrings(middleGradesMeaningfulTasteRecoveryQueriesAttempted, 20);
    const statusForHandoff: SourceResult["status"] = openLibraryScoringHandoffItems.length ? "succeeded" : status;
    return {
      source: "openLibrary",
      status: statusForHandoff,
      rawItems: openLibraryScoringHandoffItems,
      diagnostics: {
        source: "openLibrary",
        status: statusForHandoff,
        planned: true,
        attempted: true,
        timedOut: statusForHandoff === "timed_out",
        startedAt,
        finishedAt,
        elapsedMs: Date.parse(finishedAt) - Date.parse(startedAt),
        rawCount: openLibraryScoringHandoffItems.length,
        normalizedCount: openLibraryScoringHandoffItems.length,
        queries,
        rawTitles: uniqueStrings(rawTitles, 10),
        firstReturnedTitles: uniqueStrings(openLibraryScoringHandoffItems.map((item: any) => item?.title), 5),
        failedReason: openLibraryScoringHandoffItems.length ? undefined : failedReason || undefined,
        emptyReason,
        openLibraryProbeRan: fetches.some((fetch) => fetch.diagnosticOnly),
        rawApiResultCount,
        droppedBeforeDocCount: Object.values(dropReasons).reduce((sum, count) => sum + count, 0),
        dropReasons,
        openLibraryTopUpRan,
        openLibraryTopUpTarget: ageProfile.minCleanDocs,
        openLibraryFallbackQueriesExhausted: rawItems.length < ageProfile.minCleanDocs && mainFetches.length >= queryPlans.length,
        usableRowsAfterFiltering: openLibraryScoringHandoffItems.length,
        openLibraryDocsFetchedAcrossAllQueriesCount: rawApiResultCount,
        openLibraryDocsEligibleForScoringCount: openLibraryScoringHandoffEligiblePool.length,
        openLibraryDocsActuallyHandedToScoringCount: openLibraryScoringHandoffItems.length,
        openLibraryScoringHandoffLimitedToSourceFinal,
        openLibraryScoringHandoffSuppressedTitles: ageProfile.key === "middleGrades" ? uniqueStrings(openLibraryScoringHandoffSuppressedTitles, 50) : undefined,
        openLibraryScoringHandoffSource,
        middleGradesExpandedPoolHandoffFailed,
        middleGradesExpandedPoolFailureReason,
        openLibraryQueryRouting,
        openLibraryAgeProfile: ageProfile.key,
        openLibraryProfileLabel: ageProfile.behaviorLabel,
        firstRunFetchTimeout,
        retryAttempted,
        retrySucceeded,
        proxyColdStartSuspected,
        middleGradesAgeShapeDiagnostics: middleGradesAgeShapeDiagnostics(),
        middleGradesDelayedRetryAttempted,
        middleGradesDelayedRetrySkippedReason: middleGradesDelayedRetrySkippedReason || undefined,
        middleGradesDelayedRetryTimeoutMs,
        middleGradesTimeoutBudgetRemainingBeforeRetry,
        perQueryBudgetReserved: ageProfile.key === "middleGrades" ? middleGradesPerQueryBudgetReserved : undefined,
        skippedRemainingQueriesDueToBudgetExhaustion: ageProfile.key === "middleGrades" ? middleGradesSkippedRemainingQueriesDueToBudgetExhaustion : undefined,
        plannedSpecificQueriesUnattemptedAtTimeout: ageProfile.key === "middleGrades" ? uniqueStrings(middleGradesPlannedSpecificQueriesUnattemptedAtTimeout, 20) : undefined,
        middleGradesRouteAlignedSuccessCount,
        middleGradesAntiZeroFallbackSuccessCount,
        middleGradesFallbackOnlySlate,
        middleGradesAntiZeroFallbackShapedQuery,
        middleGradesAntiZeroFallbackShapingSignals,
        fallbackCandidateQueries: middleGradesFallbackCandidateQueries,
        fallbackQueryScores: middleGradesFallbackQueryScores,
        fallbackQueryReliability: middleGradesFallbackQueryReliability,
        positiveEvidenceByFallbackQuery: middleGradesPositiveEvidenceByFallbackQuery,
        avoidEvidenceByFallbackQuery: middleGradesAvoidEvidenceByFallbackQuery,
        selectedFallbackQueryReason: middleGradesSelectedFallbackQueryReason,
        whyHigherTasteFallbackLost: middleGradesWhyHigherTasteFallbackLost,
        whySelectedFallbackTimedOutOrSucceeded: middleGradesFallbackOutcomes.length ? middleGradesFallbackOutcomes : undefined,
        fallbackAttemptOrder: middleGradesFallbackAttemptOrder.length ? middleGradesFallbackAttemptOrder : undefined,
        remainingBudgetBeforeEachFallback: Object.keys(middleGradesRemainingBudgetBeforeEachFallback).length ? middleGradesRemainingBudgetBeforeEachFallback : undefined,
        lockQualityStatus: middleGradesLockQualityStatus,
        fallbackSlateSpecificityScore: middleGradesFallbackSlateSpecificityScore,
        genericDefaultSlateDetected: middleGradesGenericDefaultSlateDetected,
        genericDefaultSlateReason: middleGradesGenericDefaultSlateReason,
        strongerSignalDroppedFromFallbackQuery: middleGradesStrongerSignalDroppedFromFallbackQuery,
        whyFallbackOnlyAcceptedAsFinal: middleGradesWhyFallbackOnlyAcceptedAsFinal,
        routeAlignedRecoveryAttemptedAfterFallback: ageProfile.key === "middleGrades" ? middleGradesRouteAlignedRecoveryAttemptedAfterFallback : undefined,
        routeAlignedRecoverySkippedReason: middleGradesRouteAlignedRecoverySkippedReason,
        underfillSafeRecoveryAttempted: ageProfile.key === "middleGrades" ? middleGradesUnderfillSafeRecoveryAttempted : undefined,
        underfillSafeRecoveryQueries: middleGradesUnderfillSafeRecoveryQueriesAttempted.length ? middleGradesUnderfillSafeRecoveryQueriesAttempted : undefined,
        underfillSafeRecoveryAcceptedCount: ageProfile.key === "middleGrades" ? middleGradesUnderfillSafeRecoveryAcceptedCount : undefined,
        underfillSafeRecoverySkippedReason: middleGradesUnderfillSafeRecoverySkippedReason,
        profileSpecificQueriesAttempted: ageProfile.key === "middleGrades" ? uniqueStrings(middleGradesProfileSpecificQueriesAttempted, 20) : undefined,
        profileSpecificQueriesTimedOut: ageProfile.key === "middleGrades" ? middleGradesProfileSpecificQueriesTimedOut : undefined,
        profileSpecificQueriesAcceptedCount: ageProfile.key === "middleGrades" ? middleGradesProfileSpecificQueriesAcceptedCount : undefined,
        targetedQueryBatchByRoute: ageProfile.key === "middleGrades" ? middleGradesTargetedQueriesForRun : undefined,
        targetedQueryFamilyScoreByFamily: ageProfile.key === "middleGrades" ? middleGradesTargetedPlanForRun?.scoreByFamily : undefined,
        targetedQueryFamilyLikedEvidenceByFamily: ageProfile.key === "middleGrades" ? middleGradesTargetedPlanForRun?.likedEvidenceByFamily : undefined,
        targetedQueryFamilySkipEvidenceByFamily: ageProfile.key === "middleGrades" ? middleGradesTargetedPlanForRun?.skipEvidenceByFamily : undefined,
        targetedQueryFamilyAvoidEvidenceByFamily: ageProfile.key === "middleGrades" ? middleGradesTargetedPlanForRun?.avoidEvidenceByFamily : undefined,
        firstBatchChosenBecause: ageProfile.key === "middleGrades" ? middleGradesTargetedPlanForRun?.firstBatchChosenBecause : undefined,
        skipOnlyFamilyPromotedToFirstBatch: ageProfile.key === "middleGrades" ? middleGradesTargetedPlanForRun?.skipOnlyFamilyPromotedToFirstBatch : undefined,
        firstBatchSkipOnlyFamilyBlocked: middleGradesFirstBatchSkipOnlyFamilyBlocked,
        skippedFantasyPromotedToFirstBatch: middleGradesSkippedFantasyPromotedToFirstBatch,
        likedEvidenceFirstBatchFamilies: ageProfile.key === "middleGrades" ? uniqueStrings(middleGradesLikedEvidenceFirstBatchFamilies, 12) : undefined,
        likedEvidenceQueryFamiliesAttemptedBeforeSkipOnlyRecovery: ageProfile.key === "middleGrades" ? uniqueStrings(middleGradesTargetedQueriesAttempted.map((query) => middleGradesTargetedPlanForRun?.familyByQuery?.[query]).filter((family) => family && middleGradesTargetedPlanForRun?.likedEvidenceQueryFamilies.includes(family)), 12) : undefined,
        docsReturnedButAllDropped: ageProfile.key === "middleGrades" ? middleGradesDocsReturnedButAllDropped : undefined,
        allDroppedContinuationQuery: ageProfile.key === "middleGrades" ? uniqueStrings(middleGradesAllDroppedContinuationQuery, 12) : undefined,
        reliableVariantAttempted: ageProfile.key === "middleGrades" ? uniqueStrings(middleGradesReliableVariantAttempted, 20) : undefined,
        reliableVariantAcceptedCount: ageProfile.key === "middleGrades" ? middleGradesReliableVariantAcceptedCount : undefined,
        firstBatchSpecificQueryTimedOutCount: ageProfile.key === "middleGrades" ? middleGradesFirstBatchSpecificQueryTimedOutCount : undefined,
        firstBatchReliableVariantUsed: ageProfile.key === "middleGrades" ? middleGradesFirstBatchReliableVariantUsed : undefined,
        middleGradesFetchMode: ageProfile.key === "middleGrades" ? middleGradesFetchMode : undefined,
        firstBatchParallelQueries: ageProfile.key === "middleGrades" ? middleGradesFirstBatchParallelQueries : undefined,
        firstBatchParallelAcceptedCount: ageProfile.key === "middleGrades" ? middleGradesFirstBatchParallelAcceptedCount : undefined,
        repeatedProxyAbortCount: ageProfile.key === "middleGrades" ? middleGradesRepeatedProxyAbortCount : undefined,
        directFallbackAttemptedAfterProxyAbort: ageProfile.key === "middleGrades" ? middleGradesDirectFallbackAttemptedAfterProxyAbort : undefined,
        proxyTimedOutThenDirectAttemptedSameQuery: ageProfile.key === "middleGrades" ? middleGradesProxyTimedOutThenDirectAttemptedSameQuery : undefined,
        directFetchReturnedRawButAllRejected: ageProfile.key === "middleGrades" ? middleGradesDirectFetchReturnedRawButAllRejected : undefined,
        sameFamilyContinuationAfterAllRejected: ageProfile.key === "middleGrades" ? middleGradesSameFamilyContinuationAfterAllRejected : undefined,
        sameFamilyContinuationQueriesAttempted: ageProfile.key === "middleGrades" ? uniqueStrings(middleGradesSameFamilyContinuationQueriesAttempted, 12) : undefined,
        recoverySkippedInsufficientBudget: ageProfile.key === "middleGrades" ? middleGradesRecoverySkippedInsufficientBudget : undefined,
        minimumViableRecoveryBudgetMs: ageProfile.key === "middleGrades" ? middleGradesMinimumViableRecoveryBudgetMs : undefined,
        actualRemainingBudgetBeforeRecoveryMs: ageProfile.key === "middleGrades" ? middleGradesActualRemainingBudgetBeforeRecoveryMs : undefined,
        targetedQueriesAttempted: ageProfile.key === "middleGrades" ? uniqueStrings(middleGradesTargetedQueriesAttempted, 20) : undefined,
        targetedQueriesAcceptedCount: ageProfile.key === "middleGrades" ? middleGradesTargetedQueriesAcceptedCount : undefined,
        targetedQueriesRejectedByReason: ageProfile.key === "middleGrades" ? middleGradesTargetedQueriesRejectedByReason : undefined,
        broadFallbackStartedBeforeTargetedExhaustion: ageProfile.key === "middleGrades" ? middleGradesBroadFallbackStartedBeforeTargetedExhaustion : undefined,
        underfilledDespiteTargetedQueriesRemaining: ageProfile.key === "middleGrades" ? middleGradesUnderfilledDespiteTargetedQueriesRemaining : undefined,
        underfilledAtFourDespiteAlignedCandidates: ageProfile.key === "middleGrades" ? middleGradesUnderfilledAtFourDespiteAlignedCandidates : undefined,
        underfillRecoveryAttemptedAfterFour: ageProfile.key === "middleGrades" ? middleGradesUnderfillRecoveryAttemptedAfterFour : undefined,
        underfillRecoveryAcceptedAfterFour: ageProfile.key === "middleGrades" ? middleGradesUnderfillRecoveryAcceptedAfterFour : undefined,
        underfilledWithSameFamilyQueriesRemaining: ageProfile.key === "middleGrades" ? middleGradesUnderfilledWithSameFamilyQueriesRemaining : undefined,
        rawRejectedButContinuationSkippedReason: middleGradesRawRejectedButContinuationSkippedReason,
        finalUnderfillTargetedExhaustionReason: middleGradesFinalUnderfillTargetedExhaustionReason,
        fallbackStartedOnlyAfterProfileQueriesExhausted: ageProfile.key === "middleGrades" ? middleGradesFallbackStartedOnlyAfterProfileQueriesExhausted : undefined,
        lockQualityRetryAttempted: ageProfile.key === "middleGrades" ? middleGradesLockQualityRetryAttempted : undefined,
        lockQualityRetryQueries: middleGradesLockQualityRetryQueries.length ? middleGradesLockQualityRetryQueries : undefined,
        lockQualityRetryAcceptedCount: ageProfile.key === "middleGrades" ? middleGradesLockQualityRetryAcceptedCount : undefined,
        finalReturnedDespiteLockQualityFailReason: middleGradesFinalReturnedDespiteLockQualityFailReason,
        evidenceAwareRecoveryQueries: ageProfile.key === "middleGrades" ? uniqueStrings(middleGradesEvidenceAwareRecoveryQueriesAttempted.length ? middleGradesEvidenceAwareRecoveryQueriesAttempted : middleGradesUnattemptedEvidenceAwareQueries(), 20) : undefined,
        evidenceAwareRecoveryRemainingQueries: ageProfile.key === "middleGrades" ? uniqueStrings(middleGradesUnattemptedEvidenceAwareQueries(), 20) : undefined,
        evidenceAwareRecoveryAttempted: ageProfile.key === "middleGrades" ? middleGradesEvidenceAwareRecoveryAttempted : undefined,
        evidenceAwareRecoveryAcceptedCount: ageProfile.key === "middleGrades" ? middleGradesEvidenceAwareRecoveryAcceptedCount : undefined,
        openLibraryCandidatePoolBeforeEarlyCap: ageProfile.key === "middleGrades" ? middleGradesOpenLibraryCandidatePoolBeforeEarlyCap : undefined,
        openLibraryCandidatePoolAfterEarlyCap: ageProfile.key === "middleGrades" ? middleGradesOpenLibraryCandidatePoolAfterEarlyCap : undefined,
        earlyCandidateCapApplied: ageProfile.key === "middleGrades" ? middleGradesEarlyCandidateCapApplied : undefined,
        earlyCandidateCapSuppressedTitles: ageProfile.key === "middleGrades" ? middleGradesEarlyCandidateCapSuppressedTitles : undefined,
        mediumStrongCandidatesSeenAcrossAllQueries: ageProfile.key === "middleGrades" ? middleGradesMediumStrongRawItems().map((item: any) => String(item?.title || "")).filter(Boolean).slice(0, 50) : undefined,
        weakFallbackCandidatesHeldBack: ageProfile.key === "middleGrades" ? rawItems.filter((item: any) => !middleGradesSourceMediumStrongEvidence(item?.rawOpenLibraryDoc || item, String(item?.queryText || ""), String(item?.routingReason || ""))).map((item: any) => String(item?.title || "")).filter(Boolean).slice(0, 50) : undefined,
        mediumStrongEvidenceTargetCount: ageProfile.key === "middleGrades" ? middleGradesMediumStrongEvidenceTargetCount : undefined,
        mediumStrongEvidenceSearchContinued: ageProfile.key === "middleGrades" ? middleGradesMediumStrongEvidenceSearchContinued : undefined,
        mediumStrongEvidenceQueriesAttempted: ageProfile.key === "middleGrades" ? uniqueStrings(middleGradesMediumStrongEvidenceQueriesAttempted, 20) : undefined,
        mediumStrongEvidenceAcceptedTitles: ageProfile.key === "middleGrades" ? middleGradesMediumStrongEvidenceAcceptedTitlesForDiagnostics : undefined,
        weakEvidenceFinalizedBecause: ageProfile.key === "middleGrades" ? middleGradesWeakEvidenceFinalizedBecause : undefined,
        weakEvidenceReturnedOnlyAfterEvidenceSearchExhausted: ageProfile.key === "middleGrades" ? middleGradesWeakEvidenceReturnedOnlyAfterEvidenceSearchExhausted : undefined,
        cleanCandidateShortfallExpansionTriggered: cleanCandidateShortfallExpansionActive || undefined,
        expansionNotTriggeredReason: (ageProfile.key === "middleGrades" || ageProfile.key === "k2") && !cleanCandidateShortfallExpansionActive ? "not_requested" : undefined,
        expansionFetchAttempted: cleanCandidateShortfallExpansionActive ? fetches.some((fetch) => !fetch.diagnosticOnly) : undefined,
        expansionAttemptedQueries: cleanCandidateShortfallExpansionActive ? cleanExpansionAttemptedQueries : undefined,
        expansionFetchResultsByQuery: cleanCandidateShortfallExpansionActive ? cleanExpansionAttemptedQueries.map((query) => {
          const matchingFetches = fetches.filter((fetch) => fetch.query === query);
          const rawCount = matchingFetches.reduce((sum, fetch) => sum + Number(fetch.docsReturned || 0), 0);
          const failed = matchingFetches.find((fetch) => fetch.failedReason || fetch.timedOut);
          return { query, status: failed ? (failed.timedOut ? "timed_out" : "error") : rawCount > 0 ? "ok" : "empty", rawCount, error: failed?.failedReason };
        }) : undefined,
        expansionRawCount: cleanCandidateShortfallExpansionActive ? cleanExpansionAttemptedQueries.reduce((sum, query) => sum + fetches.filter((fetch) => fetch.query === query).reduce((inner, fetch) => inner + Number(fetch.docsReturned || 0), 0), 0) : undefined,
        expansionConvertedCount: cleanCandidateShortfallExpansionActive ? rawItems.length : undefined,
        expansionMergedCandidateCount: cleanCandidateShortfallExpansionActive ? openLibraryScoringHandoffItems.length : undefined,
        expansionMergedTitles: cleanCandidateShortfallExpansionActive ? uniqueStrings(openLibraryScoringHandoffItems.map((item: any) => item?.title), 20) : undefined,
        expansionFetchFailureReason: ageProfile.key === "middleGrades" && forceMiddleGradesCleanCandidateShortfallExpansion && middleGradesMeaningfulTasteRecoveryQueriesAttempted.length > 0 && rawItems.length === 0 ? "expansion_source_filters_converted_zero_rows" : undefined,
        expansionMergeSkippedReason: ageProfile.key === "middleGrades" && forceMiddleGradesCleanCandidateShortfallExpansion && rawItems.length === 0 ? "no_expansion_rows_to_merge" : undefined,
        expansionCandidatesEnteredScoringCount: ageProfile.key === "middleGrades" && forceMiddleGradesCleanCandidateShortfallExpansion ? openLibraryScoringHandoffItems.length : undefined,
        expansionPreCapCandidateCount,
        expansionPostCapCandidateCount,
        expansionCapApplied,
        expansionCapReason,
        expansionDroppedBeforeScoringByReason: ageProfile.key === "middleGrades" && forceMiddleGradesCleanCandidateShortfallExpansion ? expansionDroppedBeforeScoringByReason : undefined,
        expansionDroppedBeforeScoringTitles: ageProfile.key === "middleGrades" && forceMiddleGradesCleanCandidateShortfallExpansion ? expansionDroppedBeforeScoringTitles : undefined,
        expansionCleanEligibleCount: ageProfile.key === "middleGrades" && forceMiddleGradesCleanCandidateShortfallExpansion ? 0 : undefined,
        finalEligibilityGateApplied: ageProfile.key === "middleGrades" && forceMiddleGradesCleanCandidateShortfallExpansion ? false : undefined,
        expansionCandidatesAcceptedFinal: ageProfile.key === "middleGrades" && forceMiddleGradesCleanCandidateShortfallExpansion ? [] : undefined,
        expansionSelectedTitles: ageProfile.key === "middleGrades" && forceMiddleGradesCleanCandidateShortfallExpansion ? [] : undefined,
        cleanExpansionFallbackQueriesSuppressed: ageProfile.key === "middleGrades" && forceMiddleGradesCleanCandidateShortfallExpansion ? uniqueStrings(baseQueryPlans.map((queryPlan) => queryPlan.query).filter((query) => /funny|humou?r|comedy|middle grade adventure$|middle grade friendship$|community|cozy/i.test(query)), 20) : undefined,
        cleanExpansionProfileSpecificQueriesOnly: ageProfile.key === "middleGrades" && forceMiddleGradesCleanCandidateShortfallExpansion ? queries.every((query) => !/funny|humou?r|comedy|middle grade adventure$|middle grade friendship$|community|cozy/i.test(query)) : undefined,
        cleanExpansionQueryFamilyYield: ageProfile.key === "middleGrades" && forceMiddleGradesCleanCandidateShortfallExpansion ? middleGradesRecoveryFamilyYieldByFamily : undefined,
        cleanExpansionStoppedAfterProfileFamiliesExhausted: ageProfile.key === "middleGrades" && forceMiddleGradesCleanCandidateShortfallExpansion ? middleGradesUnderfilledAfterMeaningfulTasteRecovery : undefined,
        meaningfulTasteRecoveryTriggered: ageProfile.key === "middleGrades" ? middleGradesMeaningfulTasteRecoveryTriggered : undefined,
        meaningfulTasteRecoveryTriggerStage: ageProfile.key === "middleGrades" && middleGradesMeaningfulTasteRecoveryTriggered ? (forceMiddleGradesMeaningfulTasteRecovery ? "post_final_eligibility" : "source") : undefined,
        meaningfulTasteRecoverySkippedReason: ageProfile.key === "middleGrades" && !middleGradesMeaningfulTasteRecoveryTriggered ? "trigger_conditions_not_met" : undefined,
        meaningfulTasteRecoveryQueriesAttempted: ageProfile.key === "middleGrades" ? uniqueStrings(middleGradesMeaningfulTasteRecoveryQueriesAttempted, 20) : undefined,
        meaningfulTasteRecoveryAcceptedTitles: ageProfile.key === "middleGrades" ? uniqueStrings(middleGradesMeaningfulTasteRecoveryAcceptedTitles, 20) : undefined,
        meaningfulTasteRecoveryRejectedTitlesByReason: ageProfile.key === "middleGrades" ? middleGradesMeaningfulTasteRecoveryRejectedTitlesByReason : undefined,
        recoveryQueryAnchorByQuery: ageProfile.key === "middleGrades" ? middleGradesRecoveryQueryAnchorByQuery : undefined,
        recoveryHumorUsedAsAnchorBlocked: ageProfile.key === "middleGrades" ? middleGradesRecoveryHumorUsedAsAnchorBlocked : undefined,
        recoveryConcreteFictionQueryUsed: ageProfile.key === "middleGrades" ? (middleGradesRecoveryConcreteFictionQueryUsed || (forceMiddleGradesCleanCandidateShortfallExpansion && queries.some((query) => /\b(middle grade|children)\b/i.test(query)))) : undefined,
        recoveryQueryFamilyRejectedForLeakageCount: ageProfile.key === "middleGrades" ? middleGradesRecoveryQueryFamilyRejectedForLeakageCount : undefined,
        recoveryFamilyScores: ageProfile.key === "middleGrades" ? middleGradesRecoveryFamilyScores : undefined,
        recoveryFamiliesSkippedByAvoidEvidence: ageProfile.key === "middleGrades" ? middleGradesRecoveryFamiliesSkippedByAvoidEvidence : undefined,
        recoveryFamiliesSkippedBySameRunLeakage: ageProfile.key === "middleGrades" ? middleGradesRecoveryFamiliesSkippedBySameRunLeakage : undefined,
        recoveryFamiliesSelectedForExecution: ageProfile.key === "middleGrades" ? uniqueStrings(middleGradesMeaningfulTasteRecoveryQueriesAttempted, 20) : undefined,
        recoveryFamilyExecutionOrderReason: ageProfile.key === "middleGrades" ? middleGradesRecoveryFamilyExecutionOrderReason : undefined,
        recoveryFamilyYieldByFamily: ageProfile.key === "middleGrades" ? middleGradesRecoveryFamilyYieldByFamily : undefined,
        recoveryEarlyFinalGateApplied: ageProfile.key === "middleGrades" ? middleGradesRecoveryEarlyFinalGateApplied : undefined,
        recoveryEarlyFinalGateRejectedByReason: ageProfile.key === "middleGrades" ? middleGradesRecoveryEarlyFinalGateRejectedByReason : undefined,
        recoveryAcceptedLikelyFinalSurvivorTitles: ageProfile.key === "middleGrades" ? uniqueStrings(middleGradesRecoveryAcceptedLikelyFinalSurvivorTitles, 20) : undefined,
        recoveryAcceptedButPredictedDropTitles: ageProfile.key === "middleGrades" ? uniqueStrings(middleGradesRecoveryAcceptedButPredictedDropTitles, 20) : undefined,
        recoveryFinalSurvivorPredictionMismatch: ageProfile.key === "middleGrades" ? false : undefined,
        meaningfulTasteRecoveryFinalCount: ageProfile.key === "middleGrades" ? middleGradesMeaningfulTasteRecoveryFinalCountForDiagnostics : undefined,
        underfilledAfterMeaningfulTasteRecovery: ageProfile.key === "middleGrades" ? (middleGradesMeaningfulTasteRecoveryTriggered && middleGradesMeaningfulTasteRecoveryFinalCountForDiagnostics < Math.min(ageProfile.docLimit, 5)) : undefined,
        recoverySuccessRequiresFinalEligibility: ageProfile.key === "middleGrades" ? true : undefined,
        queryOnlyRejectedThenRecoveredCount: ageProfile.key === "middleGrades" && middleGradesRejectedAllRowsAsQueryOnly ? middleGradesContinuedAfterQueryOnlyRejectionAcceptedCount : undefined,
        brittleQueryTimedOutThenShortQueryAttempted: ageProfile.key === "middleGrades" ? middleGradesBrittleQueryTimedOutThenShortQueryAttempted : undefined,
        underfillDespiteUnattemptedEvidenceQueries: ageProfile.key === "middleGrades" ? (rawItems.length < Math.min(ageProfile.docLimit, 5) && middleGradesUnattemptedEvidenceAwareQueries().length > 0) : undefined,
        rejectedAllRowsAsQueryOnly: ageProfile.key === "middleGrades" ? middleGradesRejectedAllRowsAsQueryOnly : undefined,
        queryOnlyRejectionTriggeredContinuation: ageProfile.key === "middleGrades" ? middleGradesQueryOnlyRejectionTriggeredContinuation : undefined,
        unattemptedSpecificQueriesAfterQueryOnlyRejection: ageProfile.key === "middleGrades" ? uniqueStrings(middleGradesUnattemptedSpecificQueriesAfterQueryOnlyRejection.length ? middleGradesUnattemptedSpecificQueriesAfterQueryOnlyRejection : middleGradesUnattemptedSpecificQueries(), 20) : undefined,
        continuedAfterQueryOnlyRejectionQueries: middleGradesContinuedAfterQueryOnlyRejectionQueries.length ? uniqueStrings(middleGradesContinuedAfterQueryOnlyRejectionQueries, 20) : undefined,
        continuedAfterQueryOnlyRejectionAcceptedCount: ageProfile.key === "middleGrades" ? middleGradesContinuedAfterQueryOnlyRejectionAcceptedCount : undefined,
        recoveryExhaustionReasonDetailed: middleGradesRecoveryExhaustionReasonDetailed,
        debugMiddleGradesDeepTraceEnabled: ageProfile.key === "middleGrades" ? debugMiddleGradesDeepTrace : undefined,
        debugMiddleGradesNoTimeouts: ageProfile.key === "middleGrades" ? debugMiddleGradesDeepTrace : undefined,
        middleGradesDeepDebugActive: ageProfile.key === "middleGrades" ? debugMiddleGradesDeepTrace : undefined,
        middleGradesDeepDebugActivationSource: ageProfile.key === "middleGrades" ? middleGradesDeepDebugActivationSource as SourceDiagnosticV2["middleGradesDeepDebugActivationSource"] : undefined,
        middleGradesDeepDebugRequestedButNotActivated: ageProfile.key === "middleGrades" ? Boolean(context.profile.diagnostics?.middleGradesDeepDebugRequestedButNotActivated || (context.profile.diagnostics?.middleGradesDeepDebugExpected && !debugMiddleGradesDeepTrace)) : undefined,
        middleGradesDeepDebugActivationFailureReason: ageProfile.key === "middleGrades" && (context.profile.diagnostics?.middleGradesDeepDebugRequestedButNotActivated || (context.profile.diagnostics?.middleGradesDeepDebugExpected && !debugMiddleGradesDeepTrace))
          ? String(context.profile.diagnostics?.middleGradesDeepDebugActivationFailureReason || "MIDDLE_GRADES_DEEP_DEBUG_REQUESTED_BUT_NOT_ACTIVATED")
          : undefined,
        sessionReportHeader: debugMiddleGradesDeepTrace ? "MIDDLE GRADES DEEP DEBUG: ACTIVE" : undefined,
        debugMiddleGradesBudgetMs: debugMiddleGradesDeepTrace ? sourceBudgetMs : undefined,
        debugMiddleGradesPerQueryBudgetMs: debugMiddleGradesDeepTrace ? MIDDLE_GRADES_OPEN_LIBRARY_DEBUG_PER_QUERY_BUDGET_MS : undefined,
        debugMiddleGradesPlannedQueries: middleGradesDebugTrace?.plannedQueries,
        debugMiddleGradesFetchTrace: middleGradesDebugTrace?.fetchTrace,
        debugMiddleGradesRawDocTrace: middleGradesDebugTrace?.rawDocTrace,
        debugMiddleGradesNormalizedCandidateTrace: middleGradesDebugTrace?.normalizedCandidateTrace,
        debugMiddleGradesSelectionTrace: middleGradesDebugTrace?.selectionTrace,
        debugMiddleGradesCompactSummary: middleGradesDebugCompactSummary,
        finalCountContractStatus: middleGradesFinalCountContractStatus,
        artifactSuppressedTitles: uniqueStrings(artifactSuppressedTitles, 20),
        seriesSuppressedTitles: uniqueStrings(seriesSuppressedTitles, 20),
        sameRootCollectionCollapsedTitles: ageProfile.key === "middleGrades" ? uniqueStrings(sameRootCollectionCollapsedTitles, 20) : undefined,
        selectedUniqueRootCount,
        duplicateRootBlockedReturnedTitle: ageProfile.key === "middleGrades" ? uniqueStrings(duplicateRootBlockedReturnedTitle, 20) : undefined,
        underfilledAfterDirectUsableDocs: ageProfile.key === "middleGrades" ? middleGradesUnderfilledAfterDirectUsableDocs : undefined,
        directUsableDocsButRecoveryContinued: ageProfile.key === "middleGrades" ? middleGradesDirectUsableDocsButRecoveryContinued : undefined,
        underfillStopReasonDetailed: middleGradesUnderfillStopReasonDetailed,
        rawItemPreview: openLibraryScoringHandoffItems.slice(0, 12).map((item: any) => ({ title: item?.title, authors: item?.authors || item?.author_name || item?.creators, source: item?.source, queryText: item?.queryText, originalPlannedQuery: item?.originalPlannedQuery, simplifiedOpenLibraryQuery: item?.simplifiedOpenLibraryQuery, queryCascadeIndex: item?.queryCascadeIndex, queryFamily: item?.queryFamily, routingReason: item?.routingReason, emergencyFallback: item?.emergencyFallback, fallbackAlignment: item?.fallbackAlignment, facets: item?.facets, first_publish_year: item?.first_publish_year, scoringHandoffSource: item?.scoringHandoffSource, scoringHandoffStage: item?.scoringHandoffStage })),
        fetches,
      },
    };
  },
};
