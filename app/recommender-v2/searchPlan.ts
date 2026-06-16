import type { SearchIntentV2, SearchPlan, SourceIdV2, SourcePlan, TasteProfile } from "./types";

const DEFAULT_SOURCE_TIMEOUT_MS = 2_500;
const OPEN_LIBRARY_SOURCE_TIMEOUT_MS = 8_000;
const ADULT_OPEN_LIBRARY_SOURCE_TIMEOUT_MS = 22_000;

function topValues(rows: { value: string; weight: number }[], count: number): string[] {
  return rows.slice(0, count).map((row) => row.value).filter(Boolean);
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

  const allSources: SourceIdV2[] = ["mock", "googleBooks", "openLibrary", "kitsu", "comicVine", "localLibrary", "nyt"];
  const sourcePlans: SourcePlan[] = allSources.map((source) => {
    const enabled = enabledSources[source] === true || (source === "mock" && enabledSources[source] !== false);
    return {
      source,
      enabled,
      status: enabled ? "planned" : "skipped",
      intents: enabled ? intents : [],
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
