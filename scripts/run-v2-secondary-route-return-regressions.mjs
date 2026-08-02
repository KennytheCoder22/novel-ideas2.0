import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, "..");

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

function assertIncludes(content, fragment, message) {
  if (!content.includes(fragment)) {
    throw new Error(`FAIL: ${message}\n  Expected to find: ${JSON.stringify(fragment)}`);
  }
}

const headerSource = readFileSync(resolve(ROOT, "components/BackToNovelIdeasHeader.tsx"), "utf8");
const navigationSource = readFileSync(resolve(ROOT, "lib/secondaryRouteNavigation.ts"), "utf8");
const homeSource = readFileSync(resolve(ROOT, "app/(tabs)/index.tsx"), "utf8");
const testingSource = readFileSync(resolve(ROOT, "app/testing.tsx"), "utf8");
const adminSource = readFileSync(resolve(ROOT, "app/app_admin-web.tsx"), "utf8");
const infoRouteSources = [
  ["how-it-works", readFileSync(resolve(ROOT, "app/how-it-works.tsx"), "utf8")],
  ["feedback", readFileSync(resolve(ROOT, "app/feedback.tsx"), "utf8")],
  ["privacy", readFileSync(resolve(ROOT, "app/privacy.tsx"), "utf8")],
  ["about", readFileSync(resolve(ROOT, "app/about.tsx"), "utf8")],
];
const swipeDeckSource = readFileSync(resolve(ROOT, "screens/SwipeDeckScreen.tsx"), "utf8");
const vercelConfig = JSON.parse(readFileSync(resolve(ROOT, "vercel.json"), "utf8"));
const rewrites = Array.isArray(vercelConfig?.rewrites) ? vercelConfig.rewrites : [];
const requiredRoutes = ["/testing", "/app_admin-web", "/how-it-works", "/feedback", "/privacy", "/about"];

{
  assertIncludes(headerSource, "← Back to NovelIdeas", "shared header must render the return control copy");
  assertIncludes(headerSource, 'accessibilityLabel="Back to NovelIdeas"', "shared header must expose a stable accessibility label");
  console.log("PASS R1: shared Back to NovelIdeas header is defined");
}

{
  for (const [routeName, source] of [["testing", testingSource], ["app_admin-web", adminSource], ...infoRouteSources]) {
    assertIncludes(source, "BackToNovelIdeasHeader", `R2: ${routeName} must render the shared return header`);
  }
  console.log("PASS R2: every secondary route renders the shared return header");
}

{
  assertIncludes(navigationSource, 'router.replace("/")', "R3: return helper must route explicitly to /");
  console.log("PASS R3: return helper routes explicitly to /");
}

{
  assertIncludes(homeSource, "queuePendingHomeRestore({ reopenHeaderMenu: true })", "R4: home route must queue menu restoration before opening secondary routes");
  assertIncludes(homeSource, 'setAdminMenuAccess("verified")', "R4: valid PIN unlock must be tracked separately from route visitation");
  assertIncludes(homeSource, "setVerifiedAdminMenuUnlock(true)", "R4: valid PIN unlock must persist separately");
  assertIncludes(homeSource, 'setAdminMenuAccess("temporary")', "R4: non-PIN admin access must remain temporary");
  assertIncludes(homeSource, 'setAdminMenuAccess(hasVerifiedAdminMenuUnlock() ? "verified" : "public")', "R4: returning from admin must restore the public menu unless a valid PIN unlock exists");
  console.log("PASS R4: admin return logic preserves only verified unlock state");
}

{
  assertIncludes(testingSource, "prepareToLeaveTesting", "R5: testing route must consult the testing leave guard");
  assertIncludes(swipeDeckSource, "Return to NovelIdeas? Your evaluation draft has been autosaved", "R5: testing leave guard must explain draft preservation");
  assertIncludes(swipeDeckSource, "buildHumanReviewDraft", "R5: testing leave guard must autosave review drafts before returning home");
  console.log("PASS R5: testing route safely handles in-progress review drafts");
}

{
  for (const route of requiredRoutes) {
    assert(
      rewrites.some((entry) => entry?.source === route && entry?.destination === "/"),
      `R6: vercel.json must rewrite ${route} to / for direct loads and refreshes`
    );
  }
  assert(
    rewrites.some((entry) => entry?.source === "/testing/:path*" && entry?.destination === "/"),
    "R6: vercel.json must preserve nested /testing refresh support"
  );
  console.log("PASS R6: direct secondary-route loads and refreshes remain supported");
}
