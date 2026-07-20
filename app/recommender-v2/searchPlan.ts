import type { SearchIntentV2, SearchPlan, SourceIdV2, SourcePlan, TasteProfile } from "./types";

const DEFAULT_SOURCE_TIMEOUT_MS = 2_500;
const OPEN_LIBRARY_SOURCE_TIMEOUT_MS = 8_000;
const ADULT_OPEN_LIBRARY_SOURCE_TIMEOUT_MS = 22_000;

function topValues(rows: { value: string; weight: number }[], count: number): string[] {
  return rows.slice(0, count).map((row) => row.value).filter(Boolean);
}

function normalizedTerm(value: unknown): string {
  return String(value || "").toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

function uniqueTerms(values: string[], limit = 4): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = normalizedTerm(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(normalized);
    if (output.length >= limit) break;
  }
  return output;
}

function googleBooksAgePrefix(ageBand: TasteProfile["ageBand"]): string {
  if (ageBand === "teens") return "young adult";
  if (ageBand === "preteens") return "middle grade";
  if (ageBand === "kids") return "children";
  return "adult";
}

function googleBooksGenreAnchor(value: string): string | undefined {
  const normalized = normalizedTerm(value);
  if (!normalized) return undefined;
  if (/\bscience fiction|sci fi|sci-fi|speculative\b/.test(normalized)) return "science fiction";
  if (/\bdystopian|dystopia\b/.test(normalized)) return "dystopian";
  if (/\bfantasy\b/.test(normalized)) return "fantasy";
  if (/\bmystery\b/.test(normalized)) return "mystery";
  if (/\bthriller|suspense\b/.test(normalized)) return "thriller";
  if (/\bhorror|supernatural|paranormal\b/.test(normalized)) return "horror";
  if (/\bromance\b/.test(normalized)) return "romance";
  if (/\bhistorical|history\b/.test(normalized)) return "historical";
  if (/\badventure|survival|quest\b/.test(normalized)) return "adventure";
  if (/\bmythology|mythological|mythologies\b/.test(normalized)) return "mythology fantasy";
  if (/\bsuperhero|superheroes\b/.test(normalized)) return "superhero adventure";
  if (/\bcomedy|humou?r|funny\b/.test(normalized)) return "humorous";
  if (/\bcontemporary|realistic|drama|literary\b/.test(normalized)) return "contemporary";
  return undefined;
}

function googleBooksDescriptor(value: string): string | undefined {
  const normalized = normalizedTerm(value);
  if (!normalized) return undefined;
  if (/\bcomedy|humou?r|funny\b/.test(normalized)) return "humorous";
  if (/\bdark|gothic\b/.test(normalized)) return "dark";
  if (/\bpsychological\b/.test(normalized)) return "psychological";
  if (/\bquirky|offbeat|weird\b/.test(normalized)) return "quirky";
  if (/\bcozy|gentle|warm\b/.test(normalized)) return "cozy";
  if (/\bepic\b/.test(normalized)) return "epic";
  return undefined;
}

function googleBooksAdjacentGenre(primary?: string): string | undefined {
  if (!primary) return undefined;
  if (primary === "dystopian" || primary === "science fiction") return "mystery";
  if (primary === "horror") return "mystery";
  if (primary === "fantasy") return "adventure";
  if (primary === "mystery" || primary === "thriller") return "historical";
  return "fiction";
}

function googleBooksAdultNarrativeQuery(genre?: string, descriptor?: string): string {
  const normalizedGenre = normalizedTerm(genre || "");
  const normalizedDescriptor = normalizedTerm(descriptor || "");
  const descriptorPrefix = normalizedDescriptor ? [normalizedDescriptor] : [];
  if (normalizedGenre) {
    return uniqueTerms([...descriptorPrefix, normalizedGenre, "novel"], 4).join(" ");
  }
  return uniqueTerms([...descriptorPrefix, "literary", "fiction", "novel"], 4).join(" ");
}

function googleBooksAdultPairedNarrativeQuery(primaryGenre?: string, secondaryGenre?: string, descriptor?: string): string {
  const primary = normalizedTerm(primaryGenre || "");
  const secondary = normalizedTerm(secondaryGenre || "");
  const tone = normalizedTerm(descriptor || "");
  const pair = uniqueTerms([primary, secondary].filter(Boolean), 2);
  if (pair.length >= 2) {
    return uniqueTerms([pair[0], pair[1], "novel"], 4).join(" ");
  }
  return googleBooksAdultNarrativeQuery(primary || secondary || undefined, tone || undefined);
}

type KidsGoogleBooksQueryCandidate = {
  id: string;
  query: string;
  family: string;
  format: "picture_book" | "early_reader" | "read_aloud" | "illustrated_children_book" | "chapter_book" | "magic_adventure";
  theme: string;
  rung: "primary" | "adjacent" | "third";
  priority: number;
  facets: string[];
  rationale: string[];
};

