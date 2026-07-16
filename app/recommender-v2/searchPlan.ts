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

function buildGoogleBooksIntents(profile: TasteProfile, genres: string[], tones: string[], themes: string[], formats: string[]): SearchIntentV2[] {
  const agePrefix = googleBooksAgePrefix(profile.ageBand);
  const genreAnchors = uniqueTerms(genres.map(googleBooksGenreAnchor).filter(Boolean) as string[], 2);
  const descriptors = uniqueTerms([...tones, ...themes].map(googleBooksDescriptor).filter(Boolean) as string[], 1);
  const primaryGenre = genreAnchors[0];
  const secondaryGenre = genreAnchors[1];
  const adjacentGenre = googleBooksAdjacentGenre(primaryGenre);
  const primaryQuery = uniqueTerms([
    agePrefix,
    ...(primaryGenre ? [primaryGenre] : []),
    "fiction",
    "novel",
  ]).join(" ");
  const adjacentOrToneQuery = uniqueTerms([
    agePrefix,
    ...(secondaryGenre && secondaryGenre !== primaryGenre ? [secondaryGenre] : []),
    ...(secondaryGenre || !adjacentGenre ? [] : [adjacentGenre]),
    ...descriptors,
    "fiction",
    "novel",
  ]).join(" ");
  const fallbackQuery = uniqueTerms([
    agePrefix,
    ...(primaryGenre ? [primaryGenre] : []),
    "contemporary",
    "fiction",
    "novel",
  ]).join(" ");
  return [
    {
      id: "family-fiction-primary",
      query: primaryQuery || `${agePrefix} fiction novel`,
      facets: [...genres, ...tones, ...themes].filter(Boolean),
      priority: 1,
      rationale: ["built_from_top_taste_profile_signals", "google_books_narrative_query"],
    },
    {
      id: "adjacent-or-tone-fiction",
      query: adjacentOrToneQuery || [agePrefix, primaryGenre || "fiction", "novel"].filter(Boolean).join(" "),
      facets: [...genres.slice(0, 2), ...tones.slice(0, 1), ...themes.slice(0, 1)].filter(Boolean),
      priority: 0.85,
      rationale: ["adjacent_family_or_tone_expansion", "google_books_narrative_query"],
    },
    {
      id: "fallback-fiction-broad",
      query: fallbackQuery || [agePrefix, "fiction", "novel"].filter(Boolean).join(" "),
      facets: [profile.maturityBand, ...formats, ...genres.slice(0, 1)].filter(Boolean),
      priority: 0.55,
      rationale: ["broad_fallback_when_underfilled", "google_books_narrative_query"],
    },
  ];
}

export function buildSearchPlan(profile: TasteProfile, enabledSources: Partial<Record<SourceIdV2, boolean>> = { mock: true }): SearchPlan {
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
  const googleBooksIntents = buildGoogleBooksIntents(profile, genres, tones, themes, formats);

  const allSources: SourceIdV2[] = ["mock", "googleBooks", "openLibrary", "kitsu", "comicVine", "localLibrary", "nyt"];
  const sourcePlans: SourcePlan[] = allSources.map((source) => {
    const enabled = enabledSources[source] === true || (source === "mock" && enabledSources[source] !== false);
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
    },
  };
}
