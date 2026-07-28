/**
 * Adult Kitsu source certification — Phase 2 baseline (14-run).
 *
 * Runs 14 adult profiles with Kitsu as the ONLY enabled source:
 *   googleBooks: false, openLibrary: false, comicVine: false,
 *   nyt: false, mock: false, localLibrary: false, kitsu: true
 *
 * Profiles (14 total):
 *   Stable fixtures (3): adult_a, adult_b, adult_c
 *   Random seeds   (3): 41827, 59314, 77209
 *   Weird profiles (8): horror_yes_violence_no, fantasy_military_history,
 *                        cozy_fantasy_true_crime, manga_not_anime,
 *                        likes_almost_everything, dislikes_almost_everything,
 *                        alternating_pattern, highly_contradictory
 *
 * Assertions checked per run (infrastructure/pipeline only — NO policy assertions):
 *   - kitsu diagnostic is present in result.diagnostics.sources
 *   - items, when present, have source === "kitsu"
 *   - items carry routingReason === "kitsu_v2_intent_adapter"
 *   - source status is one of succeeded/empty/failed/timed_out/skipped
 *
 * Count-contract target: >= 5 items (recorded; not a hard PASS gate here).
 *
 * Output: scripts/output/adult-kitsu-baseline-phase2.json
 */
import { createRequire } from "node:module";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");

process.env.EXPO_PUBLIC_KITSU_API_BASE_URL = "https://kitsu.app/api/edge";
process.env.EXPO_PUBLIC_COMICVINE_PROXY_URL = "undefined";
process.env.COMICVINE_PROXY_URL = "https://proxy.localhost/api/comicvine";

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

const dir = resolve(dirname(fileURLToPath(import.meta.url)), "../app/recommender-v2");
const { runRecommenderV2 } = require(resolve(dir, "engine.ts"));
const adultDeck = require(resolve(dirname(fileURLToPath(import.meta.url)), "../data/swipeDecks/adult.ts")).default;

// ── helpers ──────────────────────────────────────────────────────────────────

