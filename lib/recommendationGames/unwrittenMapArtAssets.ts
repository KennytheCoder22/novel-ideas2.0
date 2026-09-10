// Local asset manifest for The Unwritten Map's presentation layer.
//
// Authorized focal art currently covers every encounter, all Mossmere/
// frog-parliament choices and results, Whisper Orchard choices/results, Lantern
// Fair choices/results, Clockwork Bridge choices/results, and Highwind Farm
// choices/results, plus Mirror Marsh, Rain Camp, Kite Hill, and Ember Library
// choices/results, including Giant's Garden, alongside shared cartographic
// framing chrome.
// Every other choice and result remains an explicitly missing raster
// commissioning slot (see unwrittenMapPresentationContract.ts). This module
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
  "lantern-fair-result-take-stage": "assets/games/unwritten-map/illustrations/sunmeadow/lantern-fair/lantern-fair-result-take-stage.webp",
  "lantern-fair-result-balcony-view": "assets/games/unwritten-map/illustrations/sunmeadow/lantern-fair/lantern-fair-result-balcony-view.webp",
  "lantern-fair-result-hidden-melody": "assets/games/unwritten-map/illustrations/sunmeadow/lantern-fair/lantern-fair-result-hidden-melody.webp",
  "lantern-fair-result-help-lanterns": "assets/games/unwritten-map/illustrations/sunmeadow/lantern-fair/lantern-fair-result-help-lanterns.webp",
  "lantern-fair-choice-take-stage": "assets/games/unwritten-map/illustrations/sunmeadow/lantern-fair/lantern-fair-choice-take-stage.webp",
  "lantern-fair-choice-balcony-view": "assets/games/unwritten-map/illustrations/sunmeadow/lantern-fair/lantern-fair-choice-balcony-view.webp",
  "lantern-fair-choice-hidden-melody": "assets/games/unwritten-map/illustrations/sunmeadow/lantern-fair/lantern-fair-choice-hidden-melody.webp",
  "lantern-fair-choice-help-lanterns": "assets/games/unwritten-map/illustrations/sunmeadow/lantern-fair/lantern-fair-choice-help-lanterns.webp",
  "whisper-orchard-encounter": "assets/games/unwritten-map/illustrations/sunmeadow/whisper-orchard/whisper-orchard-encounter.webp",
  "whisper-orchard-choice-call-light": "assets/games/unwritten-map/illustrations/sunmeadow/whisper-orchard/whisper-orchard-choice-call-light.webp",
  "whisper-orchard-choice-trail-light": "assets/games/unwritten-map/illustrations/sunmeadow/whisper-orchard/whisper-orchard-choice-trail-light.webp",
  "whisper-orchard-choice-decode-trees": "assets/games/unwritten-map/illustrations/sunmeadow/whisper-orchard/whisper-orchard-choice-decode-trees.webp",
  "whisper-orchard-choice-taste-fruit": "assets/games/unwritten-map/illustrations/sunmeadow/whisper-orchard/whisper-orchard-choice-taste-fruit.webp",
  "whisper-orchard-result-call-light": "assets/games/unwritten-map/illustrations/sunmeadow/whisper-orchard/whisper-orchard-result-call-light.webp",
  "whisper-orchard-result-trail-light": "assets/games/unwritten-map/illustrations/sunmeadow/whisper-orchard/whisper-orchard-result-trail-light.webp",
  "whisper-orchard-result-decode-trees": "assets/games/unwritten-map/illustrations/sunmeadow/whisper-orchard/whisper-orchard-result-decode-trees.webp",
  "whisper-orchard-result-taste-fruit": "assets/games/unwritten-map/illustrations/sunmeadow/whisper-orchard/whisper-orchard-result-taste-fruit.webp",
  "clockwork-bridge-encounter": "assets/games/unwritten-map/illustrations/ironwood/clockwork-bridge/clockwork-bridge-encounter.webp",
  "clockwork-bridge-choice-gear-puzzle": "assets/games/unwritten-map/illustrations/ironwood/clockwork-bridge/clockwork-bridge-choice-gear-puzzle.webp",
  "clockwork-bridge-choice-rope-crossing": "assets/games/unwritten-map/illustrations/ironwood/clockwork-bridge/clockwork-bridge-choice-rope-crossing.webp",
  "clockwork-bridge-choice-mediate-gears": "assets/games/unwritten-map/illustrations/ironwood/clockwork-bridge/clockwork-bridge-choice-mediate-gears.webp",
  "clockwork-bridge-choice-paint-blueprint": "assets/games/unwritten-map/illustrations/ironwood/clockwork-bridge/clockwork-bridge-choice-paint-blueprint.webp",
  "clockwork-bridge-result-gear-puzzle": "assets/games/unwritten-map/illustrations/ironwood/clockwork-bridge/clockwork-bridge-result-gear-puzzle.webp",
  "clockwork-bridge-result-rope-crossing": "assets/games/unwritten-map/illustrations/ironwood/clockwork-bridge/clockwork-bridge-result-rope-crossing.webp",
  "clockwork-bridge-result-mediate-gears": "assets/games/unwritten-map/illustrations/ironwood/clockwork-bridge/clockwork-bridge-result-mediate-gears.webp",
  "clockwork-bridge-result-paint-blueprint": "assets/games/unwritten-map/illustrations/ironwood/clockwork-bridge/clockwork-bridge-result-paint-blueprint.webp",
  "cloud-shepherd-encounter": "assets/games/unwritten-map/illustrations/ironwood/cloud-shepherd/cloud-shepherd-encounter.webp",
  "cloud-shepherd-choice-race-cloud": "assets/games/unwritten-map/illustrations/ironwood/cloud-shepherd/cloud-shepherd-choice-race-cloud.webp",
  "cloud-shepherd-choice-cloud-joke": "assets/games/unwritten-map/illustrations/ironwood/cloud-shepherd/cloud-shepherd-choice-cloud-joke.webp",
  "cloud-shepherd-choice-weather-song": "assets/games/unwritten-map/illustrations/ironwood/cloud-shepherd/cloud-shepherd-choice-weather-song.webp",
  "cloud-shepherd-choice-map-air-current": "assets/games/unwritten-map/illustrations/ironwood/cloud-shepherd/cloud-shepherd-choice-map-air-current.webp",
  "cloud-shepherd-result-race-cloud": "assets/games/unwritten-map/illustrations/ironwood/cloud-shepherd/cloud-shepherd-result-race-cloud.webp",
  "cloud-shepherd-result-cloud-joke": "assets/games/unwritten-map/illustrations/ironwood/cloud-shepherd/cloud-shepherd-result-cloud-joke.webp",
  "cloud-shepherd-result-weather-song": "assets/games/unwritten-map/illustrations/ironwood/cloud-shepherd/cloud-shepherd-result-weather-song.webp",
  "cloud-shepherd-result-map-air-current": "assets/games/unwritten-map/illustrations/ironwood/cloud-shepherd/cloud-shepherd-result-map-air-current.webp",
  "mirror-marsh-encounter": "assets/games/unwritten-map/illustrations/mossmere/mirror-marsh/mirror-marsh-encounter.webp",
  "mirror-marsh-choice-step-reflection": "assets/games/unwritten-map/illustrations/mossmere/mirror-marsh/mirror-marsh-choice-step-reflection.webp",
  "mirror-marsh-choice-sketch-stars": "assets/games/unwritten-map/illustrations/mossmere/mirror-marsh/mirror-marsh-choice-sketch-stars.webp",
  "mirror-marsh-choice-wave-back": "assets/games/unwritten-map/illustrations/mossmere/mirror-marsh/mirror-marsh-choice-wave-back.webp",
  "mirror-marsh-choice-reed-raft": "assets/games/unwritten-map/illustrations/mossmere/mirror-marsh/mirror-marsh-choice-reed-raft.webp",
  "mirror-marsh-result-step-reflection": "assets/games/unwritten-map/illustrations/mossmere/mirror-marsh/mirror-marsh-result-step-reflection.webp",
  "mirror-marsh-result-sketch-stars": "assets/games/unwritten-map/illustrations/mossmere/mirror-marsh/mirror-marsh-result-sketch-stars.webp",
  "mirror-marsh-result-wave-back": "assets/games/unwritten-map/illustrations/mossmere/mirror-marsh/mirror-marsh-result-wave-back.webp",
  "mirror-marsh-result-reed-raft": "assets/games/unwritten-map/illustrations/mossmere/mirror-marsh/mirror-marsh-result-reed-raft.webp",
  "rain-camp-encounter": "assets/games/unwritten-map/illustrations/westreach/rain-camp/rain-camp-encounter.webp",
  "rain-camp-choice-crowded-table": "assets/games/unwritten-map/illustrations/westreach/rain-camp/rain-camp-choice-crowded-table.webp",
  "rain-camp-choice-paint-storm": "assets/games/unwritten-map/illustrations/westreach/rain-camp/rain-camp-choice-paint-storm.webp",
  "rain-camp-choice-sort-supplies": "assets/games/unwritten-map/illustrations/westreach/rain-camp/rain-camp-choice-sort-supplies.webp",
  "rain-camp-choice-rain-walk": "assets/games/unwritten-map/illustrations/westreach/rain-camp/rain-camp-choice-rain-walk.webp",
  "rain-camp-result-crowded-table": "assets/games/unwritten-map/illustrations/westreach/rain-camp/rain-camp-result-crowded-table.webp",
  "rain-camp-result-paint-storm": "assets/games/unwritten-map/illustrations/westreach/rain-camp/rain-camp-result-paint-storm.webp",
  "rain-camp-result-sort-supplies": "assets/games/unwritten-map/illustrations/westreach/rain-camp/rain-camp-result-sort-supplies.webp",
  "rain-camp-result-rain-walk": "assets/games/unwritten-map/illustrations/westreach/rain-camp/rain-camp-result-rain-walk.webp",
  "paper-dragon-encounter": "assets/games/unwritten-map/illustrations/westreach/paper-dragon/paper-dragon-encounter.webp",
  "paper-dragon-choice-fly-with-dragon": "assets/games/unwritten-map/illustrations/westreach/paper-dragon/paper-dragon-choice-fly-with-dragon.webp",
  "paper-dragon-choice-dragon-riddle": "assets/games/unwritten-map/illustrations/westreach/paper-dragon/paper-dragon-choice-dragon-riddle.webp",
  "paper-dragon-choice-repair-tail": "assets/games/unwritten-map/illustrations/westreach/paper-dragon/paper-dragon-choice-repair-tail.webp",
  "paper-dragon-choice-festival-chase": "assets/games/unwritten-map/illustrations/westreach/paper-dragon/paper-dragon-choice-festival-chase.webp",
  "paper-dragon-result-fly-with-dragon": "assets/games/unwritten-map/illustrations/westreach/paper-dragon/paper-dragon-result-fly-with-dragon.webp",
  "paper-dragon-result-dragon-riddle": "assets/games/unwritten-map/illustrations/westreach/paper-dragon/paper-dragon-result-dragon-riddle.webp",
  "paper-dragon-result-repair-tail": "assets/games/unwritten-map/illustrations/westreach/paper-dragon/paper-dragon-result-repair-tail.webp",
  "paper-dragon-result-festival-chase": "assets/games/unwritten-map/illustrations/westreach/paper-dragon/paper-dragon-result-festival-chase.webp",
  "ember-library-encounter": "assets/games/unwritten-map/illustrations/ashpeak/ember-library/ember-library-encounter.webp",
  "ember-library-choice-forbidden-volume": "assets/games/unwritten-map/illustrations/ashpeak/ember-library/ember-library-choice-forbidden-volume.webp",
  "ember-library-choice-catalog-flames": "assets/games/unwritten-map/illustrations/ashpeak/ember-library/ember-library-choice-catalog-flames.webp",
  "ember-library-choice-listen-book": "assets/games/unwritten-map/illustrations/ashpeak/ember-library/ember-library-choice-listen-book.webp",
  "ember-library-choice-fold-fire-bird": "assets/games/unwritten-map/illustrations/ashpeak/ember-library/ember-library-choice-fold-fire-bird.webp",
  "ember-library-result-forbidden-volume": "assets/games/unwritten-map/illustrations/ashpeak/ember-library/ember-library-result-forbidden-volume.webp",
  "ember-library-result-catalog-flames": "assets/games/unwritten-map/illustrations/ashpeak/ember-library/ember-library-result-catalog-flames.webp",
  "ember-library-result-listen-book": "assets/games/unwritten-map/illustrations/ashpeak/ember-library/ember-library-result-listen-book.webp",
  "ember-library-result-fold-fire-bird": "assets/games/unwritten-map/illustrations/ashpeak/ember-library/ember-library-result-fold-fire-bird.webp",
  "giant-garden-encounter": "assets/games/unwritten-map/illustrations/ashpeak/giant-garden/giant-garden-encounter.webp",
  "giant-garden-choice-climb-fast": "assets/games/unwritten-map/illustrations/ashpeak/giant-garden/giant-garden-choice-climb-fast.webp",
  "giant-garden-choice-botany-notes": "assets/games/unwritten-map/illustrations/ashpeak/giant-garden/giant-garden-choice-botany-notes.webp",
  "giant-garden-choice-vine-picnic": "assets/games/unwritten-map/illustrations/ashpeak/giant-garden/giant-garden-choice-vine-picnic.webp",
  "giant-garden-choice-cloud-shapes": "assets/games/unwritten-map/illustrations/ashpeak/giant-garden/giant-garden-choice-cloud-shapes.webp",
  "giant-garden-result-climb-fast": "assets/games/unwritten-map/illustrations/ashpeak/giant-garden/giant-garden-result-climb-fast.webp",
  "giant-garden-result-botany-notes": "assets/games/unwritten-map/illustrations/ashpeak/giant-garden/giant-garden-result-botany-notes.webp",
  "giant-garden-result-vine-picnic": "assets/games/unwritten-map/illustrations/ashpeak/giant-garden/giant-garden-result-vine-picnic.webp",
  "giant-garden-result-cloud-shapes": "assets/games/unwritten-map/illustrations/ashpeak/giant-garden/giant-garden-result-cloud-shapes.webp",
  "old-lighthouse-encounter": "assets/games/unwritten-map/illustrations/tideglass/old-lighthouse/old-lighthouse-encounter.webp",
  "old-lighthouse-choice-repair-lens": "assets/games/unwritten-map/illustrations/tideglass/old-lighthouse/old-lighthouse-choice-repair-lens.webp",
  "old-lighthouse-choice-keeper-journals": "assets/games/unwritten-map/illustrations/tideglass/old-lighthouse/old-lighthouse-choice-keeper-journals.webp",
  "old-lighthouse-choice-storm-roof": "assets/games/unwritten-map/illustrations/tideglass/old-lighthouse/old-lighthouse-choice-storm-roof.webp",
  "old-lighthouse-choice-sea-listen": "assets/games/unwritten-map/illustrations/tideglass/old-lighthouse/old-lighthouse-choice-sea-listen.webp",
  "old-lighthouse-result-repair-lens": "assets/games/unwritten-map/illustrations/tideglass/old-lighthouse/old-lighthouse-result-repair-lens.webp",
  "old-lighthouse-result-keeper-journals": "assets/games/unwritten-map/illustrations/tideglass/old-lighthouse/old-lighthouse-result-keeper-journals.webp",
  "old-lighthouse-result-storm-roof": "assets/games/unwritten-map/illustrations/tideglass/old-lighthouse/old-lighthouse-result-storm-roof.webp",
  "old-lighthouse-result-sea-listen": "assets/games/unwritten-map/illustrations/tideglass/old-lighthouse/old-lighthouse-result-sea-listen.webp",
  "star-ferry-encounter": "assets/games/unwritten-map/illustrations/tideglass/star-ferry/star-ferry-encounter.webp",
  "star-ferry-choice-steer-stars": "assets/games/unwritten-map/illustrations/tideglass/star-ferry/star-ferry-choice-steer-stars.webp",
  "star-ferry-choice-ferryman-tale": "assets/games/unwritten-map/illustrations/tideglass/star-ferry/star-ferry-choice-ferryman-tale.webp",
  "star-ferry-choice-catch-star": "assets/games/unwritten-map/illustrations/tideglass/star-ferry/star-ferry-choice-catch-star.webp",
  "star-ferry-choice-deck-dance": "assets/games/unwritten-map/illustrations/tideglass/star-ferry/star-ferry-choice-deck-dance.webp",

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