function kidsGoogleBooksTheme(signals: string[]): string {
  const normalized = signals.map((value) => normalizedTerm(value)).join(" ");
  if (/\b(humorous|humour|humor|funny|laugh)\b/.test(normalized)) return "humorous";
  if (/\b(animal|animals|pet|pets|dog|dogs|cat|cats)\b/.test(normalized)) return "animal";
  if (/\b(friendship|friend|friends)\b/.test(normalized)) return "friendship";
  if (/\b(nature|forest|garden|ocean|sea|river|weather)\b/.test(normalized)) return "nature";
  if (/\b(fantasy|magic|magical|dragon|fairy)\b/.test(normalized)) return "fantasy";
  if (/\b(adventure|quest|journey|explore)\b/.test(normalized)) return "adventure";
  if (/\b(alphabet|letters|phonics)\b/.test(normalized)) return "alphabet";
  if (/\b(rhythm|rhythmical|rhyme|rhyming|repetition|repetitive)\b/.test(normalized)) return "rhyming";
  return "general";
}

function kidsGoogleBooksThemeFromSignal(value: string): string | undefined {
  const normalized = normalizedTerm(value);
  if (!normalized) return undefined;
  if (/\b(humorous|humour|humor|funny|laugh)\b/.test(normalized)) return "humorous";
  if (/\b(animal|animals|pet|pets|dog|dogs|cat|cats)\b/.test(normalized)) return "animal";
  if (/\b(friendship|friend|friends)\b/.test(normalized)) return "friendship";
  if (/\b(nature|forest|garden|ocean|sea|river|weather)\b/.test(normalized)) return "nature";
  if (/\b(fantasy|magic|magical|dragon|fairy)\b/.test(normalized)) return "fantasy";
  if (/\b(adventure|quest|journey|explore)\b/.test(normalized)) return "adventure";
  if (/\b(alphabet|letters|phonics)\b/.test(normalized)) return "alphabet";
  if (/\b(rhythm|rhythmical|rhyme|rhyming|repetition|repetitive)\b/.test(normalized)) return "rhyming";
  return undefined;
}

function kidsGoogleBooksThemeCandidates(
  genres: string[],
  tones: string[],
  themes: string[],
  formats: string[],
  blockedFamilies: Set<string>,
): string[] {
  const orderedSignals = [...genres, ...themes, ...tones, ...formats];
  const seen = new Set<string>();
  const orderedFamilies: string[] = [];
  for (const signal of orderedSignals) {
    const family = kidsGoogleBooksThemeFromSignal(signal);
    if (!family || seen.has(family) || blockedFamilies.has(family)) continue;
    seen.add(family);
    orderedFamilies.push(family);
  }
  const fallback = kidsGoogleBooksTheme(orderedSignals);
  if (fallback !== "general" && !seen.has(fallback) && !blockedFamilies.has(fallback)) orderedFamilies.push(fallback);
  return orderedFamilies.length ? orderedFamilies : ["general"];
}

function kidsThemePhrase(theme: string): string {
  if (theme === "general") return "";
  if (theme === "rhyming") return "rhyming";
  if (theme === "alphabet") return "alphabet";
  return theme;
}

function kidsGoogleBooksSupportsEarlyReader(signals: string[]): boolean {
  const normalized = signals.map((value) => normalizedTerm(value)).join(" ");
  return /\b(adventure|fantasy|magic|mystery|science fiction|animal|friendship|humorous|alphabet|rhyming|reader|beginning reader|read aloud)\b/.test(normalized);
}

function kidsGoogleBooksSupportsFantasyRetrieval(signals: string[]): boolean {
  const normalized = signals.map((value) => normalizedTerm(value)).join(" ");
  return /\b(fantasy|magic|magical|dragon|dragons|wizard|witch|fairy|myth|mythology)\b/.test(normalized);
}

function kidsGoogleBooksFormatQuery(theme: string, format: KidsGoogleBooksQueryCandidate["format"]): string {
  const themePrefix = kidsThemePhrase(theme);
  if (format === "picture_book") {
    return uniqueTerms(["kids", ...(themePrefix ? [themePrefix] : []), "picture book"], 5).join(" ");
  }
  if (format === "early_reader") {
    return uniqueTerms(["kids", ...(themePrefix ? [themePrefix] : []), "early reader"], 5).join(" ");
  }
  if (format === "read_aloud") {
    return uniqueTerms(["kids", ...(themePrefix ? [themePrefix] : []), "read aloud"], 5).join(" ");
  }
  return uniqueTerms(["illustrated", "kids", ...(themePrefix ? [themePrefix] : []), "book"], 6).join(" ");
}

