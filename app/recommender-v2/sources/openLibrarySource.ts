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
const MIDDLE_GRADES_OPEN_LIBRARY_PROXY_CLIENT_TIMEOUT_MS = 3_500;
const MIDDLE_GRADES_OPEN_LIBRARY_TIMEOUT_CASCADE_QUERY_CAP_MS = 1_500;
const MIDDLE_GRADES_OPEN_LIBRARY_TIMEOUT_CASCADE_QUERY_FLOOR_MS = 600;
const MIDDLE_GRADES_OPEN_LIBRARY_DELAYED_RETRY_MIN_BUDGET_MS = 3_500;

type OpenLibraryQueryPlan = {
  query: string;
  originalPlannedQuery: string;
  queryCascadeIndex: number;
  queryFamily: string;
  facets: string[];
  routingReason?: string;
  routingDominance?: Record<string, number | string | boolean>;
  emergencyFallback?: boolean;
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
  };
  subjectPreview: string[];
};

const ABSTRACT_OPEN_LIBRARY_TERMS = new Set([
  "identity",
  "family",
  "friendship",
  "emotional",
  "growth",
  "emotional growth",
  "self discovery",
  "relationships",
  "belonging",
  "indie",
  "mshs",
  "teen",
  "teens",
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
  const wantsFantasySchoolActionDystopian = !wantsHorrorSurvivalPsychological && !wantsHistoricalSciFiAdventure && hasFantasy && !hasParanormal && (hasSchool || hasAction || hasComedy || hasSpeculative) && fantasyWeight + actionComedyWeight + dystopianWeight >= Math.max(contemporaryWeight, mysteryWeight, historicalWeight);
  const wantsPsychologicalMysteryDrama = !wantsHorrorSurvivalPsychological && hasMystery && (hasPsychological || hasDrama || hasClearContemporarySignal) && mysteryWeight + contemporaryWeight >= Math.max(fantasyWeight, dystopianWeight, historicalWeight) * 0.8;
  const wantsContemporaryRomanceFantasy = hasFantasy && !wantsFantasySchoolActionDystopian && !hasSpeculative && !hasAction && !hasComedy && !hasParanormal && !hasHorror && (contemporaryWeight > 0 || romanceWeight > 0) && fantasyWeight + contemporaryWeight + romanceWeight >= Math.max(mysteryWeight, dystopianWeight, historicalWeight);
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
            "fantasy school",
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
  const hasHumor = /\b(humor|humorous|comedy|funny)\b/.test(facetText);
  const fantasyWeight = nonSkipSignalWeight(signalRows, /\b(fantasy|magic|magical|paranormal|supernatural)\b/);
  const adventureWeight = nonSkipSignalWeight(signalRows, /\b(adventure|action|quest|survival)\b/);
  const mysteryWeight = nonSkipSignalWeight(signalRows, /\b(mystery|detective|puzzle|investigation|suspense)\b/);
  const historicalWeight = nonSkipSignalWeight(signalRows, /\b(historical|history)\b/);
  const sciFiWeight = nonSkipSignalWeight(signalRows, /\b(science fiction|sci-fi|space|robot|speculative|dystopia|dystopian)\b/);
  const contemporaryWeight = nonSkipSignalWeight(signalRows, /\b(contemporary|realistic|school|friendship|family|coming of age)\b/);
  const humorWeight = nonSkipSignalWeight(signalRows, /\b(humor|humorous|comedy|funny)\b/);
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
  const wantsSciFiAdventure = hasSciFi && (hasAdventure || dominantFamily === "sciFi");
  const wantsContemporarySchool = hasContemporary && !wantsFantasyAdventure && !wantsMysteryAdventure && !wantsHistoricalAdventure && !wantsSciFiAdventure;
  const wantsHumor = hasHumor && !wantsMysteryAdventure && !wantsFantasyAdventure;
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
  const preparedQueries = queryCandidates.map((query) => preservedKnownGoodQueries.test(query) ? query : finalOpenLibraryQueryDedupe(query));
  const uniqueQueries = uniqueStrings(preparedQueries.filter(isUsefulOpenLibraryQueryPart), ageProfile.queryLimit);
  const routingReason = wantsFantasyMystery
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
  const routingDominance = { openLibraryPlanner: "middle_grades_profile_candidate", ageProfile: ageProfile.key, behaviorLabel: ageProfile.behaviorLabel, lockedBaseline: ageProfile.lockedBaseline, dominantFamily, dominantWeight, runnerUpWeight, dominanceRatio, wantsFantasyMystery, wantsFantasyHumor, wantsFantasySchoolFamily, wantsFantasyAdventure, wantsMysteryAdventure, wantsHistoricalAdventure, wantsSciFiAdventure, wantsContemporarySchool, wantsHumor };
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

function openLibraryRequest(query: string, limit: number): { url: string; fetchPath: "direct" | "proxy" } {
  const params = `q=${encodeURIComponent(query)}&limit=${Math.max(1, Math.min(20, limit))}`;
  if (typeof window !== "undefined") return { url: `/api/openlibrary?${params}`, fetchPath: "proxy" };
  const proxyBase = configuredOpenLibraryProxyBase();
  if (proxyBase) return { url: `${proxyBase}/api/openlibrary?${params}`, fetchPath: "proxy" };
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
  ]);
  const firstPublishYear = Number.isFinite(Number(doc?.first_publish_year)) ? Number(doc.first_publish_year) : undefined;
  const sourceUrl = key ? `https://openlibrary.org${key.startsWith("/") ? key : `/${key}`}` : undefined;
  return {
    id: key || `openlibrary:${title.toLowerCase()}`,
    sourceId: key || undefined,
    key: key || undefined,
    title,
    subtitle: String(doc?.subtitle || "").trim() || undefined,
    creators: authors,
    authors,
    author_name: authors,
    description: undefined,
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
  return undefined;
}

async function fetchOpenLibraryDocs(queryPlan: OpenLibraryQueryPlan, limit: number, signal?: AbortSignal, diagnosticOnly = false, timeoutMs = DEFAULT_OPEN_LIBRARY_PROFILE.perQueryTimeoutMs, attemptNumber = 1, proxyClientTimeoutMs?: number): Promise<{ docs: any[]; diagnostic: SourceFetchDiagnosticV2; responseBodyPrefix?: string }> {
  const query = queryPlan.query;
  const { url, fetchPath } = openLibraryRequest(query, limit);
  const proxyRetryWindowEnabled = Number.isFinite(Number(proxyClientTimeoutMs)) && fetchPath === "proxy";
  const effectiveTimeoutMs = proxyRetryWindowEnabled
    ? Math.max(timeoutMs, Number(proxyClientTimeoutMs))
    : timeoutMs;
  const fetchStartedAt = nowIso();
  const startedMs = Date.now();
  const diagnostic: SourceFetchDiagnosticV2 = {
    query,
    fetchStartedAt,
    requestStart: fetchStartedAt,
    attemptNumber,
    timedOut: false,
    fetchPath,
    clientTimeoutMs: effectiveTimeoutMs,
    proxyRetryWindowEnabled,
    diagnosticOnly,
    originalPlannedQuery: queryPlan.originalPlannedQuery,
    queryCascadeIndex: queryPlan.queryCascadeIndex,
    queryFamily: queryPlan.queryFamily,
    facets: queryPlan.facets,
  };

  const queryController = new AbortController();
  let abortReason = "";
  const timeout = setTimeout(() => {
    abortReason = "per_query_timeout";
    queryController.abort();
  }, effectiveTimeoutMs);
  const abortFromParent = () => {
    abortReason = "source_timeout_or_parent_abort";
    queryController.abort();
  };
  if (signal?.aborted) {
    abortReason = "source_already_aborted";
    queryController.abort();
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
    diagnostic.abortReason = abortReason || (diagnostic.timedOut ? "abort_or_timeout" : undefined);
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

function middleGradesRecoveryQueries(queryPlans: OpenLibraryQueryPlan[]): string[] {
  const routingReason = String(queryPlans[0]?.routingReason || "");
  const plannedQueries = queryPlans.map((plan) => plan.query);
  const ageAnchoredUnderfillQueries = ["middle grade fiction", "middle grade adventure", "middle grade fantasy", "children's fantasy adventure", "children's school stories", "middle grade humor"];
  const routeFallbacks = (() => {
    if (/humor|funny/i.test(routingReason)) return ["middle grade adventure", "middle grade fantasy adventure", "middle grade friendship", "middle grade school story", "children's funny books", "funny children's books", "children's school stories", "middle grade fiction", "middle grade fantasy", "children's fantasy adventure"];
    if (/scifi|science|dystopian/i.test(routingReason)) return ["middle grade adventure", "middle grade science fiction", "children's fantasy adventure", "middle grade fantasy", ...ageAnchoredUnderfillQueries];
    if (/fantasy/i.test(routingReason)) return ["children's fantasy adventure", "middle grade fantasy", "middle grade adventure", "middle grade fiction", "children's school stories", "middle grade humor"];
    if (/contemporary|school|friendship|realistic/i.test(routingReason)) return ["middle grade school story", "middle grade friendship", "middle grade adventure", "children's funny books", "children's school stories", "middle grade fiction", "middle grade humor", "children's fantasy adventure"];
    return [...ageAnchoredUnderfillQueries, "children's funny books"];
  })();
  return uniqueStrings([...plannedQueries.slice(1), ...routeFallbacks], 12);
}

function middleGradesZeroCandidateFallbackQuery(queryPlans: OpenLibraryQueryPlan[], attemptedQueries = new Set<string>()): string {
  const routingReason = String(queryPlans[0]?.routingReason || "");
  const firstUnattempted = (queries: string[]): string | undefined => uniqueStrings(queries, queries.length)
    .find((query) => !attemptedQueries.has(query.toLowerCase()));
  if (/humor|funny/i.test(routingReason)) return firstUnattempted(["middle grade adventure", "middle grade fantasy adventure", "middle grade friendship", "middle grade school story", "children's funny books", "funny children's books"]) || "middle grade adventure";
  if (/contemporary|school|friendship|realistic/i.test(routingReason)) return firstUnattempted(["middle grade school story", "middle grade friendship", "middle grade adventure", "children's funny books", "middle grade realistic fiction"]) || "middle grade school story";
  if (/fantasy/i.test(routingReason)) return "middle grade fantasy";
  if (/scifi|science|dystopian|mystery|historical|adventure/i.test(routingReason)) return "middle grade adventure";
  return queryPlans.find((plan) => /\b(middle grade|children'?s|school)\b/i.test(plan.query) && !attemptedQueries.has(plan.query.toLowerCase()))?.query
    || queryPlans.find((plan) => /\b(middle grade|children'?s|school)\b/i.test(plan.query))?.query
    || "middle grade adventure";
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
  const queryIsAgeAnchored = /\bmiddle grade|children'?s|school story|school mystery|magic school\b/i.test(query);
  const genreShapePattern = /\b(fantasy|magic|adventure|mystery|detective|school|students?|humor|humorous|funny|science fiction|sci-fi|space|survival|juvenile)\b/i;
  const hasSubjectGenreShape = genreShapePattern.test(subjects);
  const hasQueryGenreShape = genreShapePattern.test(query);
  const hasTitleGenreShape = genreShapePattern.test(title);
  const hasGenreShape = hasSubjectGenreShape || hasQueryGenreShape || hasTitleGenreShape;
  const hasAdultLeakageShape = /\b(short stories|literary fiction|classic literature|adult fiction|booker prize|pulitzer|nobel|erotica|dark romance)\b/.test(text);
  const keep = hasExplicitMiddleGradesEvidence || (queryIsAgeAnchored && hasGenreShape && !hasAdultLeakageShape);
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
  if (isOmnibusBundleDriftOpenLibraryDoc(doc, query, profile)) return { keep: false, reason: "adult_literary_content" };
  if (!isTeenCompatibleOpenLibraryDoc(doc, profile)) return { keep: false, reason: "not_teen_compatible_publication_year" };
  if (!hasMiddleGradesAgeShapeEvidence(doc, query, profile)) return { keep: false, reason: "middle_grades_age_shape_mismatch" };
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
    const queryPlans = buildOpenLibraryQueryPlans(plan, context.profile, ageProfile);
    const queries = queryPlans.map((queryPlan) => queryPlan.query);
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
    const rawTitles: string[] = [];
    const dropReasons: Record<string, number> = {};
    const fetches: SourceFetchDiagnosticV2[] = [];
    const acceptedSeriesKeys = new Set<string>();
    const acceptedDocKeys = new Set<string>();
    const artifactSuppressedTitles: string[] = [];
    const seriesSuppressedTitles: string[] = [];
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

    for (const [queryPlanIndex, queryPlan] of queryPlans.entries()) {
      const query = queryPlan.query;
      const elapsedBeforeQueryMs = Date.now() - Date.parse(startedAt);
      const reserveProbeTimeMs = ageProfile.probeTimeoutMs + ageProfile.probeReserveBufferMs;
      const teenMainQueryTimedOut = ageProfile.key === "teen" && fetches.some((fetch) => !fetch.diagnosticOnly && fetch.timedOut);
      const middleGradesMainQueryTimedOut = ageProfile.key === "middleGrades" && fetches.some((fetch) => !fetch.diagnosticOnly && fetch.timedOut);
      if (ageProfile.key === "teen" && teenMainQueryTimedOut && rawItems.length < Math.min(ageProfile.docLimit, 5) && elapsedBeforeQueryMs >= plan.timeoutMs) {
        dropReasons.teen_timeout_cascade_source_budget_exhausted = Number(dropReasons.teen_timeout_cascade_source_budget_exhausted || 0) + 1;
        break;
      }
      if (ageProfile.key === "teen" && teenMainQueryTimedOut && rawItems.length === 0 && elapsedBeforeQueryMs + TEEN_OPEN_LIBRARY_DELAYED_RETRY_MIN_BUDGET_MS >= plan.timeoutMs) {
        dropReasons.teen_delayed_final_retry_budget_reserved = Number(dropReasons.teen_delayed_final_retry_budget_reserved || 0) + 1;
        break;
      }
      if (ageProfile.key === "middleGrades" && middleGradesMainQueryTimedOut && rawItems.length === 0 && elapsedBeforeQueryMs + MIDDLE_GRADES_OPEN_LIBRARY_TIMEOUT_CASCADE_QUERY_FLOOR_MS + MIDDLE_GRADES_OPEN_LIBRARY_DELAYED_RETRY_MIN_BUDGET_MS >= plan.timeoutMs) {
        dropReasons.middle_grades_delayed_final_retry_budget_reserved = Number(dropReasons.middle_grades_delayed_final_retry_budget_reserved || 0) + 1;
        break;
      }
      if (!rawItems.length && fetches.length > 0 && !(ageProfile.key === "adult" && adultPrimaryQueryTimedOutTwice) && !teenMainQueryTimedOut && !middleGradesMainQueryTimedOut && elapsedBeforeQueryMs + ageProfile.perQueryTimeoutMs + reserveProbeTimeMs >= plan.timeoutMs) {
        dropReasons.main_query_reserved_probe_time = Number(dropReasons.main_query_reserved_probe_time || 0) + 1;
        break;
      }
      if (context.signal?.aborted) {
        dropReasons.probe_skipped_due_to_source_timeout = Number(dropReasons.probe_skipped_due_to_source_timeout || 0) + 1;
        failedReason = failedReason || "openlibrary_aborted_before_query_start";
        break;
      }

      const isAdultFirstMainFetch = ageProfile.key === "adult" && fetches.filter((fetch) => !fetch.diagnosticOnly).length === 0;
      const firstAttemptTimeoutMs = isAdultFirstMainFetch ? ADULT_OPEN_LIBRARY_FIRST_RUN_TIMEOUT_MS : ageProfile.perQueryTimeoutMs;
      const teenTimeoutCascadeRemainingMs = ageProfile.key === "teen" && teenMainQueryTimedOut
        ? Math.max(250, plan.timeoutMs - elapsedBeforeQueryMs - (rawItems.length === 0 ? TEEN_OPEN_LIBRARY_DELAYED_RETRY_MIN_BUDGET_MS : 0))
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
        ? Math.max(250, plan.timeoutMs - elapsedBeforeQueryMs - (rawItems.length === 0 ? MIDDLE_GRADES_OPEN_LIBRARY_DELAYED_RETRY_MIN_BUDGET_MS : 0))
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
      const mainFetchTimeoutMs = middleGradesDistributedTimeoutMs ?? teenDistributedSpecificTimeoutMs ?? middleGradesTimeoutCascadeRemainingMs ?? teenTimeoutCascadeRemainingMs ?? firstAttemptTimeoutMs;
      const mainProxyClientTimeoutMs = middleGradesDistributedTimeoutMs ?? teenDistributedSpecificTimeoutMs ?? middleGradesTimeoutCascadeRemainingMs ?? teenTimeoutCascadeRemainingMs ?? openLibraryProxyClientTimeoutMs(ageProfile);
      let { docs, diagnostic } = await fetchOpenLibraryDocs(queryPlan, ageProfile.docsPerQuery, context.signal, false, mainFetchTimeoutMs, 1, mainProxyClientTimeoutMs);
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
      if (diagnostic.timedOut) {
        dropReasons.query_timeout = Number(dropReasons.query_timeout || 0) + 1;
        failedReason = diagnostic.failedReason || "openlibrary_fetch_timed_out";
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
        if (rawItems.length >= timeoutRecoveryTarget || rawItems.length >= ageProfile.docLimit) break;
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
        break;
      }

      rawApiResultCount += docs.length;
      for (const doc of docs) {
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
        if (seriesKey) acceptedSeriesKeys.add(seriesKey);
        acceptedDocKeys.add(docKey);
        rawItems.push(normalizeOpenLibraryDoc(doc, queryPlan));
        const acceptTarget = (ageProfile.key === "adult" && adultPrimaryQueryTimedOutTwice) || teenMainQueryTimedOut ? Math.min(ageProfile.docLimit, 5) : ageProfile.docLimit;
        if (rawItems.length >= acceptTarget) break;
      }
      const cleanDocTarget = (ageProfile.key === "adult" && adultPrimaryQueryTimedOutTwice) || teenMainQueryTimedOut ? Math.min(ageProfile.docLimit, 5) : ageProfile.minCleanDocs;
      if (rawItems.length >= cleanDocTarget || rawItems.length >= ageProfile.docLimit) break;
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
        const elapsedBeforeRecoveryMs = Date.now() - Date.parse(startedAt);
        const remainingBudgetMs = plan.timeoutMs - elapsedBeforeRecoveryMs;
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
          if (context.signal?.aborted) break;
          continue;
        }
        if (diagnostic.failedReason) {
          dropReasons.teen_underfill_recovery_failed = Number(dropReasons.teen_underfill_recovery_failed || 0) + 1;
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

    if (ageProfile.key === "middleGrades" && rawItems.length === 0 && !context.signal?.aborted) {
      const mainFetches = fetches.filter((fetch) => !fetch.diagnosticOnly);
      const allAttemptedLaneQueriesTimedOut = mainFetches.length > 0 && mainFetches.every((fetch) => fetch.timedOut);
      const attemptedMainQueries = new Set(mainFetches.map((fetch) => String(fetch.query || "").toLowerCase()));
      const delayedRetryQuery = middleGradesZeroCandidateFallbackQuery(queryPlans, attemptedMainQueries);
      if (allAttemptedLaneQueriesTimedOut && delayedRetryQuery) {
        const delayedRetryPlan: OpenLibraryQueryPlan = {
          query: delayedRetryQuery,
          originalPlannedQuery: queries[0] || "",
          queryCascadeIndex: queryPlans.length + mainFetches.length,
          queryFamily: queryFamilyForOpenLibraryQuery(delayedRetryQuery),
          facets: queryPlans[0]?.facets || [],
          routingReason: `${queryPlans[0]?.routingReason || "middle_grades"}_delayed_final_retry`,
          routingDominance: queryPlans[0]?.routingDominance,
        };
        const elapsedBeforeDelayedRetryMs = Date.now() - Date.parse(startedAt);
        const delayedRetryRemainingBudgetMs = plan.timeoutMs - elapsedBeforeDelayedRetryMs;
        middleGradesTimeoutBudgetRemainingBeforeRetry = delayedRetryRemainingBudgetMs;
        if (delayedRetryRemainingBudgetMs < MIDDLE_GRADES_OPEN_LIBRARY_DELAYED_RETRY_MIN_BUDGET_MS) {
          middleGradesDelayedRetrySkippedReason = "insufficient_budget";
          dropReasons.middle_grades_delayed_final_retry_skipped_insufficient_budget = Number(dropReasons.middle_grades_delayed_final_retry_skipped_insufficient_budget || 0) + 1;
        } else {
          const delayedRetryTimeoutMs = Math.min(MIDDLE_GRADES_OPEN_LIBRARY_PROXY_CLIENT_TIMEOUT_MS, delayedRetryRemainingBudgetMs);
          middleGradesDelayedRetryAttempted = true;
          middleGradesDelayedRetryTimeoutMs = delayedRetryTimeoutMs;
          const { docs: delayedRetryDocs, diagnostic } = await fetchOpenLibraryDocs(delayedRetryPlan, ageProfile.docsPerQuery, context.signal, false, delayedRetryTimeoutMs, 3, delayedRetryTimeoutMs);
          fetches.push(diagnostic);
          dropReasons.middle_grades_delayed_final_retry_attempted = Number(dropReasons.middle_grades_delayed_final_retry_attempted || 0) + 1;
          openLibraryTopUpRan = true;
          if (diagnostic.timedOut) {
            dropReasons.middle_grades_delayed_final_retry_timeout = Number(dropReasons.middle_grades_delayed_final_retry_timeout || 0) + 1;
            if (!failedReason) failedReason = diagnostic.failedReason || "openlibrary_fetch_timed_out";
          } else if (diagnostic.failedReason) {
            dropReasons.middle_grades_delayed_final_retry_failed = Number(dropReasons.middle_grades_delayed_final_retry_failed || 0) + 1;
            if (!failedReason) failedReason = diagnostic.failedReason;
          } else {
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

    if (ageProfile.key === "middleGrades" && rawItems.length < Math.min(ageProfile.docLimit, 5) && !context.signal?.aborted) {
      const attemptedMainQueries = new Set(fetches.filter((fetch) => !fetch.diagnosticOnly).map((fetch) => String(fetch.query || "").toLowerCase()));
      const recoveryQueries = middleGradesRecoveryQueries(queryPlans)
        .filter((query) => !attemptedMainQueries.has(query.toLowerCase()));
      const recoveryTarget = Math.min(ageProfile.docLimit, 5);
      for (const recoveryQuery of recoveryQueries) {
        const elapsedBeforeRecoveryMs = Date.now() - Date.parse(startedAt);
        const remainingBudgetMs = plan.timeoutMs - elapsedBeforeRecoveryMs;
        if (remainingBudgetMs < MIDDLE_GRADES_OPEN_LIBRARY_TIMEOUT_CASCADE_QUERY_FLOOR_MS) {
          dropReasons.middle_grades_underfill_recovery_source_budget_exhausted = Number(dropReasons.middle_grades_underfill_recovery_source_budget_exhausted || 0) + 1;
          break;
        }
        const recoveryTimeoutMs = Math.min(MIDDLE_GRADES_OPEN_LIBRARY_PROXY_CLIENT_TIMEOUT_MS, Math.max(MIDDLE_GRADES_OPEN_LIBRARY_TIMEOUT_CASCADE_QUERY_FLOOR_MS, remainingBudgetMs));
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
          rawItems.push(normalizeOpenLibraryDoc(doc, recoveryPlan));
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

    if (ageProfile.key === "teen" && rawItems.length === 0 && !context.signal?.aborted) {
      const mainFetches = fetches.filter((fetch) => !fetch.diagnosticOnly);
      const allAttemptedLaneQueriesTimedOut = mainFetches.length > 0 && mainFetches.every((fetch) => fetch.timedOut);
      const delayedRetryQuery = queryPlans[0]?.query || "";
      if (allAttemptedLaneQueriesTimedOut && delayedRetryQuery) {
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
        const delayedRetryRemainingBudgetMs = plan.timeoutMs - elapsedBeforeDelayedRetryMs;
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
    if (!rawItems.length && !context.signal?.aborted && !teenMainQueryTimedOutDuringRun) {
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
          ? queries.some((query) => /\b(science fiction|sci-fi|space|dystopian|dystopia)\b/i.test(query)) ? "middle grade adventure" : queries.some((query) => /\b(humor|funny)\b/i.test(query)) ? "middle grade adventure" : queries.some((query) => /\b(school|friendship|contemporary|realistic)\b/i.test(query)) ? "middle grade school story" : queries.some((query) => /\b(mystery|detective|suspense)\b/i.test(query)) ? "middle grade adventure" : "middle grade adventure"
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
    const status: SourceResult["status"] = rawItems.length ? "succeeded" : allMainFetchesTimedOut ? "timed_out" : failedReason ? "failed" : "empty";
    const emptyReason = !rawItems.length && (status === "empty" || status === "failed" || status === "timed_out") ? openLibraryEmptyReason(rawItems, rawApiResultCount, dropReasons, fetches, failedReason) : undefined;
    return {
      source: "openLibrary",
      status,
      rawItems,
      diagnostics: {
        source: "openLibrary",
        status,
        planned: true,
        attempted: true,
        timedOut: status === "timed_out",
        startedAt,
        finishedAt,
        elapsedMs: Date.parse(finishedAt) - Date.parse(startedAt),
        rawCount: rawItems.length,
        normalizedCount: rawItems.length,
        queries,
        rawTitles: uniqueStrings(rawTitles, 10),
        firstReturnedTitles: uniqueStrings(rawItems.map((item: any) => item?.title), 5),
        failedReason: rawItems.length ? undefined : failedReason || undefined,
        emptyReason,
        openLibraryProbeRan: fetches.some((fetch) => fetch.diagnosticOnly),
        rawApiResultCount,
        droppedBeforeDocCount: Object.values(dropReasons).reduce((sum, count) => sum + count, 0),
        dropReasons,
        openLibraryTopUpRan,
        openLibraryTopUpTarget: ageProfile.minCleanDocs,
        openLibraryFallbackQueriesExhausted: rawItems.length < ageProfile.minCleanDocs && mainFetches.length >= queryPlans.length,
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
        artifactSuppressedTitles: uniqueStrings(artifactSuppressedTitles, 20),
        seriesSuppressedTitles: uniqueStrings(seriesSuppressedTitles, 20),
        rawItemPreview: rawItems.slice(0, 12).map((item: any) => ({ title: item?.title, authors: item?.authors || item?.author_name || item?.creators, source: item?.source, queryText: item?.queryText, originalPlannedQuery: item?.originalPlannedQuery, simplifiedOpenLibraryQuery: item?.simplifiedOpenLibraryQuery, queryCascadeIndex: item?.queryCascadeIndex, queryFamily: item?.queryFamily, facets: item?.facets, first_publish_year: item?.first_publish_year })),
        fetches,
      },
    };
  },
};
