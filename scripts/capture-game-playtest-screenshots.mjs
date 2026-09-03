import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const root = process.cwd();
const output = resolve(root, "artifacts", "game-playtest-screenshots");
const baseUrl = process.env.PLAYTEST_BASE_URL || "http://127.0.0.1:8081";
const browser = process.env.PLAYTEST_BROWSER || [
  process.env["PROGRAMFILES"] && `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
  process.env["PROGRAMFILES(X86)"] && `${process.env["PROGRAMFILES(X86)"]}\\Microsoft\\Edge\\Application\\msedge.exe`,
].find((path) => path && existsSync(path));
if (!browser) throw new Error("Set PLAYTEST_BROWSER to a Chrome or Edge executable; no browser was found.");
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
let server;
if (!process.env.PLAYTEST_BASE_URL) {
  const isWindows = process.platform === "win32";
  server = spawn(isWindows ? process.env.ComSpec : "npm", isWindows
    ? ["/d", "/s", "/c", "npm run web -- --port 8081"]
    : ["run", "web", "--", "--port", "8081"], {
    cwd: root, stdio: "inherit", windowsHide: true, env: { ...process.env, EXPO_PUBLIC_GAME_PLAYTEST_FIXTURES: "1" },
  });
  for (let attempt = 0; attempt < 45; attempt += 1) {
    try { if ((await fetch(baseUrl)).ok) break; } catch {}
    await delay(1000);
    if (attempt === 44) throw new Error("Expo web server did not become available.");
  }
}
const states = [
  "media-mania-start", "media-mania-like", "media-mania-dislike", "media-mania-unknown-replacement", "media-mania-unlock", "media-mania-cross-media",
  "last-bookshop-visitor-shelf", "last-bookshop-counter", "last-bookshop-pitch-charm", "last-bookshop-candle", "last-bookshop-result",
  "unwritten-map-exploration", "unwritten-map-encounter", "unwritten-map-choice-result", "unwritten-map-skip-result", "unwritten-map-journal",
  "cascade-level-start", "cascade-board", "cascade-catalyst-selection", "cascade-resolved", "cascade-success", "cascade-failure-retry",
];
const viewports = { desktop: [1440, 1000], tablet: [834, 1112], phone: [390, 844] };
try {
  for (const state of states) for (const [label, [width, height]] of Object.entries(viewports)) {
    const file = resolve(output, `${state}-${label}.png`);
    const url = `${baseUrl}/admin/game-playtest-fixtures?playtestFixture=${state}`;
    const fixtureSentinel = `game-playtest-fixture:${state}`;
    const browserEnv = { ...process.env, EXPO_PUBLIC_GAME_PLAYTEST_FIXTURES: "1" };
    const dom = spawnSync(browser, ["--headless=new", "--disable-gpu", `--window-size=${width},${height}`, "--dump-dom", url], { encoding: "utf8", env: browserEnv });
    if (dom.status !== 0 || !dom.stdout.includes(fixtureSentinel)) throw new Error(`Fixture sentinel was not rendered: ${state} ${label}. Refusing to capture a non-fixture page.`);
    const result = spawnSync(browser, ["--headless=new", "--disable-gpu", `--window-size=${width},${height}`, `--screenshot=${file}`, url], { stdio: "inherit", env: browserEnv });
    if (result.status !== 0 || !existsSync(file) || statSync(file).size < 2_000) throw new Error(`Screenshot failed or was unexpectedly small: ${state} ${label}`);
  }
  const expected = states.length * Object.keys(viewports).length;
  const captures = readdirSync(output).filter((file) => file.endsWith(".png"));
  if (captures.length !== expected) throw new Error(`Expected ${expected} screenshots but found ${captures.length}.`);
  console.log(`Captured and verified ${expected} PNGs in ${output}`);
} finally { if (server) server.kill(); }
