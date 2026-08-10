export const swipeCardFallbackImages = {
  "adult": {
  },
  "k2": {
  },
  "36": {
    "5-Minute Crafts Kids": require("./images/36__5-minute-crafts-kids.png"),
    "DuckTales": require("./images/36__ducktales.png"),
    "LEGO Ninjago": require("./images/36__lego-ninjago.png"),
    "Nat Geo Kids": require("./images/36__nat-geo-kids.png"),
  },
  "ms_hs": {
  },
} as const;

export function getSwipeCardFallbackImage(deckKey: string, title: string) {
  return (swipeCardFallbackImages as any)?.[deckKey]?.[title] ?? null;
}