function buildKidsGoogleBooksIntents(profile: TasteProfile, genres: string[], tones: string[], themes: string[], formats: string[]): { intents: SearchIntentV2[]; diagnostics: Record<string, unknown> } {
  const signalPool = [...genres, ...themes, ...tones, ...formats];
  const isLikeBacked = (evidence: string[]): boolean => evidence.some((entry) => /^like:/i.test(String(entry || "")));
  const positiveFamilies = Array.from(new Set(
    [...profile.genreFamily, ...profile.themes, ...profile.tone]
      .filter((row) => isLikeBacked(row.evidence || []))
      .map((row) => kidsGoogleBooksThemeFromSignal(row.value))
      .filter(Boolean) as string[],
  ));
  const blockedFamilies = new Set(
    (profile.avoidSignals || [])
      .map((signal) => kidsGoogleBooksThemeFromSignal(signal.value))
      .filter(Boolean) as string[],
  );
  for (const row of [...profile.genreFamily, ...profile.themes, ...profile.tone]) {
    const family = kidsGoogleBooksThemeFromSignal(row.value);
    if (!family) continue;
    if (!isLikeBacked(row.evidence || [])) blockedFamilies.add(family);
  }
  const themeCandidates = kidsGoogleBooksThemeCandidates(genres, tones, themes, formats, blockedFamilies);
  const theme = themeCandidates[0] || "general";
  const secondaryTheme = themeCandidates.find((candidate) => candidate && candidate !== theme);
  const supportsEarlyReader = kidsGoogleBooksSupportsEarlyReader(signalPool);
  const supportsFantasyRetrieval = kidsGoogleBooksSupportsFantasyRetrieval(signalPool)
    || positiveFamilies.includes("fantasy")
    || themeCandidates.includes("fantasy");
  const avoidFamilies = Array.from(blockedFamilies);

  const candidates: KidsGoogleBooksQueryCandidate[] = [];
  const thematicRoute = theme === "friendship" || theme === "humorous" || theme === "rhyming";
  const fantasyRoute = !thematicRoute && supportsFantasyRetrieval;
  const selectedCascade = thematicRoute
    ? "thematic_friendship_humor_rhyming"
    : fantasyRoute
      ? "fantasy_magic_adventure"
      : "adventure_broad_narrative";

  if (thematicRoute) {
    candidates.push(
      {
        id: "thematic-primary-friendship-picture-book",
        query: "kids friendship picture book",
        family: "friendship",
        format: "picture_book",
        theme: "friendship",
        rung: "primary",
        priority: 1,
        facets: [...genres, ...tones, ...themes].filter(Boolean),
        rationale: ["kids_googlebooks_thematic_cascade", "kids_googlebooks_friendship_picture_book_template"],
      },
      {
        id: "thematic-adjacent-humorous-picture-book",
        query: "kids humorous picture book",
        family: "humorous",
        format: "picture_book",
        theme: "humorous",
        rung: "adjacent",
        priority: 0.85,
        facets: [...genres.slice(0, 2), ...tones.slice(0, 2), ...themes.slice(0, 1)].filter(Boolean),
        rationale: ["kids_googlebooks_thematic_cascade", "kids_googlebooks_humorous_picture_book_template"],
      },
      {
        id: "thematic-third-rhyming-picture-book",
        query: "kids rhyming picture book",
        family: "rhyming",
        format: "picture_book",
        theme: "rhyming",
        rung: "third",
        priority: 0.7,
        facets: [profile.maturityBand, ...formats, ...themes.slice(0, 2)].filter(Boolean),
        rationale: ["kids_googlebooks_thematic_cascade", "kids_googlebooks_rhyming_picture_book_template"],
      },
    );
  } else if (fantasyRoute) {
    candidates.push(
      {
        id: "fantasy-primary-adventure-picture-book",
        query: "kids adventure picture book",
        family: "adventure",
        format: "picture_book",
        theme: "adventure",
        rung: "primary",
        priority: 1,
        facets: [...genres, ...tones, ...themes].filter(Boolean),
        rationale: ["kids_googlebooks_fantasy_route_via_adventure", "kids_googlebooks_adventure_picture_book_template"],
      },
      {
        id: "fantasy-adjacent-magic-adventure",
        query: "kids magic adventure",
        family: "fantasy",
        format: "magic_adventure",
        theme: "fantasy",
        rung: "adjacent",
        priority: 0.85,
        facets: [...genres.slice(0, 2), ...themes.slice(0, 2), ...tones.slice(0, 1)].filter(Boolean),
        rationale: ["kids_googlebooks_fantasy_route_via_adventure", "kids_googlebooks_magic_adventure_template"],
      },
      {
        id: "fantasy-third-dragon-adventure-early-reader",
        query: "kids dragon adventure early reader",
        family: "fantasy",
        format: "early_reader",
        theme: "fantasy",
        rung: "third",
        priority: supportsEarlyReader ? 0.7 : 0.6,
        facets: [profile.maturityBand, ...formats, ...genres.slice(0, 1)].filter(Boolean),
        rationale: ["kids_googlebooks_fantasy_route_via_adventure", "kids_googlebooks_dragon_adventure_early_reader_template"],
      },
    );
  } else {
    candidates.push(
      {
        id: "adventure-primary-picture-book",
        query: "kids adventure picture book",
        family: "adventure",
        format: "picture_book",
        theme: "adventure",
        rung: "primary",
        priority: 1,
        facets: [...genres, ...tones, ...themes].filter(Boolean),
        rationale: ["kids_googlebooks_adventure_cascade", "kids_googlebooks_adventure_picture_book_template"],
      },
      {
        id: "adventure-adjacent-early-reader",
        query: "kids adventure early reader",
        family: "adventure",
        format: "early_reader",
        theme: "adventure",
        rung: "adjacent",
        priority: supportsEarlyReader ? 0.85 : 0.75,
        facets: [...genres.slice(0, 2), ...tones.slice(0, 1), ...themes.slice(0, 1)].filter(Boolean),
        rationale: ["kids_googlebooks_adventure_cascade", "kids_googlebooks_adventure_early_reader_template"],
      },
      {
        id: "adventure-third-chapter-book",
        query: "kids chapter book",
        family: secondaryTheme || "adventure",
        format: "chapter_book",
        theme: secondaryTheme || "adventure",
        rung: "third",
        priority: 0.7,
        facets: [profile.maturityBand, ...formats, ...genres.slice(0, 1)].filter(Boolean),
        rationale: ["kids_googlebooks_adventure_cascade", "kids_googlebooks_chapter_book_template"],
      },
    );
  }

  const plannedQueries: string[] = [];
  const familyByQuery: Record<string, string> = {};
  const formatByQuery: Record<string, string> = {};
  const themeByQuery: Record<string, string> = {};
  const rungByQuery: Record<string, string> = {};
  const duplicateSuppressionReasons: string[] = [];
  const seenQueryToRung = new Map<string, string>();
  const intents: SearchIntentV2[] = [];
  for (const candidate of candidates) {
    const normalizedQuery = normalizedTerm(candidate.query);
    if (!normalizedQuery) continue;
    if (seenQueryToRung.has(normalizedQuery)) {
      duplicateSuppressionReasons.push(`${candidate.rung}:${candidate.query}=>duplicate_of_${seenQueryToRung.get(normalizedQuery)}`);
      continue;
    }
    if (normalizedQuery.includes("fiction novel")) {
      duplicateSuppressionReasons.push(`${candidate.rung}:${candidate.query}=>suppressed_k2_novel_template`);
      continue;
    }
    seenQueryToRung.set(normalizedQuery, candidate.rung);
    plannedQueries.push(candidate.query);
    familyByQuery[candidate.query] = candidate.family || "general";
    formatByQuery[candidate.query] = candidate.format;
    themeByQuery[candidate.query] = candidate.theme;
    rungByQuery[candidate.query] = candidate.rung;
    intents.push({
      id: candidate.id,
      query: candidate.query,
      facets: candidate.facets,
      priority: candidate.priority,
      rationale: [
        ...candidate.rationale,
        `kids_googlebooks_query_family:${candidate.family || "general"}`,
        `kids_googlebooks_query_format:${candidate.format}`,
        `kids_googlebooks_query_theme:${candidate.theme}`,
        `kids_googlebooks_query_rung:${candidate.rung}`,
      ],
    });
    if (intents.length >= 3) break;
  }

  const omittedThirdQueryReason = selectedCascade;
  const genericPlanningReason = theme === "general"
    ? "no_like_backed_family_signals_survived_suppression"
    : "";
  const familySuppressedReason = avoidFamilies.length
    ? avoidFamilies.map((family) => `suppressed_family:${family}`).join("|")
    : "";
  const suppressedFamilyDetails: Record<string, { blockedBy: string[]; likeBackedRows: number; noLikeBackedRows: number }> = {};
  for (const family of Array.from(blockedFamilies)) {
    const blockingRows = [...profile.genreFamily, ...profile.themes, ...profile.tone]
      .filter((row) => kidsGoogleBooksThemeFromSignal(row.value) === family);
    const likeBackedRows = blockingRows.filter((row) => isLikeBacked(row.evidence || []));
    const noLikeBackedRows = blockingRows.filter((row) => !isLikeBacked(row.evidence || []));
    if (noLikeBackedRows.length > 0) {
      suppressedFamilyDetails[family] = {
        blockedBy: noLikeBackedRows.map((row) => `${row.value}(${(row.evidence || []).join(",")})`),
        likeBackedRows: likeBackedRows.length,
        noLikeBackedRows: noLikeBackedRows.length,
      };
    }
  }
  return {
    intents,
    diagnostics: {
      kidsGoogleBooksPlannedQueries: plannedQueries,
      kidsGoogleBooksThemeCandidates: themeCandidates,
      kidsGoogleBooksSelectedPrimaryTheme: theme,
      kidsGoogleBooksSelectedSecondaryTheme: secondaryTheme || "",
      kidsGoogleBooksProfilePositiveFamilies: positiveFamilies,
      kidsGoogleBooksProfileAvoidFamilies: avoidFamilies,
      kidsGoogleBooksSelectedCascade: selectedCascade,
      kidsGoogleBooksSelectedPrimaryFamily: theme,
      kidsGoogleBooksSelectedSecondaryFamily: secondaryTheme || "",
      kidsGoogleBooksGenericPlanningReason: genericPlanningReason,
      kidsGoogleBooksFamilySuppressedReason: familySuppressedReason,
      kidsGoogleBooksSuppressedFamilyDetailsByFamily: suppressedFamilyDetails,
      kidsGoogleBooksQueryFamilyByQuery: familyByQuery,
      kidsGoogleBooksQueryFormatByQuery: formatByQuery,
      kidsGoogleBooksQueryThemeByQuery: themeByQuery,
      kidsGoogleBooksQueryRungByQuery: rungByQuery,
      kidsGoogleBooksQuerySuppressionReason: duplicateSuppressionReasons,
      kidsGoogleBooksQueryReplacementReason: omittedThirdQueryReason,
      kidsGoogleBooksDuplicateQueriesRemoved: duplicateSuppressionReasons.filter((reason) => reason.includes("duplicate_of_")).length,
      kidsGoogleBooksOmittedThirdQueryReason: omittedThirdQueryReason,
    },
  };
}

