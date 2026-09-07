import type { ImageSourcePropType } from "react-native";

export const ALCHEMISTS_CASCADE_GAMEPLAY_ARTWORK: ImageSourcePropType = require(
  "../../assets/games/alchemists-cascade/gameplay-laboratory.webp",
);

export const ALCHEMISTS_CASCADE_GAMEPLAY_MOBILE_ARTWORK: ImageSourcePropType = require(
  "../../assets/games/alchemists-cascade/gameplay-laboratory-mobile.webp",
);

export const ALCHEMISTS_CASCADE_GAMEPLAY_ARTWORK_SIZE = {
  width: 1312,
  height: 1199,
} as const;

export const ALCHEMISTS_CASCADE_GAMEPLAY_BOUNDS = {
  pause: { left: 19, top: 17, width: 160, height: 75 },
  help: { left: 1134, top: 17, width: 144, height: 75 },
  title: { left: 328, top: 48, width: 656, height: 108 },
  status: { left: 365, top: 164, width: 582, height: 111 },
  goals: { left: 357, top: 282, width: 598, height: 76 },
  board: { left: 343, top: 355, width: 626, height: 626 },
  instruction: { left: 330, top: 986, width: 652, height: 53 },
  sync: { left: 472, top: 1052, width: 418, height: 68 },
} as const;

type Bounds = { left: number; top: number; width: number; height: number };

export type AlchemistsCascadeGameplayLayout = {
  mode: "cinematic" | "stacked";
  stage: { width: number; height: number };
  pause: Bounds;
  help: Bounds;
  title: Bounds;
  status: Bounds;
  goals: Bounds;
  board: Bounds;
  instruction: Bounds;
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

export function computeAlchemistsCascadeGameplayLayout(
  viewportWidth: number,
  viewportHeight: number,
): AlchemistsCascadeGameplayLayout {
  const safeWidth = Math.max(1, viewportWidth);
  const safeHeight = Math.max(1, viewportHeight);
  const aspectRatio = ALCHEMISTS_CASCADE_GAMEPLAY_ARTWORK_SIZE.width
    / ALCHEMISTS_CASCADE_GAMEPLAY_ARTWORK_SIZE.height;
  const containedWidth = Math.min(safeWidth, safeHeight * aspectRatio);
  const mode = safeWidth >= 900 && safeHeight >= 650 ? "cinematic" : "stacked";
  const stageWidth = mode === "cinematic" ? containedWidth : safeWidth;
  const scale = stageWidth / ALCHEMISTS_CASCADE_GAMEPLAY_ARTWORK_SIZE.width;

  return {
    mode,
    stage: { width: stageWidth, height: stageWidth / aspectRatio },
    pause: scaleBounds(ALCHEMISTS_CASCADE_GAMEPLAY_BOUNDS.pause, scale),
    help: scaleBounds(ALCHEMISTS_CASCADE_GAMEPLAY_BOUNDS.help, scale),
    title: scaleBounds(ALCHEMISTS_CASCADE_GAMEPLAY_BOUNDS.title, scale),
    status: scaleBounds(ALCHEMISTS_CASCADE_GAMEPLAY_BOUNDS.status, scale),
    goals: scaleBounds(ALCHEMISTS_CASCADE_GAMEPLAY_BOUNDS.goals, scale),
    board: scaleBounds(ALCHEMISTS_CASCADE_GAMEPLAY_BOUNDS.board, scale),
    instruction: scaleBounds(ALCHEMISTS_CASCADE_GAMEPLAY_BOUNDS.instruction, scale),
    sync: scaleBounds(ALCHEMISTS_CASCADE_GAMEPLAY_BOUNDS.sync, scale),
  };
}
