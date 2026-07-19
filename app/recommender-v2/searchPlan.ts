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
  if (profile.ageBand === "teens") {
    return buildTeenGoogleBooksIntents(profile, genres, tones, themes, formats);
  }
  const agePrefix = googleBooksAgePrefix(profile.ageBand);
  const useAgePrefix = profile.ageBand !== "adult";
  const genreAnchors = uniqueTerms(genres.map(googleBooksGenreAnchor).filter(Boolean) as string[], 2);
  const descriptors = uniqueTerms([...tones, ...themes].map(googleBooksDescriptor).filter(Boolean) as string[], 1);
  const primaryDescriptor = descriptors[0];
  const primaryGenre = genreAnchors[0];
  const secondaryGenre = genreAnchors[1];
  const adjacentGenre = googleBooksAdjacentGenre(primaryGenre);
  const primaryQuery = uniqueTerms([
    ...(useAgePrefix ? [agePrefix] : []),
    ...(profile.ageBand === "adult"
      ? [googleBooksAdultNarrativeQuery(primaryGenre, primaryDescriptor)]
      : [
        ...(primaryGenre ? [primaryGenre] : []),
        "fiction",
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
        "fiction",
        "novel",
      ]),
  ]).join(" ");
  return {
    intents: [
      {
        id: "family-fiction-primary",
        query: primaryQuery || (useAgePrefix ? `${agePrefix} fiction novel` : "fiction novel"),
        facets: [...genres, ...tones, ...themes].filter(Boolean),
        priority: 1,
        rationale: ["built_from_top_taste_profile_signals", "google_books_narrative_query"],
      },
      {
        id: "adjacent-or-tone-fiction",
        query: adjacentOrToneQuery || (useAgePrefix
          ? [agePrefix, primaryGenre || "fiction", "novel"].filter(Boolean).join(" ")
          : [primaryGenre || "fiction", "novel"].filter(Boolean).join(" ")),
        facets: [...genres.slice(0, 2), ...tones.slice(0, 1), ...themes.slice(0, 1)].filter(Boolean),
        priority: 0.85,
        rationale: ["adjacent_family_or_tone_expansion", "google_books_narrative_query"],
      },
      {
        id: "fallback-fiction-broad",
        query: fallbackQuery || (useAgePrefix ? [agePrefix, "fiction", "novel"].filter(Boolean).join(" ") : "literary fiction novel"),
        facets: [profile.maturityBand, ...formats, ...genres.slice(0, 1)].filter(Boolean),
        priority: 0.55,
        rationale: ["broad_fallback_when_underfilled", "google_books_narrative_query"],
      },
    ],
    diagnostics: {},
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
