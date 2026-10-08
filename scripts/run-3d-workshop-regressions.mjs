import assert from "node:assert/strict";
import fs from "node:fs";

const screen = fs.readFileSync("app/3d-workshop.tsx", "utf8");
const api = fs.readFileSync("api/3d-generate.ts", "utf8");
const layout = fs.readFileSync("app/_layout.tsx", "utf8");
const home = fs.readFileSync("app/(tabs)/index.tsx", "utf8");

assert(screen.includes("3D Workshop"), "3D Workshop screen title is missing");
assert(screen.includes('fetch("/api/3d-generate"'), "3D Workshop must call its server API");
assert(screen.includes("Save GLB"), "3D Workshop must expose GLB download");
assert(screen.includes("model-viewer"), "3D Workshop must render the generated GLB");
assert(api.includes("STABILITY_API_KEY"), "server API must use a server-only Stability key");
assert(api.includes("https://api.stability.ai/v2beta/3d/stable-fast-3d"), "Stable Fast 3D endpoint is missing");
assert(api.includes("origin_rejected"), "server API must reject cross-origin posts");
assert(layout.includes('name="3d-workshop"'), "root layout must register the workshop route");
assert(home.includes('openInfoScreen("/3d-workshop")'), "main menu must link to the workshop");

console.log("PASS 3D Workshop V1 route, API, viewer, download, and navigation contract");
