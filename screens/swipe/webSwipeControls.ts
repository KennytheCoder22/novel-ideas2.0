export const FINE_HOVER_POINTER_QUERY = "(pointer: fine) and (hover: hover)";

type SwipeControlModeInput = {
  platform: string;
  isSmallScreen: boolean;
  hasFineHoverPointer: boolean | null;
};

/**
 * Web input capability decides the controls, while native keeps its existing
 * viewport-based behavior. A null web capability is only possible during SSR
 * or in browsers without matchMedia, where the previous layout fallback is
 * retained.
 */
export function shouldShowDesktopSwipeControls({
  platform,
  isSmallScreen,
  hasFineHoverPointer,
}: SwipeControlModeInput): boolean {
  if (platform === "web" && hasFineHoverPointer !== null) {
    return hasFineHoverPointer;
  }

  return !isSmallScreen;
}
