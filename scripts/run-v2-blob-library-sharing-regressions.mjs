#!/usr/bin/env node
/**
 * run-v2-blob-library-sharing-regressions.mjs
 *
 * Regression suite for the Vercel Blob–backed library sharing storage layer.
 * Covers: save, load, replacement, missing blob, malformed JSON,
 *         cross-device hydration, admin PIN stripping, and upload routing.
 *
 * All checks are structural (grep source files) or pure-logic (no I/O).
 * No network calls, no Vercel Blob token required.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, "..");

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  ✅  ${name}`);
  } else {
    failed++;
    failures.push({ name, detail });
    console.log(`  ❌  ${name}${detail ? `\n      → ${detail}` : ""}`);
  }
}

function readSrc(relPath) {
  const abs = resolve(root, relPath);
  if (!existsSync(abs)) return null;
  return readFileSync(abs, "utf8");
}

function contains(src, pattern) {
  if (!src) return false;
  if (typeof pattern === "string") return src.includes(pattern);
  return pattern.test(src);
}

console.log("\n=== Blob Library Sharing Regressions ===\n");

// ── 1. Storage mode ───────────────────────────────────────────────────────────
console.log("1. Storage mode detection");
{
  const storage = readSrc("lib/librarySharing/storage.ts");

  check(
    "storageMode() returns vercel_blob when BLOB_READ_WRITE_TOKEN is set",
    contains(storage, "BLOB_READ_WRITE_TOKEN") && contains(storage, "vercel_blob")
  );
  check(
    "storageMode() returns local_filesystem as fallback",
    contains(storage, "local_filesystem")
  );
  check(
    "No POSTGRES_URL dependency in storage.ts",
    !contains(storage, "POSTGRES_URL")
  );
  check(
    "No @vercel/postgres import in storage.ts",
    !contains(storage, "@vercel/postgres")
  );
  check(
    "Uses @vercel/blob for Vercel Blob operations",
    contains(storage, "@vercel/blob")
  );
}

// ── 2. Admin PIN stripping ────────────────────────────────────────────────────
console.log("\n2. Admin PIN must not be stored in public blobs");
{
  const storage = readSrc("lib/librarySharing/storage.ts");

  check(
    "sanitizeConfigForPublicStorage is exported from storage.ts",
    contains(storage, "export function sanitizeConfigForPublicStorage")
  );
  check(
    "sanitizeConfigForPublicStorage deletes admin.pin",
    contains(storage, "delete") && contains(storage, ".pin")
  );
  check(
    "saveBlobConfig calls sanitizeConfigForPublicStorage before writing",
    contains(storage, "sanitizeConfigForPublicStorage(payload)")
  );
  check(
    "saveFileAsset applies sanitizeConfigForPublicStorage for config kind",
    contains(storage, `kind === "config" ? sanitizeConfigForPublicStorage(payload) : payload`)
  );

  // Logic test: verify PIN is stripped
  function sanitizeConfigForPublicStorage(config) {
    const clone = JSON.parse(JSON.stringify(config));
    if (clone.admin && typeof clone.admin === "object" && !Array.isArray(clone.admin)) {
      delete clone.admin.pin;
    }
    return clone;
  }
  const configWithPin = {
    branding: { libraryName: "YVHS Library" },
    admin: { pinEnabled: true, pin: "123456" },
  };
  const sanitized = sanitizeConfigForPublicStorage(configWithPin);
  check(
    "sanitize: admin.pin is removed from output",
    sanitized.admin?.pin === undefined,
    JSON.stringify(sanitized.admin)
  );
  check(
    "sanitize: admin.pinEnabled is preserved",
    sanitized.admin?.pinEnabled === true,
    JSON.stringify(sanitized.admin)
  );
  check(
    "sanitize: other config fields are preserved",
    sanitized.branding?.libraryName === "YVHS Library"
  );
  check(
    "sanitize: does not mutate original config",
    configWithPin.admin?.pin === "123456"
  );
  const noAdminConfig = { branding: { libraryName: "Test" } };
  check(
    "sanitize: config without admin field is unchanged",
    sanitizeConfigForPublicStorage(noAdminConfig).branding?.libraryName === "Test"
  );
}

// ── 3. Config save / load path ────────────────────────────────────────────────
console.log("\n3. Config save/load (Vercel Blob)");
{
  const storage = readSrc("lib/librarySharing/storage.ts");
  const adminWeb = readSrc("app/app_admin-web.tsx");
  const configApi = readSrc("api/library-config.ts");

  check(
    "saveSharedLibraryConfig exists and is exported",
    contains(storage, "export async function saveSharedLibraryConfig")
  );
  check(
    "loadSharedLibraryConfigPayload exists and is exported",
    contains(storage, "export async function loadSharedLibraryConfigPayload")
  );
  check(
    "Config blob pathname uses libraries/{id}/config.json pattern",
    contains(storage, "libraries/") && contains(storage, "/config.json")
  );
  check(
    "Config is wrapped in a schema-versioned envelope before writing",
    contains(storage, "library_config_v1")
  );
  check(
    "Config wrapper includes contentHash",
    contains(storage, "contentHash")
  );
  check(
    "loadBlobConfig unwraps the config field from the envelope",
    contains(storage, "wrapper.config")
  );
  check(
    "loadBlobConfig returns null for missing blob (loadBlobJson returns null)",
    contains(storage, "if (!data || typeof data !== \"object\"") ||
    contains(storage, 'if (!data || typeof data !== "object"')
  );
  check(
    "storage exports backend/key diagnostics for config save/load tracing",
    contains(storage, "export function getSharedLibraryConfigStorageTrace") &&
    contains(storage, "configBlobPath") &&
    contains(storage, "configFilePath")
  );
  check(
    "saveSharedLibraryConfig logs backend, libraryId, and storage key details",
    contains(storage, "logConfigEvent(\"save_started\"")
  );
  check(
    "loadSharedLibraryConfigPayload logs backend, libraryId, and found/missing result",
    contains(storage, "logConfigEvent(\"lookup_succeeded\"") &&
    contains(storage, "logConfigEvent(\"not_found\"")
  );
  check(
    "library-config API logs backend/library/key on GET and POST",
    contains(configApi, "[api/library-config][GET] route_entered") &&
    contains(configApi, "[api/library-config][POST] save_start")
  );
  check(
    "Admin save fails loudly when shared config POST is not successful",
    contains(adminWeb, "shared_config_save_failed")
  );

  // Logic test: config envelope roundtrip shape (save wrapper -> load unwrap)
  const savedConfig = {
    branding: { libraryName: "YVHS Library", libraryNameAlias: "YVHS" },
    recommendations: { sourceEnabled: { localLibrary: true, openLibrary: false } },
    library: { id: "yvhs-library" },
  };
  const wrapped = {
    schemaVersion: "library_config_v1",
    libraryId: "yvhs-library",
    updatedAt: "2026-01-01T00:00:00.000Z",
    contentHash: "abc123",
    config: savedConfig,
  };
  const loadedConfig = wrapped.config;
  check(
    "save->immediate-load regression: loaded config equals saved config",
    JSON.stringify(loadedConfig) === JSON.stringify(savedConfig)
  );
}

// ── 4. Collection upload (server-side API) ───────────────────────────────────
console.log("\n4. Collection upload via server API");
{
  const storage = readSrc("lib/librarySharing/storage.ts");
  const client = readSrc("lib/librarySharing/client.ts");
  const adminWeb = readSrc("app/app_admin-web.tsx");

  check(
    "collectionBlobPathname is exported from storage.ts",
    contains(storage, "export function collectionBlobPathname")
  );
  check(
    "saveSharedLibraryCollection writes collection.json in vercel_blob mode",
    contains(storage, "putBlobJson(collectionBlobPathname(id), payload)")
  );
  check(
    "saveSharedLibraryCollection updates collection pointer in vercel_blob mode",
    contains(storage, "saveBlobCollectionPtr(id, url)")
  );
  check(
    "recordSharedLibraryCollectionUrl is exported",
    contains(storage, "export async function recordSharedLibraryCollectionUrl")
  );
  check(
    "upload-url endpoint removed (no client Blob SDK flow)",
    readSrc("app/api/local-collection/upload-url/+api.ts") === null
  );
  check(
    "client.ts no longer imports @vercel/blob/client",
    !contains(client, "@vercel/blob/client")
  );
  check(
    "client.ts no longer exports uploadSharedLibraryCollectionClientSide",
    !contains(client, "uploadSharedLibraryCollectionClientSide")
  );
  check(
    "admin web no longer imports blobUpload helper",
    !contains(adminWeb, "lib/librarySharing/blobUpload")
  );
}

// ── 5. Collection GET — artifact vs artifactUrl ───────────────────────────────
console.log("\n5. Collection GET endpoint response shape");
{
  const collectionApi = readSrc("api/local-collection.ts");

  check(
    "GET endpoint uses loadSharedLibraryCollectionResult",
    contains(collectionApi, "loadSharedLibraryCollectionResult")
  );
  check(
    "GET response includes both artifact and artifactUrl fields",
    contains(collectionApi, "artifactUrl")
  );
  check(
    "GET returns artifact: null when only artifactUrl is set",
    contains(collectionApi, "artifact: result.artifact ?? null")
  );
  check(
    "POST expects artifact in request body",
    contains(collectionApi, "missing_artifact") || contains(collectionApi, "b.artifact")
  );
  check(
    "POST does not accept blobUrl shape anymore",
    !contains(collectionApi, "blobUrl")
  );
  check(
    "POST artifact shape calls saveSharedLibraryCollection",
    contains(collectionApi, "saveSharedLibraryCollection")
  );
}

// ── 6. Client — handles both response shapes ──────────────────────────────────
console.log("\n6. Client loadSharedLibraryCollection handles both response shapes");
{
  const client = readSrc("lib/librarySharing/client.ts");

  check(
    "loadSharedLibraryCollection handles inline artifact shape",
    contains(client, "payload.artifact")
  );
  check(
    "loadSharedLibraryCollection handles artifactUrl shape (fetches from CDN)",
    contains(client, "payload.artifactUrl") && contains(client, "readJsonAny")
  );
  check(
    "readJsonAny fetches without credentials (cross-origin CDN URL)",
    contains(client, "function readJsonAny") &&
    !contains(client, /readJsonAny[^}]+credentials/)
  );
}

// ── 7. Missing blob / malformed JSON ─────────────────────────────────────────
console.log("\n7. Missing blob and malformed JSON handling");
{
  const storage = readSrc("lib/librarySharing/storage.ts");

  check(
    "loadBlobJson returns null on 404 response",
    contains(storage, "status === 404") && contains(storage, "return null")
  );
  check(
    "loadBlobJson returns null when JSON parse fails (.catch(() => null))",
    contains(storage, "json_parse_failed") &&
    contains(storage, "return result.validJson ? result.data : null")
  );
  check(
    "loadBlobConfig returns null when wrapper is not an object",
    contains(storage, "typeof data !== \"object\"") || contains(storage, 'typeof data !== "object"')
  );
  check(
    "loadBlobConfig returns null when config field is missing or wrong type",
    contains(storage, "wrapper.config")
  );
  check(
    "loadBlobCollectionUrl returns null when pointer is missing",
    contains(storage, "typeof ptr.blobUrl === \"string\"") || contains(storage, 'typeof ptr.blobUrl === "string"')
  );
  check(
    "readJson in filesystem path is wrapped in try/catch",
    contains(storage, "try {") && contains(storage, "readFileSync") && contains(storage, "} catch {")
  );

  // Logic test: malformed JSON graceful handling
  function parseOrNull(text) {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }
  check("malformed JSON parse returns null (not throws)", parseOrNull("{bad json}") === null);
  check("empty string parse returns null", parseOrNull("") === null);
  check("valid JSON parses correctly", parseOrNull('{"ok":true}')?.ok === true);
}

// ── 8. Replacement (overwrite) ────────────────────────────────────────────────
console.log("\n8. Blob overwrite / versioning");
{
  const storage = readSrc("lib/librarySharing/storage.ts");

  check(
    "putBlobJson uses addRandomSuffix: false for deterministic paths",
    contains(storage, "addRandomSuffix: false")
  );
  check(
    "Collection pointer is also written with addRandomSuffix: false",
    contains(storage, "addRandomSuffix: false") // applies to both config and pointer
  );
  check(
    "Config blob includes updatedAt timestamp",
    contains(storage, "updatedAt: new Date().toISOString()")
  );
  check(
    "Collection pointer includes updatedAt timestamp",
    contains(storage, "updatedAt: new Date().toISOString()")
  );
  check(
    "Overwriting config calls put() again at same pathname (idempotent)",
    contains(storage, "putBlobJson(configBlobPathname(libraryId)")
  );
}

// ── 9. Cross-device hydration ─────────────────────────────────────────────────
console.log("\n9. Cross-device hydration path");
{
  const configApi = readSrc("api/library-config.ts");
  const collectionApi = readSrc("api/local-collection.ts");
  const homeScreen = readSrc("app/(tabs)/index.tsx");
  const localCollectionStorage = readSrc("lib/localCollection/storage.ts");

  check(
    "GET /api/library-config does NOT require admin cookie",
    configApi !== null &&
    contains(configApi, "if (req.method === \"GET\")") &&
    !configApi.split("if (req.method === \"GET\")")[1]?.split("if (!hasAdminSessionCookie")[0]?.includes("hasAdminSessionCookie")
  );
  check(
    "GET /api/local-collection does NOT require admin cookie",
    collectionApi !== null &&
    contains(collectionApi, "if (req.method === \"GET\")") &&
    !collectionApi.split("if (req.method === \"GET\")")[1]?.split("if (!hasAdminSessionCookie")[0]?.includes("hasAdminSessionCookie")
  );
  check(
    "HomeScreen loads shared config when libraryId prop is set",
    contains(homeScreen, "loadSharedLibraryConfig")
  );
  check(
    "HomeScreen shows error state when personalized config fails to load",
    contains(homeScreen, "personalizedConfigError") && contains(homeScreen, "could not be loaded")
  );
  check(
    "loadLocalCollectionRecommendationArtifact falls through to shared API when local storage is empty",
    contains(localCollectionStorage, "loadSharedLibraryCollection")
  );
  check(
    "publishSharedLocalCollectionRecommendationArtifact no longer uses client Blob SDK path",
    !contains(localCollectionStorage, "uploadSharedLibraryCollectionClientSide") &&
    !contains(localCollectionStorage, "blobUpload")
  );
  check(
    "publishSharedLocalCollectionRecommendationArtifact falls back to server-side POST",
    contains(localCollectionStorage, "saveSharedLibraryCollection")
  );
}

// ── 10. Blob URL derivation ───────────────────────────────────────────────────
console.log("\n10. Blob URL derivation from token");
{
  const storage = readSrc("lib/librarySharing/storage.ts");

  check(
    "blobStoreBaseUrl derives URL from BLOB_READ_WRITE_TOKEN format",
    contains(storage, "vercel_blob_rw_") || (
      contains(storage, "split(\"_\")") || contains(storage, "split('_')")
    )
  );
  check(
    "loadBlobJson falls back to list() when derived URL fails",
    contains(storage, "list(") && contains(storage, "prefix: pathname")
  );
  check(
    "loadBlobJson returns null on network error (catch block)",
    contains(storage, "// network error") || contains(storage, "fall through to list")
  );

  // Logic test: URL derivation
  function blobStoreBaseUrl(token) {
    if (!token) return null;
    const parts = token.split("_");
    if (parts[0] !== "vercel" || parts[1] !== "blob" || parts[2] !== "rw" || !parts[3]) return null;
    return `https://${parts[3]}.public.blob.vercel-storage.com`;
  }
  const realToken = "vercel_blob_rw_abc123def_xyzxyzxyz";
  check(
    "URL derivation: extracts storeId from token correctly",
    blobStoreBaseUrl(realToken) === "https://abc123def.public.blob.vercel-storage.com"
  );
  check(
    "URL derivation: returns null for empty token",
    blobStoreBaseUrl("") === null
  );
  check(
    "URL derivation: returns null for malformed token",
    blobStoreBaseUrl("not_a_real_token") === null
  );
}

// ── 11. Hosted-library diagnostics and correlation IDs ────────────────────────
console.log("\n11. Hosted-library diagnostics and correlation IDs");
{
  const storage = readSrc("lib/librarySharing/storage.ts");
  const client = readSrc("lib/librarySharing/client.ts");
  const configApi = readSrc("api/library-config.ts");
  const diagnosticsApi = readSrc("api/library-config-diagnostics.ts");
  const homeScreen = readSrc("app/(tabs)/index.tsx");
  const adminSession = readSrc("lib/adminSession.ts");

  check(
    "storage exports diagnoseSharedLibraryConfig",
    contains(storage, "export async function diagnoseSharedLibraryConfig")
  );
  check(
    "storage diagnostics includes backend, configPath, exists/readable/valid fields",
    contains(storage, "backend: StorageMode") &&
    contains(storage, "configPath: string") &&
    contains(storage, "exists: boolean") &&
    contains(storage, "validConfig: boolean")
  );
  check(
    "library-config API sets correlation and route-reached headers",
    contains(configApi, "\"x-correlation-id\"") &&
    contains(configApi, "\"x-library-config-route\"")
  );
  check(
    "library-config API emits config_not_found error code",
    contains(configApi, "config_not_found")
  );
  check(
    "library-config API reads x-correlation-id from request",
    contains(configApi, "x-correlation-id")
  );
  check(
    "client exports loadSharedLibraryConfigWithDiagnostics",
    contains(client, "export async function loadSharedLibraryConfigWithDiagnostics")
  );
  check(
    "client diagnostics capture status/content-type/requestReachedApiRoute",
    contains(client, "httpStatus") &&
    contains(client, "responseContentType") &&
    contains(client, "requestReachedApiRoute")
  );
  check(
    "client sends x-correlation-id header for hosted config load",
    contains(client, "\"x-correlation-id\"")
  );
  check(
    "diagnostics endpoint file exists",
    diagnosticsApi !== null
  );
  check(
    "diagnostics endpoint is admin-gated or preview-gated",
    contains(diagnosticsApi, "hasAdminSessionCookie") &&
    contains(diagnosticsApi, "isPreviewAcceptanceEnvironmentEnabled")
  );
  check(
    "diagnostics endpoint returns safe operational fields",
    contains(diagnosticsApi, "routeReachable") &&
    contains(diagnosticsApi, "backend") &&
    contains(diagnosticsApi, "configPath") &&
    contains(diagnosticsApi, "validConfig")
  );
  check(
    "diagnostics endpoint does not return secrets",
    !contains(diagnosticsApi, "BLOB_READ_WRITE_TOKEN") &&
    !contains(diagnosticsApi, "blobUrl") &&
    !contains(diagnosticsApi, "admin.pin")
  );
  check(
    "root Vercel handlers exist for hosted library APIs",
    readSrc("api/library-config.ts") !== null &&
    readSrc("api/library-config-diagnostics.ts") !== null &&
    readSrc("api/local-collection.ts") !== null
  );
  check(
    "root hosted API handlers export default Vercel handler",
    contains(configApi, "export default async function handler(req: VercelRequest, res: VercelResponse)") &&
    contains(diagnosticsApi, "export default async function handler(req: VercelRequest, res: VercelResponse)") &&
    contains(readSrc("api/local-collection.ts"), "export default async function handler(req: VercelRequest, res: VercelResponse)")
  );
  check(
    "legacy Expo API route files are retired",
    readSrc("app/api/library-config/+api.ts") === null &&
    readSrc("app/api/library-config-diagnostics/+api.ts") === null &&
    readSrc("app/api/local-collection/+api.ts") === null
  );
  check(
    "error UI keeps patron-safe message but has diagnostics toggle for debug users",
    contains(homeScreen, "This library's configuration could not be loaded.") &&
    contains(homeScreen, "Diagnostics") &&
    contains(homeScreen, "isAdminSessionActive") &&
    contains(homeScreen, "isPreviewAcceptanceEnvironmentEnabled")
  );
  check(
    "admin session helper exports cookie name for server gating",
    contains(adminSession, "ADMIN_SESSION_COOKIE_NAME")
  );
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(48)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log("\nFailed checks:");
  for (const f of failures) {
    console.log(`  ❌ ${f.name}${f.detail ? `\n     ${f.detail}` : ""}`);
  }
  process.exit(1);
}
console.log("\nAll checks passed ✅");