export const LANTERN_FAIR_CHOICE_ASSET_IDS: Record<string, UnwrittenMapLocalAssetId> = {
  "take-stage": "lantern-fair-choice-take-stage",
  "balcony-view": "lantern-fair-choice-balcony-view",
  "hidden-melody": "lantern-fair-choice-hidden-melody",
  "help-lanterns": "lantern-fair-choice-help-lanterns",
};

export const CLOCKWORK_BRIDGE_CHOICE_ASSET_IDS: Record<string, UnwrittenMapLocalAssetId> = {
  "gear-puzzle": "clockwork-bridge-choice-gear-puzzle",
  "rope-crossing": "clockwork-bridge-choice-rope-crossing",
  "mediate-gears": "clockwork-bridge-choice-mediate-gears",
  "paint-blueprint": "clockwork-bridge-choice-paint-blueprint",
};

/** Authoritative Highwind Farm choice-id -> commissioned choice-art mapping. */
export const CLOUD_SHEPHERD_CHOICE_ASSET_IDS: Record<string, UnwrittenMapLocalAssetId> = {
  "race-cloud": "cloud-shepherd-choice-race-cloud",
  "cloud-joke": "cloud-shepherd-choice-cloud-joke",
  "weather-song": "cloud-shepherd-choice-weather-song",
  "map-air-current": "cloud-shepherd-choice-map-air-current",
};

/** Authoritative Highwind Farm choice-id -> commissioned result-art mapping. */
export const CLOUD_SHEPHERD_RESULT_ASSET_IDS: Record<string, UnwrittenMapLocalAssetId> = {
  "race-cloud": "cloud-shepherd-result-race-cloud",
  "cloud-joke": "cloud-shepherd-result-cloud-joke",
  "weather-song": "cloud-shepherd-result-weather-song",
  "map-air-current": "cloud-shepherd-result-map-air-current",
};

/** Authoritative Mirror Marsh choice-id -> commissioned choice-art mapping. */
export const MIRROR_MARSH_CHOICE_ASSET_IDS: Record<string, UnwrittenMapLocalAssetId> = {
  "step-reflection": "mirror-marsh-choice-step-reflection",
  "sketch-stars": "mirror-marsh-choice-sketch-stars",
  "wave-back": "mirror-marsh-choice-wave-back",
  "reed-raft": "mirror-marsh-choice-reed-raft",
};

/** Authoritative Mirror Marsh choice-id -> commissioned result-art mapping. */
export const MIRROR_MARSH_RESULT_ASSET_IDS: Record<string, UnwrittenMapLocalAssetId> = {
  "step-reflection": "mirror-marsh-result-step-reflection",
  "sketch-stars": "mirror-marsh-result-sketch-stars",
  "wave-back": "mirror-marsh-result-wave-back",
  "reed-raft": "mirror-marsh-result-reed-raft",
};

/** Authoritative Rain Camp choice-id -> commissioned choice-art mapping. */
export const RAIN_CAMP_CHOICE_ASSET_IDS: Record<string, UnwrittenMapLocalAssetId> = {
  "crowded-table": "rain-camp-choice-crowded-table",
  "paint-storm": "rain-camp-choice-paint-storm",
  "sort-supplies": "rain-camp-choice-sort-supplies",
  "rain-walk": "rain-camp-choice-rain-walk",
};

/** Authoritative Rain Camp choice-id -> commissioned result-art mapping. */
export const RAIN_CAMP_RESULT_ASSET_IDS: Record<string, UnwrittenMapLocalAssetId> = {
  "crowded-table": "rain-camp-result-crowded-table",
  "paint-storm": "rain-camp-result-paint-storm",
  "sort-supplies": "rain-camp-result-sort-supplies",
  "rain-walk": "rain-camp-result-rain-walk",
};

/** Authoritative Kite Hill choice-id -> commissioned choice-art mapping. */
export const PAPER_DRAGON_CHOICE_ASSET_IDS: Record<string, UnwrittenMapLocalAssetId> = {
  "fly-with-dragon": "paper-dragon-choice-fly-with-dragon",
  "dragon-riddle": "paper-dragon-choice-dragon-riddle",
  "repair-tail": "paper-dragon-choice-repair-tail",
  "festival-chase": "paper-dragon-choice-festival-chase",
};

/** Authoritative Kite Hill choice-id -> commissioned result-art mapping. */
export const PAPER_DRAGON_RESULT_ASSET_IDS: Record<string, UnwrittenMapLocalAssetId> = {
  "fly-with-dragon": "paper-dragon-result-fly-with-dragon",
  "dragon-riddle": "paper-dragon-result-dragon-riddle",
  "repair-tail": "paper-dragon-result-repair-tail",
  "festival-chase": "paper-dragon-result-festival-chase",
};

