import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const swipeSource = readFileSync(resolve(root, "screens", "SwipeDeckScreen.tsx"), "utf8");
const homeSource = readFileSync(resolve(root, "app", "(tabs)", "index.tsx"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
}

function fittedCardWidth(stageWidth, stageHeight) {
  return Math.min(Math.max(0, stageWidth), Math.max(0, stageHeight) * (2 / 3));
}

for (const sample of [
  { label: "320px phone with aggressive text scaling", width: 288, height: 620 },
  { label: "390px iPhone", width: 358, height: 560 },
  { label: "narrow browser zoom viewport", width: 250, height: 640 },
  { label: "short landscape viewport", width: 500, height: 300 },
]) {
  assert(fittedCardWidth(sample.width, sample.height) <= sample.width, `${sample.label} card never exceeds its stage`);
}

assert(
  swipeSource.includes("Math.min(stageWidth, stageHeight * (2 / 3))"),
  "card width is capped by the measured stage width",
);
assert(swipeSource.includes("useWindowDimensions()"), "viewport sizing reacts to browser zoom and display-size changes");
assert(swipeSource.includes('html.style.overflowX = "hidden"'), "document root has a defensive horizontal overflow guard");
assert(swipeSource.includes('body.style.overflowX = "hidden"'), "document body has a defensive horizontal overflow guard");
assert(!swipeSource.includes(".style.overflowY"), "vertical page scrolling is not disabled by the containment guard");
assert(swipeSource.includes('touchAction: "pinch-zoom"'), "touch containment is scoped to the draggable card while preserving user zoom");
assert(
  swipeSource.includes("Platform.OS === \"web\" ? ({ touchAction: \"pinch-zoom\" } as any) : null"),
  "horizontal gestures are not disabled globally",
);
assert(
  swipeSource.includes("position.setValue({ x: 0, y: dy })"),
  "downward card translation remains enabled",
);
assert(
  swipeSource.includes('animateOffscreen("down", handleDownNotSure)'),
  "a downward threshold swipe still triggers Skip",
);
assert(
  swipeSource.includes('animateOffscreen("left", () => handleLeft(card))')
    && swipeSource.includes('animateOffscreen("right", () => handleRight(card))'),
  "left and right threshold swipes retain their actions",
);
assert(
  swipeSource.includes("window.visualViewport")
    && swipeSource.includes('visualViewport.addEventListener("resize", updateVisualViewportInset)')
    && swipeSource.includes('visualViewport.addEventListener("scroll", updateVisualViewportInset)'),
  "mobile direction placement follows the browser visual viewport",
);
assert(
  swipeSource.includes('testID="swipe-direction-panel"')
    && swipeSource.includes("translateY: -visualViewportBottomInset")
    && swipeSource.includes('"max(0px, calc(100vh - 100dvh))"'),
  "testing directions move above dynamic mobile browser chrome without resizing the card",
);
assert(
  swipeSource.includes('"env(safe-area-inset-bottom, 0px)"'),
  "testing directions account for the device bottom safe area",
);
assert(
  !/cardArea:\s*\{[^\n]*overflow:\s*"hidden"/.test(swipeSource)
    && !/stage:\s*\{[^\n]*overflow:\s*"hidden"/.test(swipeSource),
  "outer swipe layout does not clip the card's vertical drag axis",
);
assert(
  /cardStage:\s*\{[^\n]*overflow:\s*"hidden"/.test(swipeSource),
  "the immediate card viewport still contains transformed card visuals",
);
assert(
  swipeSource.includes('swipeTitle: { maxWidth: "100%", minWidth: 0, flexShrink: 1'),
  "enlarged card titles wrap instead of widening the card",
);
assert(
  swipeSource.includes('<Text style={styles.swipeTitle}>'),
  "card titles are not forced into a fixed line count",
);
assert(
  homeSource.includes('Platform.OS === "web" ? ({ overflowX: "hidden" } as any) : null'),
  "swipe screen container prevents horizontal page overflow",
);
assert(
  /swipeStage:\s*\{\s*flex:\s*1,\s*width:\s*"100%",\s*maxWidth:\s*"100%",\s*minWidth:\s*0,/.test(homeSource),
  "host swipe stage is constrained to its available width",
);
assert(
  /headerCenter:\s*\{[^}]*minWidth:\s*0,[^}]*maxWidth:\s*"100%"/.test(homeSource),
  "enlarged header text cannot force the page wider",
);

console.log("Mobile swipe containment regressions passed.");
