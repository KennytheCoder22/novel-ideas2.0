import type { ImageSourcePropType } from "react-native";
import {
  LAST_BOOKSHOP_CUSTOMER_IDS,
  type LastBookshopCustomerId,
} from "./lastBookshop";

export const LAST_BOOKSHOP_PORTRAIT_ASSETS = {
  mara: require("../../assets/games/last-bookshop/patrons/mara-venn.webp"),
  orin: require("../../assets/games/last-bookshop/patrons/orin-bell.webp"),
  kit: require("../../assets/games/last-bookshop/patrons/kit-wren.webp"),
  elsie: require("../../assets/games/last-bookshop/patrons/elsie-thorn.webp"),
  bram: require("../../assets/games/last-bookshop/patrons/bram-hearth.webp"),
} satisfies Record<LastBookshopCustomerId, ImageSourcePropType>;

export function lastBookshopPortraitForCustomer(customerId: string): ImageSourcePropType | null {
  if (!(LAST_BOOKSHOP_CUSTOMER_IDS as readonly string[]).includes(customerId)) return null;
  return LAST_BOOKSHOP_PORTRAIT_ASSETS[customerId as LastBookshopCustomerId];
}
