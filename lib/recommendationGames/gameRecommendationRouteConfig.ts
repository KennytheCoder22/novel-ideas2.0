// Shared helper for propagating age band, library, and recommendation-source configuration from
// Home, through the games portal, to every recommendation-game route. Source flags are carried as
// plain string route params (expo-router only supports string/string[] param values) so every
// route - including one opened directly without going through Home or the portal - parses them
// the same way and falls back to the same safe defaults (local collection disabled).
import type { AgeBandV2 } from "../../app/recommender-v2";

export type GameRouteSourceFlags = {
  googleBooks: boolean;
  openLibrary: boolean;
  localLibrary: boolean;
  kitsu: boolean;
  comicVine: boolean;
  nyt: boolean;
};

export type GameRouteConfig = {
  playerId: string;
  libraryId: string;
  ageBand: AgeBandV2;
  sourceFlags: GameRouteSourceFlags;
  localCollectionOnly: boolean;
};

export type GameRouteParams = Record<string, string | string[] | undefined>;

/** Direct-route safe defaults: every hosted source on, local collection off. A route opened
 * without any params (e.g. a bookmarked link) must never silently start serving from a specific
 * library's local collection. */
const SAFE_DEFAULT_SOURCE_FLAGS: GameRouteSourceFlags = {
  googleBooks: true,
  openLibrary: true,
  localLibrary: false,
  kitsu: true,
  comicVine: true,
  nyt: false,
};

function paramValue(params: GameRouteParams, key: string): string {
  const value = params[key];
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}

function parseFlag(value: string, fallback: boolean): boolean {
  if (value === "1" || value.toLowerCase() === "true") return true;
  if (value === "0" || value.toLowerCase() === "false") return false;
  return fallback;
}

export function normalizeGameRouteAgeBand(value: unknown): AgeBandV2 {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "kids" || normalized === "preteens" || normalized === "teens" || normalized === "adult") return normalized;
  // Home's existing /games launcher emits the plural "adults" for its adult deck.
  if (normalized === "adults") return "adult";
  return "teens";
}

/** Preserves local-collection-only routing exactly: whenever local collection is enabled for a
 * route, every hosted source is force-disabled so a library that has opted into local-only
 * routing never leaks hosted-source results through a recommendation game. */
export function applyLocalCollectionOnlyRouting(flags: GameRouteSourceFlags): GameRouteSourceFlags {
  if (!flags.localLibrary) return flags;
  return {
    googleBooks: false,
    openLibrary: false,
    localLibrary: true,
    kitsu: false,
    comicVine: false,
    nyt: false,
  };
}

export function parseGameRouteConfig(params: GameRouteParams): GameRouteConfig {
  const rawFlags: GameRouteSourceFlags = {
    googleBooks: parseFlag(paramValue(params, "srcGoogleBooks"), SAFE_DEFAULT_SOURCE_FLAGS.googleBooks),
    openLibrary: parseFlag(paramValue(params, "srcOpenLibrary"), SAFE_DEFAULT_SOURCE_FLAGS.openLibrary),
    localLibrary: parseFlag(paramValue(params, "srcLocalLibrary"), SAFE_DEFAULT_SOURCE_FLAGS.localLibrary),
    kitsu: parseFlag(paramValue(params, "srcKitsu"), SAFE_DEFAULT_SOURCE_FLAGS.kitsu),
    comicVine: parseFlag(paramValue(params, "srcComicVine"), SAFE_DEFAULT_SOURCE_FLAGS.comicVine),
    nyt: parseFlag(paramValue(params, "srcNyt"), SAFE_DEFAULT_SOURCE_FLAGS.nyt),
  };
  return {
    playerId: paramValue(params, "playerId").trim() || "media-mania-player",
    libraryId: paramValue(params, "libraryId").trim() || "default",
    ageBand: normalizeGameRouteAgeBand(paramValue(params, "ageBand")),
    sourceFlags: applyLocalCollectionOnlyRouting(rawFlags),
    localCollectionOnly: Boolean(rawFlags.localLibrary),
  };
}

/** Serializes source flags back into route params so the games portal (and Home) can forward its
 * resolved configuration unchanged to every game route. */
export function buildGameRouteSourceParams(flags: GameRouteSourceFlags): Record<string, string> {
  return {
    srcGoogleBooks: flags.googleBooks ? "1" : "0",
    srcOpenLibrary: flags.openLibrary ? "1" : "0",
    srcLocalLibrary: flags.localLibrary ? "1" : "0",
    srcKitsu: flags.kitsu ? "1" : "0",
    srcComicVine: flags.comicVine ? "1" : "0",
    srcNyt: flags.nyt ? "1" : "0",
  };
}

/** Maps route source flags to the recommender's `enabledSources` shape. `mock` is always
 * disabled: it exists in the recommender only for internal debugging, never for real play. */
export function gameRouteSourceFlagsToEnabledSources(flags: GameRouteSourceFlags): {
  mock: false;
  googleBooks: boolean;
  openLibrary: boolean;
  localLibrary: boolean;
  kitsu: boolean;
  comicVine: boolean;
  nyt: boolean;
} {
  return {
    mock: false,
    googleBooks: flags.googleBooks,
    openLibrary: flags.openLibrary,
    localLibrary: flags.localLibrary,
    kitsu: flags.kitsu,
    comicVine: flags.comicVine,
    nyt: flags.nyt,
  };
}
