import type { ImageSourcePropType } from "react-native";

export type AlchemistsCascadeAtlasIcon =
  | "sprout"
  | "tree-outline"
  | "weather-rainy"
  | "book-open-page-variant-outline"
  | "waves"
  | "circle-double"
  | "fire"
  | "chili-mild"
  | "volcano"
  | "bowl-mix-outline"
  | "moon-waning-crescent"
  | "flask-outline"
  | "leaf"
  | "star-four-points-outline";

export const ALCHEMISTS_CASCADE_RECIPE_VISUALS: Record<
  string,
  { icon: AlchemistsCascadeAtlasIcon; motif: string }
> = {
  "level-1": { icon: "sprout", motif: "new-growth" },
  "level-2": { icon: "tree-outline", motif: "deep-roots" },
  "level-3": { icon: "weather-rainy", motif: "copper-rain" },
  "level-4": { icon: "book-open-page-variant-outline", motif: "salt-page" },
  "level-5": { icon: "waves", motif: "returning-tide" },
  "level-6": { icon: "circle-double", motif: "luminous-pearl" },
  "level-7": { icon: "fire", motif: "laughing-cinders" },
  "level-8": { icon: "chili-mild", motif: "pepper-comet" },
  "level-9": { icon: "volcano", motif: "grinning-crater" },
  "level-10": { icon: "bowl-mix-outline", motif: "star-soup" },
  "level-11": { icon: "moon-waning-crescent", motif: "midnight-preparation" },
  "level-12": { icon: "flask-outline", motif: "bright-flask" },
};

export const ALCHEMISTS_CASCADE_REALM_VISUALS: Record<
  string,
  { icon: AlchemistsCascadeAtlasIcon; motif: string }
> = {
  "copper-garden": { icon: "leaf", motif: "garden-leaves" },
  "tidal-archive": { icon: "waves", motif: "tidal-wave" },
  "laughing-volcano": { icon: "volcano", motif: "volcanic-ridge" },
  "astral-kitchen": { icon: "star-four-points-outline", motif: "astral-stars" },
};

export const ALCHEMISTS_CASCADE_ATLAS_ARTWORK: ImageSourcePropType = require(
  "../../assets/games/alchemists-cascade/recipe-atlas.webp",
);

export const ALCHEMISTS_CASCADE_ATLAS_ARTWORK_SIZE = {
  width: 1672,
  height: 941,
} as const;

export const ALCHEMISTS_CASCADE_ATLAS_BOUNDS = {
  exit: { left: 29, top: 16, width: 99, height: 59 },
  stars: { left: 1547, top: 16, width: 97, height: 59 },
  realms: {
    "copper-garden": { left: 277, top: 295, width: 552, height: 239 },
    "tidal-archive": { left: 842, top: 295, width: 552, height: 239 },
    "laughing-volcano": { left: 277, top: 546, width: 552, height: 246 },
    "astral-kitchen": { left: 842, top: 546, width: 552, height: 246 },
  },
  notes: { left: 746, top: 791, width: 181, height: 53 },
  sync: { left: 582, top: 850, width: 508, height: 48 },
} as const;

type Bounds = { left: number; top: number; width: number; height: number };

export type AlchemistsCascadeAtlasLayout = {
  mode: "cinematic" | "stacked";
  stage: { width: number; height: number };
  header: { width: number; height: number; imageHeight: number; imageLeft: number };
  exit: Bounds;
  stars: Bounds;
  realms: Record<keyof typeof ALCHEMISTS_CASCADE_ATLAS_BOUNDS.realms, Bounds>;
  notes: Bounds;
  sync: Bounds;
};

function scaleBounds(bounds: Bounds, scale: number): Bounds {
  return {
    left: bounds.left * scale,
    top: bounds.top * scale,
    width: bounds.width * scale,
    height: bounds.height * scale,
  };
}

export function computeAlchemistsCascadeAtlasLayout(
  viewportWidth: number,
  viewportHeight: number,
): AlchemistsCascadeAtlasLayout {
  const safeWidth = Math.max(1, viewportWidth);
  const safeHeight = Math.max(1, viewportHeight);
  const aspectRatio = ALCHEMISTS_CASCADE_ATLAS_ARTWORK_SIZE.width
    / ALCHEMISTS_CASCADE_ATLAS_ARTWORK_SIZE.height;
  const containedWidth = Math.min(safeWidth, safeHeight * aspectRatio);
  const mode = safeWidth >= 1000 && safeWidth / safeHeight >= 1.35
    ? "cinematic"
    : "stacked";
  const stageWidth = mode === "cinematic" ? containedWidth : safeWidth;
  const stageHeight = stageWidth / aspectRatio;
  const scale = stageWidth / ALCHEMISTS_CASCADE_ATLAS_ARTWORK_SIZE.width;
  const headerImageWidth = Math.max(safeWidth, 760);
  const headerImageHeight = headerImageWidth / aspectRatio;

  return {
    mode,
    stage: { width: stageWidth, height: stageHeight },
    header: {
      width: safeWidth,
      height: headerImageHeight * (280 / ALCHEMISTS_CASCADE_ATLAS_ARTWORK_SIZE.height),
      imageHeight: headerImageHeight,
      imageLeft: (safeWidth - headerImageWidth) / 2,
    },
    exit: scaleBounds(ALCHEMISTS_CASCADE_ATLAS_BOUNDS.exit, scale),
    stars: scaleBounds(ALCHEMISTS_CASCADE_ATLAS_BOUNDS.stars, scale),
    realms: {
      "copper-garden": scaleBounds(ALCHEMISTS_CASCADE_ATLAS_BOUNDS.realms["copper-garden"], scale),
      "tidal-archive": scaleBounds(ALCHEMISTS_CASCADE_ATLAS_BOUNDS.realms["tidal-archive"], scale),
      "laughing-volcano": scaleBounds(ALCHEMISTS_CASCADE_ATLAS_BOUNDS.realms["laughing-volcano"], scale),
      "astral-kitchen": scaleBounds(ALCHEMISTS_CASCADE_ATLAS_BOUNDS.realms["astral-kitchen"], scale),
    },
    notes: scaleBounds(ALCHEMISTS_CASCADE_ATLAS_BOUNDS.notes, scale),
    sync: scaleBounds(ALCHEMISTS_CASCADE_ATLAS_BOUNDS.sync, scale),
  };
}
