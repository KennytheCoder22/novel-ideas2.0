import type { ImageSourcePropType } from "react-native";

export const ALCHEMISTS_CASCADE_RESULT_ARTWORK: ImageSourcePropType = require(
  "../../assets/games/alchemists-cascade/completion-laboratory.webp",
);

export const ALCHEMISTS_CASCADE_RESULT_ARTWORK_SIZE = {
  width: 1672,
  height: 941,
} as const;

export const ALCHEMISTS_CASCADE_RESULT_DYNAMIC_BOUNDS = {
  stars: { left: 495, top: 90, width: 690, height: 165 },
  parchment: { left: 495, top: 245, width: 690, height: 570 },
} as const;

type Bounds = { left: number; top: number; width: number; height: number };

export type AlchemistsCascadeResultLayout = {
  mode: "cinematic" | "stacked";
  stage: { width: number; height: number };
  stars: Bounds;
  parchment: Bounds;
  header: {
    width: number;
    height: number;
    imageWidth: number;
    imageHeight: number;
    imageLeft: number;
  };
};

export function alchemistsCascadeResultStarStates(stars: number): boolean[] {
  const earnedStars = Math.max(0, Math.min(3, Math.floor(stars)));
  return Array.from({ length: 3 }, (_, index) => index < earnedStars);
}

function scaleBounds(bounds: Bounds, scale: number): Bounds {
  return {
    left: bounds.left * scale,
    top: bounds.top * scale,
    width: bounds.width * scale,
    height: bounds.height * scale,
  };
}

export function computeAlchemistsCascadeResultLayout(
  viewportWidth: number,
  viewportHeight: number,
): AlchemistsCascadeResultLayout {
  const safeWidth = Math.max(1, viewportWidth);
  const safeHeight = Math.max(1, viewportHeight);
  const aspectRatio = ALCHEMISTS_CASCADE_RESULT_ARTWORK_SIZE.width
    / ALCHEMISTS_CASCADE_RESULT_ARTWORK_SIZE.height;
  const containedWidth = Math.min(safeWidth, safeHeight * aspectRatio);
  const mode = safeWidth >= 900 && safeHeight >= 600 && safeWidth / safeHeight >= 1.35
    ? "cinematic"
    : "stacked";
  const stageWidth = mode === "cinematic" ? containedWidth : safeWidth;
  const stageHeight = stageWidth / aspectRatio;
  const scale = stageWidth / ALCHEMISTS_CASCADE_RESULT_ARTWORK_SIZE.width;
  const headerHeight = Math.min(mode === "stacked" && safeHeight < 500 ? 150 : 220, safeHeight * 0.3);
  const headerImageWidth = safeWidth * 3.1;

  return {
    mode,
    stage: { width: stageWidth, height: stageHeight },
    stars: scaleBounds(ALCHEMISTS_CASCADE_RESULT_DYNAMIC_BOUNDS.stars, scale),
    parchment: scaleBounds(ALCHEMISTS_CASCADE_RESULT_DYNAMIC_BOUNDS.parchment, scale),
    header: {
      width: safeWidth,
      height: headerHeight,
      imageWidth: headerImageWidth,
      imageHeight: headerImageWidth / aspectRatio,
      imageLeft: safeWidth - headerImageWidth,
    },
  };
}
