import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => {
  const source = readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  module._compile(output, filename);
};

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const {
  MIN_NEW_LIBRARY_ID_LENGTH,
  normalizeHostedLibraryId,
  normalizeHostedLibraryRouteId,
  readAdminLibraries,
  readPatronLibraries,
  rememberAdminLibrary,
  rememberPatronLibrary,
  validateLibraryIdForSave,
} = require(resolve(repoRoot, "lib", "savedLibraries.ts"));

class MemoryStorage {
  values = new Map();
  getItem(key) {
    return this.values.get(key) ?? null;
  }
  setItem(key, value) {
    this.values.set(key, String(value));
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function check(name, fn) {
  fn();
  return { name, pass: true };
}

const homeSource = readFileSync(resolve(repoRoot, "app", "(tabs)", "index.tsx"), "utf8");
const adminSource = readFileSync(resolve(repoRoot, "app", "app_admin-web.tsx"), "utf8");
const apiSource = readFileSync(resolve(repoRoot, "api", "library-config.ts"), "utf8");
const checks = [];

checks.push(check("new_library_ids_require_three_characters", () => {
  assert(MIN_NEW_LIBRARY_ID_LENGTH === 3, "minimum ID length must be 3");
  assert(!validateLibraryIdForSave("ab").valid, "two-character new ID must fail");
  assert(validateLibraryIdForSave("abc").valid, "three-character new ID must pass");
  assert(normalizeHostedLibraryId(" My Library! ") === "MyLibrary", "URL-safe normalization changed");
  assert(
    normalizeHostedLibraryRouteId("a".repeat(50)).length === 50,
    "existing hosted routes must preserve long URL-safe IDs",
  );
}));

checks.push(check("legacy_short_library_ids_remain_usable", () => {
  assert(validateLibraryIdForSave("y", "y").valid, "existing /y scope must remain saveable");
  assert(validateLibraryIdForSave("m", "m").valid, "existing /m scope must remain saveable");
  assert(apiSource.includes("loadSharedLibraryConfigPayload(normalizedLibraryId"), "API must check for an existing short config");
  assert(apiSource.includes('error: "library_id_too_short"'), "API must reject newly-created short IDs");
}));

checks.push(check("patron_libraries_persist_and_deduplicate", () => {
  const storage = new MemoryStorage();
  rememberPatronLibrary(storage, { libraryId: "yvhs", libraryName: "Ygnacio Valley High School" });
  rememberPatronLibrary(storage, { libraryId: "YVHS", libraryName: "YVHS Library" });
  rememberPatronLibrary(storage, { libraryId: "city", libraryName: "City Library" });
  const longId = "long-library-route-" + "x".repeat(40);
  rememberPatronLibrary(storage, { libraryId: longId, libraryName: "Long Route Library" });
  const libraries = readPatronLibraries(storage);
  assert(libraries.length === 3, "repeat visits must not create duplicate patron libraries");
  assert(libraries.find((item) => item.libraryId === "YVHS")?.libraryName === "YVHS Library", "friendly name must refresh");
  assert(libraries.find((item) => item.libraryId === "city")?.hostedPath === "/city", "hosted route must be retained");
  assert(libraries.find((item) => item.libraryName === "Long Route Library")?.libraryId === longId, "legacy long route IDs must not be truncated");
  assert(homeSource.includes("if (shared)") && homeSource.includes("rememberPatronLibrary"), "valid hosted config loads must be remembered");
  assert(homeSource.includes("My Libraries"), "patron selector must be rendered");
}));

checks.push(check("admin_libraries_are_separate_and_switch_full_scope", () => {
  const storage = new MemoryStorage();
  rememberPatronLibrary(storage, { libraryId: "public", libraryName: "Public Library" });
  rememberAdminLibrary(storage, { libraryId: "school", libraryName: "School Library" });
  assert(readPatronLibraries(storage).length === 1, "patron list must remain present");
  assert(readAdminLibraries(storage).length === 1, "admin list must persist independently");
  assert(readAdminLibraries(storage)[0].libraryId === "school", "admin scope must not merge with patron scope");
  assert(adminSource.includes("/app_admin-web?libraryId="), "admin selection must navigate by scoped library ID");
  assert(adminSource.includes("Create New Library"), "default/new-library scope option must be visible");
  assert(adminSource.includes("loadSharedLibraryConfigWithDiagnostics(adminDraftScopeId"), "missing local drafts must hydrate the selected shared config");
  assert(adminSource.includes("No changes were made."), "failed Admin hydration must not expose editable defaults");
  assert(
    adminSource.indexOf("if (adminScopeLoading)") > adminSource.indexOf("const onSavePin = useCallback"),
    "Admin loading guards must not change hook order between renders",
  );
  assert(adminSource.includes("adminConfigStorageKeyForScope(adminDraftScopeId)"), "admin config must remain scope-isolated");
  assert(adminSource.includes("adminConfigStorageKeyForScope(nextLibraryId || adminDraftScopeId)"), "first save must move a new library into its own scope");
  assert(adminSource.includes("resolveAdminDraftScopeId(nextLibraryId) !== adminDraftScopeId"), "created or renamed libraries must navigate to their full new scope");
  assert(
    adminSource.includes("localCollectionCsvStorageKeyForExactScope(candidateScopeId)"),
    "local collection must remain scope-isolated while reading legacy aliases",
  );
}));

checks.push(check("hosted_navigation_wording_is_precise", () => {
  assert(adminSource.includes(">Go To Library</Text>"), "hosted route action must say Go To Library");
  assert(!adminSource.includes(">Open Library</Text>"), "hosted route action must not say Open Library");
  assert(adminSource.includes('if (s === "openLibrary") return "Open Library"'), "Open Library data-source label must remain unchanged");
}));

process.stdout.write(`${JSON.stringify({ ok: true, checks }, null, 2)}\n`);