type TeenGoogleBooksQueryCandidate = {
  id: string;
  query: string;
  family: string;
  rung: "primary" | "adjacent" | "third";
  priority: number;
  facets: string[];
  rationale: string[];
};

function teenGoogleBooksCanonicalFamilyQuery(agePrefix: string, family?: string): string | undefined {
  const normalizedFamily = normalizedTerm(family || "");
  if (!normalizedFamily) return undefined;
  if (normalizedFamily === "science fiction") return `${agePrefix} science fiction novel`;
  if (normalizedFamily === "fiction") return `${agePrefix} fiction novel`;
  return uniqueTerms([agePrefix, normalizedFamily, "fiction", "novel"], 4).join(" ");
}

function teenGoogleBooksDistinctThirdQuery(
  agePrefix: string,
  primaryGenre?: string,
  secondaryGenre?: string,
  adjacentGenre?: string,
): { query?: string; family?: string; reason: string } {
  const primary = normalizedTerm(primaryGenre || "");
  const secondary = normalizedTerm(secondaryGenre || "");
  const adjacent = normalizedTerm(adjacentGenre || "");
  const companion = secondary && secondary !== primary ? secondary : adjacent && adjacent !== primary ? adjacent : "";
  if (!primary || !companion) {
    return { reason: "omitted_third_query:no_distinct_companion_family" };
  }
  const pairKey = `${primary}+${companion}`;
  if (pairKey === "historical+mystery" || pairKey === "mystery+historical") {
    return {
      query: `${agePrefix} historical mystery novel`,
      family: "historical_mystery",
      reason: "replaced_third_query:historical_mystery_template",
    };
  }
  if (pairKey === "fantasy+adventure") {
    return {
      query: `${agePrefix} fantasy adventure novel`,
      family: "fantasy_adventure",
      reason: "replaced_third_query:fantasy_adventure_template",
    };
  }
  if (pairKey === "humorous+fantasy" || pairKey === "fantasy+humorous") {
    return {
      query: `${agePrefix} humorous fantasy novel`,
      family: "humorous_fantasy",
      reason: "replaced_third_query:humorous_fantasy_template",
    };
  }
  return { reason: `omitted_third_query:no_safe_distinct_template:${pairKey}` };
}

