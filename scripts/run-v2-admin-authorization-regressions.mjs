import { createRequire } from "node:module";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => {
  const source = readFileSync(filename, "utf8");
  module._compile(ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText, filename);
};

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.env.ADMIN_SESSION_SECRET = "regression-only-admin-session-secret";
process.env.ADMIN_PIN_RECOVERY_SECRET = "regression-only-recovery-secret-123";
delete process.env.BLOB_READ_WRITE_TOKEN;

function check(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
}

function source(path) {
  return readFileSync(resolve(ROOT, path), "utf8");
}

function mockResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    send(value) { this.body = value; return this; },
    redirect(code, value) { this.statusCode = code; this.body = value; return this; },
  };
}

const adminPage = source("app/app_admin-web.tsx");
const homePage = source("app/(tabs)/index.tsx");
const adminSession = source("lib/adminSession.ts");
const configApi = source("api/library-config.ts");
const collectionApi = source("api/local-collection.ts");

check(adminPage.includes('status: "loading" | "authorized" | "pin_required" | "reenrollment_required"'),
  "direct Librarian Settings route is authorization-gated");
check(adminPage.indexOf('adminAuthorization.status !== "authorized"') < adminPage.indexOf("localStorage.setItem(targetDraftStorageKey"),
  "save checks authorization before local persistence");
check(!adminPage.includes('activateAdminSession("admin_web_save")'),
  "save cannot mint its own admin authorization");
check(homePage.includes("if (adminPinEnabled)") && homePage.includes("verifyHostedAdminPin"),
  "menu entry challenges whenever PIN protection is enabled");
check(homePage.includes('setAdminPinError("Incorrect PIN.")'),
  "wrong menu PIN does not open settings");
check(adminSession.includes("window.sessionStorage") && !adminSession.includes("document.cookie"),
  "downloaded unlock is tab-session scoped and cannot create a server cookie");
check(configApi.includes("hasAuthorizedAdminSession(req, libraryId)"),
  "configuration writes validate a library-scoped server session");
check(collectionApi.includes("hasAuthorizedAdminSession(req, libraryId)"),
  "collection writes validate a library-scoped server session");

const storage = require(resolve(ROOT, "lib/librarySharing/storage.ts"));
const authorization = require(resolve(ROOT, "lib/adminAuthorizationServer.ts"));
const configHandler = require(resolve(ROOT, "api/library-config.ts")).default;
const collectionHandler = require(resolve(ROOT, "api/local-collection.ts")).default;
const authHandler = require(resolve(ROOT, "api/admin-auth.ts")).default;

const libraryId = `auth-regression-${process.pid}`;
const otherLibraryId = `${libraryId}-other`;
const aliasTargetLibraryId = `${libraryId}-alias`;
const aliasLibraryId = aliasTargetLibraryId.replace("-", ".");
const normalizedAliasLibraryId = aliasLibraryId.replace(".", "");
const reenrollmentLibraryId = `${libraryId}-reenroll`;
const concurrentReenrollmentLibraryId = `${libraryId}-reenroll-race`;
const safeName = (value) => value.toLowerCase().replace(/[^a-z0-9_-]/g, "_");
const cleanupPaths = [
  resolve(ROOT, "scripts/output/library-sharing/configs", `${safeName(libraryId)}.json`),
  resolve(ROOT, "scripts/output/library-sharing/configs", `${safeName(otherLibraryId)}.json`),
  resolve(ROOT, "scripts/output/library-sharing/configs", `${safeName(aliasTargetLibraryId)}.json`),
  resolve(ROOT, "scripts/output/library-sharing/configs", `${safeName(normalizedAliasLibraryId)}.json`),
  resolve(ROOT, "scripts/output/library-sharing/configs", `${safeName(reenrollmentLibraryId)}.json`),
  resolve(ROOT, "scripts/output/library-sharing/configs", `${safeName(concurrentReenrollmentLibraryId)}.json`),
  resolve(ROOT, "scripts/output/library-sharing/admin-verifiers", `${safeName(libraryId)}.json`),
  resolve(ROOT, "scripts/output/library-sharing/admin-verifiers", `${safeName(aliasTargetLibraryId)}.json`),
  resolve(ROOT, "scripts/output/library-sharing/admin-verifiers", `${safeName(reenrollmentLibraryId)}.json`),
  resolve(ROOT, "scripts/output/library-sharing/admin-verifiers", `${safeName(concurrentReenrollmentLibraryId)}.json`),
];

