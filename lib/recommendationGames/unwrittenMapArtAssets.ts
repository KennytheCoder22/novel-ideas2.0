// Local asset manifest for The Unwritten Map's presentation layer.
//
// Authorized focal art currently covers Mossmere/frog-parliament and the
// Sunmeadow/lantern-fair encounter, alongside shared cartographic framing
// chrome. Every other encounter, choice, and result remains an explicitly
// missing raster commissioning slot (see unwrittenMapPresentationContract.ts). This module
// is pure data (a path manifest) plus a couple of pure lookup helpers; it
// does not touch the filesystem itself so it stays safe to import from any
// runtime. Filesystem existence checks live in the Node-only validator.

/**
 * Maps a bounded local-asset id to its path relative to the repository
 * root. Keys are grouped by purpose:
 *  - `frog-parliament-*`: exact per-choice/result/encounter art for the
 *    Mossmere "Reed Parliament" frog-parliament scenario, mapped by the
 *    game's authoritative choice ids (not by any baked/legacy numbering).
 *  - `shared-frame-*`: framing chrome shared across many screens (entry,
 *    journal, map, and Mossmere-specific backdrop panels). These are not
 *    per-encounter focal art, but are tracked here so the validator can
 *    confirm every local asset PR #305 shipped is accounted for and still
 *    present on disk.
 */
export const UNWRITTEN_MAP_LOCAL_ASSET_MANIFEST = {
  "lantern-fair-encounter": "assets/games/unwritten-map/illustrations/sunmeadow/lantern-fair/lantern-fair-encounter.webp",

  "frog-parliament-encounter": "assets/games/unwritten-map/frog-encounter.webp",

  "frog-parliament-choice-hear-frogs": "assets/games/unwritten-map/frog-hear.webp",
  "frog-parliament-choice-night-pageant": "assets/games/unwritten-map/frog-pageant.webp",
  "frog-parliament-choice-moon-experiment": "assets/games/unwritten-map/frog-experiment.webp",
  "frog-parliament-choice-grand-speech": "assets/games/unwritten-map/frog-speech.webp",

  "frog-parliament-result-hear-frogs": "assets/games/unwritten-map/result-frog-hear.webp",
  "frog-parliament-result-night-pageant": "assets/games/unwritten-map/result-frog-pageant.webp",
  "frog-parliament-result-moon-experiment": "assets/games/unwritten-map/result-moon-frog.webp",
  "frog-parliament-result-grand-speech": "assets/games/unwritten-map/result-frog-speech.webp",

  "shared-frame-entry-left": "assets/games/unwritten-map/entry-left.webp",
  "shared-frame-entry-right": "assets/games/unwritten-map/entry-right.webp",
  "shared-frame-entry-tabletop": "assets/games/unwritten-map/entry-tabletop.webp",
  "shared-frame-journal-left": "assets/games/unwritten-map/journal-left.webp",
  "shared-frame-journal-right": "assets/games/unwritten-map/journal-right.webp",
  "shared-frame-board-map": "assets/games/unwritten-map/board-map.webp",
  "shared-frame-board-map-mobile": "assets/games/unwritten-map/board-map-mobile.webp",
  "shared-frame-world-map": "assets/games/unwritten-map/world-map.webp",
  "shared-frame-mossmere-encounter-left": "assets/games/unwritten-map/encounter-mossmere-left.webp",
  "shared-frame-mossmere-encounter-right": "assets/games/unwritten-map/encounter-mossmere-right.webp",
  "shared-frame-mossmere-result-left": "assets/games/unwritten-map/result-mossmere-left.webp",
  "shared-frame-mossmere-result-right": "assets/games/unwritten-map/result-mossmere-right.webp",
  "shared-frame-mossmere-result-bottom": "assets/games/unwritten-map/result-mossmere-bottom.webp",
} as const;

export type UnwrittenMapLocalAssetId = keyof typeof UNWRITTEN_MAP_LOCAL_ASSET_MANIFEST;

export const UNWRITTEN_MAP_LOCAL_ASSET_IDS = Object.keys(
  UNWRITTEN_MAP_LOCAL_ASSET_MANIFEST,
) as readonly UnwrittenMapLocalAssetId[];

export function unwrittenMapLocalAssetPath(assetId: UnwrittenMapLocalAssetId): string {
  return UNWRITTEN_MAP_LOCAL_ASSET_MANIFEST[assetId];
}

/**
 * The exact, authoritative choice-id -> local-asset-id mapping for the
 * frog-parliament scenario's per-choice focal art. Keyed by the game's real
 * choice ids so remapping stays correct regardless of any historical baked
 * numbering (e.g. "choice 1/2/3/4") used while the art was produced.
 */
export const FROG_PARLIAMENT_CHOICE_ASSET_IDS: Record<string, UnwrittenMapLocalAssetId> = {
  "hear-frogs": "frog-parliament-choice-hear-frogs",
  "night-pageant": "frog-parliament-choice-night-pageant",
  "moon-experiment": "frog-parliament-choice-moon-experiment",
  "grand-speech": "frog-parliament-choice-grand-speech",
};

/** The exact, authoritative choice-id -> local-asset-id mapping for results. */
export const FROG_PARLIAMENT_RESULT_ASSET_IDS: Record<string, UnwrittenMapLocalAssetId> = {
  "hear-frogs": "frog-parliament-result-hear-frogs",
  "night-pageant": "frog-parliament-result-night-pageant",
  "moon-experiment": "frog-parliament-result-moon-experiment",
  "grand-speech": "frog-parliament-result-grand-speech",
};

export const FROG_PARLIAMENT_ENCOUNTER_ASSET_ID: UnwrittenMapLocalAssetId = "frog-parliament-encounter";

export const UNWRITTEN_MAP_ENCOUNTER_ASSET_IDS: Readonly<Partial<Record<string, UnwrittenMapLocalAssetId>>> = {
  "lantern-fair": "lantern-fair-encounter",
  "frog-parliament": FROG_PARLIAMENT_ENCOUNTER_ASSET_ID,
};

export const UNWRITTEN_MAP_FOCAL_ASSET_PROVENANCE: Readonly<Partial<Record<UnwrittenMapLocalAssetId, {
  sourceFile: string;
  sourceSha256: string;
  derivedSha256: string;
  derivedDimensions: string;
  authorization: string;
}>>> = {
  "lantern-fair-encounter": {
    sourceFile: "a38fedbc-84ee-4467-8b6a-6f23c6135066-0fca7dc5-313d-45ce-beea-f3c0ce118358-clipboard.png",
    sourceSha256: "1cc48fed7691c3fdbf29cc1096d4df7bbe2992a868c5e1893a2876e80fe701a7",
    derivedSha256: "78c0bbd53611f141fbf9118170e00010f902af52298ead3c8df2d736a1889830",
    derivedDimensions: "1418x945",
    authorization: "User-supplied for PR #306",
  },
};

export const UNWRITTEN_MAP_SHARED_FRAME_ASSET_IDS: readonly UnwrittenMapLocalAssetId[] =
  UNWRITTEN_MAP_LOCAL_ASSET_IDS.filter((id) => id.startsWith("shared-frame-"));