function buildTeenGoogleBooksIntents(profile: TasteProfile, genres: string[], tones: string[], themes: string[], formats: string[]): { intents: SearchIntentV2[]; diagnostics: Record<string, unknown> } {
  const agePrefix = googleBooksAgePrefix(profile.ageBand);
  const genreAnchors = uniqueTerms(genres.map(googleBooksGenreAnchor).filter(Boolean) as string[], 2);
  const descriptors = uniqueTerms([...tones, ...themes].map(googleBooksDescriptor).filter(Boolean) as string[], 1);
  const primaryGenre = genreAnchors[0];
  const secondaryGenre = genreAnchors[1];
  const adjacentGenre = googleBooksAdjacentGenre(primaryGenre);
  const primaryQuery = teenGoogleBooksCanonicalFamilyQuery(agePrefix, primaryGenre);
  const adjacentFamily = secondaryGenre && secondaryGenre !== primaryGenre
    ? secondaryGenre
    : adjacentGenre && adjacentGenre !== primaryGenre
      ? adjacentGenre
      : undefined;
  const adjacentQuery = teenGoogleBooksCanonicalFamilyQuery(agePrefix, adjacentFamily);
  const thirdQuery = teenGoogleBooksDistinctThirdQuery(agePrefix, primaryGenre, secondaryGenre, adjacentGenre);
  const candidates: TeenGoogleBooksQueryCandidate[] = [
    {
      id: "family-fiction-primary",
      query: primaryQuery || `${agePrefix} fiction novel`,
      family: primaryGenre || "fiction",
      rung: "primary",
      priority: 1,
      facets: [...genres, ...tones, ...themes].filter(Boolean),
      rationale: ["built_from_top_taste_profile_signals", "google_books_narrative_query"],
    },
    {
      id: "adjacent-or-tone-fiction",
      query: adjacentQuery || `${agePrefix} fiction novel`,
      family: adjacentFamily || "fiction",
      rung: "adjacent",
      priority: 0.85,
      facets: [...genres.slice(0, 2), ...tones.slice(0, 1), ...themes.slice(0, 1)].filter(Boolean),
      rationale: ["adjacent_family_or_tone_expansion", "google_books_narrative_query"],
    },
  ];
  if (thirdQuery.query) {
    candidates.push({
      id: "fallback-fiction-broad",
      query: thirdQuery.query,
      family: thirdQuery.family || "combined_family",
      rung: "third",
      priority: 0.55,
      facets: [profile.maturityBand, ...formats, ...genres.slice(0, 1)].filter(Boolean),
      rationale: ["broad_fallback_when_underfilled", "google_books_narrative_query", thirdQuery.reason],
    });
  }

  const plannedQueries: string[] = [];
  const familyByQuery: Record<string, string> = {};
  const rungByQuery: Record<string, string> = {};
  const duplicateSuppressionReasons: string[] = [];
  const seenQueryToRung = new Map<string, string>();
  const intents: SearchIntentV2[] = [];
  for (const candidate of candidates) {
    const normalizedQuery = normalizedTerm(candidate.query);
    if (!normalizedQuery) continue;
    if (seenQueryToRung.has(normalizedQuery)) {
      duplicateSuppressionReasons.push(`${candidate.rung}:${candidate.query}=>duplicate_of_${seenQueryToRung.get(normalizedQuery)}`);
      continue;
    }
    seenQueryToRung.set(normalizedQuery, candidate.rung);
    plannedQueries.push(candidate.query);
    familyByQuery[candidate.query] = candidate.family;
    rungByQuery[candidate.query] = candidate.rung;
    intents.push({
      id: candidate.id,
      query: candidate.query,
      facets: candidate.facets,
      priority: candidate.priority,
      rationale: [
        ...candidate.rationale,
        `teen_googlebooks_query_family:${candidate.family}`,
        `teen_googlebooks_query_rung:${candidate.rung}`,
      ],
    });
  }
  return {
    intents,
    diagnostics: {
      teenGoogleBooksFinalQueryList: plannedQueries,
      teenGoogleBooksQueryFamilyByQuery: familyByQuery,
      teenGoogleBooksQueryRungByQuery: rungByQuery,
      teenGoogleBooksDuplicateSuppressionReasons: duplicateSuppressionReasons,
      teenGoogleBooksOmittedThirdQueryReason: thirdQuery.reason,
    },
  };
}

