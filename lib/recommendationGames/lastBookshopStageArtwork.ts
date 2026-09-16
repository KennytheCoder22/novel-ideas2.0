import type { ImageSourcePropType } from "react-native";

export type LastBookshopStageArtwork =
  | "title"
  | "arrival"
  | "shelves"
  | "counter"
  | "result"
  | "night_complete"
  | "ending";

const TITLE_ARTWORK = require("../../assets/games/last-bookshop/stages/title-environment.webp");
const ARRIVAL_ARTWORK = require("../../assets/games/last-bookshop/stages/arrival-environment.webp");
const SHELVES_ARTWORK = require("../../assets/games/last-bookshop/stages/shelves-environment.webp");
const COUNTER_ARTWORK = require("../../assets/games/last-bookshop/stages/counter-environment.webp");
const RESULT_ARTWORK = require("../../assets/games/last-bookshop/stages/result-environment.webp");

export const LAST_BOOKSHOP_STAGE_ARTWORK: Record<LastBookshopStageArtwork, ImageSourcePropType> = {
  title: TITLE_ARTWORK,
  arrival: ARRIVAL_ARTWORK,
  shelves: SHELVES_ARTWORK,
  counter: COUNTER_ARTWORK,
  result: RESULT_ARTWORK,
  night_complete: RESULT_ARTWORK,
  ending: ARRIVAL_ARTWORK,
};

export const LAST_BOOKSHOP_STAGE_ARTWORK_SIZE = {
  width: 1600,
  height: 900,
} as const;