/** Authoritative Ember Library choice-id -> commissioned choice-art mapping. */
export const EMBER_LIBRARY_CHOICE_ASSET_IDS: Record<string, UnwrittenMapLocalAssetId> = {
  "forbidden-volume": "ember-library-choice-forbidden-volume",
  "catalog-flames": "ember-library-choice-catalog-flames",
  "listen-book": "ember-library-choice-listen-book",
  "fold-fire-bird": "ember-library-choice-fold-fire-bird",
};

/** Authoritative Ember Library choice-id -> commissioned result-art mapping. */
export const EMBER_LIBRARY_RESULT_ASSET_IDS: Record<string, UnwrittenMapLocalAssetId> = {
  "forbidden-volume": "ember-library-result-forbidden-volume",
  "catalog-flames": "ember-library-result-catalog-flames",
  "listen-book": "ember-library-result-listen-book",
  "fold-fire-bird": "ember-library-result-fold-fire-bird",
};

/** Authoritative Giant's Garden choice-id -> commissioned choice-art mapping. */
export const GIANT_GARDEN_CHOICE_ASSET_IDS: Record<string, UnwrittenMapLocalAssetId> = {
  "climb-fast": "giant-garden-choice-climb-fast",
  "botany-notes": "giant-garden-choice-botany-notes",
  "vine-picnic": "giant-garden-choice-vine-picnic",
  "cloud-shapes": "giant-garden-choice-cloud-shapes",
};

/** Authoritative Giant's Garden choice-id -> commissioned result-art mapping. */
export const GIANT_GARDEN_RESULT_ASSET_IDS: Record<string, UnwrittenMapLocalAssetId> = {
  "climb-fast": "giant-garden-result-climb-fast",
  "botany-notes": "giant-garden-result-botany-notes",
  "vine-picnic": "giant-garden-result-vine-picnic",
  "cloud-shapes": "giant-garden-result-cloud-shapes",
};

/** Authoritative Old Lighthouse choice-id -> commissioned choice-art mapping. */
export const OLD_LIGHTHOUSE_CHOICE_ASSET_IDS: Record<string, UnwrittenMapLocalAssetId> = {
  "repair-lens": "old-lighthouse-choice-repair-lens",
  "keeper-journals": "old-lighthouse-choice-keeper-journals",
  "storm-roof": "old-lighthouse-choice-storm-roof",
  "sea-listen": "old-lighthouse-choice-sea-listen",
};

/** Authoritative Old Lighthouse choice-id -> commissioned result-art mapping. */
export const OLD_LIGHTHOUSE_RESULT_ASSET_IDS: Record<string, UnwrittenMapLocalAssetId> = {
  "repair-lens": "old-lighthouse-result-repair-lens",
  "keeper-journals": "old-lighthouse-result-keeper-journals",
  "storm-roof": "old-lighthouse-result-storm-roof",
  "sea-listen": "old-lighthouse-result-sea-listen",
};

/** Authoritative Star Ferry choice-id -> commissioned choice-art mapping. */
export const STAR_FERRY_CHOICE_ASSET_IDS: Record<string, UnwrittenMapLocalAssetId> = {
  "steer-stars": "star-ferry-choice-steer-stars",
  "ferryman-tale": "star-ferry-choice-ferryman-tale",
  "catch-star": "star-ferry-choice-catch-star",
  "deck-dance": "star-ferry-choice-deck-dance",
};

export const CLOCKWORK_BRIDGE_RESULT_ASSET_IDS: Record<string, UnwrittenMapLocalAssetId> = {
  "gear-puzzle": "clockwork-bridge-result-gear-puzzle",
  "rope-crossing": "clockwork-bridge-result-rope-crossing",
  "mediate-gears": "clockwork-bridge-result-mediate-gears",
  "paint-blueprint": "clockwork-bridge-result-paint-blueprint",
};

/** The exact, authoritative choice-id -> local-asset-id mapping for results. */
export const FROG_PARLIAMENT_RESULT_ASSET_IDS: Record<string, UnwrittenMapLocalAssetId> = {
  "hear-frogs": "frog-parliament-result-hear-frogs",
  "night-pageant": "frog-parliament-result-night-pageant",
  "moon-experiment": "frog-parliament-result-moon-experiment",
  "grand-speech": "frog-parliament-result-grand-speech",
};

/** Authoritative Lantern Fair choice-id -> commissioned result-art mapping. */
export const LANTERN_FAIR_RESULT_ASSET_IDS: Record<string, UnwrittenMapLocalAssetId> = {
  "take-stage": "lantern-fair-result-take-stage",
  "balcony-view": "lantern-fair-result-balcony-view",
  "hidden-melody": "lantern-fair-result-hidden-melody",
  "help-lanterns": "lantern-fair-result-help-lanterns",
};

/** Authoritative Whisper Orchard choice-id -> commissioned choice-art mapping. */
export const WHISPER_ORCHARD_CHOICE_ASSET_IDS: Record<string, UnwrittenMapLocalAssetId> = {
  "call-light": "whisper-orchard-choice-call-light",
  "trail-light": "whisper-orchard-choice-trail-light",
  "decode-trees": "whisper-orchard-choice-decode-trees",
  "taste-fruit": "whisper-orchard-choice-taste-fruit",
};

/** Authoritative Whisper Orchard choice-id -> commissioned result-art mapping. */
export const WHISPER_ORCHARD_RESULT_ASSET_IDS: Record<string, UnwrittenMapLocalAssetId> = {
  "call-light": "whisper-orchard-result-call-light",
  "trail-light": "whisper-orchard-result-trail-light",
  "decode-trees": "whisper-orchard-result-decode-trees",
  "taste-fruit": "whisper-orchard-result-taste-fruit",
};

export const FROG_PARLIAMENT_ENCOUNTER_ASSET_ID: UnwrittenMapLocalAssetId = "frog-parliament-encounter";

export const UNWRITTEN_MAP_ENCOUNTER_ASSET_IDS: Readonly<Partial<Record<string, UnwrittenMapLocalAssetId>>> = {
  "lantern-fair": "lantern-fair-encounter",
  "whisper-orchard": "whisper-orchard-encounter",
  "clockwork-bridge": "clockwork-bridge-encounter",
  "cloud-shepherd": "cloud-shepherd-encounter",
  "mirror-marsh": "mirror-marsh-encounter",
  "rain-camp": "rain-camp-encounter",
  "paper-dragon": "paper-dragon-encounter",
  "ember-library": "ember-library-encounter",
  "giant-garden": "giant-garden-encounter",
  "old-lighthouse": "old-lighthouse-encounter",
  "star-ferry": "star-ferry-encounter",
  "frog-parliament": FROG_PARLIAMENT_ENCOUNTER_ASSET_ID,
};