try {
  await storage.saveSharedLibraryConfig(libraryId, {
    library: { id: libraryId, name: "Authorization Regression" },
    branding: { libraryId, libraryName: "Authorization Regression" },
    admin: { pinEnabled: true, pin: "123456" },
  });
  await authorization.saveAdminPinVerifier(libraryId, "123456");

  check(await authorization.verifyAdminPin(libraryId, "123456"), "correct PIN verifies");
  check(!(await authorization.verifyAdminPin(libraryId, "654321")), "wrong PIN is rejected");

  const issueResponse = mockResponse();
  authorization.issueAdminSession(issueResponse, libraryId);
  const cookie = String(issueResponse.headers["set-cookie"]);
  check(cookie.includes("HttpOnly") && cookie.includes("Secure") && cookie.includes("SameSite=Strict"),
    "hosted session cookie is HttpOnly, Secure, and SameSite Strict");
  const requestWithCookie = { headers: { cookie: cookie.split(";")[0] } };
  check(authorization.hasAuthorizedAdminSession(requestWithCookie, libraryId),
    "server-issued session authorizes its library");
  check(!authorization.hasAuthorizedAdminSession(requestWithCookie, otherLibraryId),
    "session for one library cannot authorize another");
  check(!authorization.hasAuthorizedAdminSession({ headers: { cookie: `${cookie.split(";")[0]}x` } }, libraryId),
    "tampered session is rejected");

  const directResponse = mockResponse();
  await configHandler({
    method: "POST",
    headers: {},
    query: {},
    body: { libraryId, config: { admin: { pinEnabled: true } } },
    url: "/api/library-config",
  }, directResponse);
  check(directResponse.statusCode === 403, "privileged config save without authorization is rejected");

  const collectionResponse = mockResponse();
  await collectionHandler({
    method: "POST",
    headers: {},
    query: {},
    body: { libraryId, artifact: {} },
  }, collectionResponse);
  check(collectionResponse.statusCode === 403, "privileged collection publish without authorization is rejected");

  const wrongPinResponse = mockResponse();
  await authHandler({
    method: "POST",
    headers: {},
    query: {},
    body: { libraryId, pin: "654321" },
  }, wrongPinResponse);
  check(wrongPinResponse.statusCode === 401, "hosted wrong PIN cannot create a session");

  const correctPinResponse = mockResponse();
  await authHandler({
    method: "POST",
    headers: {},
    query: {},
    body: { libraryId, pin: "123456" },
  }, correctPinResponse);
  check(correctPinResponse.statusCode === 200 && correctPinResponse.headers["set-cookie"],
    "hosted correct PIN creates a server session");

  await storage.saveSharedLibraryConfig(otherLibraryId, {
    library: { id: otherLibraryId, name: "Unprotected Regression" },
    branding: { libraryId: otherLibraryId, libraryName: "Unprotected Regression" },
    admin: { pinEnabled: false },
  });
  const unprotectedResponse = mockResponse();
  await configHandler({
    method: "POST",
    headers: {},
    query: {},
    body: {
      libraryId: otherLibraryId,
      config: {
        library: { id: otherLibraryId, name: "Unprotected Regression" },
        branding: { libraryId: otherLibraryId, libraryName: "Unprotected Regression" },
        admin: { pinEnabled: false },
      },
    },
    url: "/api/library-config",
  }, unprotectedResponse);
  check(unprotectedResponse.statusCode === 200, "PIN-disabled library preserves unrestricted settings behavior");

  await storage.saveSharedLibraryConfig(aliasTargetLibraryId, {
    library: { id: aliasTargetLibraryId, name: "Protected Alias Target" },
    branding: { libraryId: aliasTargetLibraryId, libraryName: "Protected Alias Target" },
    admin: { pinEnabled: true },
  });
  await authorization.saveAdminPinVerifier(aliasTargetLibraryId, "123456");
  const aliasResponse = mockResponse();
  await configHandler({
    method: "POST",
    headers: {},
    query: {},
    body: {
      libraryId: aliasLibraryId,
      config: {
        library: { id: normalizedAliasLibraryId, name: "Alias Request" },
        branding: { libraryId: normalizedAliasLibraryId, libraryName: "Alias Request" },
        admin: { pinEnabled: false },
      },
    },
    url: "/api/library-config",
  }, aliasResponse);
  const protectedAliasTarget = await storage.loadSharedLibraryConfigPayload(aliasTargetLibraryId);
  check(
    protectedAliasTarget?.admin?.pinEnabled === true &&
      await authorization.verifyAdminPin(aliasTargetLibraryId, "123456"),
    "punctuation alias cannot overwrite or disable a protected library",
  );

  await storage.saveSharedLibraryConfig(reenrollmentLibraryId, {
    library: { id: reenrollmentLibraryId, name: "Re-enrollment Regression" },
    branding: { libraryId: reenrollmentLibraryId, libraryName: "Re-enrollment Regression" },
    admin: { pinEnabled: true },
  });
  const failedReenrollmentResponse = mockResponse();
  await authHandler({
    method: "POST",
    headers: {},
    query: {},
    body: {
      action: "reenroll",
      libraryId: reenrollmentLibraryId,
      pin: "123456",
      recoverySecret: "wrong-recovery-secret",
    },
  }, failedReenrollmentResponse);
  check(failedReenrollmentResponse.statusCode === 403, "PIN re-enrollment rejects the wrong recovery secret");

  const reenrollmentResponse = mockResponse();
  await authHandler({
    method: "POST",
    headers: {},
    query: {},
    body: {
      action: "reenroll",
      libraryId: reenrollmentLibraryId,
      pin: "123456",
      recoverySecret: process.env.ADMIN_PIN_RECOVERY_SECRET,
    },
  }, reenrollmentResponse);
  check(
    reenrollmentResponse.statusCode === 200 &&
      await authorization.verifyAdminPin(reenrollmentLibraryId, "123456"),
    "legacy protected library can securely enroll its verifier once",
  );

  const overwriteReenrollmentResponse = mockResponse();
  await authHandler({
    method: "POST",
    headers: {},
    query: {},
    body: {
      action: "reenroll",
      libraryId: reenrollmentLibraryId,
      pin: "654321",
      recoverySecret: process.env.ADMIN_PIN_RECOVERY_SECRET,
    },
  }, overwriteReenrollmentResponse);
  check(
    overwriteReenrollmentResponse.statusCode === 401 &&
      await authorization.verifyAdminPin(reenrollmentLibraryId, "123456"),
    "recovery path cannot overwrite an existing PIN verifier",
  );

  const concurrentEnrollmentResults = await Promise.all([
    authorization.enrollAdminPinVerifier(concurrentReenrollmentLibraryId, "123456"),
    authorization.enrollAdminPinVerifier(concurrentReenrollmentLibraryId, "654321"),
  ]);
  check(
    concurrentEnrollmentResults.filter(Boolean).length === 1,
    "concurrent re-enrollment creates exactly one PIN verifier",
  );
} finally {
  for (const path of cleanupPaths) {
    if (existsSync(path)) unlinkSync(path);
  }
}

console.log("Admin authorization regressions passed.");
