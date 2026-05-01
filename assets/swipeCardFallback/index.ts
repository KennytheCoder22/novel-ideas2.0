export const swipeCardFallbackImages = {
  "adult": {
  },
  "k2": {
  },
  "36": {
  },
  "ms_hs": {
  },
} as const;

export function getSwipeCardFallbackImage(deckKey: string, title: string) {
  return (swipeCardFallbackImages as any)?.[deckKey]?.[title] ?? null;
}