export const UNWRITTEN_MAP_FOCAL_ASSET_PROVENANCE: Readonly<Partial<Record<UnwrittenMapLocalAssetId, {
  sourceFile: string;
  sourceSha256: string;
  derivedSha256: string;
  derivedDimensions: string;
  authorization: string;
  authoredScene?: string;
}>>> = {
  "lantern-fair-result-take-stage": {
    sourceFile: "4f09c3b1-da6f-468d-bf8a-768339f60720-3d4033fe-7250-46b7-8347-ea980876126f-clipboard.png",
    sourceSha256: "65aaa4416927fbc0a1f4fb8067dc10318841efdf35e9094198b5707ac6d99e03",
    derivedSha256: "59b183d1005cb134564057018e34b32c22b9d92ff41fee2fc8e3d8d4ada9ab1f",
    derivedDimensions: "1536x1024",
    authorization: "User-supplied for Lantern Fair result integration",
  },
  "lantern-fair-result-balcony-view": {
    sourceFile: "ccb74a15-5b66-4b4a-8c71-1319b53569e2-c3bda329-21a9-403b-b6c9-dfb7f7087545-clipboard.png",
    sourceSha256: "e1bfd1c7ab8d154e93d5bf30709f8dfa201a0d2a334af899a4f570c2bb51a161",
    derivedSha256: "56db31e9a3cde453c9dbcb634f894d61b6a306213b74a428257db8e43e4e8442",
    derivedDimensions: "1536x1024",
    authorization: "User-supplied for Lantern Fair result integration",
  },
  "lantern-fair-result-hidden-melody": {
    sourceFile: "76c97622-4b97-4c37-8d54-f9619eb525ad-7776b0cf-a87a-46e7-80fa-9720d593170a-clipboard.png",
    sourceSha256: "1d6016847f1e052199145343944730e8f5bd03f140cd64095725230df5eacc99",
    derivedSha256: "8fce6819e9f1b44f2f9b19e5778223aaf772082ed75457814cc4d3a97a6d1924",
    derivedDimensions: "1536x1024",
    authorization: "User-supplied for Lantern Fair result integration",
  },
  "lantern-fair-result-help-lanterns": {
    sourceFile: "785f6217-7585-4b68-a820-c4540c4eff75-5bc84b8d-e271-458f-b854-ddf281b46c23-clipboard.png",
    sourceSha256: "974e0b9ce0cbe5d348e049584f75ce0b9831fdb13331b40ddd3732d958f653df",
    derivedSha256: "131cb45ef6a5775669935ce9ed16cf51cb0c9752669b565a7189f4260847357d",
    derivedDimensions: "1536x1024",
    authorization: "User-supplied for Lantern Fair result integration",
  },
  "lantern-fair-encounter": {
    sourceFile: "a38fedbc-84ee-4467-8b6a-6f23c6135066-0fca7dc5-313d-45ce-beea-f3c0ce118358-clipboard.png",
    sourceSha256: "1cc48fed7691c3fdbf29cc1096d4df7bbe2992a868c5e1893a2876e80fe701a7",
    derivedSha256: "78c0bbd53611f141fbf9118170e00010f902af52298ead3c8df2d736a1889830",
    derivedDimensions: "1418x945",
    authorization: "User-supplied for PR #306",
  },
  "lantern-fair-choice-take-stage": {
    sourceFile: "b0a32019-e55d-4ab8-ac7a-49b2ef3139a9-1cc8091e-4547-4f71-b077-afec765727ab-clipboard.png",
    sourceSha256: "ae0339a4bb2eb03f5b950a905e9e2b7b6b10dedf90de6ea8fa4723c910bec7aa",
    derivedSha256: "64607381a8dcdcd637f630923112727188484f70de9deb8ba799b53f62ed6386",
    derivedDimensions: "800x600",
    authorization: "User-supplied for this Lantern Fair choice-art phase",
  },
  "lantern-fair-choice-balcony-view": {
    sourceFile: "ca53938b-ddf0-462c-8a93-ca0a9472cd37-a923c3e0-51c2-41c5-88d0-7c176fd0dbf2-clipboard.png",
    sourceSha256: "cc5e3f5be63c4b9795da9129d12307636612f8d0c2ea00b528e517e392f72e86",
    derivedSha256: "fcf4a37324cc3da4b8e9a49127d0553dd159d4b1c686c835a91d63aebc3e0ac6",
    derivedDimensions: "800x600",
    authorization: "User-supplied for this Lantern Fair choice-art phase",
  },
  "lantern-fair-choice-hidden-melody": {
    sourceFile: "1e2e7391-3aae-451d-8292-1f6a52941b64-45e1b0b4-7c1a-4919-ba16-9ba6ce8425ee-clipboard.png",
    sourceSha256: "ba6edef51d9408217bfb8a60a13dd66bf23cdc693701f2580429f42800e0565b",
    derivedSha256: "c5294a8154949d9f46b98d4cb18ee6c3aa61653c03aa77681720d9ab0cd26475",
    derivedDimensions: "800x600",
    authorization: "User-supplied for this Lantern Fair choice-art phase",
  },
  "lantern-fair-choice-help-lanterns": {
    sourceFile: "1b6f2dad-2192-4686-b8d4-9e61d6b9ff5c-db2ba40c-635f-48c8-afae-8ceb25aeab03-clipboard.png",
    sourceSha256: "5080027b52021a6685fb30a161b59efb8f0e2599fec77a2fd81594592ec5a762",
    derivedSha256: "f6cfa181a31c803850fddf459b8a4f44e659ea357e663bed2da1cca57cb2cd7d",
    derivedDimensions: "800x600",
    authorization: "User-supplied for this Lantern Fair choice-art phase",
  },
  "whisper-orchard-encounter": {
    sourceFile: "a93fb7d1-cb43-487e-ae1e-e6e62c2eb72a-ca28c87f-d8d7-4e64-b9e6-4a0a862d12c9-clipboard.png",
    sourceSha256: "d8a7e9bcd190a155012fa8487de34ed9f04374f8b8dc09ae8595f76b54ac0424",
    derivedSha256: "158536501f8daba63b55782ef6725e6762da29045538290418bc5fbabad319a3",
    derivedDimensions: "1395x930",
    authorization: "User-supplied for PR #306",
  },
  "whisper-orchard-choice-call-light": {
    sourceFile: "736c738d-c658-4a40-a814-b3082af8886b-745be0cd-a0a7-4a42-97d5-868286b02324-clipboard.png",
    sourceSha256: "08d7e426025efa8048fbec7841253c09661dcce2a137e9ffedf71b94b35c85ab",
    derivedSha256: "23f74f6070b5cb7bd2106346fa02eab6ec8f730f4ce14892ace8aa5b8085c0c5",
    derivedDimensions: "1200x900",
    authorization: "User-supplied for Whisper Orchard choice integration",
  },
  "whisper-orchard-choice-trail-light": {
    sourceFile: "8c6e765d-a09d-434c-869f-651fbc62e17c-19ea12d1-959d-451e-9da5-666bc2a9bb37-clipboard.png",
    sourceSha256: "6bbcee66d1d01a07a6bd5b549ee626735816a57f72ceaf85f293988dc66cba64",
    derivedSha256: "c3f5861e983633b3c5ded814528511a9c8241e0372442d978eb48eb17a70a3f9",
    derivedDimensions: "1200x900",
    authorization: "User-supplied for Whisper Orchard choice integration",
  },
  "whisper-orchard-choice-decode-trees": {
    sourceFile: "a77b7a05-018b-450d-9413-82fb71cd6446-9d39468b-509c-46e4-aba8-de754a0cc9a8-clipboard.png",
    sourceSha256: "6c4ae438db87e704fd648c2506517e4d2432298cf2ab9304fb9228e41eac0665",
    derivedSha256: "17b71cbecf8843341a6d5cb7e3f3a687c6a17c138f5de9ab88a9ae8fd9bb6817",
    derivedDimensions: "1200x900",
    authorization: "User-supplied for Whisper Orchard choice integration",
  },
  "whisper-orchard-choice-taste-fruit": {
    sourceFile: "9d597ec4-5eca-47ca-8129-8de37ae96768-7ae4edb6-a642-4654-941d-cced0b6ceb63-clipboard.png",
    sourceSha256: "723e9596d70e4c78e336397d57cc4a24f2f26aa2781d723ec634e22e607173ea",
    derivedSha256: "e8a035ee144aa388b83c669a8e979296cea41591ca71575dc089da7f45cdb0fe",
    derivedDimensions: "1200x900",
    authorization: "User-supplied for Whisper Orchard choice integration",
  },
  "whisper-orchard-result-call-light": {
    sourceFile: "8e55b153-01ca-486d-9c8e-bd3191526200-e8d74e3a-e1ae-4d1b-9dd8-e0d29ecf66c0-clipboard.png",
    sourceSha256: "252f5d20fdf7802f7f1b4a74f50d8aa122de74581be5689267df41a97d7de2db",
    derivedSha256: "e2251dfb8cea6e36442af804b268f131f0d7d0ea71f43a1b5c270fe6bc183332",
    derivedDimensions: "1464x976",
    authorization: "User-supplied for Whisper Orchard result integration",
  },
  "whisper-orchard-result-trail-light": {
    sourceFile: "502cd676-16e1-418f-ba32-08a33874812e-f6c2f7da-07ea-417f-92cd-25a57bf8672f-clipboard.png",
    sourceSha256: "92de7af3c94e8fa9d061aa3f7439a66a49c393ddfe5a2e283124a8e99d06aef3",
    derivedSha256: "d93e28f69c1f6e14ea68d8f10f5aaa3a85b278ef5b170449774726f742f23e62",
    derivedDimensions: "1470x980",
    authorization: "User-supplied for Whisper Orchard result integration",
  },
  "whisper-orchard-result-decode-trees": {
    sourceFile: "776af5b6-66b2-4f75-a6e6-52dfd774d627-1ba5641e-8b22-4c44-ac76-9fa3c5df1854-clipboard.png",
    sourceSha256: "77b167e30fb07e4fe229a32f9c9c366ec609d427cb2c56941eb7197bfdbc53ab",
    derivedSha256: "eca54ef6903e2c5de0f8c72b8322a4ae37facadabdb8f31d509512c5c63068f4",
    derivedDimensions: "1467x978",
    authorization: "User-supplied for Whisper Orchard result integration",
  },
  "whisper-orchard-result-taste-fruit": {
    sourceFile: "6271ffff-beb0-4ac5-87de-cd0e924b3988-08f34f0e-1a48-405c-b894-3202e86551fc-clipboard.png",
    sourceSha256: "fa3ac36376b472c7fdc636812966c01192b7322480e3760a5c05366d25da75b2",
    derivedSha256: "a00a75715b03e383f8ca8a318b17df9112ac606d0f2d2e6667496186b50b00c8",
    derivedDimensions: "1494x996",
    authorization: "User-supplied for Whisper Orchard result integration",
  },
  "clockwork-bridge-encounter": {
    sourceFile: "14e6145f-c501-457e-b5c3-728a7fa8ae1d-e414d6fb-2c40-4268-998c-28658fc346cb-clipboard.png",
    sourceSha256: "d5db024902530a630b4b4915de00abf71dfb00994dd4eb6c781c7c8747cc77ff",
    derivedSha256: "017e95d59c74753fc74446e0316e38a4780ca12371c849c17eb654583c4b2de7",
    derivedDimensions: "1418x945",
    authorization: "User-supplied for PR #306",
  },
  "clockwork-bridge-choice-gear-puzzle": {
    sourceFile: "60a2a0d5-f950-464e-b3bb-93148caa5a37-a9943e72-1052-4220-b61a-3487b37087c9-clipboard.png",
    sourceSha256: "f79446e357f6d993f525fe8a803928fec4591db232a1e80695a2f27d4ef656d8",
    derivedSha256: "13f0a5b2879c7c5e6ba13028243bdaa26117d1902db8f3484fecb61433c84963",
    derivedDimensions: "800x600",
    authorization: "User-supplied for Clockwork Bridge choice integration",
  },
  "clockwork-bridge-choice-rope-crossing": {
    sourceFile: "255c9a32-1061-41fb-95fc-61f260f39a4a-d9affb6c-2987-4158-92c1-6fb31bd2ce2a-clipboard.png",
    sourceSha256: "1be7face075af0ec2576e41aea7b6fe483457579f9b0842c73c3c5f2d3f3915a",
    derivedSha256: "536debbe785553c45a6a896530a8df62049946e7f9178ccbbc18c734d67db55a",
    derivedDimensions: "800x600",
    authorization: "User-supplied for Clockwork Bridge choice integration",
  },
  "clockwork-bridge-choice-mediate-gears": {
    sourceFile: "d549fc41-32c3-4747-9e2d-d222ffce164c-f9163eab-98d4-41ce-8eb8-5294392b3813-clipboard.png",
    sourceSha256: "3d44bc5afd22f53a40e96252b0d82f65f3fc7f72957932bab3817d8608240fa5",
    derivedSha256: "ff7c51e15f8e95085eb7eaeeb07493e32dced685165fbf0d5c5644b668c911ca",
    derivedDimensions: "800x600",
    authorization: "User-supplied for Clockwork Bridge choice integration",
  },
  "clockwork-bridge-choice-paint-blueprint": {
    sourceFile: "ba8c4abd-c941-488c-8a08-231bb42cad4e-38ab5d42-c9bb-4e0b-98df-a83362167f5c-clipboard.png",
    sourceSha256: "3c718dc4cdb26e525e310535f61d242203e8bc55afa64a4e8a4e887f2ecddd18",
    derivedSha256: "b8879da8753fc5f10fd7e3ef38e853a7c43e8b1831da427d75f6f893e91ef337",
    derivedDimensions: "800x600",
    authorization: "User-supplied for Clockwork Bridge choice integration",
  },
  "clockwork-bridge-result-gear-puzzle": {
    sourceFile: "456e4913-9cef-4c1c-bcf4-3f0303360e47-1ec60e4a-8fae-4ec1-919b-4589de9bb031-clipboard.png",
    sourceSha256: "7545b5a712a517a9d0210612ecbd1693c67dbb5db95eb22da7a1bdce87986fc9",
    derivedSha256: "245aa71635b2a2d27ee7c1602e8e398f465ace6f3e4105cf7f28c64a71993e11",
    derivedDimensions: "1473x982",
    authorization: "User-supplied for Clockwork Bridge result integration",
  },
  "clockwork-bridge-result-rope-crossing": {
    sourceFile: "bdaad6ec-4b6c-4fde-b1e7-b5b959a0982d-7dec58fd-e568-4586-9a96-659ae3354495-clipboard.png",
    sourceSha256: "5de2b7ac1ceb8f92a7f75ca4e48b080aa56c3ee1485019e010e76adb4aebe931",
    derivedSha256: "d82b2266e8461e0cb7f020a650b8254c00191f8ce34c498b4d257a51e341bc1b",
    derivedDimensions: "1442x961",
    authorization: "User-supplied for Clockwork Bridge result integration",
  },
  "clockwork-bridge-result-mediate-gears": {
    sourceFile: "07fdc65e-156c-4876-82ce-b6c0ab31b104-1c7e0af5-c76f-48e6-92d6-a38f72ec18e3-clipboard.png",
    sourceSha256: "3cd20fd668151b32ef478fbc41497cbd9d73395d27213346620f6a5f7c3ff3b3",
    derivedSha256: "9be776e572c3e0684a593db550ff79fdbbc40d313beae1fc1f29f0e83aaf097a",
    derivedDimensions: "1461x974",
    authorization: "User-supplied for Clockwork Bridge result integration",
  },
  "clockwork-bridge-result-paint-blueprint": {
    sourceFile: "e92bc360-f5ce-494f-9899-efe5aa2edba2-d46dce09-575d-45ed-bca2-8746bf2cec49-clipboard.png",
    sourceSha256: "c69634d4ab182736263fc5e300693d7cb9fac600060b2f095a847afa6e0bf910",
    derivedSha256: "b35de9105a98e3ff4ddf1cf6ceef164d03e1537001a5e719cc6bd46de5ff73bf",
    derivedDimensions: "1471x981",
    authorization: "User-supplied for Clockwork Bridge result integration",
  },
  "cloud-shepherd-encounter": {
    sourceFile: "b3ea9f57-fbd8-4344-bd46-3fc24e3a79c0-eb5fbca4-1ec4-4e0d-9419-154633bfc2bf-clipboard.png",
    sourceSha256: "dee3eb79771fe639eb2e2bb4f0cd85007c3300ee6d55545ab62318bf1162fc89",
    derivedSha256: "853f75983848a79f04f72b7dade2ba89f72ce3cafa2c83752a5ed040742a0286",
    derivedDimensions: "1466x977",
    authorization: "User-supplied for PR #306",
  },
  "cloud-shepherd-choice-race-cloud": {
    sourceFile: "d98f5612-df7c-4652-bcac-34878a14869e-a23111bc-632f-4f17-ae2a-a4ef8ca1e1f4-clipboard.png",
    sourceSha256: "07911bb5b328d24e856407e56508c174664a6eb1c79795c6caa49ba267df1d72",
    derivedSha256: "1ac7a372ca163e5108a6b7d2cf9c09e462d381ce6b00ae1b59eee8b2cacec6ed",
    derivedDimensions: "800x600",
    authorization: "User-supplied for Highwind Farm choice integration",
    authoredScene: "Explorer and dog race a wind-sail cart along a highland ridge and farm road at sunset; the cloud remains contextual rather than central.",
  },
  "cloud-shepherd-choice-cloud-joke": {
    sourceFile: "0be35d24-ac17-460b-91d3-0ac5e57890cb-fb888bc1-ee3c-49ec-aab5-f33e51510618-clipboard.png",
    sourceSha256: "06a15ce5b566c59bbdca55534ea472fd5ac2974473b9969071267ff779e337a3",
    derivedSha256: "51c255069b6f7a0bde5dbb911db232f4796b58598d16bd1c496db97b3f52c2bb",
    derivedDimensions: "800x600",
    authorization: "User-supplied for Highwind Farm choice integration",
    authoredScene: "Explorer tells a joke to a laughing cow with the dog and farm visible at sunset; the cow is decorative context and does not redefine the cloud choice.",
  },
  "cloud-shepherd-choice-weather-song": {
    sourceFile: "5e5515fb-3f3c-4735-86ce-c854694c7134-9b837eee-c871-4ba1-a0ca-ff2d5fe645cf-clipboard.png",
    sourceSha256: "5ce3ce4eff4f37d4995dd806f8b13a7459e0fe402b314a04f7364ef24b6b0641",
    derivedSha256: "a2c33cc8d55dfb21f2bb9753ec350b5743f77e3fbd47d8f878172e24e48d1b22",
    derivedDimensions: "800x600",
    authorization: "User-supplied for Highwind Farm choice integration",
    authoredScene: "Explorer and dog learn a guitar weather song from an elder shepherd among sheep on the farm at sunset.",
  },
  "cloud-shepherd-choice-map-air-current": {
    sourceFile: "26a066b4-96e9-43b4-b2f4-642d4e0e2c5f-2614173d-2d20-4d58-afa7-b2f1f4895cfc-clipboard.png",
    sourceSha256: "f1ea8730b8a73e4357f44df84d8e25288d52ad1b09d2b3ec6c9942f3c9dbd282",
    derivedSha256: "e50fd9e50432e8b264c5c79a45316aac716af715831c7616df579abf57dafcfc",
    derivedDimensions: "800x600",
    authorization: "User-supplied for Highwind Farm choice integration",
    authoredScene: "Explorer and dog study drawn wind patterns beside a weather vane as visible air-current ribbons cross the valley.",
  },
  "cloud-shepherd-result-race-cloud": {
    sourceFile: "982fe171-9261-4560-b050-98f6db3c4867-31d5a204-ad6c-4ca1-a9bd-8ea34514c604-clipboard.png",
    sourceSha256: "df21f6182641326a28e519ec7199a41d442d1f67abf20651dd3df655be0c1e81",
    derivedSha256: "d3a8c5bbbc6b9bbcddbb138f064fd3623220e15a2f0d8aa12f5be150fbe8139a",
    derivedDimensions: "1536x1024",
    authorization: "User-supplied for Highwind Farm result integration",
  },
  "cloud-shepherd-result-cloud-joke": {
    sourceFile: "d4373905-e8a5-4c47-938e-c4d868c2e108-c2e9e549-8409-482f-a212-a12775464e12-clipboard.png",
    sourceSha256: "e5295fafe70c750eab97d73321c9dcc3b5d5416006ff9e51030c691cb2a16a59",
    derivedSha256: "9d9750b9a3d4728f2a1a43b98f679a52612fa1cebc489676f6274a61c623992f",
    derivedDimensions: "1536x1024",
    authorization: "User-supplied for Highwind Farm result integration",
  },
  "cloud-shepherd-result-weather-song": {
    sourceFile: "6d94ade5-87fa-40e1-a3b8-32c81deb9cc5-07c22ef1-a170-44d8-8402-f9efe9a0a72d-clipboard.png",
    sourceSha256: "6de291b8a3e29c40fe8f98f369ff794a33370a8e011cb910086e95c955a1b789",
    derivedSha256: "1b0261fa73bd3fd093fa1c6975859a21c752a7149b4f1dce1c1a2fa16dda4484",
    derivedDimensions: "1536x1024",
    authorization: "User-supplied for Highwind Farm result integration",
  },
  "cloud-shepherd-result-map-air-current": {
    sourceFile: "22ede1d6-5277-43f0-b147-cadb41826493-a3204a78-e1ce-4f14-b0f2-f10cb0831d37-clipboard.png",
    sourceSha256: "b50e8b65f63cd1fa2109133939455a89dcf2be99c311e94aebc0e58ed64b1b5f",
    derivedSha256: "0656f0e7b9ce74b75de432e52c66c3ee07d3a5fdf71a3d6682ad79a8fa4bd744",
    derivedDimensions: "1530x1020",
    authorization: "User-supplied for Highwind Farm result integration",
  },
  "mirror-marsh-choice-step-reflection": {
    sourceFile: "63ee9ba2-455f-457f-bd94-ef0dbf267d0a-f0e5d1a3-68d4-4d01-a0da-9f849490b7be-clipboard.png",
    sourceSha256: "6d19e35808c9d7ce6d481b3367c13ce3a22c972ec913db7942bf5ffaaa9f93a9",
    derivedSha256: "ea272da8893f45949806f9bad463d07ae810e1f68bf9452ce7fcdd0f849e1890",
    derivedDimensions: "800x600",
    authorization: "User-supplied for Mirror Marsh choice integration",
  },
  "mirror-marsh-choice-sketch-stars": {
    sourceFile: "a39da34b-30a2-49f7-a240-9e37e486e41a-e52d5d7f-c76f-4461-ae3d-896947869eb3-clipboard.png",
    sourceSha256: "42ea837fb07f403ba4f4f69763d483babb5dfd37ab4697274277dd8806b21d46",
    derivedSha256: "157a06e840d9010daaa2f2f702406f18b3d6c6c901ba3ca209e0e06df3ecafb0",
    derivedDimensions: "800x600",
    authorization: "User-supplied for Mirror Marsh choice integration",
  },
  "mirror-marsh-choice-wave-back": {
    sourceFile: "828ea167-3538-4b7f-869e-abc4bbeb6d80-c9bf7312-09ea-4bbf-966d-3510a353ec15-clipboard.png",
    sourceSha256: "a943667384a410ea718ecc074b9b5fac57564a8aa89da3d5074f17cbd3381cc8",
    derivedSha256: "9d65a756a37910fb0e933a5bbea57d68656bad9ab81785e07f3d34806e3f952d",
    derivedDimensions: "800x600",
    authorization: "User-supplied for Mirror Marsh choice integration",
  },
  "mirror-marsh-choice-reed-raft": {
    sourceFile: "b13dce52-baac-46e6-93b1-e7a366f3bf9e-f9aa1729-ef05-41fe-ba25-7728f27e4f37-clipboard.png",
    sourceSha256: "f23c6b7603ac8891696aa3f7719b409109dacdfd8f4bbd0897a36ccf0e120528",
    derivedSha256: "36cc71da1a086a1ba965f85135cbc86c456e032d74dee7cf02d503ec2a7beb8a",
    derivedDimensions: "800x600",
    authorization: "User-supplied for Mirror Marsh choice integration",
  },
  "mirror-marsh-result-step-reflection": {
    sourceFile: "c9d54953-b139-4e00-ad54-2295053de84e-78ce8c8f-4bdb-46a9-b9a4-ae5923fc964c-clipboard.png",
    sourceSha256: "8c04b1538eb6f1ee2f132b96ab4ee6f27d276eceeeb2b742168dc5bc0638baa1",
    derivedSha256: "cc29b74c1eefd009dde8c3cfb379d357c789c1721fe5e68206cb7cc3d6ef9590",
    derivedDimensions: "1536x1024",
    authorization: "User-supplied for Mirror Marsh result integration",
  },
  "mirror-marsh-result-sketch-stars": {
    sourceFile: "52f666df-1af1-4671-86c4-2aef2bc6a4c7-a707eda2-6c3d-42f5-9857-42c5b352d4ea-clipboard.png",
    sourceSha256: "1f70a997bf7e24ca854083d7eea63146b5ffed7f21f633c91a911197e04c2469",
    derivedSha256: "5c828f1eeb6ea824a7278dc48a74bc7568bbf3256eb2a8fac7bda5d661eb4d4c",
    derivedDimensions: "1536x1024",
    authorization: "User-supplied for Mirror Marsh result integration",
  },
  "mirror-marsh-result-wave-back": {
    sourceFile: "c251a539-88dc-40fc-9f40-650477728a1f-3469a028-d46d-418d-90b4-c6e04fbe2d71-clipboard.png",
    sourceSha256: "53f17580427ad13fb4a27a384bdea036792153d87e96beadcaa5c234b4b57eed",
    derivedSha256: "1a196438f099454c2c77011f581191f4430b4e6154c305b07977db89c8c73cdf",
    derivedDimensions: "1536x1024",
    authorization: "User-supplied for Mirror Marsh result integration",
  },
  "mirror-marsh-result-reed-raft": {
    sourceFile: "7fa0b133-5bf9-4e94-a131-7eef31ea5450-29fd5056-6fb6-405e-a297-d99d87719463-clipboard.png",
    sourceSha256: "ddfdeeef04416f560c90e65171babed088c39f5fae5df7cac2d9adb39fe6ee02",
    derivedSha256: "ed3fdeaa4e0b7a31e0c0b5ba674cbb5d81f46925eed34332e5e1ed991139eec3",
    derivedDimensions: "1526x1017",
    authorization: "User-supplied for Mirror Marsh result integration",
  },
  "rain-camp-choice-crowded-table": {
    sourceFile: "c6f63653-3aed-49da-8b52-1f2e24f7efe7-01cbe309-9e77-49e4-8114-8af747284ea7-clipboard.png",
    sourceSha256: "e7d54af792d6fbe4e181a40f655aa097394023f410801f24b654cbedd3cfa635",
    derivedSha256: "74989dd42a4c62d57bd772dbdff3568830a5fcb13a2e42ed4449c5c7d8eacf2a",
    derivedDimensions: "800x600",
    authorization: "User-supplied for Rain Camp choice integration",
  },
  "rain-camp-choice-paint-storm": {
    sourceFile: "2a599151-cf0a-401a-aaf8-bfc3173d0239-a708a265-4f36-4711-910f-1a155e5960f3-clipboard.png",
    sourceSha256: "4a292dd3a821c8a2c2de504ea5f0650feaede00a426c15608af2d0343a6e8036",
    derivedSha256: "ed5a709117995938ec0cf8d9250bf712b19d8750545cc1002aabf7b23f9725f8",
    derivedDimensions: "800x600",
    authorization: "User-supplied for Rain Camp choice integration",
  },
  "rain-camp-choice-sort-supplies": {
    sourceFile: "ec9c5625-4a2e-4ebd-b666-ca272590ed0c-ffcf5cc9-068b-489e-b73d-88c2bd7e94aa-clipboard.png",
    sourceSha256: "0fe6ff3b0909b238999456c5d8e749c9444f7a48ef4c5bcdc77b7f2d772894f9",
    derivedSha256: "8736b1b5ca4c214ae239b01acfb94ff250f633d8b192af79fdb2a54066ff9c7f",
    derivedDimensions: "800x600",
    authorization: "User-supplied for Rain Camp choice integration",
  },
  "rain-camp-choice-rain-walk": {
    sourceFile: "836d8936-4e56-47ac-932d-f0717d964430-85871674-21a1-4d58-b759-312d56cd90fb-clipboard.png",
    sourceSha256: "41f21debea2f5faded886478ab86e9f5848b5b39e6bd0f3caf3a73d927026e80",
    derivedSha256: "09f482eb8f9899c0365c6c1d258a10d82f11ae0ed3cfcea026865c6d4d3b007f",
    derivedDimensions: "800x600",
    authorization: "User-supplied for Rain Camp choice integration",
  },
  "rain-camp-result-crowded-table": {
    sourceFile: "0eadbc8a-a481-4efc-b929-18e8d020681f-0d15eab2-fa5f-4f02-b794-b0e7b0d8d88b-clipboard.png",
    sourceSha256: "b6940ec312d97d61ed167009f0302653d864d9269d631f4a0cf5ad1994d68b70",
    derivedSha256: "3f84256e88fdb0915232857dadaf7ec3fbafcdc5e5af960679fd05c65fcd5261",
    derivedDimensions: "1536x1024",
    authorization: "User-supplied for Rain Camp result integration",
  },
  "rain-camp-result-paint-storm": {
    sourceFile: "71c6cd83-9895-4000-a3bd-20cfab631778-e0a2b53f-4ac3-45d1-974f-fd29abff1791-clipboard.png",
    sourceSha256: "9389645ac74261ab007bbf98dd8e5dcda7851eb029ceed1a3d4e728a6ea42d38",
    derivedSha256: "bffd6a91a16d126f0ae532925295e139161a37fb9965b03549751a892c59b62d",
    derivedDimensions: "1536x1024",
    authorization: "User-supplied for Rain Camp result integration",
  },
  "rain-camp-result-sort-supplies": {
    sourceFile: "89bb95fe-070e-4b7e-838a-cd7f930392fb-c494ba21-cf48-4f52-a978-4cd58cb7e15d-clipboard.png",
    sourceSha256: "f5ab8947cc1697fe2c92837c0e45a3b8b7d5d9399c93346b9c0540b11732b228",
    derivedSha256: "9a6bdaab5f44d0cccb1a9c9841321b6d874bf3b331b38bd2a76e72ebb1e2a9d7",
    derivedDimensions: "1536x1024",
    authorization: "User-supplied for Rain Camp result integration",
  },
  "rain-camp-result-rain-walk": {
    sourceFile: "554df50a-a22d-49fc-83ea-d78dc0a72429-520e4541-6f23-4b9f-9b81-931a72a2c1d0-clipboard.png",
    sourceSha256: "4f0c676c09a12df20f10b35d9a58bb67e575f80cb5aa2e1680fb5e3a3962181e",
    derivedSha256: "245e236f0b629909a836f989f9cd7c0575bc9c239ae27f9aeb58a597ca1a4360",
    derivedDimensions: "1536x1024",
    authorization: "User-supplied for Rain Camp result integration",
  },
  "paper-dragon-choice-fly-with-dragon": {
    sourceFile: "046d28ff-b417-4f46-b5e4-941289c8edb3-548d51ef-5da1-4394-881c-9fccb7c4987a-clipboard.png",
    sourceSha256: "0e744561aeb5169a64391a321f05fc23f23d8ce7b00761d0364c778b508571e8",
    derivedSha256: "66fe467bbdae0ef2b7bc30a8e5ab1643b0535a813433ff04c274cdaadc0096c4",
    derivedDimensions: "800x600",
    authorization: "User-supplied for Kite Hill choice integration",
  },
  "paper-dragon-choice-dragon-riddle": {
    sourceFile: "1c314700-72f4-4c61-86c6-e159463afdd0-bb1da7a8-4862-4e45-8c34-ff1857ec029a-clipboard.png",
    sourceSha256: "6b5d48f1e4da06048358288542f39f29f7203d022214b3d8832f6d74a1dd33aa",
    derivedSha256: "41d640440a78b8edb636fccace6ddfc3f67bc33c7c7a1592a12c123f24aa97b3",
    derivedDimensions: "800x600",
    authorization: "User-supplied for Kite Hill choice integration",
  },
  "paper-dragon-choice-repair-tail": {
    sourceFile: "cbfe92fc-2b55-4c9f-97e2-2da4fdb94f99-7dffe431-3e07-437c-bc5b-6edeb24d77da-clipboard.png",
    sourceSha256: "18c49b0e9549ce2b4662efb1107e5f0533c018dbfd0439c964de98791f54a713",
    derivedSha256: "befc19e91d0cbfe5c699a3520a67f8b915acd529f7e233f0e75e0360b810f53d",
    derivedDimensions: "800x600",
    authorization: "User-supplied for Kite Hill choice integration",
  },
  "paper-dragon-choice-festival-chase": {
    sourceFile: "7510736e-5436-4f52-a99b-4d85b0a9e865-071be2fd-d520-4652-9a14-63cead9c145f-clipboard.png",
    sourceSha256: "8750bf114e853abb523518bccabc67745e7f5ec6c210198c897cef761ebec806",
    derivedSha256: "19e8e6cca1bec009dfe44f7b309a898017353449cce7a04543084aeafcb1dc75",
    derivedDimensions: "800x600",
    authorization: "User-supplied for Kite Hill choice integration",
  },
  "paper-dragon-result-fly-with-dragon": {
    sourceFile: "3f7e4253-7624-479b-92f9-c7abb351130d-3fbafa5c-58df-45f0-9c55-5aaa050dabfc-clipboard.png",
    sourceSha256: "9d131c49c779dde72f0c45fd787295689f88fe3a4457b1f198ca2ac8ba8795de",
    derivedSha256: "18502570f6ca0113f90b8bebe8ec603fced1ef53cd6b3d586273a4ec1c5b8157",
    derivedDimensions: "1536x1024",
    authorization: "User-supplied for Kite Hill result integration",
  },
  "paper-dragon-result-dragon-riddle": {
    sourceFile: "91fbf1be-8e3c-4a5e-8f3a-068c96893141-fc82bd5c-c12b-434c-9dab-88017093d889-clipboard.png",
    sourceSha256: "ae4601b07fbb895f83aa0d1d49e7a39739810ba5b28846d345529b7411ca2dbe",
    derivedSha256: "ebd15e6d67c337343c1ce685353b4227cbae9cee483d2cccbedba19bb94e5b97",
    derivedDimensions: "1536x1024",
    authorization: "User-supplied for Kite Hill result integration",
  },
  "paper-dragon-result-repair-tail": {
    sourceFile: "e6939229-78c7-49cb-ad47-fc7c1bfff0f5-afb5d674-f917-4c8a-aeda-8e77186b3497-clipboard.png",
    sourceSha256: "acbec56ebbe5fbf7f2841fb6703a2655acaf67d5f4927b89c42acf1f57a032f0",
    derivedSha256: "c23045597d85491876a29cc3e8b8cd8c164e477ba3e1433d4cb730e4c873e141",
    derivedDimensions: "1536x1024",
    authorization: "User-supplied for Kite Hill result integration",
  },
  "paper-dragon-result-festival-chase": {
    sourceFile: "b250f8f1-5833-4b36-82be-7ed0f15a711f-ca0a3253-2c22-4711-b04b-44a0b0e0f876-clipboard.png",
    sourceSha256: "2783cfc90f115408c30a78e40adea523baf62874c9cfb9d7688647c2fd799e0c",
    derivedSha256: "98491c328bddeb0a103029f8285fa046446e06966eeab874a8eff708787e3511",
    derivedDimensions: "1533x1022",
    authorization: "User-supplied for Kite Hill result integration",
  },
  "ember-library-choice-forbidden-volume": {
    sourceFile: "bd8d5af0-ff8a-45f3-bd76-a217b2dcaaf1-7d607a7d-ea99-4647-856f-3d263635fc41-clipboard.png",
    sourceSha256: "004bed1b06b3914ed36cfeca6ff90a22b969fc61410f424dff7fd2730731012b",
    derivedSha256: "66dae76c0cf98e14e0fdf08a934573b5b09b6e77df509e36ed5441b746338fb6",
    derivedDimensions: "800x600",
    authorization: "User-supplied for Ember Library choice integration",
  },
  "ember-library-choice-catalog-flames": {
    sourceFile: "50bea801-e2b3-4a1d-904d-7da845f20b89-a6abb8a1-ffc2-413b-aa64-697f4f393fbd-clipboard.png",
    sourceSha256: "205268a257e2c61604fd149785abfa53220fa768e5195804badfbc6d63c4ec8f",
    derivedSha256: "a5e67d5caba9e2e77d4089991fb61adc3e48de742ba62cb042c77570bc5d9638",
    derivedDimensions: "800x600",
    authorization: "User-supplied for Ember Library choice integration",
  },
  "ember-library-choice-listen-book": {
    sourceFile: "625228e9-5a3d-41b0-8560-8222fd93c544-cd1a11fd-811e-46ec-bfec-32a2a7847308-clipboard.png",
    sourceSha256: "985b27a7189536a643dc742b02c819d2158a7502429ea19924275ec9131ea943",
    derivedSha256: "eda2953943a00e1814c88289e376b89690102592b1efa8e43a7308f5b7ac64b8",
    derivedDimensions: "800x600",
    authorization: "User-supplied for Ember Library choice integration",
  },
  "ember-library-choice-fold-fire-bird": {
    sourceFile: "159bc44e-91dd-4e4a-839a-e9866dbade9e-76fe8c19-9389-4168-913b-34c81df9bdb7-clipboard.png",
    sourceSha256: "f68b43e887c0a1cd81328a517d565352f6f8cc2a4787711b7c7b6841b335bd51",
    derivedSha256: "ad90d6edc3a1788e54be0a2f64605c1f9524200561cdf22fd023c8587c141ae1",
    derivedDimensions: "800x600",
    authorization: "User-supplied for Ember Library choice integration",
  },
  "ember-library-result-forbidden-volume": {
    sourceFile: "6f3894fb-117c-464e-80c6-388887e522f5-09a5b7e6-e1d1-4130-a2e1-0d8bffe03a8a-clipboard.png",
    sourceSha256: "77ef3af0c2427081c6d2d194b35cb1ca16e4d7061d74be3ce7d7906141327167",
    derivedSha256: "870a340103d385f2c8dcf00b1e31417318c479baf3773bf39635c9793f340876",
    derivedDimensions: "1452x968",
    authorization: "User-supplied for Ember Library result integration",
  },
  "ember-library-result-catalog-flames": {
    sourceFile: "35443cc7-a2ad-4b66-8252-77a3f6b030bb-01c72927-b23f-43ea-a375-af71c3d02ee4-clipboard.png",
    sourceSha256: "e57170d574067c2a6c890b4d4b6744ab91e855a09b35a164c865f3f373d2a2e5",
    derivedSha256: "94b7949b6a3d1788240446b81030ee2179d5215eeeb6d1899161e45969af08ca",
    derivedDimensions: "1485x990",
    authorization: "User-supplied for Ember Library result integration",
  },
  "ember-library-result-listen-book": {
    sourceFile: "8b8d11d6-5d88-4735-85ea-60a28c8cbc1d-7fc92f2c-ae1d-47cb-a7aa-62ffe6c0f53a-clipboard.png",
    sourceSha256: "5ce080187cc53c580370fd2f912d3f082a23cd6ffdfcee27384cafe158aa1c10",
    derivedSha256: "56574d1901f8f414b2015dfb768c9290c5008c937f816e87e12107d814d6868f",
    derivedDimensions: "1522x1015",
    authorization: "User-supplied for Ember Library result integration",
  },
  "ember-library-result-fold-fire-bird": {
    sourceFile: "ac410c08-97ad-40c5-a19b-0a515c92a41a-19ab6904-3ed4-4ec5-aa9d-2ad627ca0d07-clipboard.png",
    sourceSha256: "515106fae30a140dc830455562f1337ee1fbb0d3b4d358cedbb0a700dd3b5a9f",
    derivedSha256: "784117e58690b0db46ea8510ca94186e26811af2899d595dbc7f79cc80c5b7d0",
    derivedDimensions: "1524x1016",
    authorization: "User-supplied for Ember Library result integration",
  },
  "mirror-marsh-encounter": {
    sourceFile: "50be74da-47fa-49fe-a204-cf1076c80c9c-25a580be-9955-4d46-bcd1-978a2e7fad60-clipboard.png",
    sourceSha256: "2bb05f58ad5eafe013c568c1bd9bf41565cb159f842c8caed99a5003f68dd6b1",
    derivedSha256: "5be524e0902da7ec87b0561cacd6c8f1f73ba5b9f58e4d23ca154373c54115a2",
    derivedDimensions: "1437x958",
    authorization: "User-supplied for PR #306",
  },
  "rain-camp-encounter": {
    sourceFile: "9af4bcb0-68d8-4724-8736-faa412031456-02e1abbf-3f03-4f02-8c0b-b7019fb013c9-clipboard.png",
    sourceSha256: "8972b46edee314463a21dab80b9f95f91487e1e99bc732cb5cc1f356bf18bc4e",
    derivedSha256: "dc15e7d5ea431adb2e43c9a707e2893a3c1d2e8422e84f8d1fb2c36620ee366f",
    derivedDimensions: "1433x955",
    authorization: "User-supplied for PR #306",
  },
  "paper-dragon-encounter": {
    sourceFile: "46e2ab70-c86c-4262-8ea3-a4888b62c6d5-c5fc2e67-4901-4091-85a7-980d427650c1-clipboard.png",
    sourceSha256: "78b042b8c4c00051226c5d8716147eac38b6ae1cbff6dfd44baa6ce3125f0ed5",
    derivedSha256: "16f3a3afbd00bbdc89d415074f35207ba1ea43d9102307fbff46c209fdcb9878",
    derivedDimensions: "1415x943",
    authorization: "User-supplied for PR #306",
  },
  "ember-library-encounter": {
    sourceFile: "b0a8de70-ee09-4689-b17d-bdfc0761a57d-cb090572-9604-483f-bde6-7e6c67648898-clipboard.png",
    sourceSha256: "393eeab390da6677bb066b6a0348802e98a0c0ce71e26ed98447c79adead8f99",
    derivedSha256: "a37ecbed9816430d18a1a087cf45f37c2beb25b8b7e4716cfa4dcd6facd86aeb",
    derivedDimensions: "1462x975",
    authorization: "User-supplied for PR #306",
  },
  "giant-garden-choice-climb-fast": {
    sourceFile: "b6ca4f9c-6957-421f-beea-9a5d80b6036a-ba9440b1-3eb3-488a-99d4-99363f5b932d-clipboard.png",
    sourceSha256: "60c1bed3133cf214f2b30d6556ccb409f8717fa5839f28089f6d2bceb38847fd",
    derivedSha256: "f7aa16566772de5ccc06335e8fe1a7a223dbcb5cd1c5b2bcf7fa25ccd9e4f5fb",
    derivedDimensions: "800x600",
    authorization: "User-supplied for Giant's Garden choice integration",
  },
  "giant-garden-choice-botany-notes": {
    sourceFile: "0618b06c-b53b-4a34-8d03-ead8cdb1c344-9f4c248f-477b-44a5-8514-05f04a20996a-clipboard.png",
    sourceSha256: "ddb8ebd9ccd75b6114b5eb472204aba1334da8e58b9f89da12ab1307b18fd4ba",
    derivedSha256: "6417650bb3ed6577599227736c6dfa1147964f558e2b4065bc396c44d267f9a9",
    derivedDimensions: "800x600",
    authorization: "User-supplied for Giant's Garden choice integration",
  },
  "giant-garden-choice-vine-picnic": {
    sourceFile: "9ed5f82e-7cfb-40fe-94af-c8dffeaf811b-0116b601-52e7-4081-8e0b-f091e19bc381-clipboard.png",
    sourceSha256: "628bc48c01271a45550e5a047d3e502d9cd9327c4da4ad59fffa4cc9137d5a92",
    derivedSha256: "b7386703d9bd6f26491caf93c4275bddd2cbaf4b036f18c29f623ec732101a56",
    derivedDimensions: "800x600",
    authorization: "User-supplied for Giant's Garden choice integration",
  },
  "giant-garden-choice-cloud-shapes": {
    sourceFile: "2115ab19-caae-4976-801c-41ac01e85b70-16011b58-0de7-4277-9c7e-6c9ce3f9fa53-clipboard.png",
    sourceSha256: "e6fb5e383c5b27a27400f0362bf8ba4b7d2a2d86b3044917f330138a5e410194",
    derivedSha256: "28fdb2bf698467b656e5fadf007a8b071f2f43b15e2d0ae33d025071272448c6",
    derivedDimensions: "800x600",
    authorization: "User-supplied for Giant's Garden choice integration",
  },
  "giant-garden-result-climb-fast": {
    sourceFile: "717762a1-637a-48e6-9fb0-5fedda1e2d5a-ef279fb9-8453-48f7-a1b6-1f765f0e2059-clipboard.png",
    sourceSha256: "66f037fcf19246af76930f914f3012c91776fa276f546060685a4d376f296452",
    derivedSha256: "01adbd0017b773c520465d6522cc7a13cec41fe555e83122fd36043164c05b80",
    derivedDimensions: "1439x959",
    authorization: "User-supplied for Giant's Garden result integration",
  },
  "giant-garden-result-botany-notes": {
    sourceFile: "c7f4157c-be59-4613-b1d0-c96cf72b7b34-6b0d6b66-f015-4a6f-9d76-6e8ed3067d8e-clipboard.png",
    sourceSha256: "bf09edd33b8de279f8abd9f2494ba5dda810cd423141a689963a2f5871f3df2f",
    derivedSha256: "fce8d1402952c5c2d791d4e3f03fa179b1f00df2fd35fb0a422ffdd019e6c7da",
    derivedDimensions: "1461x974",
    authorization: "User-supplied for Giant's Garden result integration",
  },
  "giant-garden-result-vine-picnic": {
    sourceFile: "e5865053-98b1-4db0-8afd-6b65187a1c82-9d591455-de7a-4ae4-b481-be8d7989233d-clipboard.png",
    sourceSha256: "edd77cef1dc003b0d309be7d8b6580ff5778d7a34ac5fef3a8c235f437d604d3",
    derivedSha256: "d5550c6f72dc8d5d900d4c7bf24283517c223523585665f1f138e4cb41cb6d7b",
    derivedDimensions: "1482x988",
    authorization: "User-supplied for Giant's Garden result integration",
  },
  "giant-garden-result-cloud-shapes": {
    sourceFile: "77556991-23d7-4ea5-8345-983c73587815-dc41df34-de06-461b-a329-789669fdb75d-clipboard.png",
    sourceSha256: "18f1d54589afa0c7f37e915829df84789935bfdbfd1c9b51df3412132a2222a6",
    derivedSha256: "385ff85b4f6cb87f93689b3f686a10a524423d4330b7f04f07b7993500ff7c18",
    derivedDimensions: "1475x983",
    authorization: "User-supplied for Giant's Garden result integration",
  },
  "giant-garden-encounter": {
    sourceFile: "d6294571-6ee0-46e2-81ee-e0524eefe120-37247589-303a-4b1e-a770-360b980522c1-clipboard.png",
    sourceSha256: "cbc25a399df56665c5ec14d3bdafc56d6b726bc480cb24ce4012ce8436293d62",
    derivedSha256: "8726c896b3247ffff1d404412e797a2ac85cba1acab9b0521e09da825fbe9764",
    derivedDimensions: "1423x949",
    authorization: "User-supplied for PR #306",
  },
  "old-lighthouse-choice-repair-lens": {
    sourceFile: "372d028c-8441-4af8-9895-551163984ae4-4b25b199-9d79-448f-95a2-2c0291ea9eba-clipboard.png",
    sourceSha256: "5e6caf89cb2124a4f6f9b11be942640c415231e327b479c53b892fb53490f70e",
    derivedSha256: "7784b2a0e71164afdaa0ded0f571f752f576219961957542092454638b202b7c",
    derivedDimensions: "800x600",
    authorization: "User-supplied for Old Lighthouse choice integration",
  },
  "old-lighthouse-choice-keeper-journals": {
    sourceFile: "e6e5dae2-48bf-499d-ab0b-274d29534a7a-0bd6f1ac-a8c4-442d-bb95-a8a086412f9a-clipboard.png",
    sourceSha256: "d57b98cd1128fd7503717266712bf81ab12203204b34f8bb39c74b3850f25da3",
    derivedSha256: "7ccbe5f5d45fde7def9de42680d7abd8b32072da33ab89327dbab3e67aee9f9b",
    derivedDimensions: "800x600",
    authorization: "User-supplied for Old Lighthouse choice integration",
  },
  "old-lighthouse-choice-storm-roof": {
    sourceFile: "4d6e6eb6-a9ad-446a-93f8-03f7f52520e6-383217b7-b671-47db-9db3-2ca73809267d-clipboard.png",
    sourceSha256: "4dc5a0764f995346a9fe28ce4accf77ac181561ba5d03de5833ce6986585b048",
    derivedSha256: "dfb57345277836fd3a86d129e8ecb495e5b82ceb4e1e3ec3bc5fcfcc1190d76a",
    derivedDimensions: "800x600",
    authorization: "User-supplied for Old Lighthouse choice integration",
  },
  "old-lighthouse-choice-sea-listen": {
    sourceFile: "7251113f-8679-4b66-8a6f-cf49f9ff8628-433c7755-2349-4e90-9845-a956986f24a1-clipboard.png",
    sourceSha256: "2ec99a24c773b60ac99853fff32e313becadfbe13ffb8a9d6081c4d82d868609",
    derivedSha256: "cc0c9dbde54058a9034b6724089d5e9d5819e3f7f47532e053b66b19c99d04c2",
    derivedDimensions: "800x600",
    authorization: "User-supplied for Old Lighthouse choice integration",
  },
  "old-lighthouse-result-repair-lens": {
    sourceFile: "a36f8a04-2057-4507-8340-103b0bcefc8b-bc1fbd38-0091-4b29-8918-8cdfd3075516-clipboard.png",
    sourceSha256: "55a4a788cdb2bc666fbd97a70ec8bddf8e5336cfdd0ddd55c3eef8c4e8b3c6e1",
    derivedSha256: "bf66fca8bdb86b40140defdfe5c0fbe7ce26fc3f1e7149ac67d284f2c784c760",
    derivedDimensions: "1478x985",
    authorization: "User-supplied for Old Lighthouse result integration",
  },
  "old-lighthouse-result-keeper-journals": {
    sourceFile: "d968ecc1-8427-48f6-a8ec-32bd4ffaf848-62d0a062-9b41-4aed-b53c-ad8a3424e940-clipboard.png",
    sourceSha256: "f34c86950dd1d0ada7b854cf849bc6efbd70cffc84c07377bf9eb9410b53e926",
    derivedSha256: "9b81ae0bc62d593d22f2d74646d2dca31fdbc3d587bce0b3ea8f198d10a83c51",
    derivedDimensions: "1529x1019",
    authorization: "User-supplied for Old Lighthouse result integration",
  },
  "old-lighthouse-result-storm-roof": {
    sourceFile: "c54b1f71-ce6c-4a41-8425-04fabb20108e-6cd53c01-2636-4750-9faf-501f11862090-clipboard.png",
    sourceSha256: "2d7954e00087afeb098b7a09e844436b0c12193002728bec9499bda07aa7cc9c",
    derivedSha256: "5c1c6b911867c83bfd1b16d5605859030b0db5a64db204b1b1b5ff3aab306c2f",
    derivedDimensions: "1494x996",
    authorization: "User-supplied for Old Lighthouse result integration",
  },
  "old-lighthouse-result-sea-listen": {
    sourceFile: "c93acafd-5105-4379-a4cd-196ec80bd169-2f1068fc-77e2-4ec6-b53f-2c324416d8bb-clipboard.png",
    sourceSha256: "081f2566dd36e92ec8c9bc095f1148a1beaadc46cd9f906a4b0f62503335ebe8",
    derivedSha256: "046ed3c1a2a35f89b0403b5d8d8ec58ca737790d78d5f646d783d42be42e7fb4",
    derivedDimensions: "1508x1005",
    authorization: "User-supplied for Old Lighthouse result integration",
  },
  "old-lighthouse-encounter": {
    sourceFile: "fd93d49f-eb70-4549-b0e6-258e38d01765-0e9685d8-3fbe-4032-9d48-7e77e57e8169-clipboard.png",
    sourceSha256: "6987ff68be3bd618d4fee1564a7b95b1838b01fffac205fb2d6c41cb3884656d",
    derivedSha256: "445c48582f033eff5c3e4c0f1d1c96d4f721995d0ba6cb1434f280eeda2578f1",
    derivedDimensions: "1479x986",
    authorization: "User-supplied for PR #306",
  },
  "star-ferry-choice-steer-stars": {
    sourceFile: "8f0075e8-e3cc-4b01-a7b2-7c09de8e5027-3e438ebc-c5fe-4f4a-b3bf-5edde4ca3a02-clipboard.png",
    sourceSha256: "72d0b14b6437328680e4de86e844523b446b16a4f8faeb5e52eaf4c27b571d89",
    derivedSha256: "870f3e4ae25ee68f38e64cba18cf5ea98b5f8783bd434c236a1986103d6a92b5",
    derivedDimensions: "800x600",
    authorization: "User-supplied for Star Ferry choice integration",
  },
  "star-ferry-choice-ferryman-tale": {
    sourceFile: "9e822cc8-eb3e-462e-a3e7-22c737d74d41-162ad75e-2ebc-45ba-9e13-58f936e55074-clipboard.png",
    sourceSha256: "6125310efca5b87c268c925b14d3ec1aca5626df83a0a1d889170dc34840c33d",
    derivedSha256: "8102099ae8771e91f68f60a2d7372c5675a8dd799a1f77ae0a0507d708b70a43",
    derivedDimensions: "800x600",
    authorization: "User-supplied for Star Ferry choice integration",
  },
  "star-ferry-choice-catch-star": {
    sourceFile: "6e504907-d7f0-4989-bbca-befb8f510c06-983b0146-7011-409d-9fb0-565e502728d5-clipboard.png",
    sourceSha256: "a220a9fab8e0f782ce0a73048703b6ee981eddf4d989e3c76bc1e21c45fa25e5",
    derivedSha256: "853e39d32d837e3f179d93ff5f03ddbd8f73bf5c2b6e68c5b4e3e536f07b4d44",
    derivedDimensions: "800x600",
    authorization: "User-supplied for Star Ferry choice integration",
  },
  "star-ferry-choice-deck-dance": {
    sourceFile: "3af365a3-6340-4d7a-bfd4-07872e5f8221-cfbf82e3-4b54-4da1-92b5-f659a5166c1f-clipboard.png",
    sourceSha256: "b8dfa7c1410ead82e9a965d89a38960c008077849d506f54ef6d2f7c8ca83e67",
    derivedSha256: "9b419bf87e51b5e160cc9c831deabb9af469727e39be8a7697c552ef86abbcb7",
    derivedDimensions: "800x600",
    authorization: "User-supplied for Star Ferry choice integration",
  },
  "star-ferry-encounter": {
    sourceFile: "e5d4d34d-5d75-4328-84d3-06a0af2218a9-a6eb876a-74d1-49b0-a946-b3d69f786326-clipboard.png",
    sourceSha256: "7b0ee456626ce512ac1f4dbbf4bf8f4011679d278cfd51806753a465090cd89d",
    derivedSha256: "4de56d8cfbfeea737a481e0430b5d1d04e1aefa19db4cf19f6c7934443b06e93",
    derivedDimensions: "1464x976",
    authorization: "User-supplied for PR #306",
  },
};

export const UNWRITTEN_MAP_SHARED_FRAME_ASSET_IDS: readonly UnwrittenMapLocalAssetId[] =
  UNWRITTEN_MAP_LOCAL_ASSET_IDS.filter((id) => id.startsWith("shared-frame-"));