function assertTruthy(value, message) {
  if (!value) throw new Error(`${message}: expected truthy, got ${JSON.stringify(value)}`);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

// Mulberry32 seeded PRNG — deterministic across runs
function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

// Generate a deterministic like/dislike/skip sequence for a given seed
function seededSequence(seed, length = 8) {
  const rng = mulberry32(seed);
  const actions = [];
  for (let i = 0; i < length; i++) {
    const r = rng();
    if (r < 0.38) actions.push("like");
    else if (r < 0.62) actions.push("dislike");
    else actions.push("skip");
  }
  return actions;
}

function formatFromTagsForV2(tags) {
  const joined = tags.join(" ").toLowerCase();
  if (/\b(manga|anime)\b/.test(joined)) return joined.includes("anime") ? "anime" : "manga";
  if (/\b(comic|superhero)\b/.test(joined)) return "comic";
  if (/graphicnovel|graphic novel/.test(joined)) return "graphicNovel";
  return "book";
}

function buildSignalsFromPreset(sequence) {
  const cards = adultDeck.cards.slice(0, sequence.length);
  return cards.map((card, index) => {
    const tags = Array.isArray(card.tags) ? card.tags.map((tag) => String(tag || "").trim()).filter(Boolean) : [];
    const bareTags = tags.map((tag) => tag.replace(/^[a-zA-Z]+:/, "").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase());
    const genres = [card.genre, ...tags.filter((tag) => /^genre:/i.test(tag)).map((tag) => tag.replace(/^genre:/i, ""))]
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    const tones = tags.filter((tag) => /^(tone|mood):/i.test(tag)).map((tag) => tag.replace(/^(tone|mood):/i, ""));
    const themes = tags.filter((tag) => /^(theme|setting|stakes|graphicNovel):/i.test(tag)).map((tag) => tag.replace(/^(theme|setting|stakes|graphicNovel):/i, ""));
    const characterDynamics = tags.filter((tag) => /^(character|relationship|dynamic):/i.test(tag)).map((tag) => tag.replace(/^(character|relationship|dynamic):/i, ""));
    const action = sequence[index] || "skip";
    return {
      id: `${index + 1}-${String(card.title || "")}`,
      title: String(card.title || "").trim(),
      action: action === "like" ? "like" : action === "dislike" ? "dislike" : "skip",
      source: "mock",
      format: formatFromTagsForV2(tags),
      tags: bareTags,
      genres,
      tones,
      themes,
      characterDynamics,
      weight: action === "skip" ? 0.25 : 1,
    };
  });
}

// ── Profile definitions ───────────────────────────────────────────────────────
// Stable fixture sequences (from prior source baselines; 8-card sequences)
const STABLE_PROFILES = [
  { id: "adult_a", label: "Adult A — control", sequence: ["like", "like", "dislike", "skip", "like", "dislike", "like", "skip"] },
  { id: "adult_b", label: "Adult B — recovery-assisted", sequence: ["dislike", "dislike", "like", "skip", "dislike", "like", "skip", "like"] },
  { id: "adult_c", label: "Adult C — underfill/rollback", sequence: ["like", "skip", "like", "skip", "dislike", "like", "dislike", "like"] },
];

// Random seed profiles (8-card seeded sequences)
const SEED_PROFILES = [
  { id: "random_41827", label: "Random Seed 41827", sequence: seededSequence(41827, 8) },
  { id: "random_59314", label: "Random Seed 59314", sequence: seededSequence(59314, 8) },
  { id: "random_77209", label: "Random Seed 77209", sequence: seededSequence(77209, 8) },
];

// Weird profiles — semantically meaningful 8-card sequences against adult deck.
// Adult deck card indices (0-based):
//   0  Night Circus      fantasy, whimsical, atmospheric
//   1  The Road          dystopian, dark, survival (harsh violence in aversionTraits)
//   2  Gone Girl         thriller, mystery, dark (psychological, not graphic)
//   3  Name of the Wind  fantasy, epic
//   4  Project Hail Mary science fiction, comedy
//   5  Silent Patient    thriller, mystery, dark (psychological)
//   6  Circe             fantasy, mythology, atmospheric
//   7  Seven Husbands    drama, historical
const WEIRD_PROFILES = [
  {
    id: "weird_horror_yes_violence_no",
    label: "Horror yes, graphic violence no",
    // Like dark/psychological thriller; dislike titles known for graphic violence
    sequence: ["skip", "dislike", "like", "skip", "skip", "like", "skip", "skip"],
  },
  {
    id: "weird_fantasy_military_history",
    label: "Fantasy + Military History (corrected polarity)",
    // Like fantasy/dark-epic and survival (military-adjacent); dislike cozy domestic
    sequence: ["like", "like", "dislike", "like", "skip", "dislike", "like", "skip"],
  },
  {
    id: "weird_cozy_fantasy_true_crime",
    label: "Cozy Fantasy but also True Crime",
    // Like cozy/atmospheric fantasy AND crime/mystery; contradictory tone pairing
    sequence: ["like", "dislike", "like", "skip", "skip", "like", "like", "skip"],
  },
  {
    id: "weird_manga_not_anime",
    label: "Manga but not anime",
    // Like fantasy/mythology/epic (closest manga aesthetic in adult deck);
    // dislike movie/media titles; signals should produce manga-relevant queries
    sequence: ["like", "dislike", "skip", "like", "skip", "skip", "like", "skip"],
  },
  {
    id: "weird_likes_almost_everything",
    label: "Likes almost everything",
    sequence: ["like", "like", "like", "like", "like", "like", "like", "like"],
  },
  {
    id: "weird_dislikes_almost_everything",
    label: "Dislikes almost everything",
    sequence: ["dislike", "dislike", "dislike", "dislike", "dislike", "dislike", "dislike", "dislike"],
  },
  {
    id: "weird_alternating_pattern",
    label: "Alternating like/dislike",
    sequence: ["like", "dislike", "like", "dislike", "like", "dislike", "like", "dislike"],
  },
  {
    id: "weird_highly_contradictory",
    label: "Highly contradictory signals",
    // Like warm+cozy AND dark+grim; creates maximum signal conflict in planner
    sequence: ["like", "like", "dislike", "like", "dislike", "like", "dislike", "like"],
  },
];

const ALL_PROFILES = [...STABLE_PROFILES, ...SEED_PROFILES, ...WEIRD_PROFILES];

// ── Runner ────────────────────────────────────────────────────────────────────

async function runKitsuOnly(requestId, signals) {
  return runRecommenderV2({
    requestId,
    ageBand: "adult",
    limit: 5,
    enabledSources: {
      mock: false,
      googleBooks: false,
      openLibrary: false,
      kitsu: true,
      comicVine: false,
      localLibrary: false,
      nyt: false,
    },
    signals,
    deckKey: "adult",
  });
}

function kitsuDiag(result) {
  return asObject(asArray(result?.diagnostics?.sources).find((source) => source.source === "kitsu"));
}

function extractItemData(item) {
  const raw = asObject(item.raw);
  const rawAttrs = asObject(raw.attributes || raw.raw?.attributes);
  return {
    title: item.title || "",
    format: asArray(item.formats)[0] || "unknown",
    source: item.source,
    score: Number(item.score || 0).toFixed(2),
    subtype: String(rawAttrs.subtype || raw.mangaSubtype || "").trim() || null,
    ageRating: String(rawAttrs.ageRating || "").trim() || null,
    maturityBand: item.maturityBand || null,
    genres: asArray(item.genres).slice(0, 6),
    themes: asArray(item.themes).slice(0, 4),
    routingReason: String(item.diagnostics?.routingReason || "").trim() || null,
    sourceUrl: item.sourceUrl || null,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const runs = [];
  let totalPass = 0;
  let totalFail = 0;
  let contractPasses = 0;
  let contractFails = 0;
  let liveApiFailures = 0;
  const entityTypeCounts = {};
  const formatCounts = {};
  const failureReasonCounts = {};

  console.log(`\nAdult Kitsu Source Certification — Phase 2 baseline (${ALL_PROFILES.length} runs)`);
  console.log("Kitsu-only mode: all other sources disabled.\n");

  for (const profile of ALL_PROFILES) {
    const signals = buildSignalsFromPreset(profile.sequence);
    const requestId = `kitsu-cert-baseline-${profile.id}`;
    let result;
    let runError = null;

    try {
      result = await runKitsuOnly(requestId, signals);
    } catch (error) {
      runError = String(error?.message || error);
    }

    const diag = result ? kitsuDiag(result) : {};
    const items = asArray(result?.items);
    const itemCount = items.length;
    const kitsuStatus = String(diag.status || "error");
    const countContractPass = itemCount >= 5;
    const isLiveApiFailure = ["failed", "timed_out", "error"].includes(kitsuStatus) || !!runError;

    // Infrastructure assertions (contract regressions)
    let passCount = 0;
    let failCount = 0;
    const assertionResults = [];

    function check(name, fn) {
      try {
        fn();
        assertionResults.push({ name, pass: true });
        passCount += 1;
      } catch (err) {
        assertionResults.push({ name, pass: false, error: err.message });
        failCount += 1;
      }
    }

    if (result) {
      // K-I1: kitsu diagnostic is present
      check("K-I1: kitsu diagnostic present", () =>
        assertTruthy(diag.source === "kitsu", "kitsu source diagnostic missing"));

      // K-I2: items carry source=kitsu
      check("K-I2: items have source=kitsu", () => {
        for (const item of items) {
          assertEqual(item.source, "kitsu", `item "${item.title}" source`);
        }
      });

      // K-I3: items carry routingReason provenance
      check("K-I3: items carry routingReason provenance", () => {
        for (const item of items) {
          assertTruthy(
            String(item.diagnostics?.routingReason || "").includes("kitsu"),
            `item "${item.title}" missing kitsu routingReason`,
          );
        }
      });

      // K-I4: kitsu status is a known value
      check("K-I4: kitsu status is known", () =>
        assertTruthy(
          ["succeeded", "empty", "failed", "timed_out", "skipped"].includes(kitsuStatus),
          `unknown status "${kitsuStatus}"`,
        ));
    } else {
      check("K-I0: run completed without exception", () => {
        if (runError) throw new Error(runError);
      });
    }

    if (countContractPass) {
      contractPasses += 1;
    } else {
      contractFails += 1;
      const reason = runError
        ? "run_exception"
        : kitsuStatus === "failed" || kitsuStatus === "timed_out"
          ? `api_${kitsuStatus}`
          : kitsuStatus === "empty"
            ? "api_empty"
            : `underfill_${itemCount}`;
      failureReasonCounts[reason] = (failureReasonCounts[reason] || 0) + 1;
    }

    if (isLiveApiFailure) liveApiFailures += 1;

    totalPass += passCount;
    totalFail += failCount;

    // Tally entity distribution from raw source diagnostics
    const rawTitles = asArray(diag.rawTitles);

    // Extract per-item data
    const itemData = items.map(extractItemData);

    // Tally formats from final items
    for (const item of itemData) {
      const fmt = item.format || "unknown";
      formatCounts[fmt] = (formatCounts[fmt] || 0) + 1;
    }

    // Tally subtype from final items
    for (const item of itemData) {
      const subtype = item.subtype || "unknown";
      entityTypeCounts[subtype] = (entityTypeCounts[subtype] || 0) + 1;
    }

    const runRecord = {
      profileId: profile.id,
      profileLabel: profile.label,
      sequence: profile.sequence,
      kitsuStatus,
      rawCount: Number(diag.rawCount || 0),
      rawApiCount: Number(diag.rawApiResultCount || 0),
      normalizedCount: Number(diag.normalizedCount || 0),
      finalItemCount: itemCount,
      countContractPass,
      assertionPass: passCount,
      assertionFail: failCount,
      assertionResults,
      items: itemData,
      rawTitles: rawTitles.slice(0, 10),
      dominantQuery: asArray(diag.queries)[0] || null,
      queries: asArray(diag.queries),
      failedReason: diag.failedReason || null,
      emptyReason: diag.emptyReason || null,
      runError: runError || null,
    };

    const contractIcon = countContractPass ? "✓" : "✗";
    const assertionIcon = failCount === 0 ? "✓" : "✗";
    console.log(
      `  [${contractIcon}/${assertionIcon}] ${profile.id.padEnd(35)} ` +
      `status=${kitsuStatus.padEnd(10)} final=${String(itemCount).padStart(2)}/5  ` +
      `raw=${String(Number(diag.rawCount || 0)).padStart(3)}  ` +
      `queries=[${asArray(diag.queries).map((q) => q.slice(0, 25)).join(" | ")}]`,
    );

    if (failCount > 0) {
      for (const a of assertionResults.filter((a) => !a.pass)) {
        console.log(`      FAIL ${a.name}: ${a.error}`);
      }
    }

    runs.push(runRecord);
  }

  // Summary
  const totalRuns = ALL_PROFILES.length;
  console.log("\n─────────────────────────────────────────────────────────────────");
  console.log(`Count-contract (≥5 final): ${contractPasses}/${totalRuns} pass, ${contractFails}/${totalRuns} fail`);
  console.log(`Infrastructure assertions: ${totalPass} pass, ${totalFail} fail`);
  console.log(`Live API failures: ${liveApiFailures}/${totalRuns}`);
  console.log("\nFormat distribution (final items):", JSON.stringify(formatCounts));
  console.log("Entity subtype distribution (final items):", JSON.stringify(entityTypeCounts));
  if (Object.keys(failureReasonCounts).length > 0) {
    console.log("Count-contract failure reasons:", JSON.stringify(failureReasonCounts));
  }

  // Write artifact
  const artifact = {
    phase: "phase2-baseline",
    source: "kitsu",
    generatedAt: new Date().toISOString(),
    runCount: totalRuns,
    countContractPasses: contractPasses,
    countContractFails: contractFails,
    infrastructureAssertionPasses: totalPass,
    infrastructureAssertionFails: totalFail,
    liveApiFailures,
    formatDistribution: formatCounts,
    entitySubtypeDistribution: entityTypeCounts,
    countContractFailureReasons: failureReasonCounts,
    runs,
  };

  const outDir = resolve(dirname(fileURLToPath(import.meta.url)), "output");
  const outPath = resolve(outDir, "adult-kitsu-baseline-phase2.json");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(`\nArtifact saved: ${outPath}`);

  if (totalFail > 0) {
    console.error(`\nFAIL: ${totalFail} infrastructure assertion(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log("\nAll infrastructure assertions passed.");
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exitCode = 1;
});
