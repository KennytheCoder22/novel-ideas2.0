/**
 * Menu navigation destination regressions.
 *
 * Verifies that every visible header overflow menu item has a real destination
 * and that no dead stubs remain. Covers both public and admin-only sections.
 *
 * Tests:
 *   NM1  — showMenuInfoStub is removed (no "Coming soon" stubs in the menu)
 *   NM2  — How to Use NovelIdeas routes to the combined /how-it-works page
 *   NM3  — Send Feedback routes to /feedback (openInfoScreen call)
 *   NM4  — Privacy routes to /privacy (openInfoScreen call)
 *   NM5  — About routes to /about (openInfoScreen call)
 *   NM6  — Admin items without destinations are hidden, not rendered as stubs
 *   NM7  — Info screen files exist for each public destination
 *   NM8  — Each info screen has a router.back() close affordance
 *   NM9  — app/_layout.tsx registers all four info screens
 *   NM10 — vercel.json includes SPA rewrites for all four info routes
 *   NM11 — feedback.tsx contains a real mailto: link
 *   NM12 — privacy.tsx mentions anonymous reviewer IDs, local drafts, and durable storage
 *   NM13 — how-it-works.tsx covers swiping, recommendations, and Human Review
 *   NM14 — openInfoScreen helper closes the menu before routing
 *   NM15 — No admin stub TouchableOpacity items remain in the admin section of renderHeaderMenu
 *   NM16 — Tip Developer opens the developer's Venmo profile
 *   NM17 — Combined How to Use page embeds the bundled tutorial above the explanatory text
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, "..");

function assert(condition, msg) {
  if (!condition) throw new Error(`FAIL: ${msg}`);
}
function assertIncludes(content, fragment, msg) {
  if (!content.includes(fragment)) {
    throw new Error(`FAIL: ${msg}\n  Expected to find: ${JSON.stringify(fragment)}`);
  }
}
function assertNotIncludes(content, fragment, msg) {
  if (content.includes(fragment)) {
    throw new Error(`FAIL: ${msg}\n  Expected NOT to find: ${JSON.stringify(fragment)}`);
  }
}

const indexSource = readFileSync(resolve(ROOT, "app/(tabs)/index.tsx"), "utf8");
const layoutSource = readFileSync(resolve(ROOT, "app/_layout.tsx"), "utf8");
const vercelConfig = JSON.parse(readFileSync(resolve(ROOT, "vercel.json"), "utf8"));

// Slice out only the renderHeaderMenu function body for targeted checks.
const menuFnStart = indexSource.indexOf("function renderHeaderMenu()");
const menuFnEnd = indexSource.indexOf("\n  function ", menuFnStart + 1);
const menuFnSource = menuFnStart >= 0 && menuFnEnd > menuFnStart
  ? indexSource.slice(menuFnStart, menuFnEnd)
  : indexSource; // fallback: whole file

// Slice the admin items section (inside showAdminMenuItems conditional).
const adminSectionStart = menuFnSource.indexOf("{showAdminMenuItems ? (");
const adminSectionEnd = menuFnSource.indexOf(") : null}", adminSectionStart);
const adminSectionSource =
  adminSectionStart >= 0 && adminSectionEnd > adminSectionStart
    ? menuFnSource.slice(adminSectionStart, adminSectionEnd)
    : "";

// NM1: showMenuInfoStub is gone from the whole file.
{
  assertNotIncludes(indexSource, "showMenuInfoStub", "NM1: showMenuInfoStub must be removed — no dead stubs allowed in the menu");
  assertNotIncludes(indexSource, "Coming soon.", "NM1: 'Coming soon.' text must not appear in the menu (stub pattern)");
  console.log("PASS NM1: showMenuInfoStub removed — no dead stubs");
}

// NM2: How to Use NovelIdeas routes to the combined /how-it-works page.
{
  assertIncludes(menuFnSource, 'openInfoScreen("/how-it-works")', "NM2: How to Use NovelIdeas must call openInfoScreen('/how-it-works')");
  assertIncludes(menuFnSource, "How to Use NovelIdeas", "NM2: How to Use NovelIdeas must appear in menu");
  assertNotIncludes(menuFnSource, ">How NovelIdeas Works</Text>", "NM2: duplicate How NovelIdeas Works menu item must be removed");
  console.log("PASS NM2: How to Use NovelIdeas routes to the combined page");
}

// NM3: Send Feedback routes to /feedback.
{
  assertIncludes(menuFnSource, 'openInfoScreen("/feedback")', "NM3: Send Feedback must call openInfoScreen('/feedback')");
  assertIncludes(menuFnSource, "Send Feedback", "NM3: Send Feedback must still appear in menu");
  console.log("PASS NM3: Send Feedback routes to /feedback");
}

// NM4: Privacy routes to /privacy.
{
  assertIncludes(menuFnSource, 'openInfoScreen("/privacy")', "NM4: Privacy must call openInfoScreen('/privacy')");
  assertIncludes(menuFnSource, "Privacy", "NM4: Privacy must still appear in menu");
  console.log("PASS NM4: Privacy routes to /privacy");
}

// NM5: About routes to /about.
{
  assertIncludes(menuFnSource, 'openInfoScreen("/about")', "NM5: About must call openInfoScreen('/about')");
  assertIncludes(menuFnSource, "About", "NM5: About must still appear in menu");
  console.log("PASS NM5: About routes to /about");
}

// NM16: Tip Developer closes the menu and opens the developer's Venmo profile.
{
  assertIncludes(indexSource, 'Linking.openURL("https://venmo.com/u/ken-bragg")', "NM16: Tip Developer must open @ken-bragg on Venmo");
  assertIncludes(indexSource, "function openDeveloperTip()", "NM16: Tip Developer handler must exist");
  assertIncludes(indexSource, "closeHeaderMenu();", "NM16: external-link handlers must close the menu");
  assertIncludes(menuFnSource, "onPress={openDeveloperTip}", "NM16: Tip Developer menu item must use its external-link handler");
  assertIncludes(menuFnSource, "Tip Developer", "NM16: Tip Developer must appear in the menu");
  console.log("PASS NM16: Tip Developer opens @ken-bragg on Venmo");
}

// NM17: Combined page embeds the tutorial above the explanatory text.
{
  const tutorialPath = resolve(ROOT, "public/how-to-use-novelideas.mp4");
  const howToSource = readFileSync(resolve(ROOT, "app/how-it-works.tsx"), "utf8");
  assert(existsSync(tutorialPath), "NM17: tutorial video must be included in public assets");
  assert(readFileSync(tutorialPath).byteLength > 0, "NM17: tutorial video must not be empty");
  assertIncludes(howToSource, 'React.createElement("video"', "NM17: web page must embed a video player");
  assertIncludes(howToSource, 'src: "/how-to-use-novelideas.mp4"', "NM17: video player must use the bundled tutorial");
  assertIncludes(howToSource, "<TutorialVideo />", "NM17: tutorial video must render in the page body");
  assertIncludes(howToSource, ">How NovelIdeas Works</Text>", "NM17: explanatory text heading must remain beneath the video");
  assert(
    howToSource.indexOf("<TutorialVideo />") < howToSource.indexOf(">How NovelIdeas Works</Text>"),
    "NM17: tutorial video must appear above How NovelIdeas Works text",
  );
  assertNotIncludes(indexSource, "openNovelIdeasTutorial", "NM17: duplicate external tutorial handler must be removed");
  console.log("PASS NM17: combined page embeds video above How NovelIdeas Works text");
}

// NM6: Admin items are hidden — no TouchableOpacity wiring to stub calls in admin section.
{
  assertNotIncludes(adminSectionSource, 'onPress={() => showMenuInfoStub(', "NM6: admin section must not contain showMenuInfoStub calls");
  assertNotIncludes(menuFnSource, "Human Review Dashboard", "NM6: owner analytics must not appear in normal menus");
  console.log("PASS NM6: owner analytics and unfinished admin items are not rendered");
}

// NM7: Info screen files exist.
{
  const screens = ["how-it-works", "feedback", "privacy", "about"];
  for (const s of screens) {
    const path = resolve(ROOT, `app/${s}.tsx`);
    assert(existsSync(path), `NM7: app/${s}.tsx must exist`);
  }
  console.log("PASS NM7: all four info screen files exist");
}

// NM8: Each info screen has router.back() close affordance.
{
  const screens = ["how-it-works", "feedback", "privacy", "about"];
  for (const s of screens) {
    const src = readFileSync(resolve(ROOT, `app/${s}.tsx`), "utf8");
    assertIncludes(src, "router.back()", `NM8: app/${s}.tsx must call router.back() for close`);
  }
  console.log("PASS NM8: all info screens have a close (router.back()) affordance");
}

// NM9: app/_layout.tsx registers all four info screens.
{
  const infoScreens = ["how-it-works", "feedback", "privacy", "about"];
  for (const s of infoScreens) {
    assertIncludes(layoutSource, `name="${s}"`, `NM9: app/_layout.tsx must register Stack.Screen name="${s}"`);
    assertIncludes(layoutSource, `"${s}"`, `NM9: app/_layout.tsx must include "${s}" screen config`);
  }
  console.log("PASS NM9: _layout.tsx registers all four info screens");
}

// NM10: vercel.json includes SPA rewrites for all four info routes.
{
  const rewrites = vercelConfig?.rewrites || [];
  const sources = rewrites.map((r) => r.source);
  for (const route of ["/how-it-works", "/feedback", "/privacy", "/about"]) {
    assert(sources.includes(route), `NM10: vercel.json must include a rewrite for "${route}"`);
    const entry = rewrites.find((r) => r.source === route);
    assert(entry?.destination === "/", `NM10: rewrite for "${route}" must point to destination "/"`);
  }
  console.log("PASS NM10: vercel.json includes SPA rewrites for all four info routes");
}

// NM11: feedback.tsx contains a real mailto: link.
{
  const feedbackSrc = readFileSync(resolve(ROOT, "app/feedback.tsx"), "utf8");
  assertIncludes(feedbackSrc, "mailto:", "NM11: feedback.tsx must include a mailto: link");
  assertIncludes(feedbackSrc, "Linking.openURL", "NM11: feedback.tsx must use Linking.openURL to open the mailto link");
  console.log("PASS NM11: feedback.tsx has a working mailto: link");
}

// NM12: privacy.tsx mentions the key privacy topics.
{
  const privacySrc = readFileSync(resolve(ROOT, "app/privacy.tsx"), "utf8");
  assertIncludes(privacySrc, "anonymous", "NM12: privacy.tsx must mention anonymous reviewer IDs");
  assertIncludes(privacySrc, "local", "NM12: privacy.tsx must mention local drafts");
  assertIncludes(privacySrc, "durable", "NM12: privacy.tsx must mention durable review storage");
  assertNotIncludes(privacySrc, "Coming soon", "NM12: privacy.tsx must not be a stub");
  console.log("PASS NM12: privacy.tsx covers required topics");
}

// NM13: how-it-works.tsx covers the three required topics.
{
  const howSrc = readFileSync(resolve(ROOT, "app/how-it-works.tsx"), "utf8");
  assertIncludes(howSrc, "wipe", "NM13: how-it-works.tsx must explain swiping");
  assertIncludes(howSrc, "ecommend", "NM13: how-it-works.tsx must mention recommendation generation");
  assertIncludes(howSrc, "Human Review", "NM13: how-it-works.tsx must mention optional anonymous Human Review");
  console.log("PASS NM13: how-it-works.tsx covers swiping, recommendations, and Human Review");
}

// NM14: openInfoScreen helper closes the menu before routing.
{
  const helperStart = indexSource.indexOf("function openInfoScreen(");
  const helperEnd = indexSource.indexOf("\n  function ", helperStart + 1);
  const helperSource = helperStart >= 0 && helperEnd > helperStart
    ? indexSource.slice(helperStart, helperEnd)
    : "";
  assertIncludes(helperSource, "closeHeaderMenu();", "NM14: openInfoScreen must call closeHeaderMenu() before routing");
  assertIncludes(helperSource, "router.push(", "NM14: openInfoScreen must call router.push to navigate");
  console.log("PASS NM14: openInfoScreen closes menu before routing");
}

// NM15: No admin stub TouchableOpacity items in renderHeaderMenu admin section.
{
  // Count live (non-comment) TouchableOpacity elements inside the admin section.
  // We do this by removing comment lines then checking for TouchableOpacity.
  const commentStripped = adminSectionSource.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\/.*$/gm, "");
  assertNotIncludes(commentStripped, "<TouchableOpacity", "NM15: admin section must not render any live TouchableOpacity items until real destinations exist");
  console.log("PASS NM15: no live TouchableOpacity items in admin section (all hidden)");
}

console.log("\nAll menu-nav destination regressions passed (15/15).");
