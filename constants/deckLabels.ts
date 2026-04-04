// constants/deckLabels.ts
// Single source of truth for deck display labels across the app.
//
// NOTE: Deck keys are stable identifiers used by config + deck modules.
// Display labels are UI-facing and should ONLY be defined here.

export type DeckKey = "k2" | "36" | "ms_hs" | "adult";

export function getDeckLabel(
  key: DeckKey,
  opts?: { compact?: boolean }
): string {
  // We intentionally ignore compact for now so all platforms stay consistent.
  // If you ever want different compact labels, implement it HERE only.
  switch (key) {
    case "k2":
      return "Kids";
    case "36":
      return "Pre-Teens";
    case "ms_hs":
      return "Teens";
    case "adult":
      return "Adults";
    default:
      // Exhaustive safety; should never hit.
      return String(key);
  }
}
