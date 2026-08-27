import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, "..");

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

function assertIncludes(content, fragment, message) {
  assert(content.includes(fragment), `${message}\n  Missing: ${JSON.stringify(fragment)}`);
}

const dashboardRoutePath = resolve(ROOT, "app", "admin", "human-review.tsx");
const dashboardApiPath = resolve(ROOT, "api", "human-review-dashboard.ts");
const dashboardLibPath = resolve(ROOT, "lib", "humanReview", "dashboard.ts");
const dashboardPreviewFixturePath = resolve(ROOT, "lib", "humanReview", "dashboardPreviewAcceptanceFixture.ts");
const ownerAuthPath = resolve(ROOT, "lib", "ownerAnalyticsAuth.ts");
const ownerSessionApiPath = resolve(ROOT, "api", "owner-analytics-session.ts");
const previewAcceptanceHarnessPath = resolve(ROOT, "lib", "previewAcceptanceHarness.ts");
const layoutPath = resolve(ROOT, "app", "_layout.tsx");
const homePath = resolve(ROOT, "app", "(tabs)", "index.tsx");
const adminWebPath = resolve(ROOT, "app", "app_admin-web.tsx");

const dashboardRoute = existsSync(dashboardRoutePath) ? readFileSync(dashboardRoutePath, "utf8") : "";
const dashboardApi = existsSync(dashboardApiPath) ? readFileSync(dashboardApiPath, "utf8") : "";
const dashboardLib = existsSync(dashboardLibPath) ? readFileSync(dashboardLibPath, "utf8") : "";
const dashboardPreviewFixture = existsSync(dashboardPreviewFixturePath) ? readFileSync(dashboardPreviewFixturePath, "utf8") : "";
const ownerAuth = existsSync(ownerAuthPath) ? readFileSync(ownerAuthPath, "utf8") : "";
const ownerSessionApi = existsSync(ownerSessionApiPath) ? readFileSync(ownerSessionApiPath, "utf8") : "";
const previewAcceptanceHarness = existsSync(previewAcceptanceHarnessPath) ? readFileSync(previewAcceptanceHarnessPath, "utf8") : "";
const layoutSource = readFileSync(layoutPath, "utf8");
const homeSource = readFileSync(homePath, "utf8");
const adminWebSource = readFileSync(adminWebPath, "utf8");

assert(dashboardRoute.length > 0, "D1: admin/human-review route file exists");
console.log("PASS D1: dashboard route file exists");

assertIncludes(dashboardRoute, "export default function HumanReviewDashboardRoute", "D2: dashboard route exports default component");
assertIncludes(dashboardRoute, 'fetch(`/api/human-review-dashboard', "D2: dashboard route fetches dashboard API");
assertIncludes(dashboardRoute, "Owner Analytics", "D2: dashboard route exposes owner authentication");
assertIncludes(dashboardRoute, "/api/owner-analytics-session", "D2: dashboard route checks the owner session API");
assertIncludes(dashboardRoute, "NovelIdeas Home", "D2: dashboard route exposes path back to main UI");
console.log("PASS D2: dashboard route exports and uses dashboard API with navigation controls");

assertIncludes(layoutSource, 'name="admin/human-review"', "D3: root layout registers admin/human-review route");
console.log("PASS D3: app/_layout.tsx registers admin/human-review");

assertIncludes(ownerAuth, "OWNER_ANALYTICS_PASSWORD", "D4: owner auth reads an environment-backed credential");
assertIncludes(ownerAuth, "OWNER_ANALYTICS_SESSION_SECRET", "D4: owner auth signs sessions with a separate environment secret");
assertIncludes(ownerAuth, "timingSafeEqual", "D4: owner credential and signatures use timing-safe comparison");
assertIncludes(ownerAuth, "HttpOnly; SameSite=Strict", "D4: owner session cookie is HttpOnly and strict same-site");
assertIncludes(ownerSessionApi, "validateOwnerAnalyticsPassword", "D4: owner session API validates credentials server-side");
console.log("PASS D4: owner authentication is environment-backed and server-side");

assertIncludes(dashboardApi, "owner_session_required", "D5: dashboard API fails closed without owner session");
assertIncludes(dashboardApi, "hasValidOwnerAnalyticsSession", "D5: dashboard API validates the signed owner cookie");
assertIncludes(dashboardApi, "createRepository()", "D5: dashboard API reads the Human Review repository");
assertIncludes(dashboardApi, "listSnapshots()", "D5: dashboard API loads snapshots");
assertIncludes(dashboardApi, "listReviews()", "D5: dashboard API loads reviews");
console.log("PASS D5: dashboard API is owner-gated and repository-backed");

assertIncludes(dashboardLib, "Promising discoveries", "D6: dashboard aggregation computes discovery indicators");
assertIncludes(dashboardLib, "Only synthetic certification or study fixtures are currently available", "D6: dashboard aggregation distinguishes synthetic-only evidence");
assertIncludes(dashboardLib, "capturedSlateVerdicts", "D6: dashboard aggregation tracks unavailable verdict fields explicitly");
console.log("PASS D6: dashboard aggregation preserves evidence caveats and discovery metrics");

