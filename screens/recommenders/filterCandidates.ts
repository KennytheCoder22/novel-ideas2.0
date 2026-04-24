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
  if (family === "horror") return HORROR_AUTHOR_AFFINITY.has(author);
  if (family === "thriller") return THRILLER_AUTHOR_AFFINITY.has(author);
  if (family === "romance") return ROMANCE_AUTHOR_AFFINITY.has(author);
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

    if (!thrillerNative) return true;

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

function buildFilterDiagnostics(doc: any, bucketPlan: any): FilterDiagnostics {
  const title = normalizeText(doc?.title ?? doc?.volumeInfo?.title);
  const categories = collectCategoryText(doc);
  const description = collectDescriptionText(doc);
  const author = normalizeText(
    doc?.author_name ?? doc?.authors ?? doc?.author ?? doc?.authorName ?? doc?.volumeInfo?.authors
  );
  const combined = [title, categories, description, author].filter(Boolean).join(" ");
  const family = (bucketPlan?.lane || inferRouterFamily(bucketPlan)) as RouterFamily;
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

  const fictionPositive =
    /\b(fiction|novel|thriller|suspense|dystopian|survival|science fiction|fantasy|horror|romance|historical fiction|literary fiction|young adult)\b/.test(
      combined
    );

  const strongNarrative =
    /\b(novel|thriller|horror|suspense|fiction)\b/.test(title) ||
    /\b(follows|story of|when .* discovers|must survive|after .* happens|trapped in|haunted by|must confront|investigates|must uncover|haunted|ghost|terror|dread|survive|escape)\b/.test(description);

  const genericTitle =
    /^\s*novels?\b/.test(title) ||
    /^\s*novelists?\b/.test(title) ||
    /\bnovels?\s+of\b/.test(title) ||
    /\bnovels?\s+and\s+(tales|stories|other works|related works)\b/.test(title) ||
    /\bfuture of the novel\b/.test(title);

  const speculativePositive =
    /\b(science fiction|fantasy|dystopian|speculative|space|spaceship|alien|robot|android|ai|artificial intelligence|future|time travel|portal|parallel world|magic|magical|haunted|ghost|supernatural|occult|monster|creature|horror|survival horror|terror|dread)\b/.test(
      combined
    );

  const thrillerPositive =
    /\b(thriller|psychological thriller|crime thriller|domestic suspense|legal thriller|murder|serial killer|investigation|police procedural|noir|survival)\b/.test(
      combined
    );

  const mysteryPositive =
    /\b(mystery|detective|whodunit|case|private investigator|investigation)\b/.test(combined);

  const crimePositive =
    /\b(crime|criminal|murder|killer|kidnapp(?:ed|ing)?|abduction|fbi|police|procedural|manhunt|fugitive)\b/.test(combined);

  const suspensePositive =
    /\b(suspense|psychological suspense|domestic suspense|tension|cat and mouse)\b/.test(combined);

  const horrorAligned =
    isHorrorLane && /\b(horror|haunted|ghost|supernatural|occult|monster|creature|survival horror|terror|dread|eerie|disturbing)\b/.test(combined);

  const historicalPositive =
    /\b(historical fiction|historical novel|period fiction|victorian|edwardian|civil war|world war|regency|gilded age)\b/.test(
      combined
    );

  const romancePositive = /\b(romance|love story|romantic|courtship|second chance|forbidden love|historical romance|gothic romance|fantasy romance|rom-com|rom com|duke|earl|bridgerton|regency|wallflower|rake|wedding|husband|wife|lover|kiss|heart)\b/.test(combined) || hasCanonicalRomanceTitle(combined) || (family === "romance" && hasAuthorAffinityForFamily(author, family));
  const authorAffinity = hasAuthorAffinityForFamily(author, family);
  const legitAuthority = hasLegitCommercialAuthority(doc);
  const weakSeriesSpam = isWeakSeriesSpam(title, doc, hasDescription, hasRealLength);

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
  if (!hasRealLength && !hasDescription) diagnostics.rejectReasons.push("insufficient_length_or_description");
  if (weakSeriesSpam) diagnostics.rejectReasons.push("weak_series_spam");

  if (family === "horror") {
    if (!horrorAligned) diagnostics.passedChecks.push("soft_missing_horror_alignment");
  }

  
  if (family === "science_fiction") {
    const scienceFictionReject =
      /\b(bookshop mysteries|family names|science fact\/science fiction|analog science|public library|publishers weekly|historical dictionary|guide to|popular culture|writers? market|literary criticism)\b/.test(combined);
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

    if (!thrillerPositive) diagnostics.passedChecks.push("soft_missing_thriller_signal");
    if (horrorToneWanted && !horrorAligned) diagnostics.passedChecks.push("soft_missing_horror_alignment");

    if (!thrillerNative) {
      diagnostics.rejectReasons.push("thriller_native_signal_required");
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
    diagnostics.rejectReasons.push("lane_mismatch_science_fiction");
  }
  if (family === "speculative" && isLaneMismatch(family, combined, diagnostics.flags)) {
    diagnostics.rejectReasons.push("lane_mismatch_speculative");
  }

  if (family === "horror" && !horrorAligned) {
    diagnostics.rejectReasons.push("missing_horror_alignment_hard");
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
    hasBasicBibliographicShape &&
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

export function filterCandidates(docs: RecommendationDoc[], bucketPlan: any): RecommendationDoc[] {
  const inputDocs = Array.isArray(docs) ? docs : [];
  const filtered: RecommendationDoc[] = [];

  const criticalRejectReasons = new Set([
    "missing_title",
    "hard_reject_title",
    "hard_reject_category",
    "literature_without_fiction",
    "insufficient_length_or_description",
    "weak_series_spam",
    "speculative_off_profile_reference",
    "missing_horror_alignment_hard",
    "lane_mismatch_fantasy",
    "lane_mismatch_thriller",
    "lane_mismatch_romance",
    "lane_mismatch_historical",
    "lane_mismatch_speculative",
    "thriller_native_signal_required",
    "antique_off_profile_thriller",
    "thriller_meta_reference",
    "missing_or_low_quality_cover",
    "too_many_soft_failures",
    "below_shape_floor",
    "romance_meta_reference",
  ]);

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
        hardcoverRatingsCount >= 10 ||
        hardcoverRating >= 3.7;

      if (thrillerRecoverySignals) {
        const removed = new Set([
          "insufficient_length_or_description",
          "thriller_native_signal_required",
          "missing_or_low_quality_cover",
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

    if (isWeakSource && diagnostics.family !== "thriller" && onlyNonCriticalRejects) {
      diagnostics.passedChecks.push("weak_source_noncritical_reject_bypass");
      diagnostics.rejectReasons = [];
    }

    if (
      isOpenLibraryLike &&
      diagnostics.family !== "thriller" &&
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
      diagnostics.kept = false;
      Object.assign(doc as any, attachDiagnostics(doc, diagnostics));
      continue;
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
              Number((doc as any)?.hardcover?.ratings_count || 0) >= 10
            ) &&
            (
              diagnostics.ratingsCount >= 5 ||
              diagnostics.flags.legitAuthority ||
              Number((doc as any)?.hardcover?.ratings_count || 0) >= 10 ||
              Number((doc as any)?.hardcover?.rating || 0) >= 3.7 ||
              diagnostics.flags.authorAffinity
            )
          )
        : (
            diagnostics.flags.strongNarrative ||
            (diagnostics.hasDescription && diagnostics.flags.fictionPositive) ||
            (diagnostics.flags.authorAffinity && diagnostics.flags.fictionPositive) ||
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
      } else if (isOpenLibraryLike && hasOpenLibraryFallbackShape(doc, diagnostics)) {
        diagnostics.passedChecks.push("openlibrary_shape_bypass");
      } else {
        diagnostics.rejectReasons.push("below_shape_floor");
        diagnostics.kept = false;
        Object.assign(doc as any, attachDiagnostics(doc, diagnostics));
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

  if (filtered.length === 0) {
    return inputDocs.slice(0, 20).map((doc) => {
      const diagnostics = buildFilterDiagnostics(doc, bucketPlan);
      diagnostics.kept = true;
      diagnostics.passedChecks.push("empty_filter_fallback");
      diagnostics.rejectReasons = [];
      const withDiagnostics = attachDiagnostics(doc, diagnostics);
      Object.assign(doc as any, withDiagnostics);
      return withDiagnostics;
    });
  }

  return filtered;
}

export default filterCandidates;