function buildGoogleBooksIntents(profile: TasteProfile, genres: string[], tones: string[], themes: string[], formats: string[]): { intents: SearchIntentV2[]; diagnostics: Record<string, unknown> } {
  if (profile.ageBand === "kids") {
    return buildKidsGoogleBooksIntents(profile, genres, tones, themes, formats);
  }
  if (profile.ageBand === "teens") {
    return buildTeenGoogleBooksIntents(profile, genres, tones, themes, formats);
  }
  const agePrefix = googleBooksAgePrefix(profile.ageBand);
  const useAgePrefix = profile.ageBand !== "adult";
  // For preteens, scan ranked genre signals in order until two valid anchors are
  // found rather than capping at the top two raw signals.  This prevents unmapped
  // top signals (e.g. "mythology", "superheroes") from silently blocking a
  // lower-ranked but anchor-recognized signal (e.g. "adventure").
  const extendedGenreRaw = profile.ageBand === "preteens" ? topValues(profile.genreFamily, 6) : genres;
  const genreAnchors = profile.ageBand === "preteens"
    ? (() => {
        const found: string[] = [];
        const seen = new Set<string>();
        for (const g of extendedGenreRaw) {
          if (found.length >= 2) break;
          const anchor = googleBooksGenreAnchor(g);
          if (anchor && !seen.has(anchor)) {
            seen.add(anchor);
            found.push(anchor);
          }
        }
        return found;
      })()
    : uniqueTerms(genres.map(googleBooksGenreAnchor).filter(Boolean) as string[], 2);
  const descriptors = uniqueTerms([...tones, ...themes].map(googleBooksDescriptor).filter(Boolean) as string[], 1);
  const primaryDescriptor = descriptors[0];
  const primaryGenre = genreAnchors[0];
  const secondaryGenre = genreAnchors[1];
  const adjacentGenre = googleBooksAdjacentGenre(primaryGenre);
  // When the resolved genre anchor already contains the word "fiction" (e.g. "science fiction"),
  // omit the standalone "fiction" token so we don't produce "science fiction fiction novel".
  const primaryGenreHasFiction = !!(primaryGenre && /\bfiction\b/.test(normalizedTerm(primaryGenre)));
  const primaryQuery = uniqueTerms([
    ...(useAgePrefix ? [agePrefix] : []),
    ...(profile.ageBand === "adult"
      ? [googleBooksAdultNarrativeQuery(primaryGenre, primaryDescriptor)]
      : [
        ...(primaryGenre ? [primaryGenre] : []),
        ...(primaryGenreHasFiction ? [] : ["fiction"]),
        "novel",
      ]),
  ]).join(" ");
  const adjacentOrToneQuery = uniqueTerms([
    ...(useAgePrefix ? [agePrefix] : []),
    ...(profile.ageBand === "adult"
      ? [googleBooksAdultPairedNarrativeQuery(
        primaryGenre,
        secondaryGenre && secondaryGenre !== primaryGenre ? secondaryGenre : adjacentGenre,
        primaryDescriptor,
      )]
      : [
        ...(secondaryGenre && secondaryGenre !== primaryGenre ? [secondaryGenre] : []),
        ...(secondaryGenre || !adjacentGenre ? [] : [adjacentGenre]),
        ...descriptors,
        "fiction",
        "novel",
      ]),
  ]).join(" ");
  const fallbackQuery = uniqueTerms([
    ...(useAgePrefix ? [agePrefix] : []),
    ...(profile.ageBand === "adult"
      ? [googleBooksAdultPairedNarrativeQuery(primaryGenre || "fiction", adjacentGenre, "literary")]
      : [
        ...(primaryGenre ? [primaryGenre] : []),
        "contemporary",
        ...(primaryGenreHasFiction ? [] : ["fiction"]),
        "novel",
      ]),
  ]).join(" ");
  const resolvedPrimaryQuery = primaryQuery || (useAgePrefix ? `${agePrefix} fiction novel` : "fiction novel");
  const resolvedAdjacentQuery = adjacentOrToneQuery || (useAgePrefix
    ? [agePrefix, primaryGenre || "fiction", "novel"].filter(Boolean).join(" ")
    : [primaryGenre || "fiction", "novel"].filter(Boolean).join(" "));
  const resolvedFallbackQuery = fallbackQuery || (useAgePrefix ? [agePrefix, "fiction", "novel"].filter(Boolean).join(" ") : "literary fiction novel");

  // Build preteens query-routing diagnostics so session reports can explain why
  // a profile landed on a generic family instead of a richer genre anchor.
  // These fields are visible in googleBooksAgeBandQueryPlanningByDeck.preteens.*
  const preteenDiagnostics: Record<string, unknown> = {};
  if (profile.ageBand === "preteens") {
    // Separate signals that were actively scanned from those skipped after
    // the two-anchor target was already satisfied.
    const scannedSignals: string[] = [];
    const skippedAfterSatisfied: string[] = [];
    const satisfiedAnchors = new Set<string>();
    for (const g of extendedGenreRaw) {
      if (satisfiedAnchors.size >= 2) {
        skippedAfterSatisfied.push(g);
      } else {
        scannedSignals.push(g);
        const a = googleBooksGenreAnchor(g);
        if (a) satisfiedAnchors.add(a);
      }
    }
    const anchorBySignal: Record<string, string> = {};
    for (const g of scannedSignals) {
      anchorBySignal[g] = googleBooksGenreAnchor(g) ?? "discarded_no_anchor_match";
    }
    const discardedGenreSignals = scannedSignals.filter((g) => googleBooksGenreAnchor(g) === undefined);
    const adjacentFamilyForDiagnostics = secondaryGenre && secondaryGenre !== primaryGenre
      ? secondaryGenre
      : adjacentGenre ?? "none";
    const adjacentQueryFamily = secondaryGenre && secondaryGenre !== primaryGenre
      ? secondaryGenre
      : adjacentGenre
        ? adjacentGenre
        : primaryGenre ?? "general";
    const queryFamilyByQuery: Record<string, string> = {};
    queryFamilyByQuery[resolvedPrimaryQuery] = primaryGenre ?? "general";
    if (resolvedAdjacentQuery !== resolvedPrimaryQuery) {
      queryFamilyByQuery[resolvedAdjacentQuery] = adjacentQueryFamily;
    }
    if (resolvedFallbackQuery !== resolvedPrimaryQuery && resolvedFallbackQuery !== resolvedAdjacentQuery) {
      queryFamilyByQuery[resolvedFallbackQuery] = primaryGenre ?? "general";
    }
    const genreSignalScoreHistogram: Record<string, string> = {};
    for (const g of [...scannedSignals, ...themes, ...tones]) {
      const anchor = googleBooksGenreAnchor(g);
      genreSignalScoreHistogram[g] = anchor ? `recognized_anchor:${anchor}` : "discarded_no_anchor_match";
    }
    preteenDiagnostics.preteenGoogleBooksGenreSignals = genres;
    preteenDiagnostics.preteenGoogleBooksThemeSignals = themes;
    preteenDiagnostics.preteenGoogleBooksToneSignals = tones;
    preteenDiagnostics.preteenGoogleBooksRawSignalsInspected = scannedSignals;
    preteenDiagnostics.preteenGoogleBooksSignalsSkippedAfterSatisfied = skippedAfterSatisfied;
    preteenDiagnostics.preteenGoogleBooksGenreAnchorBySignal = anchorBySignal;
    preteenDiagnostics.preteenGoogleBooksGenreAnchorsResolved = genreAnchors;
    preteenDiagnostics.preteenGoogleBooksDiscardedGenreSignals = discardedGenreSignals;
    preteenDiagnostics.preteenGoogleBooksPrimaryGenre = primaryGenre ?? "none";
    preteenDiagnostics.preteenGoogleBooksSecondaryGenre = secondaryGenre ?? "none";
    preteenDiagnostics.preteenGoogleBooksAdjacentGenre = adjacentFamilyForDiagnostics;
    preteenDiagnostics.preteenGoogleBooksGenericFallbackOccurred = genreAnchors.length === 0;
    preteenDiagnostics.preteenGoogleBooksQueryPlanReason = genreAnchors.length > 0
      ? `primary_family_resolved:${primaryGenre}`
      : "no_recognized_genre_anchors_generic_fallback";
    preteenDiagnostics.preteenGoogleBooksWinningMargin = genreAnchors.length >= 2
      ? "tied_multi_anchor"
      : genreAnchors.length === 1
        ? "single_anchor_clear_winner"
        : "no_anchor_generic_fallback";
    preteenDiagnostics.preteenGoogleBooksQueryFamilyByQuery = queryFamilyByQuery;
    preteenDiagnostics.preteenGoogleBooksPlannedQueryList = Array.from(new Set([
      resolvedPrimaryQuery,
      resolvedAdjacentQuery,
      resolvedFallbackQuery,
    ].filter(Boolean)));
    preteenDiagnostics.preteenGoogleBooksSignalScoreHistogram = genreSignalScoreHistogram;
    preteenDiagnostics.preteenGoogleBooksSkippedSignalCount = discardedGenreSignals.length;
    preteenDiagnostics.preteenGoogleBooksDiscardedSignalNote = discardedGenreSignals.length > 0
      ? `${discardedGenreSignals.join(", ")} not recognized by googleBooksGenreAnchor`
      : "all_genre_signals_recognized";
  }

  return {
    intents: [
      {
        id: "family-fiction-primary",
        query: resolvedPrimaryQuery,
        facets: [...genres, ...tones, ...themes].filter(Boolean),
        priority: 1,
        rationale: ["built_from_top_taste_profile_signals", "google_books_narrative_query"],
      },
      {
        id: "adjacent-or-tone-fiction",
        query: resolvedAdjacentQuery,
        facets: [...genres.slice(0, 2), ...tones.slice(0, 1), ...themes.slice(0, 1)].filter(Boolean),
        priority: 0.85,
        rationale: ["adjacent_family_or_tone_expansion", "google_books_narrative_query"],
      },
      {
        id: "fallback-fiction-broad",
        query: resolvedFallbackQuery,
        facets: [profile.maturityBand, ...formats, ...genres.slice(0, 1)].filter(Boolean),
        priority: 0.55,
        rationale: ["broad_fallback_when_underfilled", "google_books_narrative_query"],
      },
    ],
    diagnostics: preteenDiagnostics,
  };
}