assert(!homeSource.includes(">Human Review Dashboard</Text>"), "D7: patron/admin menu does not render Human Review Dashboard");
assertIncludes(homeSource, "ownerLogoTapCountRef.current += 1", "D7: logo taps count toward hidden owner entry");
assertIncludes(homeSource, "ownerLogoTapCountRef.current < 7", "D7: owner entry requires seven taps");
assertIncludes(homeSource, "}, 3000);", "D7: owner tap sequence resets after short inactivity");
assertIncludes(homeSource, 'router.push("/admin/human-review"', "D7: seventh logo tap opens owner authentication");
console.log("PASS D7: dashboard entry is hidden behind seven time-bounded logo taps");

assert(!adminWebSource.includes("Human Review Dashboard"), "D8: Librarian Settings does not expose the dashboard");
assert(!adminWebSource.includes('router.push("/admin/human-review"'), "D8: Librarian Settings cannot navigate to owner analytics");
console.log("PASS D8: librarian administration has no owner analytics navigation");

assertIncludes(dashboardRoute, "Clear all filters", "D9: dashboard UI provides clear-all filters control");
assertIncludes(dashboardRoute, "Discovery indicators", "D9: dashboard UI renders discovery section");
assertIncludes(dashboardRoute, "Disagreement worth inspecting", "D9: dashboard UI renders disagreement section");
assertIncludes(dashboardRoute, "My-own-session reviews", "D9: dashboard distinguishes self-session reviews");
assertIncludes(dashboardRoute, "Anonymous-reader-session reviews", "D9: dashboard distinguishes anonymous-session reviews");
assertIncludes(dashboardLib, "normalizeReviewMode", "D9: legacy reviews default to self-session reporting");
console.log("PASS D9: dashboard UI exposes filters and evidence sections");

assertIncludes(dashboardRoute, 'const dashboardState: "loading" | "failure" | "empty" | "success"', "D10: dashboard route models loading/success/empty/failure states explicitly");
assertIncludes(dashboardRoute, "Loading dashboard data…", "D10: loading state copy is explicit");
assertIncludes(dashboardRoute, "Dashboard data unavailable", "D10: failure state copy is explicit");
assertIncludes(dashboardRoute, "No review evidence exists yet", "D10: empty-success state copy is explicit");
assertIncludes(dashboardRoute, "isValidDashboardPayload", "D10: malformed payloads are validated");
assertIncludes(dashboardRoute, "malformed_dashboard_payload", "D10: malformed payloads are rejected");
assertIncludes(dashboardRoute, "dashboardState === \"success\" && data", "D10: success rendering is gated to successful payloads only");
assert(!dashboardRoute.includes("Real reviews: {data?.datasetInventory?.realReviews ?? 0}"), "D10: false-zero rendering pattern removed");
console.log("PASS D10: dashboard state handling distinguishes loading/empty/success/failure/malformed responses");

assertIncludes(dashboardRoute, "const paramsKey = JSON.stringify(params);", "D11: route derives a stable params key for dashboard filter parsing");
assertIncludes(dashboardRoute, "[paramsKey]", "D11: filter parsing is memoized on the stable params key");
console.log("PASS D11: dashboard filter parsing avoids unstable re-fetch loops");

assertIncludes(previewAcceptanceHarness, "PREVIEW_ACCEPTANCE_PIN", "D12: preview acceptance harness defines a stable preview PIN");
assertIncludes(adminWebSource, "Prepare Admin PIN challenge", "D12: admin web exposes preview-only PIN seeding controls");
assertIncludes(dashboardApi, "preview_acceptance_forced_dashboard_failure", "D12: dashboard API can force preview-only unavailable state");
assertIncludes(dashboardPreviewFixture, "PREVIEW_ACCEPTANCE_FIXTURE_STORAGE_MODE", "D12: preview fixture dataset is available to the dashboard API");
assertIncludes(dashboardRoute, "Preview Acceptance Harness", "D12: dashboard route exposes preview-only mode controls");
console.log("PASS D12: preview-only acceptance harness is wired for PIN, fixtures, and forced failure");

assertIncludes(previewAcceptanceHarness, "PREVIEW_ACCEPTANCE_ENV_GATE", "D13: preview acceptance harness declares a single explicit environment gate");
assertIncludes(previewAcceptanceHarness, 'EXPO_PUBLIC_PREVIEW_ACCEPTANCE_HARNESS', "D13: preview acceptance harness uses the explicit environment gate");
assertIncludes(previewAcceptanceHarness, "process.env.EXPO_PUBLIC_PREVIEW_ACCEPTANCE_HARNESS", "D13: preview acceptance harness reads the explicit gate through a direct Expo public env access");
assertIncludes(previewAcceptanceHarness, "if (!isPreviewAcceptanceEnvironmentEnabled()) return false;", "D13: browser harness activation fails closed without the environment gate");
assertIncludes(dashboardApi, "isPreviewAcceptanceEnvironmentEnabled()", "D13: API fixture/failure modes are blocked without the environment gate");
assert(!previewAcceptanceHarness.includes(".vercel.app"), "D13: hostname heuristics are not used as the production-isolation gate");
console.log("PASS D13: preview-only harness is isolated behind the explicit environment gate");
