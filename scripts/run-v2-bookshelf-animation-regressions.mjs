/**
 * Regression suite: bookshelf loading animation for recommendation gathering.
 *
 * R1  BookshelfLoadingIndicator file exists and exports the component
 * R2  Component does NOT import Lottie, react-native-reanimated, or any unlisted animation lib
 * R3  Component references the loading prop
 * R4  Loading messages contain no engineering/technical terms
 * R5  Component contains cleanup pattern (timer/animation teardown)
 * R6  SwipeDeckScreen no longer has the bare <ActivityIndicator /> in the recLoading block
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function check(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    return { name, pass: true };
  } catch (err) {
    console.error(`  ✗ ${name}: ${err.message}`);
    return { name, pass: false, error: err.message };
  }
}

// ─── Load source files ───────────────────────────────────────────────────────

const componentPath = resolve(repoRoot, "components", "BookshelfLoadingIndicator.tsx");
const screenPath = resolve(repoRoot, "screens", "SwipeDeckScreen.tsx");

const checks = [];

// R1 – File exists and exports BookshelfLoadingIndicator
checks.push(check("R1_component_file_exists_and_exports", () => {
  assert(existsSync(componentPath), `Component file not found: ${componentPath}`);
  const src = readFileSync(componentPath, "utf8");
  assert(
    src.includes("export function BookshelfLoadingIndicator") ||
    src.includes("export const BookshelfLoadingIndicator"),
    "File does not export BookshelfLoadingIndicator"
  );
}));

// R2 – No forbidden animation library imports
checks.push(check("R2_no_forbidden_animation_libraries", () => {
  const src = readFileSync(componentPath, "utf8");
  const forbidden = [
    "lottie",
    "react-native-reanimated",
    "react-native-gesture-handler/reanimated",
    "moti",
    "framer-motion",
  ];
  for (const lib of forbidden) {
    assert(
      !src.toLowerCase().includes(`from "${lib}"`),
      `Component imports forbidden library: ${lib}`
    );
    assert(
      !src.toLowerCase().includes(`require("${lib}")`),
      `Component requires forbidden library: ${lib}`
    );
  }
}));

// R3 – Component references 'loading' prop
checks.push(check("R3_references_loading_prop", () => {
  const src = readFileSync(componentPath, "utf8");
  assert(
    src.includes("loading") && (
      src.includes("loading: boolean") ||
      src.includes("{ loading }") ||
      src.includes("loading }") ||
      src.includes("props.loading")
    ),
    "Component does not appear to accept or use a 'loading' prop"
  );
}));

// R4 – Loading messages contain no engineering/technical terms
checks.push(check("R4_loading_messages_no_tech_terms", () => {
  const src = readFileSync(componentPath, "utf8");

  // Extract the MESSAGES array content
  const messagesMatch = src.match(/const MESSAGES\s*=\s*\[([^\]]+)\]/s);
  assert(messagesMatch, "Could not find MESSAGES array in component");
  const messagesBlock = messagesMatch[1];

  const banned = ["route", "query", "fetch", "API", "source", "diagnostic"];
  for (const term of banned) {
    assert(
      !messagesBlock.toLowerCase().includes(term.toLowerCase()),
      `Loading message contains banned engineering term: "${term}"`
    );
  }
}));

// R5 – Component has cleanup pattern
checks.push(check("R5_cleanup_pattern_present", () => {
  const src = readFileSync(componentPath, "utf8");
  const hasReturnCleanup = src.includes("return () => {") || src.includes("return () =>");
  const hasStopAnimation = src.includes("stopAnimation") || src.includes("stop()");
  const hasClearTimeout = src.includes("clearTimeout");
  assert(
    hasReturnCleanup && (hasStopAnimation || hasClearTimeout),
    "Component does not appear to clean up timers/animations in useEffect return"
  );
}));

// R6 – SwipeDeckScreen no longer has bare <ActivityIndicator /> in the recLoading block
checks.push(check("R6_swipe_deck_screen_uses_new_component", () => {
  const src = readFileSync(screenPath, "utf8");

  // Locate the recLoading block
  const recLoadingIdx = src.indexOf("{recLoading ? (");
  assert(recLoadingIdx !== -1, "Could not find recLoading ternary in SwipeDeckScreen");

  // Extract ~300 chars of that block
  const block = src.slice(recLoadingIdx, recLoadingIdx + 400);

  assert(
    !block.includes("<ActivityIndicator />"),
    "SwipeDeckScreen still uses bare <ActivityIndicator /> in the recLoading block"
  );
  assert(
    block.includes("BookshelfLoadingIndicator"),
    "SwipeDeckScreen does not use BookshelfLoadingIndicator in the recLoading block"
  );
}));

// ─── Report ───────────────────────────────────────────────────────────────────

const passed = checks.filter((c) => c.pass).length;
const failed = checks.filter((c) => !c.pass).length;

console.log("");
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