export function buildSearchPlan(profile: TasteProfile, enabledSources: Partial<Record<SourceIdV2, boolean>> = {}): SearchPlan {
  const genres = topValues(profile.genreFamily, 2);
  const tones = topValues(profile.tone, 2);
  const themes = topValues(profile.themes, 2);
  const formats = topValues(profile.formatPreference, 1);
  const baseFacets = [...genres, ...tones, ...themes].filter(Boolean);
  const primaryTerms = [...baseFacets.slice(0, 4), ...formats].filter(Boolean);
  const primaryQuery = primaryTerms.length ? primaryTerms.join(" ") : `${profile.ageBand} reader discovery`;

  const intents: SearchIntentV2[] = [
    {
      id: "primary-taste",
      query: primaryQuery,
      facets: baseFacets,
      priority: 1,
      rationale: ["built_from_top_taste_profile_signals"],
    },
    {
      id: "format-maturity",
      query: [profile.maturityBand, formats[0] || "story"].filter(Boolean).join(" "),
      facets: [profile.maturityBand, ...formats].filter(Boolean),
      priority: 0.7,
      rationale: ["maturity_and_format_safety_net"],
    },
  ];
  const googleBooksPlanning = buildGoogleBooksIntents(profile, genres, tones, themes, formats);
  const googleBooksIntents = googleBooksPlanning.intents;

  const allSources: SourceIdV2[] = ["mock", "googleBooks", "openLibrary", "kitsu", "comicVine", "localLibrary", "nyt"];
  const sourcePlans: SourcePlan[] = allSources.map((source) => {
    const enabled = enabledSources[source] === true;
    return {
      source,
      enabled,
      status: enabled ? "planned" : "skipped",
      intents: enabled ? (source === "googleBooks" ? googleBooksIntents : intents) : [],
      skippedReason: enabled ? undefined : "source_disabled",
      timeoutMs: source === "openLibrary"
        ? profile.ageBand === "adult" ? ADULT_OPEN_LIBRARY_SOURCE_TIMEOUT_MS : OPEN_LIBRARY_SOURCE_TIMEOUT_MS
        : DEFAULT_SOURCE_TIMEOUT_MS,
    };
  });

  return {
    intents,
    sourcePlans,
    diagnostics: {
      intentCount: intents.length,
      enabledSourceCount: sourcePlans.filter((plan) => plan.enabled).length,
      sourceAgnostic: true,
      ...googleBooksPlanning.diagnostics,
    },
  };
}
