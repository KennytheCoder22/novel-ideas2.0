import { cardIdentityKey } from "../screens/swipe/adaptiveCardQueue";

/**
 * Local swipe-card artwork map.
 *
 * Key format should match `cardIdentityKey(card)`.
 * Add entries like:
 *   "the expanse::prime video": require("../assets/swipe-cards/the-expanse.jpg")
 */
export const SWIPE_CARD_LOCAL_IMAGE_MAP: Record<string, any> = {};

export function localSwipeImageForCard(card: any): any | null {
  if (!card) return null;
  const key = cardIdentityKey(card);
  return SWIPE_CARD_LOCAL_IMAGE_MAP[key] || null;
}

