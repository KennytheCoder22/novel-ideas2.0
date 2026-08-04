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
const adminSessionPath = resolve(ROOT, "lib", "adminSession.ts");
const previewAcceptanceHarnessPath = resolve(ROOT, "lib", "previewAcceptanceHarness.ts");
const layoutPath = resolve(ROOT, "app", "_layout.tsx");
const homePath = resolve(ROOT, "app", "(tabs)", "index.tsx");
const adminWebPath = resolve(ROOT, "app", "app_admin-web.tsx");

const dashboardRoute = existsSync(dashboardRoutePath) ? readFileSync(dashboardRoutePath, "utf8") : "";
const dashboardApi = existsSync(dashboardApiPath) ? readFileSync(dashboardApiPath, "utf8") : "";
const dashboardLib = existsSync(dashboardLibPath) ? readFileSync(dashboardLibPath, "utf8") : "";
const dashboardPreviewFixture = existsSync(dashboardPreviewFixturePath) ? readFileSync(dashboardPreviewFixturePath, "utf8") : "";
const adminSession = existsSync(adminSessionPath) ? readFileSync(adminSessionPath, "utf8") : "";
const previewAcceptanceHarness = existsSync(previewAcceptanceHarnessPath) ? readFileSync(previewAcceptanceHarnessPath, "utf8") : "";
const layoutSource = readFileSync(layoutPath, "utf8");
const homeSource = readFileSync(homePath, "utf8");
const adminWebSource = readFileSync(adminWebPath, "utf8");

assert(dashboardRoute.length > 0, "D1: admin/human-review route file exists");
console.log("PASS D1: dashboard route file exists");

assertIncludes(dashboardRoute, "export default function HumanReviewDashboardRoute", "D2: dashboard route exports default component");
assertIncludes(dashboardRoute, 'fetch(`/api/human-review-dashboard', "D2: dashboard route fetches dashboard API");
assertIncludes(dashboardRoute, "Back to Admin", "D2: dashboard route exposes back to Admin control");
assertIncludes(dashboardRoute, "NovelIdeas Home", "D2: dashboard route exposes path back to main UI");
console.log("PASS D2: dashboard route exports and uses dashboard API with navigation controls");

assertIncludes(layoutSource, 'name="admin/human-review"', "D3: root layout registers admin/human-review route");
console.log("PASS D3: app/_layout.tsx registers admin/human-review");

assertIncludes(adminSession, "activateAdminSession", "D4: admin session helper exposes activateAdminSession");
assertIncludes(adminSession, "isAdminSessionActive", "D4: admin session helper exposes isAdminSessionActive");
assertIncludes(adminSession, "setPendingAdminRoute", "D4: admin session helper exposes setPendingAdminRoute");
assertIncludes(adminSession, "ADMIN_SESSION_COOKIE_NAME", "D4: admin session helper exposes admin session cookie name");
console.log("PASS D4: admin session helper provides route-gating primitives");

assertIncludes(dashboardApi, "admin_session_required", "D5: dashboard API fails closed without admin session");
assertIncludes(dashboardApi, "createRepository()", "D5: dashboard API reads the Human Review repository");
assertIncludes(dashboardApi, "listSnapshots()", "D5: dashboard API loads snapshots");
assertIncludes(dashboardApi, "listReviews()", "D5: dashboard API loads reviews");
console.log("PASS D5: dashboard API is admin-gated and repository-backed");

assertIncludes(dashboardLib, "Promising discoveries", "D6: dashboard aggregation computes discovery indicators");
assertIncludes(dashboardLib, "Only synthetic certification or study fixtures are currently available", "D6: dashboard aggregation distinguishes synthetic-only evidence");
assertIncludes(dashboardLib, "capturedSlateVerdicts", "D6: dashboard aggregation tracks unavailable verdict fields explicitly");
console.log("PASS D6: dashboard aggregation preserves evidence caveats and discovery metrics");

assertIncludes(homeSource, "Human Review Dashboard", "D7: home admin menu exposes Human Review Dashboard");
assertIncludes(homeSource, 'router.push("/admin/human-review"', "D7: home admin menu routes to dashboard");
assertIncludes(homeSource, "activateAdminSession(\"menu\")", "D7: home admin menu activates admin session before routing");
assertIncludes(homeSource, "setPendingAdminRoute(\"/admin/human-review\")", "D7: home admin menu records pending dashboard route");
console.log("PASS D7: main menu exposes dashboard and sets authenticated dashboard navigation intent");

assertIncludes(adminWebSource, "Human Review Dashboard", "D8: desktop admin page links to Human Review Dashboard");
assertIncludes(adminWebSource, 'const dashboardRoute = previewAcceptanceHarnessVisible', "D8: desktop admin computes the dashboard destination");
assertIncludes(adminWebSource, "router.push(dashboardRoute as any)", "D8: desktop admin link routes to dashboard");
assertIncludes(adminWebSource, "activateAdminSession(\"admin_web\")", "D8: desktop admin link activates admin session");
assertIncludes(adminWebSource, "setPendingAdminRoute(\"/admin/human-review\")", "D8: desktop admin link records pending dashboard route");
console.log("PASS D8: desktop admin links to dashboard with authenticated navigation intent");

assertIncludes(dashboardRoute, "Clear all filters", "D9: dashboard UI provides clear-all filters control");
assertIncludes(dashboardRoute, "Discovery indicators", "D9: dashboard UI renders discovery section");
assertIncludes(dashboardRoute, "Disagreement worth inspecting", "D9: dashboard UI renders disagreement section");
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
