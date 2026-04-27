import type { RecommendationDoc } from "./types";

type RouterFamily = "fantasy" | "horror" | "mystery" | "thriller" | "science_fiction" | "speculative" | "romance" | "historical" | "general";

type FilterDiagnostics = {
  kept: boolean;
  family: RouterFamily;
  wantsHorrorTone: boolean;
  title: string;
  pageCount: number;
  ratingsCount: number;
  hasDescription: boolean;
  hasRealLength: boolean;
  passedChecks: string[];
  rejectReasons: string[];
  flags: {
    fictionPositive: boolean;
    strongNarrative: boolean;
    genericTitle: boolean;
    speculativePositive: boolean;
    thrillerPositive: boolean;
    horrorAligned: boolean;
    historicalPositive: boolean;
    romancePositive: boolean;
    weakSeriesSpam: boolean;
    legitAuthority: boolean;
    authorAffinity: boolean;
    mysteryPositive: boolean;
    crimePositive: boolean;
    suspensePositive: boolean;
  };
};

function normalizeText(value: unknown): string {
  if (Array.isArray(value)) return value.map(normalizeText).join(" ").toLowerCase();
  if (value == null) return "";
  return String(value).toLowerCase();
}

function collectCategoryText(doc: any): string {
  return [
    normalizeText(doc?.categories),
    normalizeText(doc?.subjects),
    normalizeText(doc?.subject),
    normalizeText(doc?.genre),
    normalizeText(doc?.genres),
    normalizeText(doc?.volumeInfo?.categories),
    normalizeText(doc?.volumeInfo?.subjects),
  ]
    .filter(Boolean)
    .join(" ");
}

function collectDescriptionText(doc: any): string {
  return [
    normalizeText(doc?.description),
    normalizeText(doc?.subtitle),
    normalizeText(doc?.notes),
    normalizeText(doc?.first_sentence),
    normalizeText(doc?.excerpt),
    normalizeText(doc?.volumeInfo?.description),
    normalizeText(doc?.volumeInfo?.subtitle),
  ]
    .filter(Boolean)
    .join(" ");
}

