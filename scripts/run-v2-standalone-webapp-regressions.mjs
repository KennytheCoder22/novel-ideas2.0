import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(relativePath) {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

const results = [];

function run(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}

run("R1_manifest_file_exists_and_matches_standalone_contract", () => {
  const manifestPath = resolve(ROOT, "public", "manifest.webmanifest");
  assert(existsSync(manifestPath), "public/manifest.webmanifest must exist");
  const manifest = JSON.parse(read("public/manifest.webmanifest"));
  assert(manifest.name === "NovelIdeas", "manifest name must be NovelIdeas");
  assert(manifest.short_name === "NovelIdeas", "manifest short_name must be NovelIdeas");
  assert(manifest.start_url === "/", "manifest start_url must be /");
  assert(manifest.scope === "/", "manifest scope must be /");
  assert(manifest.display === "standalone", "manifest display must be standalone");
  assert(manifest.background_color === "#07182b", "manifest background_color must be #07182b");
  assert(manifest.theme_color === "#07182b", "manifest theme_color must be #07182b");
});

run("R2_html_links_manifest_and_apple_meta", () => {
  const html = read("app/+html.tsx");
  assert(html.includes('name="apple-mobile-web-app-capable" content="yes"'), "apple mobile capable meta missing");
  assert(html.includes('name="apple-mobile-web-app-title" content="NovelIdeas"'), "apple title meta missing");
  assert(html.includes('name="apple-mobile-web-app-status-bar-style" content="black-translucent"'), "apple status bar meta missing");
  assert(html.includes('rel="manifest" href="/manifest.webmanifest"'), "manifest link missing");
  assert(html.includes('rel="apple-touch-icon" href="/apple-touch-icon.png"'), "apple touch icon link missing");
  assert(html.includes("viewport-fit=cover"), "viewport-fit=cover meta missing");
});

run("R3_safe_area_css_present", () => {
  const html = read("app/+html.tsx");
  assert(html.includes("safe-area-inset-top"), "top safe area inset missing");
  assert(html.includes("safe-area-inset-bottom"), "bottom safe area inset missing");
  assert(html.includes("body > div:first-child"), "root height style missing");
});

run("R4_icons_exist", () => {
  assert(existsSync(resolve(ROOT, "public", "apple-touch-icon.png")), "apple-touch-icon.png missing");
  assert(existsSync(resolve(ROOT, "public", "icon-192.png")), "icon-192.png missing");
  assert(existsSync(resolve(ROOT, "public", "icon-512.png")), "icon-512.png missing");
});

run("R5_internal_admin_nav_stays_in_app", () => {
  const tabsIndex = read("app/(tabs)/index.tsx");
  assert(!tabsIndex.includes('window.open("/admin-web", "_blank")'), "admin navigation still opens a new browser tab");
  assert(tabsIndex.includes('router.push("/app_admin-web" as any);'), "admin navigation must use in-app routing");
});

run("R6_rewrites_cover_standalone_routes", () => {
  const rewrites = JSON.parse(read("vercel.json")).rewrites.map((entry) => entry.source);
  for (const route of ["/testing", "/testing/:path*", "/app_admin-web", "/admin/:path*", "/admin-collection", "/how-it-works", "/feedback", "/privacy", "/about"]) {
    assert(rewrites.includes(route), `missing rewrite for ${route}`);
  }
});

const passed = results.filter((result) => result.ok);
const failed = results.filter((result) => !result.ok);

for (const result of passed) {
  console.log(`✓ ${result.name}`);
}

for (const result of failed) {
  console.log(`✗ ${result.name}`);
  console.log(`  ${result.error}`);
}

console.log();
console.log(`Results: ${passed.length} passed, ${failed.length} failed`);

if (failed.length > 0) {
  process.exitCode = 1;
}
