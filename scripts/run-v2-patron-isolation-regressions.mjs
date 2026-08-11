#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PATRON_ID_STORAGE_KEY,
  clearPatronRecordStores,
  pipelineSessionIdForPatron,
  pipelineUserIdForPatron,
  readOrCreatePatronId,
  recommendationHistoryKeyForPatron,
  resetPatronIdentity,
} from "../lib/patronIdentity.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const homeSource = readFileSync(resolve(repoRoot, "app", "(tabs)", "index.tsx"), "utf8");
const swipeSource = readFileSync(resolve(repoRoot, "screens", "SwipeDeckScreen.tsx"), "utf8");
const adultParity = JSON.parse(readFileSync(resolve(repoRoot, "scripts", "output", "scoring-s2-parity-post.json"), "utf8"));

class MemoryStorage {
  constructor(entries = {}) {
    this.values = new Map(Object.entries(entries));
  }
  get length() { return this.values.size; }
  key(index) { return Array.from(this.values.keys())[index] ?? null; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

function run(name, test) {
  test();
  process.stdout.write(`  PASS ${name}\n`);
}

run("distinct patrons derive independent recommendation scopes", () => {
  const storageA = new MemoryStorage();
  const storageB = new MemoryStorage();
  const patronA = readOrCreatePatronId(storageA, () => "reader-a");
  const patronB = readOrCreatePatronId(storageB, () => "reader-b");
  const userA = pipelineUserIdForPatron(patronA, "adult");
  const userB = pipelineUserIdForPatron(patronB, "adult");
  const sessionA = pipelineSessionIdForPatron(patronA, "adult", 0);
  const sessionB = pipelineSessionIdForPatron(patronB, "adult", 0);
  const historyA = recommendationHistoryKeyForPatron(patronA, "adult");
  const historyB = recommendationHistoryKeyForPatron(patronB, "adult");

  assert.notEqual(userA, userB);
  assert.notEqual(sessionA, sessionB);
  assert.notEqual(historyA, historyB);

  const personalityStore = {
    [userA]: { liked: ["literary", "romance"] },
    [userB]: { liked: ["science fiction", "technology"] },
  };
  const swipeStore = {
    [sessionA]: ["like:Possession", "dislike:Cryptonomicon"],
    [sessionB]: ["dislike:Possession", "like:Cryptonomicon"],
  };
  const recommendationHistory = {
    [historyA]: ["Possession"],
    [historyB]: ["Cryptonomicon"],
  };
  assert.notDeepEqual(personalityStore[userA], personalityStore[userB]);
  assert.notDeepEqual(swipeStore[sessionA], swipeStore[sessionB]);
  assert.notDeepEqual(recommendationHistory[historyA], recommendationHistory[historyB]);

  const candidates = [
    { title: "Possession", signals: ["literary", "romance"] },
    { title: "Cryptonomicon", signals: ["science fiction", "technology"] },
  ];
  const deriveInput = (userId, sessionId, historyKey) => ({
    userId,
    sessionId,
    likedSignals: personalityStore[userId].liked,
    swipeHistory: swipeStore[sessionId],
    priorRecommendations: recommendationHistory[historyKey],
  });
  const deriveResults = (input) => candidates
    .map((candidate) => ({
      title: candidate.title,
      score: candidate.signals.filter((signal) => input.likedSignals.includes(signal)).length,
    }))
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  const inputA = deriveInput(userA, sessionA, historyA);
  const inputB = deriveInput(userB, sessionB, historyB);
  const resultsA = deriveResults(inputA);
  const resultsB = deriveResults(inputB);

  assert.notDeepEqual(inputA, inputB);
  assert.equal(resultsA[0].title, "Possession");
  assert.equal(resultsB[0].title, "Cryptonomicon");
});

run("reset rotates identity, clears live patron state, and preserves configuration", () => {
  const storage = new MemoryStorage({
    [PATRON_ID_STORAGE_KEY]: "reader-old",
    "lib_config_yvhs": "{\"branding\":{\"libraryName\":\"YVHS\"}}",
    "novelideas_admin_libraries_v1": "[\"yvhs\"]",
    "novelideas_local_collection_recommendation_v1:yvhs": "{\"records\":[1]}",
  });
  const personalities = { "novelideas:reader-old:adult": { confidence: 0.9 } };
  const swipes = { "swipe-session:reader-old:adult:0": ["like"] };
  const moods = { "swipe-session:reader-old:adult:0": { confidence: 1 } };
  const histories = { "reader-old:adult": ["five-minds"] };

  const result = resetPatronIdentity(storage, () => "reader-new");
  clearPatronRecordStores(personalities, swipes, moods, histories);
  assert.equal(result.previousId, "reader-old");
  assert.equal(result.nextId, "reader-new");
  assert.equal(storage.getItem(PATRON_ID_STORAGE_KEY), "reader-new");
  assert.deepEqual(personalities, {});
  assert.deepEqual(swipes, {});
  assert.deepEqual(moods, {});
  assert.deepEqual(histories, {});
  assert.match(storage.getItem("lib_config_yvhs"), /YVHS/);
  assert.equal(storage.getItem("novelideas_admin_libraries_v1"), "[\"yvhs\"]");
  assert.equal(storage.getItem("novelideas_local_collection_recommendation_v1:yvhs"), "{\"records\":[1]}");
});

run("UI confirmation and pipeline wiring use patron identity", () => {
  assert.match(homeSource, /Reset User\?/);
  assert.match(homeSource, /window\.confirm/);
  assert.match(homeSource, /patronIdentityReady \? \(/);
  assert.match(homeSource, /patronId=\{patronId\}/);
  assert.match(swipeSource, /pipelineUserIdForPatron\(activePatronId, deckKey\)/);
  assert.match(swipeSource, /recommendationHistoryKeyForPatron\(activePatronId, targetDeckKey\)/);
  assert.match(swipeSource, /activePatronIdRef\.current !== recommendationPatronId/);
  assert.match(swipeSource, /activePatronIdRef\.current === recommendationPatronId/);
  assert.doesNotMatch(swipeSource, /`novelideas:\$\{deckKey\}`/);
});

run("observed repeated titles are a deterministic sci-fi slate", () => {
  const sciFiSlate = adultParity.rows.find(
    (run) => run.profileId === "scifi" && run.configId === "gb_nyt_ol",
  );
  assert.ok(sciFiSlate, "expected frozen sci-fi parity slate");
  const titles = sciFiSlate.finalSlate.map((item) => item.title);
  assert.ok(titles.includes("Five Minds"));
  assert.ok(titles.includes("Cryptonomicon"));
  assert.ok(titles.includes("Sweetpea"));
});

process.stdout.write("\nPatron isolation regressions passed.\n");