function inferRouterFamily(bucketPlan: any): RouterFamily {
  const explicitLane = String(bucketPlan?.lane || "").toLowerCase();

  if (explicitLane === "fantasy") return "fantasy";
  if (explicitLane === "horror") return "horror";
  if (explicitLane === "mystery") return "mystery";
  if (explicitLane === "thriller") return "thriller";
  if (explicitLane === "romance") return "romance";
  if (explicitLane === "historical") return "historical";
  if (explicitLane === "science_fiction" || explicitLane === "science_fiction_family") return "science_fiction";
  if (explicitLane === "speculative" || explicitLane === "speculative_family") return "speculative";
  if (explicitLane === "general" || explicitLane === "general_family") return "general";

  const text = [
    bucketPlan?.preview,
    ...(Array.isArray(bucketPlan?.queries) ? bucketPlan.queries : []),
    ...(Array.isArray(bucketPlan?.signals?.genres) ? bucketPlan.signals.genres : []),
    ...(Array.isArray(bucketPlan?.signals?.tones) ? bucketPlan.signals.tones : []),
    ...(Array.isArray(bucketPlan?.signals?.scenarios) ? bucketPlan.signals.scenarios : []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/(psychological horror|survival horror|haunted house horror|haunted psychological horror|psychological horror thriller|horror|haunted|ghost|supernatural|occult|monster|creature|possession|terror|dread|eerie|disturbing)/.test(text)) return "horror";
  const romanceNative = /(romance|love story|rom-com|rom com|second chance romance|forbidden love romance|historical romance|gothic romance|fantasy romance|emotional romance)/.test(text);
  const hardMysteryNative = /(psychological mystery|murder investigation|crime detective|private investigator|cold case|whodunit|detective mystery|police procedural mystery)/.test(text);
  const hardThrillerNative = /(psychological thriller|crime thriller|serial killer|missing person|missing child|murder investigation|detective|fbi|procedural|crime conspiracy|conspiracy thriller|manhunt|fugitive|abduction|spy thriller|legal thriller)/.test(text);
  if (romanceNative && !hardThrillerNative && !hardMysteryNative) return "romance";
  if (hardMysteryNative) return "mystery";
  if (/(thriller|crime thriller|serial killer|missing person|crime conspiracy|legal thriller|spy thriller|manhunt|fugitive|abduction)/.test(text)) return "thriller";
  if (/(mystery|detective|investigation|murder|private investigator|whodunit|cold case|police procedural)/.test(text)) return "mystery";
  if (/(epic fantasy|high fantasy|magic fantasy|quest fantasy|character driven fantasy|dark fantasy|fantasy|wizard|witch|dragon|fae|mythic)/.test(text)) return "fantasy";
  if (/(science fiction|sci-fi|dystopian|space opera|technology|ai|artificial intelligence|robot|android|time travel|interstellar)/.test(text)) return "science_fiction";
  if (/(speculative)/.test(text)) return "speculative";
  if (romanceNative) return "romance";
  if (/(historical|period fiction|gilded age|19th century|world war)/.test(text)) return "historical";
  return "general";
}

function wantsHorrorTone(bucketPlan: any): boolean {
  const text = [
    bucketPlan?.preview,
    ...(Array.isArray(bucketPlan?.queries) ? bucketPlan.queries : []),
    ...(Array.isArray(bucketPlan?.signals?.genres) ? bucketPlan.signals.genres : []),
    ...(Array.isArray(bucketPlan?.signals?.tones) ? bucketPlan.signals.tones : []),
    ...(Array.isArray(bucketPlan?.signals?.scenarios) ? bucketPlan.signals.scenarios : []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /(horror|haunted|ghost|supernatural|occult|monster|creature|zombie|body horror|psychological horror|survival horror|terror|dread|eerie|disturbing)/.test(text);
}

const HORROR_AUTHOR_AFFINITY = new Set([
  "stephen king",
  "shirley jackson",
  "clive barker",
  "peter straub",
  "anne rice",
  "nick cutter",
  "paul tremblay",
  "grady hendrix",
  "dan simmons",
  "richard matheson",
  "ramsey campbell",
  "thomas ligotti",
  "joe hill",
  "caitlin r. kiernan",
  "caitlin kiernan",
  "tananarive due",
  "adam cesare",
  "john ajvide lindqvist",
  "william peter blatty",
  "bret easton ellis",
  "brom",
  "josh malerman",
  "algernon blackwood",
  "henry james",
  "mary shelley",
  "bram stoker",
  "gaston leroux",
  "wilkie collins",
]);

const THRILLER_AUTHOR_AFFINITY = new Set([
  "gillian flynn",
  "tana french",
  "dennis lehane",
  "michael connelly",
  "lee child",
  "john grisham",
  "thomas harris",
  "patricia cornwell",
  "harlan coben",
  "karin slaughter",
  "paula hawkins",
  "a j finn",
  "aj finn",
  "don winslow",
  "ruth ware",
  "patricia highsmith",
  "john le carre",
  "michael robotham",
  "nicci french",
  "blake crouch",
  "mary higgins clark",
  "helen fields",
  "stieg larsson",
  "daniel silva",
  "robert ludlum",
  "mary kubica",
  "lisa jewell",
  "alex michaelides",
  "stephen king",
]);


const ROMANCE_AUTHOR_AFFINITY = new Set([
  "jane austen",
  "georgette heyer",
  "julia quinn",
  "lisa kleypas",
  "lorretta chase",
  "mary balogh",
  "sarah maclean",
  "tessa dare",
  "eloisa james",
  "jennifer crusie",
  "nora roberts",
  "debbie macomber",
  "judith mcnaught",
  "jude deveraux",
  "johanna lindsey",
  "julie garwood",
  "katheleen e. woodiwiss",
  "kathleen e. woodiwiss",
  "sherry thomas",
  "virginia henley",
  "rosemary rogers",
  "ava march",
  "heather graham",
  "anne gracie",
  "julia london",
  "beth o'leary",
  "emily henry",
  "abby jimenez",
  "christina lauren",
  "ali hazelwood",
  "helen hoang",
  "beverly jenkins",
  "susan elizabeth phillips",
  "sarah j. maas",
  "erin morgenstern",
]);

const ROMANCE_CANONICAL_TITLE_PATTERNS = [
  /\bpride and prejudice\b/,
  /\bpersuasion\b/,
  /\bsense and sensibility\b/,
  /\bemma\b/,
  /\bnorthanger abbey\b/,
  /\brebecca\b/,
  /\boutlander\b/,
  /\bthe flame and the flower\b/,
  /\bsecrets of a summer night\b/,
  /\bdevil in winter\b/,
  /\blove in the afternoon\b/,
  /\bthe viscount who loved me\b/,
  /\bromancing mister bridgerton\b/,
  /\blord of scoundrels\b/,
  /\bthe hating game\b/,
  /\bbook lovers\b/,
  /\bpeople we meet on vacation\b/,
  /\bthe kiss quotient\b/,
  /\ba court of thorns and roses\b/,
  /\bthe night circus\b/,
];

function hasCanonicalRomanceTitle(title: string): boolean {
  return ROMANCE_CANONICAL_TITLE_PATTERNS.some((rx) => rx.test(title));
}


function isMetaLiteraryRomanceLeak(title: string, categories: string, description: string): boolean {
  const combined = [title, categories, description].filter(Boolean).join(" ");
  return (
    /\b(history of the novel|the english novel|oxford history of the novel|research companion|popular romance fiction|new approaches to popular romance fiction|novel of sentiment|gothic romance)\b/.test(combined) ||
    (/\bnovel\b/.test(title) && /\b(history|criticism|study|studies|companion|research|approaches|texts|english)\b/.test(combined)) ||
    /\b(literary criticism|criticism|studies|reference|companion|research)\b/.test(categories)
  );
}

function hasStrongRomanceTitleSignal(title: string): boolean {
  return (
    /\b(romance|love story|kiss|wedding|marriage|bride|duke|earl|viscount|lord|lady|rake|wallflower|courtship|matchmaking|husband|wife|scandal|desire|passion|temptation|seduce|seduction|groom|highlander|laird|mail order bride|regency|historical romance|gothic romance)\b/.test(title) ||
    hasCanonicalRomanceTitle(title)
  );
}

function hasRichRomanceMetadata(subjects: string, description: string): boolean {
  const combined = [subjects, description].filter(Boolean).join(" ");
  return (
    /\b(historical romance|regency romance|gothic romance|fantasy romance|courtship|wedding|marriage|mail order bride|second chance|forbidden love|duke|earl|viscount|wallflower|rake|highlander|laird|romance)\b/.test(combined) &&
    (description.trim().length >= 80 || subjects.trim().length >= 20)
  );
}





function hasAuthorAffinityForFamily(author: string, family: RouterFamily): boolean {
  if (!author) return false;
  const matches = (set: Set<string>) => Array.from(set).some((name) => author === name || author.includes(name));
  if (family === "horror") return matches(HORROR_AUTHOR_AFFINITY);
  if (family === "thriller") return matches(THRILLER_AUTHOR_AFFINITY);
  if (family === "romance") return matches(ROMANCE_AUTHOR_AFFINITY);
  return false;
}


function hasLegitCommercialAuthority(doc: any): boolean {
  const ratingsCount =
    Number(doc?.ratingsCount) ||
    Number(doc?.volumeInfo?.ratingsCount) ||
    Number(doc?.hardcover?.ratings_count) ||
    0;
  const avgRating =
    Number(doc?.averageRating) ||
    Number(doc?.volumeInfo?.averageRating) ||
    Number(doc?.hardcover?.rating) ||
    0;
  const publisher = normalizeText(doc?.publisher ?? doc?.volumeInfo?.publisher);
  const commercialSignals = (doc as any)?.commercialSignals;

  return (
    ratingsCount >= 100 ||
    avgRating >= 4.2 ||
    Boolean(commercialSignals?.bestseller) ||
    Number(commercialSignals?.awards || 0) > 0 ||
    Number(commercialSignals?.popularityTier || 0) >= 2 ||
    /\b(penguin|random house|knopf|doubleday|viking|harper|macmillan|tor|simon\s*&?\s*schuster|hachette|st\.? martin|ballantine)\b/.test(publisher)
  );
}

function isWeakSeriesSpam(title: string, doc: any, hasDescription: boolean, hasRealLength: boolean): boolean {
  const ratingsCount =
    Number(doc?.ratingsCount) ||
    Number(doc?.volumeInfo?.ratingsCount) ||
    Number(doc?.hardcover?.ratings_count) ||
    0;
  const sequelPattern = /\b(book|volume|vol\.?|part)\s*\d+\b|\bseries\b/i.test(title);
  const veryWeakAuthority = ratingsCount < 50 && !hasLegitCommercialAuthority(doc);
  return sequelPattern && veryWeakAuthority && !(hasDescription && hasRealLength);
}


function isHistoricalMetaLiteraryLeak(combined: string): boolean {
  return /\b(history of the novel|technique and spirit of the .*historical novel|study of the .*novel|studies of the .*novel|criticism|literary criticism|critical survey|companion|guide to|bibliography|catalogue|catalog|handbook|reference|the english historical novel|development of .*novel|novels? and tales?)\b/.test(combined);
}

function hasHistoricalNarrativeSignal(combined: string): boolean {
  return /\b(historical fiction|historical novel|period fiction|victorian|edwardian|regency|gilded age|civil war|world war|19th century|family saga|war|revolution|empire|frontier|society|follows|story of|novel|fiction)\b/.test(combined);
}

function passesOpenLibraryHistoricalRecovery(doc: any, diagnostics: FilterDiagnostics): boolean {
  if (diagnostics.family !== "historical") return false;
  const title = normalizeText(doc?.title ?? doc?.volumeInfo?.title);
  const categories = collectCategoryText(doc);
  const description = collectDescriptionText(doc);
  const combined = [title, categories, description].filter(Boolean).join(" ");

  if (isHistoricalMetaLiteraryLeak(combined)) return false;
  if (/\b(complete works|plays\b|poems?\b|sonnets?|anthology|collection|boxed set|omnibus)\b/.test(combined)) return false;

  const titleHistoricalShape = /\b(historical fiction|historical novel|victorian|edwardian|regency|gilded age|civil war|world war|19th century|frontier|revolution|queen|king|empire|warrior|archer|traitor)\b/.test(title);
  const metadataHistoricalShape = diagnostics.flags.historicalPositive || /\b(historical fiction|historical novel|period fiction|victorian|edwardian|regency|gilded age|civil war|world war|19th century|family saga)\b/.test(combined);
  const fictionShape = diagnostics.flags.fictionPositive || diagnostics.flags.strongNarrative || /\b(novel|fiction|story)\b/.test(combined);

  return fictionShape && (titleHistoricalShape || metadataHistoricalShape);
}



function hasCanonicalScienceFictionTitle(title: string): boolean {
  return /\b(dune|foundation|neuromancer|the left hand of darkness|the dispossessed|the lathe of heaven|parable of the sower|kindred|fahrenheit 451|brave new world|nineteen eighty[-\s]?four|1984|we|the time machine|the war of the worlds|the handmaid'?s tale|the testaments|klara and the sun|never let me go|the road|ready player one|annihilation|the power|the passage|the giver|the hunger games|the ballad of songbirds and snakes|a voyage to arcturus)\b/.test(title);
}

function hasCanonicalScienceFictionAuthor(author: string): boolean {
  return /\b(ursula k\.? le guin|octavia (e\. )?butler|philip k\.? dick|isaac asimov|arthur c\.? clarke|frank herbert|ray bradbury|william gibson|neal stephenson|george orwell|aldous huxley|h\. ?g\. ?wells|h g wells|margaret atwood|kazuo ishiguro|jeff vandermeer|cormac mccarthy|lois lowry|suzanne collins|ernest cline|naomi alderman|yevgeny zamyatin|evgenii zamyatin|mary shelley|justin cronin|ling ma)\b/.test(author);
}

function hasCanonicalThrillerTitle(title: string): boolean {
  return /\b(red dragon|the silence of the lambs|hannibal|mr\.? mercedes|you|gone girl|sharp objects|dark places|the girl on the train|the silent patient|the firm|the bourne identity|the day of the jackal|the da vinci code|the woman in the window|the talented mr\.? ripley|strangers on a train|the spy who came in from the cold|killing me softly|fractured)\b/.test(title);
}

function hasThrillerOverlapSignal(combined: string): boolean {
  return /\b(thriller|suspense|psychological|crime|murder|killer|serial killer|detective|investigation|case|missing|disappearance|abduction|fbi|procedural|police|noir|manhunt|fugitive|obsession|cat and mouse)\b/.test(combined);
}

function hasThrillerAdjacentNarrativeSignal(combined: string): boolean {
  const crimeAndSuspense = /\b(crime|murder|killer|investigation|detective|abduction|kidnapp(?:ed|ing)?|conspiracy)\b/.test(combined) && /\b(suspense|tension|cat and mouse|high stakes|danger|threat)\b/.test(combined);
  const mysteryAndPacing = /\b(mystery|case|detective|investigation)\b/.test(combined) && /\b(pace|fast[- ]paced|race against time|urgent|manhunt|fugitive|chase)\b/.test(combined);
  const psychologicalIntensity = /\b(psychological|obsession|paranoia|mind games|manipulation|dark secret)\b/.test(combined) && /\b(intense|intensity|high stakes|danger|deadly|volatile)\b/.test(combined);
  return crimeAndSuspense || mysteryAndPacing || psychologicalIntensity;
}

function passesOpenLibrarySourceRecovery(doc: any, diagnostics: FilterDiagnostics): boolean {
  if (!isOpenLibraryLikeDoc(doc)) return false;

  const rawTitle = String(doc?.title || doc?.volumeInfo?.title || "").trim();
  const normalizedTitle = normalizeText(rawTitle);
  const author = normalizeText(
    doc?.author_name ?? doc?.authors ?? doc?.author ?? doc?.authorName ?? doc?.volumeInfo?.authors
  );
  const subjects = collectCategoryText(doc);
  const description = collectDescriptionText(doc);
  const queryText = normalizeText(doc?.queryText ?? doc?.diagnostics?.queryText ?? doc?.rawQuery ?? doc?.query);
  const combined = [normalizedTitle, subjects, description, author].filter(Boolean).join(" ");
  const combinedWithQuery = [combined, queryText].filter(Boolean).join(" ");
  const firstPublishedYear =
    Number(doc?.first_publish_year) ||
    Number(doc?.publishYear) ||
    Number(doc?.firstPublishedYear) ||
    0;
  const hardcoverRatingsCount = Number((doc as any)?.hardcover?.ratings_count || 0);
  const hardcoverRating = Number((doc as any)?.hardcover?.rating || 0);

  if (!rawTitle || !author || author === "unknown") return false;
  if (diagnostics.flags.weakSeriesSpam) return false;
  if (hasOpenLibraryRecoveryBlocker(diagnostics)) return false;
  if (isAnthologyOrCollectionCandidate(normalizedTitle, subjects, description, combined)) return false;
  if (diagnostics.family === "science_fiction" && isScienceFictionMetaReferenceCandidate(normalizedTitle, subjects, description, combined)) return false;
  if (isUniversalMetaReferenceCandidate(normalizedTitle, subjects, description, combined)) return false;
  if (isHistoricalMetaLiteraryLeak(combined)) return false;
  if (/\b(complete works|plays\b|poems?\b|sonnets?|anthology|collection|boxed set|omnibus|guide|handbook|dictionary|companion|catalogue?|bibliography|study guide)\b/.test(combined)) return false;

  const hasUsefulMetadata =
    subjects.trim().length > 0 ||
    description.trim().length > 0 ||
    firstPublishedYear > 0 ||
    hardcoverRatingsCount > 0 ||
    hardcoverRating > 0;
  const hasMinimumMetadataCompleteness =
    rawTitle.length > 0 &&
    author.length > 0 &&
    author !== "unknown" &&
    (diagnostics.hasRealLength || description.trim().length > 80);

  const hasCanonicalThriller = diagnostics.family === "thriller" && hasCanonicalThrillerTitle(normalizedTitle);
  const hasCanonicalScienceFiction = diagnostics.family === "science_fiction" && (
    hasCanonicalScienceFictionTitle(normalizedTitle) ||
    hasCanonicalScienceFictionAuthor(author)
  );
  const hasAuthority =
    diagnostics.flags.authorAffinity ||
    diagnostics.flags.legitAuthority ||
    hasCanonicalThriller ||
    hasCanonicalScienceFiction ||
    hardcoverRatingsCount >= 10 ||
    hardcoverRating >= 3.7;

  const familySignalByLane: Record<RouterFamily, RegExp> = {
    horror: /\b(horror|haunted|haunting|ghost|supernatural|occult|monster|creature|terror|dread|gothic|vampire|zombie|survival horror|psychological horror)\b/,
    fantasy: /\b(fantasy|magic|magical|wizard|witch|dragon|fae|mythic|quest|kingdom|sword|sorcery|epic fantasy|high fantasy|dark fantasy)\b/,
    mystery: /\b(mystery|detective|investigation|murder|private investigator|whodunit|case|cold case|police procedural|inspector)\b/,
    thriller: /\b(thriller|suspense|psychological|crime|murder|serial killer|investigation|missing|disappearance|fbi|procedural|noir|spy thriller|legal thriller)\b/,
    romance: /\b(romance|love story|courtship|marriage|wedding|duke|earl|regency|wallflower|rake|kiss|lover|historical romance|gothic romance)\b/,
    historical: /\b(historical fiction|historical novel|period fiction|victorian|edwardian|regency|gilded age|civil war|world war|19th century|family saga|frontier|revolution|empire)\b/,
    science_fiction: /\b(science fiction|sci-fi|dystopian|space opera|ai|artificial intelligence|robot|android|alien|future|time travel|interstellar|spaceship)\b/,
    speculative: /\b(speculative|science fiction|fantasy|dystopian|alternate history|supernatural|time travel)\b/,
    general: /\b(novel|fiction|story)\b/,
  };

  const familySignal = familySignalByLane[diagnostics.family]?.test(combinedWithQuery) || false;
  const titleOrMetadataSignal =
    familySignalByLane[diagnostics.family]?.test(combined) ||
    (diagnostics.family === "thriller" && (hasCanonicalThrillerTitle(normalizedTitle) || hasThrillerOverlapSignal(combined))) ||
    (diagnostics.family === "science_fiction" && hasCanonicalScienceFiction);
  const fictionShape =
    diagnostics.flags.fictionPositive ||
    diagnostics.flags.strongNarrative ||
    /\b(novel|fiction|story)\b/.test(combinedWithQuery);

  // Query intent alone is not enough. Sparse OL rows need either external
  // authority (Hardcover/canonical author) or some native title/subject/description signal.
  return Boolean(
    hasMinimumMetadataCompleteness &&
    fictionShape &&
    (hasUsefulMetadata || hasCanonicalScienceFiction) &&
    familySignal &&
    (hasAuthority || titleOrMetadataSignal || diagnostics.flags.strongNarrative)
  );
}

function isLaneMismatch(family: RouterFamily, combined: string, flags: {
  speculativePositive: boolean;
  thrillerPositive: boolean;
  horrorAligned: boolean;
  historicalPositive: boolean;
  romancePositive: boolean;
  mysteryPositive: boolean;
  crimePositive: boolean;
  suspensePositive: boolean;
  strongNarrative: boolean;
  fictionPositive: boolean;
  authorAffinity: boolean;
}): boolean {
  if (family === "mystery") {
    const mysteryNative =
      flags.mysteryPositive ||
      flags.crimePositive ||
      /\b(mystery|detective|investigation|investigat(?:e|es|ion)|murder|private investigator|pi\b|inspector|whodunit|case|cold case|police procedural|suspect|victim|clue)\b/.test(combined);

    if (!mysteryNative) return true;

    const obviousNonMysteryMeta =
      /\b(essays|treatise|philosophy|history of|criticism|technique of the mystery story|mystery book|mammoth mystery book|anthology|collection|boxed set|true crime stories|detective fiction|literary criticism)\b/.test(combined);

    const obviousThrillerOnly =
      /\b(manhunt|fugitive|spy thriller|crime conspiracy|international conspiracy|military thriller|legal thriller)\b/.test(combined) &&
      !/\b(mystery|detective|investigation|case|whodunit|private investigator)\b/.test(combined);

    return obviousNonMysteryMeta || obviousThrillerOnly;
  }

  if (family === "thriller") {
    const thrillerNative =
      flags.thrillerPositive ||
      flags.mysteryPositive ||
      flags.crimePositive ||
      flags.suspensePositive ||
      /\b(missing|disappearance|abduction|kidnapp(?:ed|ing)?|detective|investigat(?:e|es|ion)|crime|murder|killer|fbi|procedural|noir|police|serial killer|manhunt|fugitive|case|victim|search)\b/.test(combined);

    const thrillerAdjacent = hasThrillerAdjacentNarrativeSignal(combined) || flags.authorAffinity || flags.strongNarrative;
    if (!thrillerNative && !thrillerAdjacent) return true;

    const obviousNonThrillerMeta =
      /\b(essays|treatise|philosophy|upheaval|social upheaval|history of|criticism|book of answers|critical survey|technique of the mystery story|mystery book|mammoth mystery book|century of british mystery|jew in english fiction)\b/.test(combined);

    return obviousNonThrillerMeta;
  }

  if (family === "romance") {
    const romanceNative =
      flags.romancePositive ||
      /\b(second chance|forbidden love|love story|marriage|relationship|courtship|duke|earl|bridgerton|regency|historical romance|gothic romance|fantasy romance|enemies to lovers|slow burn|rom-com|rom com|widow|debutante|matchmaking|spinster|rake|wallflower|wedding|husband|wife|lover|kiss|heart)\b/.test(combined) ||
      hasCanonicalRomanceTitle(combined);
    return !romanceNative;
  }

  if (family === "historical") {
    const historicalNative = flags.historicalPositive || hasHistoricalNarrativeSignal(combined);
    const obviousHistoricalMeta = isHistoricalMetaLiteraryLeak(combined);
    return !historicalNative || obviousHistoricalMeta;
  }

  if (family === "fantasy") {
    const fantasyNative =
      flags.speculativePositive &&
      /\b(fantasy|magic|magical|wizard|witch|dragon|fae|mythic|quest|kingdom|sword|sorcery|epic fantasy|high fantasy|dark fantasy)\b/.test(combined);

    const obviousNonFantasyMeta =
      /\b(guide to|historical dictionary|publishers weekly|library of congress|subject headings|writers? market|book review|anthology|collection|encyclopedia|companion|criticism|analysis|handbook|catalog|journal|magazine|texts)\b/.test(combined);

    return !fantasyNative || obviousNonFantasyMeta;
  }

  if (family === "science_fiction") {
    const scienceFictionNative =
      flags.speculativePositive &&
      /\b(science fiction|sci-fi|dystopian|space opera|ai|artificial intelligence|robot|android|alien|future|futuristic|time travel|interstellar|spaceship|parallel world)\b/.test(combined);

    const obviousNonScienceFiction =
      /\b(fantasy romance|gothic romance|historical romance|wizard|witch|dragon|fae|magic|haunted|ghost|supernatural|occult)\b/.test(combined);

    const obviousThrillerOnly =
      (flags.thrillerPositive || flags.mysteryPositive || flags.crimePositive) &&
      !/\b(science fiction|sci-fi|dystopian|space opera|ai|artificial intelligence|robot|android|alien|future|futuristic|time travel|interstellar|spaceship|parallel world)\b/.test(combined);

    return !scienceFictionNative || obviousNonScienceFiction || obviousThrillerOnly;
  }

  if (family === "speculative") {
    const speculativeNative = flags.speculativePositive;
    const obviousThrillerOnly = (flags.thrillerPositive || flags.mysteryPositive || flags.crimePositive) && !speculativeNative;
    return !speculativeNative || obviousThrillerOnly;
  }

  return false;
}

function isUniversalMetaReferenceCandidate(title: string, categories: string, description: string, combined: string): boolean {
  const metaTitle =
    /\b(aesthetics|history|histories|technique|spirit|development|rise|study|studies|criticism|companion|guide|bibliography|catalogue?|gold star list|finding list|survey|index|readings|reader|redefining)\b.*\b(novel|novels|fiction|literature|books?)\b/.test(title) ||
    /\b(novel|novels|fiction|literature|books?)\b.*\b(aesthetics|history|histories|technique|spirit|development|rise|study|studies|criticism|before|since|1900|1910|1920|1930|bibliography|catalogue?|list|survey|index|readings|reader|redefining)\b/.test(title) ||
    /^\s*(the\s+)?(american|english|british|historical|crime|detective|mystery|thriller|horror|gothic|modern|victorian)\s+novels?\b/.test(title) ||
    /\b(readings?\s+in|century\s+readings?\s+in|life\s+in|women\s+in|race\s+in|gender\s+in|class\s+in|redefining)\b.*\b(novel|novels|fiction|literature)\b/.test(title) ||
    /\b(irish|latin american|american|english|british|columbian|victorian|modern)\b.*\b(historical\s+fiction|fiction|novels?)\b/.test(title) && /\b(readings?|redefining|history|criticism|studies|study|survey|companion|guide|life in|fiction$|novels$)\b/.test(title);

  const metaCategory =
    /\b(literary criticism|criticism|reference|study aids?|bibliograph(?:y|ies)|books and reading|authors?|publishing|libraries|literature|studies|theory|education|history and criticism|readings?)\b/.test(categories) &&
    !/\b(fiction|juvenile fiction|young adult fiction|comics|graphic novels?)\b/.test(categories);

  const metaDescription =
    /\b(examines?|explores?|analyzes?|analysis of|study of|studies of|critical survey|scholarly|academic|reference work|resource for|guide to|introduction to|history of|bibliography|readings? in)\b/.test(description) &&
    /\b(novel|novels|fiction|literature|genre|author|authors|texts?)\b/.test(description);

  const listOrCatalog =
    /\b(gold star list|finding list|catalogue?|catalog|bibliography|index|reader'?s guide|companion to|cambridge companion|oxford companion|century readings?|selected readings?)\b/.test(combined);

  return metaTitle || metaCategory || metaDescription || listOrCatalog;
}

function isAnthologyOrCollectionCandidate(title: string, categories: string, description: string, combined: string): boolean {
  return (
    /\b(anthology|anthologies|collection|collections|collected|complete novels|selected stories|short stories|short science fiction novels|boxed set|box set|omnibus|baker['’]?s dozen)\b/.test(combined) ||
    /\b(five|great|best|classic|selected|complete)\s+(great\s+)?(science fiction\s+)?novels\b/.test(title) ||
    /\b\d+\s+(great\s+)?(science fiction\s+)?novels\b/.test(title) ||
    /\bscience fiction stories\b/.test(title)
  );
}

function isScienceFictionMetaReferenceCandidate(title: string, categories: string, description: string, combined: string): boolean {
  const bareScienceFictionNovelTitle = /^\s*(the\s+)?science\s+fiction\s+novels?\s*$/.test(title) || /^\s*science\s+fiction\s*$/.test(title);
  const metaTitle =
    bareScienceFictionNovelTitle ||
    /\b(best|great|five|100|hundred|classic|selected)\s+(science fiction\s+)?novels\b/.test(title) ||
    /\bscience and fiction\b/.test(title) ||
    /\b(survey of|companion to|readings in|guide to|history of|principles of|index(?:es)?|criticism of)\b.*\b(science fiction|sci-fi|novels?|fiction|literature)\b/.test(title) ||
    /\b(science fiction|sci-fi|novels?|fiction|literature)\b.*\b(companion|readings|guide|history|principles|index(?:es)?|criticism|survey|reference|bibliography|literature)\b/.test(title);
  const metaText =
    /\b(science fiction|sci-fi)\b.*\b(criticism|literary criticism|literature|history and criticism|bibliography|reference|study|studies|survey|guide|companion|readings|index(?:es)?|principles)\b/.test(combined) ||
    /\b(criticism|literary criticism|literature|history and criticism|bibliography|reference|study|studies|survey|guide|companion|readings|index(?:es)?|principles)\b.*\b(science fiction|sci-fi)\b/.test(combined);
  const metaCategory =
    /\b(literary criticism|criticism|reference|bibliography|books and reading|literature|history and criticism|study aids?|studies|theory|education)\b/.test(categories) &&
    !/\b(fiction|juvenile fiction|young adult fiction|comics|graphic novels?)\b/.test(categories);
  const metaDescription =
    /\b(examines?|explores?|analyzes?|analysis of|study of|studies of|survey of|guide to|introduction to|history of|bibliography|reference work|critical)\b/.test(description) &&
    /\b(science fiction|sci-fi|novels?|fiction|literature|genre)\b/.test(description);
  return metaTitle || metaText || metaCategory || metaDescription;
}

const OPEN_LIBRARY_RECOVERY_BLOCK_REASONS = new Set([
  "universal_meta_reference",
  "no_cover_low_quality_meta",
  "science_fiction_off_profile_reference",
  "anthology_or_collection",
  "title_meta_reference",
]);

function hasOpenLibraryRecoveryBlocker(diagnostics: FilterDiagnostics): boolean {
  return diagnostics.rejectReasons.some((reason) => OPEN_LIBRARY_RECOVERY_BLOCK_REASONS.has(reason));
}

function candidateHasCoverSignal(doc: any): boolean {
  if (Boolean((doc as any)?.hasCover)) return true;
  if (Boolean(doc?.cover_i) || Boolean(doc?.rawDoc?.cover_i)) return true;
  const imageLinks = doc?.imageLinks ?? doc?.volumeInfo?.imageLinks ?? doc?.rawDoc?.imageLinks ?? doc?.rawDoc?.volumeInfo?.imageLinks;
  return Boolean(imageLinks?.thumbnail || imageLinks?.smallThumbnail || imageLinks?.small || imageLinks?.medium || imageLinks?.large);
}

function isNoCoverLowQualityMetaCandidate(doc: any, diagnostics: FilterDiagnostics, combined: string, categories: string, description: string): boolean {
  if (candidateHasCoverSignal(doc)) return false;

  const title = diagnostics.title;
  const pageCount = Number(diagnostics.pageCount || 0);
  const ratingsCount = Number(diagnostics.ratingsCount || 0);
  const hardcoverRatingsCount = Number((doc as any)?.hardcover?.ratings_count || 0);
  const hasAuthority = diagnostics.flags.legitAuthority || diagnostics.flags.authorAffinity || ratingsCount >= 20 || hardcoverRatingsCount >= 10;

  const metaShape =
    isUniversalMetaReferenceCandidate(title, categories, description, combined) ||
    /\b(readings?|reader|criticism|critical|study|studies|analysis|essays?|companion|guide|reference|bibliography|catalogue?|catalog|survey|history of|in fiction|historical novels?|literary criticism|history and criticism)\b/.test(combined);

  const weakShape =
    !diagnostics.hasDescription ||
    (pageCount > 0 && pageCount < 120) ||
    (pageCount === 0 && ratingsCount === 0 && hardcoverRatingsCount === 0);

  // Missing covers are not automatically bad. They become a hard quality signal
  // only when paired with meta/reference/academic shape or very sparse metadata.
  return metaShape || (weakShape && !hasAuthority && !diagnostics.flags.strongNarrative);
}


function buildFilterDiagnostics(doc: any, bucketPlan: any): FilterDiagnostics {
  const title = normalizeText(doc?.title ?? doc?.volumeInfo?.title);
  const categories = collectCategoryText(doc);
  const description = collectDescriptionText(doc);
  const author = normalizeText(
    doc?.author_name ?? doc?.authors ?? doc?.author ?? doc?.authorName ?? doc?.volumeInfo?.authors
  );
  const combined = [title, categories, description, author].filter(Boolean).join(" ");
  const queryIntentText = normalizeText([
    doc?.queryText,
    doc?.diagnostics?.queryText,
    doc?.rawDoc?.queryText,
    doc?.rawQuery,
    doc?.query,
  ].filter(Boolean).join(" "));
  const rawFamilyCandidate = normalizeText(
    doc?.queryFamily ??
    doc?.diagnostics?.queryFamily ??
    doc?.rawDoc?.queryFamily ??
    doc?.lane ??
    doc?.diagnostics?.filterFamily
  ).replace(/_family$/, "");
  const queryIntentFamily =
    /\b(psychological horror|survival horror|haunted house horror|horror|haunted|ghost|supernatural|occult|possession|gothic horror)\b/.test(queryIntentText)
      ? "horror"
      : /\b(psychological thriller|crime thriller|thriller|suspense|serial killer|missing person|manhunt|fugitive|legal thriller|spy thriller)\b/.test(queryIntentText)
      ? "thriller"
      : /\b(science fiction|sci-fi|dystopian|space opera|ai|robot|alien|time travel)\b/.test(queryIntentText)
      ? "science_fiction"
      : /\b(mystery|detective|whodunit|cold case|murder investigation)\b/.test(queryIntentText)
      ? "mystery"
      : /\b(fantasy|magic|dragon|quest)\b/.test(queryIntentText)
      ? "fantasy"
      : /\b(romance|love story|regency|courtship)\b/.test(queryIntentText)
      ? "romance"
      : /\b(historical fiction|historical novel|period fiction|civil war|world war|19th century)\b/.test(queryIntentText)
      ? "historical"
      : "";
  const docFamilyRaw = queryIntentFamily || rawFamilyCandidate;
  const family = (
    bucketPlan?.hybridMode && ["fantasy", "horror", "mystery", "thriller", "science_fiction", "speculative", "romance", "historical", "general"].includes(docFamilyRaw)
      ? docFamilyRaw
      : (bucketPlan?.lane || inferRouterFamily(bucketPlan))
  ) as RouterFamily;
  const isHorrorLane = family === "horror";
  const horrorToneWanted = isHorrorLane && wantsHorrorTone(bucketPlan);

  const hardRejectTitlePatterns = [
    /\bguide\b/,
    /\bcompanion\b/,
    /\banalysis\b/,
    /\bcritic(?:ism|al)\b/,
    /\bintroduction to\b/,
    /\bsource\s*book\b/,
    /\bhandbook\b/,
    /\bmanual\b/,
    /\breference\b/,
    /\bcatalog(?:ue)?\b/,
    /\bencyclopedia\b/,
    /\banthology\b/,
    /\bcollection\b/,
    /\bessays?\b/,
    /\bpublishers?\s+weekly\b/,
    /\bjournal\b/,
    /\bmagazine\b/,
    /\bnewsweek\b/,
    /\bbibliograph(?:y|ies)\b/,
    /\brevision series\b/,
    /\bhow to write\b/,
    /\bwriter'?s market\b/,
    /\bbook review\b/,
    /\bstudy guide\b/,
    /\bboxed set\b/,
    /\bomnibus\b/,
    /\byear'?s best\b/,
    /\bbest american\b/,
    /\btrue crime\b/,
    /\bfinding list of books\b/,
    /\bgeneral catalogue\b/,
    /\bcatalogue of english prose fiction\b/,
    /^\s*the book lady\s*$/,
    /\bpopular fiction\b/,
    /\bcentury of the .*novel\b/,
    /\bnovels? and tales?\b/,
    /\brelated works?\b/,
    /^\s*restif'?s novels\s*$/,
    /^\s*the crime novel\s*$/,
    /^\s*mystery fiction\s*$/,
    /^\s*crime fiction\s*$/,
    /i['’]?m looking for a book/,
    /\btrue stories?\b/,
    /\bsea stories?\b/,
    /\bsteamboat stories?\b/,
    /\bsurvival bible\b/,
    /\bdictionary of\b/,
    /\bhistorical dictionary\b/,
    /\bguide to united states popular culture\b/,
    /\bfuture of the novel\b/,
    /\bnovelists?\b/,
    /\bnovel vs\.? fiction\b/,
    /\bnovels? and (other works|related works|stories|tales)\b/,
    /\bfamous authors on their methods\b/,
    /\bon their methods\b/,
    /\bselected novels? and plays\b/,
    /\bintroduction to the novels? of\b/,
    /\bdevelopment of .* novel\b/,
    /\benglish gothic novel\b/,
    /\bgothic novel:\s*texts\b/,
    /\bnovel:\s*texts\b/,
    /\btexts\s*$/,
  ];

  const hardRejectCategoryPatterns = [
    /\bliterary criticism\b/,
    /\bstudy aids?\b/,
    /\breference\b/,
    /\blanguage arts\b/,
    /\bbibliograph(?:y|ies)\b/,
    /\beducation\b/,
    /\bbooks and reading\b/,
    /\bauthors?\b/,
    /\bpublishing\b/,
    /\blibraries\b/,
    /\bbooksellers?\b/,
    /\bperiodicals?\b/,
    /\bessays?\b/,
    /\bcriticism\b/,
    /\bnonfiction\b/,
    /\bbiography\b/,
    /\bmemoir\b/,
    /\bliterature\b/,
    /\bstudies\b/,
    /\btheory\b/,
    /\bfilm\b/,
    /\bfilms\b/,
    /\bmovie\b/,
    /\bmovies\b/,
    /\btelevision\b/,
    /\btv series\b/,
    /\bnovels?\b.*\b(criticism|study|history|analysis)\b/,
    /\btexts\b/,
  ];

  const hardRejectDescriptionPatterns = [
    /\bexplores?\b/,
    /\bexamines?\b/,
    /\banalyzes?\b/,
    /\bguide to\b/,
    /\bintroduction to\b/,
    /\breference for\b/,
    /\bresource for\b/,
    /\bhow to\b/,
    /\bwritten for students\b/,
    /\btextbook\b/,
    /\bworkbook\b/,
    /\bstudy guide\b/,
    /\bresearch\b/,
    /\bproceedings\b/,
    /\breal[- ]life\b/,
    /\btrue story\b/,
    /\bnon[- ]fiction\b/,
    /\bmemoir\b/,
    /\bbiograph(?:y|ical)\b/,
  ];

  const pageCount = Number(doc?.pageCount) || Number(doc?.volumeInfo?.pageCount) || 0;
  const ratingsCount =
    Number(doc?.ratingsCount) ||
    Number(doc?.volumeInfo?.ratingsCount) ||
    Number(doc?.hardcover?.ratings_count) ||
    0;
  const hasDescription = String(doc?.description || doc?.volumeInfo?.description || "").trim().length > 120;
  const hasRealLength = pageCount >= 120;

  const classicAuthorSignal =
    /\b(h\.?g\.?\s*wells|jules verne|mary shelley|isaac asimov|frank herbert|arthur c\.?\s*clarke|philip k\.?\s*dick|iain m\.?\s*banks)\b/.test(author);

  let fictionPositive =
    (
      /\b(novel|thriller|suspense|dystopian|survival|science fiction|fantasy|horror|romance|historical fiction|literary fiction|young adult)\b/.test(
        combined
      ) ||
      /\b(follows|story of|must survive|must uncover|investigates|disappearance|serial killer|murder case)\b/.test(description) ||
      classicAuthorSignal
    ) &&
    !/\b(reference|guide|criticism|study of|analysis of|companion to|anthology|collection)\b/.test(combined);

  let strongNarrative =
    /\b(thriller|horror|suspense|red dragon|mr\.? mercedes|killing me softly|silence of the lambs|gone girl)\b/.test(title) ||
    /\b(follows|story of|when .* discovers|must survive|after .* happens|trapped in|haunted by|must confront|investigates|must uncover|survive|escape|killer|serial killer|detective|investigation|disappearance|missing|obsession)\b/.test(description) ||
    classicAuthorSignal;

  const genericTitle =
    /^\s*novels?\b/.test(title) ||
    /^\s*novelists?\b/.test(title) ||
    /\bnovels?\s+of\b/.test(title) ||
    /\bnovels?\s+and\s+(tales|stories|other works|related works)\b/.test(title) ||
    /\bfuture of the novel\b/.test(title);

  let speculativePositive =
    /\b(science fiction|fantasy|dystopian|speculative|space|spaceship|alien|robot|android|ai|artificial intelligence|future|time travel|portal|parallel world|magic|magical|haunted|ghost|supernatural|occult|monster|creature|horror|survival horror|terror|dread)\b/.test(
      combined
    );

  const thrillerPositive =
    /\b(thriller|psychological thriller|crime thriller|domestic suspense|legal thriller|murder|serial killer|investigation|police procedural|noir|survival|high stakes|race against time|cat and mouse|intense)\b/.test(
      combined
    );

  const mysteryPositive =
    /\b(mystery|detective|whodunit|case|private investigator|investigation)\b/.test(combined);

  const crimePositive =
    /\b(crime|criminal|murder|killer|kidnapp(?:ed|ing)?|abduction|fbi|police|procedural|manhunt|fugitive)\b/.test(combined);

  const suspensePositive =
    /\b(suspense|psychological suspense|domestic suspense|tension|cat and mouse)\b/.test(combined);

  const horrorAligned =
    isHorrorLane && /\b(horror|haunted|haunting|ghost|supernatural|occult|monster|creature|survival horror|psychological horror|haunted house|terror|dread|eerie|disturbing|gothic|possession|vampire|zombie)\b/.test([combined, queryIntentText].join(" "));

  const historicalPositive =
    /\b(historical fiction|historical novel|period fiction|victorian|edwardian|civil war|world war|regency|gilded age)\b/.test(
      combined
    );

  const romancePositive = /\b(romance|love story|romantic|courtship|second chance|forbidden love|historical romance|gothic romance|fantasy romance|rom-com|rom com|duke|earl|bridgerton|regency|wallflower|rake|wedding|husband|wife|lover|kiss|heart)\b/.test(combined) || hasCanonicalRomanceTitle(combined) || (family === "romance" && hasAuthorAffinityForFamily(author, family));
  const authorAffinity = hasAuthorAffinityForFamily(author, family);
  let legitAuthority = hasLegitCommercialAuthority(doc) || classicAuthorSignal;
  const weakSeriesSpam = isWeakSeriesSpam(title, doc, hasDescription, hasRealLength);

  if (isOpenLibraryLikeDoc(doc) && family === "science_fiction") {
    fictionPositive = true;
    speculativePositive = true;
  }

  const diagnostics: FilterDiagnostics = {
    kept: false,
    family,
    wantsHorrorTone: horrorToneWanted,
    title,
    pageCount,
    ratingsCount,
    hasDescription,
    hasRealLength,
    passedChecks: [],
    rejectReasons: [],
    flags: {
      fictionPositive,
      strongNarrative,
      genericTitle,
      speculativePositive,
      thrillerPositive,
      horrorAligned,
      historicalPositive,
      romancePositive,
      weakSeriesSpam,
      legitAuthority,
      authorAffinity,
      mysteryPositive,
      crimePositive,
      suspensePositive,
    },
  };

  if (!title) diagnostics.rejectReasons.push("missing_title");
  if (hardRejectTitlePatterns.some((rx) => rx.test(title))) diagnostics.rejectReasons.push("hard_reject_title");
  if (hardRejectCategoryPatterns.some((rx) => rx.test(categories))) diagnostics.rejectReasons.push("hard_reject_category");
  if (hardRejectDescriptionPatterns.some((rx) => rx.test(description))) diagnostics.passedChecks.push("soft_description_meta_signal");
  if (/\bliterature\b/.test(categories) && !/\bfiction\b/.test(categories)) diagnostics.rejectReasons.push("literature_without_fiction");

  if (isUniversalMetaReferenceCandidate(title, categories, description, combined)) {
    diagnostics.rejectReasons.push("universal_meta_reference");
  }

  if (isAnthologyOrCollectionCandidate(title, categories, description, combined)) {
    diagnostics.rejectReasons.push("anthology_or_collection");
  }

  if (family === "science_fiction" && isScienceFictionMetaReferenceCandidate(title, categories, description, combined)) {
    diagnostics.rejectReasons.push("title_meta_reference");
  }

  if (isNoCoverLowQualityMetaCandidate(doc, diagnostics, combined, categories, description)) {
    diagnostics.rejectReasons.push("no_cover_low_quality_meta");
  }

  const bookCultureReject =
    /\b(book lady|readers'? advisory|popular fiction|books and reading|literary culture|book review|writing speculative fiction)\b/.test(title) ||
    /\b(readers'? advisory|books and reading|book clubs?|library science|literary criticism|popular fiction)\b/.test(categories) ||
    /\b(readers'? advisory|about books|guide for readers|history of horror literature|literary reference)\b/.test(description);
  if (bookCultureReject) diagnostics.passedChecks.push("soft_book_culture_signal");

  const academicNovelStudyReject =
    /\b(english gothic novel|gothic novel:\s*texts|novel:\s*texts)\b/.test(title) ||
    (/\btexts\b/.test(title) && /\b(literature|criticism|studies)\b/.test(categories + " " + description));
  if (academicNovelStudyReject) diagnostics.passedChecks.push("soft_academic_novel_study_signal");

  const novelMetaReject =
    /\b(future of the novel|novelists?|novel vs\.? fiction|famous authors on their methods|introduction to the novels? of|development of .* novel|selected novels? and plays|novels? and (other works|related works|stories|tales))\b/.test(combined);
  if (novelMetaReject) diagnostics.passedChecks.push("soft_novel_meta_signal");

  if (family === "romance" && isMetaLiteraryRomanceLeak(title, categories, description)) {
    diagnostics.rejectReasons.push("romance_meta_reference");
  }

  if (!fictionPositive) diagnostics.passedChecks.push("soft_missing_fiction_signal");
  if (genericTitle) diagnostics.passedChecks.push("soft_generic_title_signal");
  if (!strongNarrative) diagnostics.passedChecks.push("soft_missing_narrative_signal");
  const classicAuthorWhitelist =
    /\b(h\.?g\.?\s*wells|mary shelley|jules verne|isaac asimov|arthur c\.?\s*clarke|ray bradbury|ursula k\.?\s*le guin|philip k\.?\s*dick)\b/.test(author);
  const canonicalWorkOverride =
    hasCanonicalThrillerTitle(title) ||
    hasCanonicalScienceFictionTitle(title) ||
    hasCanonicalRomanceTitle(title) ||
    /\b(the time machine|the war of the worlds|frankenstein|the caves of steel|i, robot|childhood'?s end|fahrenheit 451|left hand of darkness|do androids dream of electric sheep)\b/.test(title) ||
    /\b(dracula|the exorcist|the hobbit|foundation|dune|murder on the orient express|the hound of the baskervilles|the haunting of hill house)\b/.test(title);
  const knownClassicSignal = canonicalWorkOverride || classicAuthorWhitelist;
  if (!hasRealLength && !hasDescription) {
    if (isOpenLibraryLikeDoc(doc) && knownClassicSignal) diagnostics.passedChecks.push("soft_sparse_classic_metadata");
    else diagnostics.rejectReasons.push("insufficient_length_or_description");
  }
  if (/\b(character[- ]driven|psychological)\b/.test(queryIntentText) && !strongNarrative && !fictionPositive && !speculativePositive) {
    diagnostics.rejectReasons.push("narrative_strength_required");
  }
  if (weakSeriesSpam) diagnostics.rejectReasons.push("weak_series_spam");

  if (family === "horror") {
    if (!horrorAligned) diagnostics.passedChecks.push("soft_missing_horror_alignment");
  }

  
  if (family === "science_fiction") {
    const scienceFictionReject =
      /\b(bookshop mysteries|family names|science fact\/science fiction|analog science|public library|publishers weekly|historical dictionary|guide to|popular culture|writers? market|literary criticism|criticism|literature|history of|survey of|companion to|readings in|principles of|index(?:es)?|bibliography|reference|anthology|collection|collected|complete novels|selected stories|short stories|short science fiction novels|baker['’]?s dozen)\b/.test(combined);
    const scienceFictionNative = /\b(science fiction|sci-fi|dystopian|space opera|ai|artificial intelligence|robot|android|alien|future|futuristic|time travel|interstellar|spaceship|parallel world)\b/.test(combined);
    if (!scienceFictionNative) diagnostics.passedChecks.push("soft_missing_science_fiction_signal");
    if (scienceFictionReject) diagnostics.rejectReasons.push("science_fiction_off_profile_reference");
  }

  if (family === "fantasy") {
    if (!speculativePositive) diagnostics.passedChecks.push("soft_missing_fantasy_signal");
  }

if (family === "speculative") {
    const speculativeReject =
      /\b(bookshop mysteries|family names|family science|theme in .* fiction|science fact\/science fiction|analog science|public library|publishers weekly|books?\s*\d+\s*-\s*\d+|historical dictionary|guide to|popular culture)\b/.test(
        combined
      );
    if (!speculativePositive) diagnostics.passedChecks.push("soft_missing_speculative_signal");
    if (speculativeReject) diagnostics.rejectReasons.push("speculative_off_profile_reference");
  }

  if (family === "thriller") {
    const thrillerNative =
      thrillerPositive ||
      mysteryPositive ||
      crimePositive ||
      suspensePositive;
    const thrillerAdjacent =
      hasThrillerAdjacentNarrativeSignal(combined) ||
      (crimePositive && suspensePositive && strongNarrative) ||
      (mysteryPositive && /\b(tension|high stakes|urgent|race against time|manhunt|fugitive)\b/.test(combined) && strongNarrative) ||
      (/\b(psychological|obsession|paranoia|mind games)\b/.test(combined) && strongNarrative) ||
      authorAffinity;

    if (!thrillerPositive) diagnostics.passedChecks.push("soft_missing_thriller_signal");
    if (horrorToneWanted && !horrorAligned) diagnostics.passedChecks.push("soft_missing_horror_alignment");

    if (!thrillerNative && !thrillerAdjacent) {
      diagnostics.passedChecks.push("soft_missing_thriller_native");
    }

    const antiqueOffProfileThriller =
      /\b(victorian|edwardian|19th century)\b/.test(combined) ||
      (pageCount >= 250 &&
        ratingsCount === 0 &&
        !legitAuthority &&
        /\b(miss|mrs\.?|lady|gentleman|detective story|mystery story|novel)\b/.test(title) &&
        !crimePositive &&
        !suspensePositive);

    if (antiqueOffProfileThriller) {
      diagnostics.rejectReasons.push("antique_off_profile_thriller");
    }

    const thrillerMetaReference =
      /\b(technique of the mystery story|critical survey|mystery book|mammoth mystery book|boxed set|anthology|collection|true crime stories|crime fiction and|detective fiction|literary criticism)\b/.test(combined);

    if (thrillerMetaReference) {
      diagnostics.rejectReasons.push("thriller_meta_reference");
    }

    const cozyMysteryLeak =
      /\b(cozy mystery|small town|amateur sleuth|bookshop mystery|bakery mystery|culinary mystery|cat mystery|cat detective|tea shop mystery|knitting mystery|craft mystery)\b/.test(combined) ||
      /\b(cat got your tongue|murder at .* tea shop|murder at .* bakery)\b/.test(title);
    if (cozyMysteryLeak && !(suspensePositive || /\b(psychological suspense|psychological thriller)\b/.test(combined))) {
      diagnostics.rejectReasons.push("cozy_mystery_off_profile");
    }

    const hardcoverRatingsCount = Number((doc as any)?.hardcover?.ratings_count || 0);
    const isOpenLibraryLikeDoc =
      String((doc as any)?.source || "").toLowerCase().includes("openlibrary") ||
      String((doc as any)?.engine || "").toLowerCase().includes("openlibrary") ||
      String((doc as any)?.laneKind || "").toLowerCase() === "ol-backfill";

    const missingOrLowQualityCover =
      !Boolean((doc as any)?.hasCover) &&
      !isOpenLibraryLikeDoc &&
      hardcoverRatingsCount === 0 &&
      /\b(miss|mrs\.?|mystery|detective story|novel)\b/.test(title) &&
      ratingsCount === 0 &&
      !legitAuthority;

    if (missingOrLowQualityCover) {
      diagnostics.rejectReasons.push("missing_or_low_quality_cover");
    }
  }

  if (family === "mystery" && !mysteryPositive) diagnostics.passedChecks.push("soft_missing_mystery_signal");
  if (family === "historical") {
    if (!historicalPositive) diagnostics.passedChecks.push("soft_missing_historical_signal");
    if (isHistoricalMetaLiteraryLeak(combined)) diagnostics.rejectReasons.push("historical_meta_reference");
  }
  if (family === "romance" && !romancePositive) diagnostics.passedChecks.push("soft_missing_romance_signal");

  if (family === "fantasy" && isLaneMismatch(family, combined, diagnostics.flags)) {
    if (isOpenLibraryLikeDoc(doc) && (diagnostics.flags.strongNarrative || diagnostics.flags.fictionPositive)) {
      diagnostics.passedChecks.push("soft_lane_mismatch_fantasy");
    } else {
      diagnostics.rejectReasons.push("lane_mismatch_fantasy");
    }
  }
  if (family === "mystery" && isLaneMismatch(family, combined, diagnostics.flags)) {
    diagnostics.rejectReasons.push("lane_mismatch_mystery");
  }
  if (family === "thriller" && isLaneMismatch(family, combined, diagnostics.flags)) {
    diagnostics.rejectReasons.push("lane_mismatch_thriller");
  }
  if (family === "romance" && isLaneMismatch(family, combined, diagnostics.flags)) {
    diagnostics.rejectReasons.push("lane_mismatch_romance");
  }
  if (family === "historical" && isLaneMismatch(family, combined, diagnostics.flags)) {
    diagnostics.rejectReasons.push("lane_mismatch_historical");
  }
  if (family === "science_fiction" && isLaneMismatch(family, combined, diagnostics.flags)) {
    if (diagnostics.flags.legitAuthority || diagnostics.flags.authorAffinity || hasCanonicalScienceFictionTitle(title)) {
      diagnostics.passedChecks.push("soft_lane_mismatch_science_fiction");
    } else {
      diagnostics.rejectReasons.push("lane_mismatch_science_fiction");
    }
  }
  if (family === "speculative" && isLaneMismatch(family, combined, diagnostics.flags)) {
    diagnostics.rejectReasons.push("lane_mismatch_speculative");
  }

  if (family === "horror" && !horrorAligned) {
    const horrorQueryNative = /\b(psychological horror|survival horror|haunted house horror|horror|haunted|ghost|supernatural|occult|gothic horror)\b/.test(queryIntentText);
    const thrillerOverlapNative = thrillerPositive || suspensePositive || mysteryPositive || crimePositive;
    if (bucketPlan?.hybridMode && horrorQueryNative && thrillerOverlapNative) {
      diagnostics.passedChecks.push("soft_horror_thriller_overlap");
    } else {
      diagnostics.rejectReasons.push("missing_horror_alignment_hard");
    }
  }

  const softFailCount = diagnostics.passedChecks.filter((check) => check.startsWith("soft_")).length;
  if (softFailCount >= 2 && !strongNarrative) {
    diagnostics.rejectReasons.push("too_many_soft_failures");
  }

  if (fictionPositive) diagnostics.passedChecks.push("fiction_positive");
  if (strongNarrative) diagnostics.passedChecks.push("strong_narrative");
  if (authorAffinity) diagnostics.passedChecks.push("author_affinity");
  if (family === "horror" && authorAffinity && !diagnostics.flags.horrorAligned) {
    diagnostics.passedChecks.push("author_affinity_horror_recovery");
  }
  if (hasRealLength || hasDescription) diagnostics.passedChecks.push("minimum_shape");

  return diagnostics;
}

const MIN_RATINGS = 20;
const MIN_RELAXED_HORROR_RATINGS = 5;

function hasMinimumRatings(doc: any): boolean {
  const pageCount =
    Number(doc?.pageCount) ||
    Number(doc?.volumeInfo?.pageCount) ||
    0;

  const descriptionLength = String(
    doc?.description ||
    doc?.volumeInfo?.description ||
    ""
  ).trim().length;

  const hasLongDescription = descriptionLength > 120;
  const hasUsableDescription = descriptionLength > 80;
  const hasTitle = String(doc?.title || doc?.volumeInfo?.title || "").trim().length > 0;

  // Ratings are too sparse and inconsistent to be a hard gate.
  // Treat the gate as a narrative/description shape floor instead.
  if (hasLongDescription) return true;
  if (hasTitle && hasUsableDescription) return true;
  if (hasTitle && pageCount >= 120) return true;
  if (pageCount >= 80 && hasUsableDescription) return true;

  return false;
}

function passesRelaxedHorrorFloor(doc: any, diagnostics: FilterDiagnostics): boolean {
  if (diagnostics.family !== "horror") return false;
  const ratings =
    Number(doc?.ratingsCount) ||
    Number(doc?.volumeInfo?.ratingsCount) ||
    Number(doc?.hardcover?.ratings_count) ||
    0;

  if (!diagnostics.flags.horrorAligned) return false;
  if (diagnostics.flags.weakSeriesSpam) return false;
  if (ratings >= MIN_RELAXED_HORROR_RATINGS) return true;
  return diagnostics.hasRealLength && diagnostics.hasDescription;
}

function attachDiagnostics(doc: RecommendationDoc, diagnostics: FilterDiagnostics): RecommendationDoc {
  const existing = (doc as any)?.diagnostics || {};
  return {
    ...(doc as any),
    laneKind: diagnostics.family,
    diagnostics: {
      ...existing,
      filterDiagnostics: diagnostics,
      filterKept: diagnostics.kept,
      filterRejectReasons: diagnostics.rejectReasons,
      filterPassedChecks: diagnostics.passedChecks,
      filterFamily: diagnostics.family,
      filterWantsHorrorTone: diagnostics.wantsHorrorTone,
      filterFlags: diagnostics.flags,
      pageCount: diagnostics.pageCount,
      ratingsCount: diagnostics.ratingsCount,
    },
  } as RecommendationDoc;
}


function isOpenLibraryLikeDoc(doc: any): boolean {
  const source = String(
    doc?.source ||
    doc?.engine ||
    doc?.rawDoc?.source ||
    doc?.rawDoc?.engine ||
    ""
  ).toLowerCase();

  if (source === "openlibrary" || source.includes("open library")) return true;

  const hasOpenLibraryKeys =
    Boolean(doc?.key) ||
    Boolean(doc?.cover_i) ||
    Boolean(doc?.edition_key) ||
    Boolean(doc?.ia) ||
    Boolean(doc?.lending_edition_s) ||
    Boolean(doc?.rawDoc?.key) ||
    Boolean(doc?.rawDoc?.cover_i) ||
    Boolean(doc?.rawDoc?.edition_key);

  const lacksGoogleBooksVolumeInfo = !doc?.volumeInfo && !doc?.rawDoc?.volumeInfo;

  return hasOpenLibraryKeys && lacksGoogleBooksVolumeInfo;
}

function hasOpenLibraryFallbackShape(doc: any, diagnostics: FilterDiagnostics): boolean {
  const rawTitle = String(doc?.title || doc?.volumeInfo?.title || "").trim();
  const normalizedTitle = normalizeText(rawTitle);
  const author = normalizeText(
    doc?.author_name ?? doc?.authors ?? doc?.author ?? doc?.authorName ?? doc?.volumeInfo?.authors
  );
  const subjects = collectCategoryText(doc);
  const description = collectDescriptionText(doc);
  const firstPublishedYear =
    Number(doc?.first_publish_year) ||
    Number(doc?.publishYear) ||
    Number(doc?.firstPublishedYear) ||
    0;

  const hasSubjectSignal = subjects.trim().length > 0;
  const hasDescriptionSignal = description.trim().length > 0;
  const hasBasicBibliographicShape = Boolean(rawTitle) && Boolean(author && author !== "unknown");
  const hasMinimumMetadataCompleteness =
    hasBasicBibliographicShape &&
    (diagnostics.hasRealLength || description.trim().length > 80);
  const hasNarrativeishShape =
    diagnostics.flags.fictionPositive ||
    diagnostics.flags.strongNarrative ||
    diagnostics.flags.horrorAligned ||
    diagnostics.flags.authorAffinity ||
    hasSubjectSignal ||
    hasDescriptionSignal;

  const gothicOrHorrorSignal =
    diagnostics.flags.horrorAligned ||
    diagnostics.flags.authorAffinity ||
    /\b(gothic|ghost|haunted|haunting|supernatural|occult|monster|creature|terror|dread|vampire|werewolf|zombie|devil|exorcist|possession)\b/.test(
      subjects + " " + description
    );

  const canonicalClassic =
    /\b(dracula|frankenstein|carrie|the terror|the turn of the screw|the haunting of hill house|the exorcist|pet sematary|the long walk|bag of bones|cujo|hell house|house of leaves)\b/.test(
      normalizedTitle
    );

  const oldBacklistBook =
    firstPublishedYear > 1800 &&
    firstPublishedYear <= new Date().getFullYear() &&
    hasBasicBibliographicShape &&
    canonicalClassic;

  return (
    hasMinimumMetadataCompleteness &&
    (
      canonicalClassic ||
      oldBacklistBook ||
      (
        hasNarrativeishShape &&
        gothicOrHorrorSignal &&
        (diagnostics.hasRealLength || hasSubjectSignal || hasDescriptionSignal || firstPublishedYear > 0)
      )
    )
  );
}


function passesOpenLibraryHorrorRecovery(doc: any, diagnostics: FilterDiagnostics): boolean {
  if (diagnostics.family !== "horror") return false;
  if (!isOpenLibraryLikeDoc(doc)) return false;

  const rawTitle = String(doc?.title || doc?.volumeInfo?.title || "").trim();
  const normalizedTitle = normalizeText(rawTitle);
  const author = normalizeText(
    doc?.author_name ?? doc?.authors ?? doc?.author ?? doc?.authorName ?? doc?.volumeInfo?.authors
  );
  const subjects = collectCategoryText(doc);
  const description = collectDescriptionText(doc);
  const combined = [normalizedTitle, subjects, description, author].filter(Boolean).join(" ");
  const firstPublishedYear =
    Number(doc?.first_publish_year) ||
    Number(doc?.publishYear) ||
    Number(doc?.firstPublishedYear) ||
    0;

  const hasBasicBibliographicShape = Boolean(rawTitle) && Boolean(author && author !== "unknown");

  const canonicalClassic =
    /\b(dracula|frankenstein|carrie|the terror|the turn of the screw|the haunting of hill house|the exorcist|pet sematary|the long walk|bag of bones|cujo|house of leaves|hell house)\b/.test(
      normalizedTitle
    );

  const horrorSubjectSignal =
    /\b(horror|ghost|haunted|haunting|supernatural|occult|monster|creature|terror|dread|gothic|vampire|werewolf|zombie|devil|exorcist|possession)\b/.test(
      combined
    );

  const thrillerishSignal =
    /\b(psychological|thriller|suspense|mystery|survival)\b/.test(combined);

  const hasUsefulMetadata =
    subjects.trim().length > 0 ||
    description.trim().length > 0 ||
    firstPublishedYear > 0;

  if (!hasBasicBibliographicShape) return false;

  if (canonicalClassic) return true;

  if (diagnostics.flags.authorAffinity && hasUsefulMetadata) return true;

  if (!horrorSubjectSignal && !diagnostics.flags.horrorAligned && !diagnostics.flags.authorAffinity) return false;

  // For sparse Open Library records, only recover when there is actual horror/gothic metadata.
  if (horrorSubjectSignal && hasUsefulMetadata) return true;

  // Allow borderline thriller-survival recovery only when the filter already saw horror alignment.
  if (diagnostics.flags.horrorAligned && thrillerishSignal && hasUsefulMetadata) return true;

  return false;
}




function passesOpenLibraryFantasyRecovery(doc: any, diagnostics: FilterDiagnostics): boolean {
  if (diagnostics.family !== "fantasy") return false;
  if (!isOpenLibraryLikeDoc(doc)) return false;

  const rawTitle = String(doc?.title || doc?.volumeInfo?.title || "").trim();
  const normalizedTitle = normalizeText(rawTitle);
  const author = normalizeText(
    doc?.author_name ?? doc?.authors ?? doc?.author ?? doc?.authorName ?? doc?.volumeInfo?.authors
  );
  const subjects = collectCategoryText(doc);
  const description = collectDescriptionText(doc);
  const combined = [normalizedTitle, subjects, description, author].filter(Boolean).join(" ");
  const firstPublishedYear =
    Number(doc?.first_publish_year) ||
    Number(doc?.publishYear) ||
    Number(doc?.firstPublishedYear) ||
    0;

  const hasBasicBibliographicShape = Boolean(rawTitle) && Boolean(author && author !== "unknown");

  const fantasySignal =
    /\b(fantasy|magic|magical|wizard|witch|dragon|fae|mythic|quest|kingdom|sword|sorcery|epic fantasy|high fantasy|dark fantasy|gothic fantasy)\b/.test(
      combined
    );

  const classicFantasyTitle =
    /\b(the hobbit|the fellowship of the ring|the two towers|the return of the king|a wizard of earthsea|dragonflight|the name of the wind|the final empire|the chronicles of narnia|a dance with dragons|house of flame and shadow|queen of shadows)\b/.test(
      normalizedTitle
    );

  const hasUsefulMetadata =
    subjects.trim().length > 0 ||
    description.trim().length > 0 ||
    firstPublishedYear > 0;

  if (!hasBasicBibliographicShape) return false;
  if (classicFantasyTitle) return true;
  if (diagnostics.flags.authorAffinity && hasUsefulMetadata) return true;
  if (fantasySignal && hasUsefulMetadata) return true;
  if (diagnostics.flags.strongNarrative && (fantasySignal || diagnostics.flags.speculativePositive || hasUsefulMetadata)) return true;

  return false;
}

function passesOpenLibraryRomanceRecovery(doc: any, diagnostics: FilterDiagnostics): boolean {
  if (diagnostics.family !== "romance") return false;
  if (!isOpenLibraryLikeDoc(doc)) return false;

  const rawTitle = String(doc?.title || doc?.volumeInfo?.title || "").trim();
  const normalizedTitle = normalizeText(rawTitle);
  const author = normalizeText(
    doc?.author_name ?? doc?.authors ?? doc?.author ?? doc?.authorName ?? doc?.volumeInfo?.authors
  );
  const subjects = collectCategoryText(doc);
  const description = collectDescriptionText(doc);
  const firstPublishedYear =
    Number(doc?.first_publish_year) ||
    Number(doc?.publishYear) ||
    Number(doc?.firstPublishedYear) ||
    0;

  const hasBasicBibliographicShape = Boolean(rawTitle) && Boolean(author && author !== "unknown");
  const canonicalTitle = hasCanonicalRomanceTitle(normalizedTitle);
  const strongTitleSignal = hasStrongRomanceTitleSignal(normalizedTitle);
  const richRomanceMetadata = hasRichRomanceMetadata(subjects, description);
  const hasUsefulMetadata =
    subjects.trim().length > 0 ||
    description.trim().length > 0 ||
    firstPublishedYear > 0;

  if (!hasBasicBibliographicShape) return false;
  if (isMetaLiteraryRomanceLeak(normalizedTitle, subjects, description)) return false;

  if (canonicalTitle) return true;
  if (diagnostics.flags.authorAffinity && (hasUsefulMetadata || strongTitleSignal)) return true;
  if (strongTitleSignal && richRomanceMetadata && author && author !== "unknown") return true;

  return false;
}


function hasProcurementShape(doc: any): boolean {
  const publisher = normalizeText(doc?.publisher ?? doc?.volumeInfo?.publisher);
  const saleInfo = doc?.saleInfo || doc?.volumeInfo?.saleInfo || {};
  const procurementSignals = (doc as any)?.procurementSignals || {};
  const identifiers = (doc as any)?.industryIdentifiers ?? doc?.volumeInfo?.industryIdentifiers;
  const hasIndustryIdentifier =
    Boolean((doc as any)?.isbn10 || (doc as any)?.isbn13) ||
    (Array.isArray(identifiers) && identifiers.some((id: any) => String(id?.identifier || "").trim()));
  const hasPurchaseSignal =
    Boolean((doc as any)?.buyLink || saleInfo?.buyLink || saleInfo?.isEbook) ||
    Boolean(procurementSignals?.hasPurchaseSignal);
  const hasMainstreamPublisher =
    Boolean(procurementSignals?.hasMainstreamPublisherSignal) ||
    /\b(penguin|random house|knopf|doubleday|viking|harper|macmillan|tor|simon\s*&?\s*schuster|hachette|st\.? martin|ballantine|minotaur|mysterious press|little brown|grand central|sourcebooks|kensington|crooked lane|berkley|delacorte|del rey|orbit|ace|roc|anchor|scribner|atria|william morrow|putnam|mulholland|flatiron)\b/.test(publisher);

  return Boolean(hasPurchaseSignal || hasIndustryIdentifier || hasMainstreamPublisher || procurementSignals?.hasShelfAvailabilitySignal);
}

function passesCommercialNarrativeFloor(doc: any, diagnostics: FilterDiagnostics): boolean {
  if (diagnostics.family !== "thriller" && diagnostics.family !== "mystery") return false;

  const hasLaneSignal =
    diagnostics.flags.thrillerPositive ||
    diagnostics.flags.mysteryPositive ||
    diagnostics.flags.crimePositive ||
    diagnostics.flags.suspensePositive;

  const authoritySignal =
    diagnostics.flags.legitAuthority ||
    diagnostics.flags.authorAffinity ||
    Boolean((doc as any)?.commercialSignals?.bestseller) ||
    Number((doc as any)?.commercialSignals?.popularityTier || 0) >= 2 ||
    diagnostics.ratingsCount >= 20;

  return Boolean(
    diagnostics.pageCount >= 200 &&
    diagnostics.flags.strongNarrative &&
    hasLaneSignal &&
    hasProcurementShape(doc) &&
    authoritySignal &&
    diagnostics.ratingsCount > 0
  );
}

function hasRescueAuthoritySignal(doc: any, diagnostics: FilterDiagnostics): boolean {
  const multiSourcePresence =
    Number((doc as any)?.sourceCount || 0) >= 2 ||
    Number((doc as any)?.matchedSourceCount || 0) >= 2 ||
    (Array.isArray((doc as any)?.sources) && (doc as any).sources.length >= 2) ||
    (Array.isArray((doc as any)?.sourceMatches) && (doc as any).sourceMatches.length >= 2);
  return Boolean(
    diagnostics.flags.legitAuthority ||
    diagnostics.flags.authorAffinity ||
    diagnostics.ratingsCount >= 20 ||
    hasProcurementShape(doc) ||
    multiSourcePresence ||
    hasCanonicalThrillerTitle(diagnostics.title) ||
    hasCanonicalScienceFictionTitle(diagnostics.title) ||
    hasCanonicalRomanceTitle(diagnostics.title)
  );
}

function isBorderlineRescueCandidate(doc: any, diagnostics: FilterDiagnostics): boolean {
  const laneSignal =
    diagnostics.flags.thrillerPositive ||
    diagnostics.flags.mysteryPositive ||
    diagnostics.flags.suspensePositive ||
    diagnostics.flags.crimePositive;
  return Boolean(
    diagnostics.pageCount >= 250 &&
    diagnostics.flags.fictionPositive &&
    laneSignal &&
    hasRescueAuthoritySignal(doc, diagnostics)
  );
}

function filterDocIdentity(doc: any): string {
  return String(
    doc?.key ||
    doc?.id ||
    doc?.cover_edition_key ||
    doc?.edition_key?.[0] ||
    `${doc?.title || "unknown"}|${Array.isArray(doc?.author_name) ? doc.author_name[0] : doc?.author || "unknown"}`
  );
}

function hasStrongQueryFamilyMatch(diagnostics: FilterDiagnostics): boolean {
  const title = diagnostics.title || "";
  if (diagnostics.family === "science_fiction") {
    return Boolean(
      diagnostics.flags.speculativePositive ||
      diagnostics.flags.fictionPositive ||
      hasCanonicalScienceFictionTitle(title) ||
      diagnostics.flags.authorAffinity
    );
  }
  if (diagnostics.family === "thriller") {
    return Boolean(
      diagnostics.flags.thrillerPositive ||
      diagnostics.flags.suspensePositive ||
      diagnostics.flags.crimePositive ||
      diagnostics.flags.fictionPositive
    );
  }
  if (diagnostics.family === "mystery") {
    return Boolean(
      diagnostics.flags.mysteryPositive ||
      diagnostics.flags.crimePositive ||
      diagnostics.flags.fictionPositive
    );
  }
  return diagnostics.flags.fictionPositive;
}

export function filterCandidates(docs: RecommendationDoc[], bucketPlan: any): RecommendationDoc[] {
  const inputDocs = Array.isArray(docs) ? docs : [];
  const filtered: RecommendationDoc[] = [];
  const metadataShapeRescueQueue: RecommendationDoc[] = [];

  const criticalRejectReasons = new Set([
    "missing_title",
    "hard_reject_title",
    "hard_reject_category",
    "anthology_or_collection",
    "narrative_strength_required",
    "low_authority_zero_signal",
    "literature_without_fiction",
    "weak_series_spam",
    "speculative_off_profile_reference",
    "missing_horror_alignment_hard",
    "lane_mismatch_fantasy",
    "lane_mismatch_thriller",
    "lane_mismatch_romance",
    "lane_mismatch_historical",
    "lane_mismatch_speculative",
    "antique_off_profile_thriller",
    "thriller_meta_reference",
    "cozy_mystery_off_profile",
    "missing_or_low_quality_cover",
    "below_shape_floor",
    "romance_meta_reference",
    "universal_meta_reference",
    "no_cover_low_quality_meta",
  ]);
  const shapeMetadataRelaxableReasons = new Set([
    "insufficient_length_or_description",
    "below_shape_floor",
    "missing_or_low_quality_cover",
    "too_many_soft_failures",
    "no_cover_low_quality_meta",
  ]);
  const targetPoolMinimum = 8;

  for (const doc of inputDocs) {
    const diagnostics = buildFilterDiagnostics(doc, bucketPlan);

    const isOpenLibraryLike = isOpenLibraryLikeDoc(doc);
    const isWeakSource = isOpenLibraryLike;

    if (isOpenLibraryLike && diagnostics.family === "horror") {
      const recoveryReady =
        hasOpenLibraryFallbackShape(doc, diagnostics) ||
        passesOpenLibraryHorrorRecovery(doc, diagnostics);

      if (recoveryReady) {
        const removed = new Set([
          "insufficient_length_or_description",
          "missing_horror_alignment_hard",
          "too_many_soft_failures",
        ]);

        diagnostics.rejectReasons = diagnostics.rejectReasons.filter((reason) => !removed.has(reason));
        diagnostics.passedChecks.push("openlibrary_horror_recovery_precheck");
      }
    }
    if (isOpenLibraryLike && diagnostics.family === "thriller") {
      const hardcoverRatingsCount = Number((doc as any)?.hardcover?.ratings_count || 0);
      const hardcoverRating = Number((doc as any)?.hardcover?.rating || 0);
      const thrillerRecoverySignals =
        diagnostics.flags.authorAffinity ||
        diagnostics.flags.legitAuthority ||
        hasCanonicalThrillerTitle(diagnostics.title) ||
        hasThrillerOverlapSignal([diagnostics.title, collectCategoryText(doc), collectDescriptionText(doc)].join(" ")) ||
        hardcoverRatingsCount >= 10 ||
        hardcoverRating >= 3.7;

      if (thrillerRecoverySignals) {
        const removed = new Set([
          "insufficient_length_or_description",
          "missing_or_low_quality_cover",
          "lane_mismatch_thriller",
          "below_shape_floor",
          "too_many_soft_failures",
        ]);

        diagnostics.rejectReasons = diagnostics.rejectReasons.filter((reason) => !removed.has(reason));
        diagnostics.passedChecks.push("openlibrary_thriller_recovery_precheck");
      }
    }

    if (isOpenLibraryLike && diagnostics.family === "fantasy") {
      const recoveryReady = passesOpenLibraryFantasyRecovery(doc, diagnostics);

      if (recoveryReady) {
        const removed = new Set([
          "insufficient_length_or_description",
          "lane_mismatch_fantasy",
          "too_many_soft_failures",
        ]);

        diagnostics.rejectReasons = diagnostics.rejectReasons.filter((reason) => !removed.has(reason));
        diagnostics.passedChecks.push("openlibrary_fantasy_recovery_precheck");
      }
    }

    if (isOpenLibraryLike && diagnostics.family === "romance") {
      const recoveryReady = passesOpenLibraryRomanceRecovery(doc, diagnostics);

      if (recoveryReady) {
        const removed = new Set([
          "insufficient_length_or_description",
          "lane_mismatch_romance",
          "too_many_soft_failures",
          "below_shape_floor",
        ]);

        diagnostics.rejectReasons = diagnostics.rejectReasons.filter((reason) => !removed.has(reason));
        diagnostics.passedChecks.push("openlibrary_romance_recovery_precheck");
      }
    }

    if (isOpenLibraryLike && diagnostics.family === "historical") {
      const recoveryReady = passesOpenLibraryHistoricalRecovery(doc, diagnostics);

      if (recoveryReady) {
        const removed = new Set([
          "insufficient_length_or_description",
          "lane_mismatch_historical",
          "too_many_soft_failures",
          "below_shape_floor",
        ]);

        diagnostics.rejectReasons = diagnostics.rejectReasons.filter((reason) => !removed.has(reason));
        diagnostics.passedChecks.push("openlibrary_historical_recovery_precheck");
      }
    }

    if (isOpenLibraryLike && passesOpenLibrarySourceRecovery(doc, diagnostics)) {
      const removed = new Set([
        "insufficient_length_or_description",
        "too_many_soft_failures",
        "below_shape_floor",
        "missing_or_low_quality_cover",
        "lane_mismatch_fantasy",
        "lane_mismatch_thriller",
        "lane_mismatch_romance",
        "lane_mismatch_historical",
        "lane_mismatch_speculative",
      ]);

      diagnostics.rejectReasons = diagnostics.rejectReasons.filter((reason) => !removed.has(reason));
      diagnostics.passedChecks.push("openlibrary_source_recovery_precheck");
    }

    if (
      diagnostics.flags.fictionPositive &&
      (diagnostics.hasRealLength || diagnostics.hasDescription || diagnostics.pageCount >= 180 || diagnostics.flags.authorAffinity || diagnostics.flags.legitAuthority)
    ) {
      const softened = new Set(["insufficient_length_or_description", "too_many_soft_failures"]);
      const before = diagnostics.rejectReasons.length;
      diagnostics.rejectReasons = diagnostics.rejectReasons.filter((reason) => !softened.has(reason));
      if (diagnostics.rejectReasons.length !== before) {
        diagnostics.passedChecks.push("soft_shape_metadata_reject_relaxation");
      }
    }

    if (
      isOpenLibraryLike &&
      diagnostics.flags.fictionPositive &&
      (
        diagnostics.flags.authorAffinity ||
        diagnostics.flags.legitAuthority ||
        diagnostics.pageCount >= 160 ||
        diagnostics.flags.thrillerPositive ||
        diagnostics.flags.mysteryPositive ||
        diagnostics.flags.crimePositive ||
        diagnostics.flags.suspensePositive
      )
    ) {
      const relaxed = new Set([
        "insufficient_length_or_description",
        "too_many_soft_failures",
        "below_shape_floor",
        "missing_or_low_quality_cover",
      ]);
      const before = diagnostics.rejectReasons.length;
      diagnostics.rejectReasons = diagnostics.rejectReasons.filter((reason) => !relaxed.has(reason));
      if (diagnostics.rejectReasons.length !== before) {
        diagnostics.passedChecks.push("openlibrary_sparse_metadata_relaxation");
        if (hasRescueAuthoritySignal(doc, diagnostics)) diagnostics.passedChecks.push("borderline_rescue_penalty");
      }
    }

    if (isBorderlineRescueCandidate(doc, diagnostics)) {
      const removed = new Set([
        "insufficient_length_or_description",
        "below_shape_floor",
        "missing_or_low_quality_cover",
        "too_many_soft_failures",
        "no_cover_low_quality_meta",
      ]);
      const before = diagnostics.rejectReasons.length;
      diagnostics.rejectReasons = diagnostics.rejectReasons.filter((reason) => !removed.has(reason));
      if (diagnostics.rejectReasons.length !== before) {
        diagnostics.passedChecks.push("borderline_rescue_layer");
        if (hasRescueAuthoritySignal(doc, diagnostics)) diagnostics.passedChecks.push("borderline_rescue_penalty");
      }
    }

    if (
      diagnostics.ratingsCount === 0 &&
      !diagnostics.flags.strongNarrative &&
      !diagnostics.flags.fictionPositive &&
      !diagnostics.flags.speculativePositive &&
      !hasRescueAuthoritySignal(doc, diagnostics)
    ) {
      diagnostics.rejectReasons.push("low_authority_zero_signal");
    }

    const nonCriticalRejectReasons = new Set([
      "missing_fiction_signal",
      "missing_narrative_signal",
      "missing_horror_alignment",
      "generic_title",
      "soft_lane_mismatch_fantasy",
      "missing_fantasy_signal",
      "missing_speculative_signal",
      "missing_thriller_signal",
      "missing_historical_signal",
      "missing_romance_signal",
      "literature_without_fiction",
    ]);

    const hasCriticalReject = diagnostics.rejectReasons.some(
      (reason) => criticalRejectReasons.has(reason) && !(isOpenLibraryLike && nonCriticalRejectReasons.has(reason))
    );
    const onlyNonCriticalRejects =
      diagnostics.rejectReasons.length > 0 &&
      diagnostics.rejectReasons.every((reason) => nonCriticalRejectReasons.has(reason));

    if (isWeakSource && onlyNonCriticalRejects) {
      diagnostics.passedChecks.push("weak_source_noncritical_reject_bypass");
      diagnostics.rejectReasons = [];
    }

    if (
      isOpenLibraryLike &&
      !hasCriticalReject &&
      (
        diagnostics.family !== "romance" ||
        diagnostics.passedChecks.includes("openlibrary_romance_recovery_precheck")
      )
    ) {
      diagnostics.passedChecks.push("openlibrary_noncritical_reject_bypass");
      diagnostics.rejectReasons = [];
    }

    if (diagnostics.rejectReasons.length === 0) {
      diagnostics.passedChecks.push("passed_content_gate");
    }

    if (diagnostics.rejectReasons.length > 0) {
      const metadataOrShapeOnlyReject =
        diagnostics.rejectReasons.length > 0 &&
        diagnostics.rejectReasons.every((reason) => shapeMetadataRelaxableReasons.has(reason));
      if (metadataOrShapeOnlyReject && isBorderlineRescueCandidate(doc, diagnostics)) {
        diagnostics.passedChecks.push("metadata_shape_relaxation_candidate");
        diagnostics.kept = false;
        const withDiagnostics = attachDiagnostics(doc, diagnostics);
        Object.assign(doc as any, withDiagnostics);
        metadataShapeRescueQueue.push(withDiagnostics);
      } else {
        diagnostics.kept = false;
        Object.assign(doc as any, attachDiagnostics(doc, diagnostics));
      }
      continue;
    }

    const zeroRating = diagnostics.ratingsCount === 0;
    const externalAuthoritySignal =
      diagnostics.flags.legitAuthority ||
      diagnostics.flags.authorAffinity ||
      Boolean((doc as any)?.commercialSignals?.bestseller) ||
      Number((doc as any)?.commercialSignals?.popularityTier || 0) >= 2 ||
      hasCanonicalThrillerTitle(diagnostics.title) ||
      hasCanonicalScienceFictionTitle(diagnostics.title) ||
      hasCanonicalRomanceTitle(diagnostics.title);
    const minimumAuthorityFloorMet =
      !zeroRating ||
      hasProcurementShape(doc) ||
      diagnostics.flags.strongNarrative ||
      externalAuthoritySignal;
    if (!minimumAuthorityFloorMet) {
      diagnostics.passedChecks.push("soft_minimum_authority_floor_miss");
    }

    const hasNarrativeOrDescription =
      diagnostics.family === "thriller"
        ? (
            (
              diagnostics.flags.thrillerPositive ||
              diagnostics.flags.crimePositive ||
              diagnostics.flags.suspensePositive ||
              diagnostics.flags.mysteryPositive
            ) &&
            (
              diagnostics.hasDescription ||
              diagnostics.hasRealLength ||
              Number((doc as any)?.hardcover?.ratings_count || 0) >= 10 ||
              (isOpenLibraryLike && diagnostics.passedChecks.includes("openlibrary_thriller_recovery_precheck")) ||
              (isOpenLibraryLike && diagnostics.passedChecks.includes("openlibrary_source_recovery_precheck")) ||
              (isOpenLibraryLike && hasCanonicalThrillerTitle(diagnostics.title))
            ) &&
            (
              diagnostics.ratingsCount >= 5 ||
              diagnostics.flags.legitAuthority ||
              Number((doc as any)?.hardcover?.ratings_count || 0) >= 10 ||
              Number((doc as any)?.hardcover?.rating || 0) >= 3.7 ||
              diagnostics.flags.authorAffinity ||
              (isOpenLibraryLike && diagnostics.passedChecks.includes("openlibrary_thriller_recovery_precheck")) ||
              (isOpenLibraryLike && diagnostics.passedChecks.includes("openlibrary_source_recovery_precheck")) ||
              (isOpenLibraryLike && hasCanonicalThrillerTitle(diagnostics.title))
            )
          )
        : (
            diagnostics.flags.strongNarrative ||
            diagnostics.flags.fictionPositive ||
            (diagnostics.flags.authorAffinity && diagnostics.flags.fictionPositive && hasProcurementShape(doc)) ||
            (diagnostics.family === "romance" && (
              diagnostics.flags.authorAffinity ||
              (hasStrongRomanceTitleSignal(diagnostics.title) && (diagnostics.hasRealLength || diagnostics.hasDescription))
            )) ||
            (diagnostics.family === "historical" && (
              diagnostics.flags.historicalPositive ||
              diagnostics.passedChecks.includes("openlibrary_historical_recovery_precheck") ||
              diagnostics.hasDescription ||
              diagnostics.hasRealLength
            ))
          );

    if (!hasMinimumRatings(doc) || !hasNarrativeOrDescription) {
      if (passesRelaxedHorrorFloor(doc, diagnostics)) {
        diagnostics.passedChecks.push("passed_relaxed_horror_shape_gate");
      } else if (isOpenLibraryLike && passesOpenLibraryHorrorRecovery(doc, diagnostics)) {
        diagnostics.passedChecks.push("openlibrary_horror_recovery");
      } else if (isOpenLibraryLike && diagnostics.family === "mystery" && diagnostics.flags.mysteryPositive && (diagnostics.flags.strongNarrative || diagnostics.hasDescription || diagnostics.hasRealLength)) {
        diagnostics.passedChecks.push("openlibrary_mystery_recovery");
      } else if (isOpenLibraryLike && passesOpenLibraryFantasyRecovery(doc, diagnostics)) {
        diagnostics.passedChecks.push("openlibrary_fantasy_recovery");
      } else if (isOpenLibraryLike && passesOpenLibraryRomanceRecovery(doc, diagnostics)) {
        diagnostics.passedChecks.push("openlibrary_romance_recovery");
      } else if (isOpenLibraryLike && passesOpenLibraryHistoricalRecovery(doc, diagnostics)) {
        diagnostics.passedChecks.push("openlibrary_historical_recovery");
      } else if (isOpenLibraryLike && passesOpenLibrarySourceRecovery(doc, diagnostics)) {
        diagnostics.passedChecks.push("openlibrary_source_recovery");
      } else if (isOpenLibraryLike && hasOpenLibraryFallbackShape(doc, diagnostics)) {
        diagnostics.passedChecks.push("openlibrary_shape_bypass");
      } else if (!isOpenLibraryLike && passesCommercialNarrativeFloor(doc, diagnostics)) {
        diagnostics.passedChecks.push("commercial_narrative_shape_bypass");
      } else if (isOpenLibraryLike && diagnostics.flags.fictionPositive && (diagnostics.flags.strongNarrative || diagnostics.pageCount >= 160 || diagnostics.hasDescription)) {
        diagnostics.passedChecks.push("openlibrary_relaxed_shape_floor");
        if (hasRescueAuthoritySignal(doc, diagnostics)) diagnostics.passedChecks.push("borderline_rescue_penalty");
      } else if (isOpenLibraryLike && diagnostics.flags.fictionPositive && hasStrongQueryFamilyMatch(diagnostics)) {
        diagnostics.passedChecks.push("query_match_shape_floor_rescue");
        diagnostics.passedChecks.push("borderline_rescue_penalty");
      } else if (diagnostics.pageCount >= 250 && (isBorderlineRescueCandidate(doc, diagnostics) || hasRescueAuthoritySignal(doc, diagnostics))) {
        diagnostics.passedChecks.push("pagecount_shape_floor_override");
        if (hasRescueAuthoritySignal(doc, diagnostics)) diagnostics.passedChecks.push("borderline_rescue_penalty");
      } else {
        diagnostics.rejectReasons.push("below_shape_floor");
        diagnostics.kept = false;
        const withDiagnostics = attachDiagnostics(doc, diagnostics);
        Object.assign(doc as any, withDiagnostics);
        if (
          diagnostics.rejectReasons.every((reason) => shapeMetadataRelaxableReasons.has(reason)) &&
          isBorderlineRescueCandidate(doc, diagnostics)
        ) {
          metadataShapeRescueQueue.push(withDiagnostics);
        }
        continue;
      }
    } else {
      diagnostics.passedChecks.push("passed_shape_gate");
    }
    diagnostics.kept = true;

    const withDiagnostics = attachDiagnostics(doc, diagnostics);
    Object.assign(doc as any, withDiagnostics);
    filtered.push(withDiagnostics);
  }

  if (filtered.length < targetPoolMinimum && metadataShapeRescueQueue.length > 0) {
    const existingKeys = new Set(filtered.map((doc: any) => filterDocIdentity(doc)));
    const rankedRescues = [...metadataShapeRescueQueue].sort((a: any, b: any) => {
      const aRatings = Number(a?.ratingsCount ?? a?.volumeInfo?.ratingsCount ?? 0);
      const bRatings = Number(b?.ratingsCount ?? b?.volumeInfo?.ratingsCount ?? 0);
      const aPages = Number(a?.pageCount ?? a?.volumeInfo?.pageCount ?? 0);
      const bPages = Number(b?.pageCount ?? b?.volumeInfo?.pageCount ?? 0);
      return bRatings - aRatings || bPages - aPages;
    });

    for (const rescued of rankedRescues) {
      if (filtered.length >= targetPoolMinimum) break;
      const key = filterDocIdentity(rescued);
      if (existingKeys.has(key)) continue;
      const diagnostics = buildFilterDiagnostics(rescued, bucketPlan);
      if (!isBorderlineRescueCandidate(rescued, diagnostics)) continue;
      if (diagnostics.ratingsCount === 0 && !hasRescueAuthoritySignal(rescued, diagnostics)) continue;
      diagnostics.kept = true;
      diagnostics.rejectReasons = [];
      diagnostics.passedChecks.push("relaxed_pool_floor_rescue");
      diagnostics.passedChecks.push("borderline_rescue_penalty");
      const withDiagnostics = attachDiagnostics(rescued, diagnostics);
      Object.assign(rescued as any, withDiagnostics);
      filtered.push(withDiagnostics);
      existingKeys.add(key);
    }
  }

  // Do not re-admit rejected rows when the pool goes empty. Returning [] keeps
  // filterCandidates as the single source of truth and prevents universal junk
  // from bypassing diagnostics.
  return filtered;
}

export default filterCandidates;
