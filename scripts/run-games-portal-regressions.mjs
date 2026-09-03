import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = fs.readFileSync(path.join(root, "app", "games", "index.tsx"), "utf8");

const mappings = [
  ["media-mania", "Media Mania", "media-mania.webp", 'route: "/media-mania"'],
  ["last-bookshop", "The Last Bookshop", "last-bookshop.webp", 'route: "/games/last-bookshop"'],
  ["unwritten-map", "The Unwritten Map", "unwritten-map.webp", 'route: "/games/unwritten-map"'],
  ["alchemists-cascade", "The Alchemist’s Cascade", "alchemists-cascade.webp", 'route: "/games/alchemists-cascade"'],
];

for (const [id, title, image, route] of mappings) {
  assert(source.includes(`id: "${id}"`), `${title} card must render`);
  assert(source.includes(`title: "${title}"`), `${title} must retain its title`);
  assert(source.includes(`assets/games/${image}`), `${title} must use ${image}`);
  assert(source.includes(route), `${title} must retain its route`);
  assert(fs.existsSync(path.join(root, "assets", "games", image)), `${image} must exist`);
}

assert.equal((source.match(/imageAlt: "/g) || []).length, 4, "every game illustration must have alt text");
assert.equal((source.match(/aspectRatio: 16 \/ 9/g) || []).length, 1, "the portal must reserve the supplied image aspect ratio");
assert(source.includes("GAME_CARDS.map"), "all portal cards must render from the maintainable configuration");
assert(source.includes("router.back()"), "the Back button behavior must remain intact");
assert(source.includes("IntersectionObserver"), "below-the-fold artwork must be mounted lazily near the viewport");
assert(source.includes('rootMargin: "240px 0px"'), "lazy artwork must preload shortly before entering view");
assert(source.includes('priority={deferArtwork ? "low" : "high"}'), "first-row artwork must retain high loading priority");

const optimizedBytes = mappings.reduce((total, [, , image]) => (
  total + fs.statSync(path.join(root, "assets", "games", image)).size
), 0);
assert(optimizedBytes < 1_100_000, "optimized hero artwork must stay below the 1.1 MB transfer budget");

console.log("games_portal_regressions: ok");
