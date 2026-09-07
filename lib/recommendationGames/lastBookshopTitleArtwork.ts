import type { ImageSourcePropType } from "react-native";

export const LAST_BOOKSHOP_TITLE_ARTWORK: ImageSourcePropType = require(
  "../../assets/games/last-bookshop/title-screen.webp",
);

export const LAST_BOOKSHOP_TITLE_ARTWORK_SIZE = {
  width: 1672,
  height: 941,
} as const;

export const LAST_BOOKSHOP_TITLE_BUTTON_BOUNDS = {
  left: 682,
  top: 688,
  width: 310,
  height: 71,
} as const;

export type LastBookshopTitleArtworkLayout = {
  mode: "cinematic" | "mobile";
  stage: { width: number; height: number };
  button: { left: number; top: number; width: number; height: number };
};

export function computeLastBookshopTitleArtworkLayout(
  viewportWidth: number,
  viewportHeight: number,
): LastBookshopTitleArtworkLayout {
  const safeWidth = Math.max(1, viewportWidth);
  const safeHeight = Math.max(1, viewportHeight);
  const aspectRatio = LAST_BOOKSHOP_TITLE_ARTWORK_SIZE.width / LAST_BOOKSHOP_TITLE_ARTWORK_SIZE.height;
  const mode = safeWidth < 700 || safeWidth / safeHeight < 1.15 ? "mobile" : "cinematic";
  const stageWidth = mode === "mobile"
    ? safeWidth
    : Math.min(safeWidth, safeHeight * aspectRatio);
  const stageHeight = stageWidth / aspectRatio;
  const scale = stageWidth / LAST_BOOKSHOP_TITLE_ARTWORK_SIZE.width;
  const rawButton = {
    left: LAST_BOOKSHOP_TITLE_BUTTON_BOUNDS.left * scale,
    top: LAST_BOOKSHOP_TITLE_BUTTON_BOUNDS.top * scale,
    width: LAST_BOOKSHOP_TITLE_BUTTON_BOUNDS.width * scale,
    height: LAST_BOOKSHOP_TITLE_BUTTON_BOUNDS.height * scale,
  };
  const buttonWidth = mode === "mobile"
    ? Math.min(stageWidth - 24, Math.max(rawButton.width, 160))
    : Math.max(rawButton.width, 44);
  const buttonHeight = Math.max(rawButton.height, mode === "mobile" ? 48 : 44);

  return {
    mode,
    stage: { width: stageWidth, height: stageHeight },
    button: {
      left: rawButton.left + rawButton.width / 2 - buttonWidth / 2,
      top: rawButton.top + rawButton.height / 2 - buttonHeight / 2,
      width: buttonWidth,
      height: buttonHeight,
    },
  };
}
