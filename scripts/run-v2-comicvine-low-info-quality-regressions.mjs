/**
 * Low-information ComicVine quality regressions.
 *
 * Coverage:
 * 1) Clearly unusable rows like "HC" with no creator/cover are hard-rejected before scoring.
 * 2) Weak ComicVine issue/volume rows accrue strong quality penalties.
 * 3) Legitimate metadata-rich ComicVine books still outrank weak low-information rows.
 */
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
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  module._compile(output, filename);
};

function assertTruthy(value, message) {
  if (!value) throw new Error(`${message}: expected truthy, got ${JSON.stringify(value)}`);
}

function assertLt(actual, expected, message) {
  if (!(Number(actual) < Number(expected))) throw new Error(`${message}: expected ${actual} < ${expected}`);
}

function assertGte(actual, expected, message) {
  if (!(Number(actual) >= Number(expected))) throw new Error(`${message}: expected ${actual} >= ${expected}`);
}

const dir = resolve(dirname(fileURLToPath(import.meta.url)), "../app/recommender-v2");
const { normalizeSourceResults } = require(resolve(dir, "normalize.ts"));
const { scoreCandidates } = require(resolve(dir, "score.ts"));
const { applyComicVineSourceAdmissionPolicy } = require(resolve(dir, "comicVineAdmission.ts"));

function makeProfile() {
  return {
    ageBand: "teens",
    maturityBand: "ms_hs",
    genreFamily: [{ value: "fantasy", weight: 3, evidence: ["like:fantasy"] }, { value: "adventure", weight: 2.5, evidence: ["like:adventure"] }],
    themes: [{ value: "quest", weight: 2, evidence: ["like:quest"] }],
    tone: [],
    characterDynamics: [],
    formatPreference: [{ value: "comic", weight: 1, evidence: ["like:comic"] }],
    avoidSignals: [],
    diagnostics: {},
  };
}

function comicRow(overrides = {}) {
  return {
    source: "comicVine",
    status: "succeeded",
    rawItems: [],
    diagnostics: { source: "comicVine", status: "succeeded", rawCount: 0, normalizedCount: 0 },
    ...overrides,
  };
}

function candidateRow(base) {
  return {
    id: base.id,
    sourceId: base.id,
    title: base.title,
    creators: base.creators || [],
    description: base.description,
    formats: ["comic"],
    genres: base.genres || ["fantasy", "adventure", "graphic novels", "comics"],
    themes: base.themes || ["quest"],
    publicationYear: 2020,
    sourceUrl: `https://comicvine.gamespot.com/${base.id}`,
    coverUrl: base.coverUrl,
    queryText: "fantasy adventure",
    queryFamily: "teen fantasy adventure",
    raw: {
      id: base.id,
      resource_type: "issue",
      name: base.title,
      deck: base.deck || "",
      description: base.description || "",
      issue_number: base.issueNumber,
      volume: base.volume || { id: 1, name: base.volumeName || base.title },
      person_credits: (base.creators || []).map((name) => ({ name })),
      imageUrl: base.coverUrl,
    },
  };
}

const weakHc = candidateRow({
  id: "hc-1",
  title: "HC",
  creators: [],
  description: "",
  coverUrl: "",
  issueNumber: "",
  volumeName: "Fantasy Hardcover",
  genres: ["fantasy", "adventure"],
  themes: [],
});

const weakIssue = candidateRow({
  id: "issue-5",
  title: "Fantasy Comics #5",
  creators: [],
  description: "Fantasy comic.",
  coverUrl: "",
  issueNumber: "5",
  volumeName: "Fantasy Comics",
  genres: ["fantasy", "adventure"],
  themes: [],
});

const strongBook = candidateRow({
  id: "starclimber",
  title: "Starclimber",
  creators: ["Kenneth Oppel"],
  description: "A richly described fantasy adventure about a daring quest through the skies, dangerous discoveries, and determined young heroes.",
  coverUrl: "https://covers.example/starclimber.jpg",
  issueNumber: "1",
  volumeName: "Starclimber",
  genres: ["fantasy", "adventure", "young adult", "graphic novels", "comics", "quest"],
  themes: ["quest", "airships", "friendship", "survival"],
});

async function main() {
  const normalized = normalizeSourceResults([comicRow({ rawItems: [weakHc, weakIssue, strongBook] })]);
  const admitted = applyComicVineSourceAdmissionPolicy(normalized, [{ source: "comicVine", status: "succeeded", rawItems: [weakHc, weakIssue, strongBook], diagnostics: { source: "comicVine", status: "succeeded", rawCount: 3, normalizedCount: 3 } }]);

  const admittedTitles = admitted.candidates.filter((candidate) => candidate.source === "comicVine").map((candidate) => candidate.title);
  assertTruthy(!admittedTitles.includes("HC"), "T1 HC must be hard-rejected before scoring");

  const scored = scoreCandidates(admitted.candidates, makeProfile());
  const weakIssueScore = scored.find((candidate) => candidate.title === "Fantasy Comics #5")?.score ?? -999;
  const strongBookScore = scored.find((candidate) => candidate.title === "Starclimber")?.score ?? -999;

  assertLt(weakIssueScore, strongBookScore, "T2 weak issue-like row must score below strong legitimate candidate");
  assertGte(strongBookScore, 1, "T3 legitimate metadata-rich ComicVine candidate should remain viable");

  console.log("PASS T1: HC low-information record is hard-rejected before scoring");
  console.log("PASS T2: weak issue-like ComicVine row scores below strong legitimate candidate");
  console.log("PASS T3: legitimate metadata-rich ComicVine candidate remains viable");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
