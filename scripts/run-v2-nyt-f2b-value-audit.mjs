/**
 * NYT-F2B: Recommendation-value audit (read-only, live API calls).
 *
 * Experimental design: single variable — NYT enabled vs disabled.
 * For each of 4 adult genre profiles:
 *
 *   Run A: GB + OL + NYT enabled     (same signals)
 *   Run B: GB + OL only              (same signals, NYT disabled)
 *
 * Metrics collected:
 *   1. Unique contribution  — NYT candidates not in GB or OL raw pools
 *   2. Candidate flow       — NYT at each pipeline stage (retrieved → slate)
 *   3. Slate contribution   — final titles that exist only because NYT ran
 *   4. Replacement analysis — what title in B was displaced by a NYT addition in A
 *   5. Source agreement     — per-title GB/OL/NYT ✓/✗ matrix (A run only)
 *   6. Author diversity     — unique authors per slate, A vs B
 *   7. Recency/bias         — median pub year of NYT-only vs baseline titles
 *
 * Pre-defined success criteria (evaluated at end):
 *   NYT adds value if:
 *     • it contributes ≥ 1 unique candidate per route (on average)
 *     AND any such candidates survive into at least some final slates
 *     AND they do not measurably reduce author diversity
 *
 * Makes NO production code changes.
 * Serializes runs with 30 s gaps between A and B to avoid quota entanglement.
 */

import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
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

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const outDir = resolve(scriptDir, "output");
mkdirSync(outDir, { recursive: true });

// ── env ──────────────────────────────────────────────────────────────────────

function parseDotEnv(path) {
  try {
    const raw = readFileSync(path, "utf8");
    const out = {};
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx <= 0) continue;
      out[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
    }
    return out;
  } catch {
    return {};
  }
}

const localEnv = parseDotEnv(resolve(repoRoot, ".env"));
for (const k of ["NYT_BOOKS_API_KEY", "EXPO_PUBLIC_NYT_BOOKS_API_KEY", "NEXT_PUBLIC_NYT_BOOKS_API_KEY",
  "GOOGLE_BOOKS_API_KEY", "EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY", "NEXT_PUBLIC_GOOGLE_BOOKS_API_KEY"]) {
  if (!process.env[k] && localEnv[k]) process.env[k] = localEnv[k];
}

const { runRecommenderV2 } = require(resolve(repoRoot, "app/recommender-v2/engine.ts"));

// ── helpers ───────────────────────────────────────────────────────────────────

function asObject(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
function asArray(v) { return Array.isArray(v) ? v : []; }
function text(v) { return String(v || "").trim(); }
function norm(v) { return text(v).toLowerCase().replace(/\s+/g, " "); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function stageCount(diagnostics, stage, keyName) {
  const row = asArray(diagnostics.stages).find((e) => text(asObject(e).stage) === stage);
  return Number(asObject(row).counts?.[keyName] || 0);
}

function sourceDiag(diagnostics, sourceName) {
  return asObject(asArray(diagnostics.sources).find((s) => asObject(s).source === sourceName));
}

function slateItems(result) {
  return asArray(result.items).map((item) => {
    const raw = asObject(asObject(item).raw);
    return {
      title: text(asObject(item).title || raw.title),
      authors: asArray(asObject(item).authors || raw.authors || []).map(text),
      source: text(asObject(item).source || raw.source),
      publicationYear: Number(asObject(item).publicationYear || raw.first_publish_year || raw.publicationYear || 0),
    };
  });
}

function titleSet(items) {
  return new Set(items.map((i) => norm(i.title)));
}

function authorSet(items) {
  const out = new Set();
  for (const item of items) {
    for (const a of item.authors) {
      const n = norm(a);
      if (n) out.add(n);
    }
  }
  return out;
}

function medianPubYear(items) {
  const years = items.map((i) => i.publicationYear).filter((y) => y > 1900 && y <= new Date().getFullYear() + 2);
  if (!years.length) return null;
  years.sort((a, b) => a - b);
  const mid = Math.floor(years.length / 2);
  return years.length % 2 === 0 ? Math.round((years[mid - 1] + years[mid]) / 2) : years[mid];
}

// Source-agreement matrix for a single run's slate.
// Checks whether each slate title appears in the raw pool of each source.
function buildAgreementMatrix(slateItems, gbDiag, olDiag, nytDiag) {
  const gbTitles = new Set(asArray(gbDiag.rawTitles).map(norm));
  const olTitles = new Set(asArray(olDiag.rawTitles).map(norm));
  const nytTitles = new Set(asArray(nytDiag.nytNormalizedTitles).map(norm));

  return slateItems.map((item) => {
    const t = norm(item.title);
    return {
      title: item.title,
      inSlateSource: item.source,
      gb: gbTitles.has(t),
      ol: olTitles.has(t),
      nyt: nytTitles.has(t),
      agreementCount: (gbTitles.has(t) ? 1 : 0) + (olTitles.has(t) ? 1 : 0) + (nytTitles.has(t) ? 1 : 0),
    };
  });
}

// Replacement analysis: for each title in A not in B, find the closest B title
// that is in B but not A — these are what NYT "displaced".
function replacementAnalysis(aSlate, bSlate) {
  const aTitles = titleSet(aSlate);
  const bTitles = titleSet(bSlate);
  const nytAdditions = aSlate.filter((i) => !bTitles.has(norm(i.title)));
  const nytRemovals = bSlate.filter((i) => !aTitles.has(norm(i.title)));
  // Pair additions with removals by slate position (simple positional matching).
  const pairs = [];
  const maxLen = Math.max(nytAdditions.length, nytRemovals.length);
  for (let idx = 0; idx < maxLen; idx++) {
    pairs.push({
      removed: nytRemovals[idx]?.title ?? null,
      replacedBy: nytAdditions[idx]?.title ?? null,
      replacedBySource: nytAdditions[idx]?.source ?? null,
    });
  }
  return { nytAdditions: nytAdditions.map((i) => i.title), nytRemovals: nytRemovals.map((i) => i.title), pairs };
}

// NYT unique contribution: titles in NYT raw pool not present in GB or OL raw pools.
function nytUniqueContribution(gbDiag, olDiag, nytDiag) {
  const gbTitles = new Set(asArray(gbDiag.rawTitles).map(norm));
  const olTitles = new Set(asArray(olDiag.rawTitles).map(norm));
  const nytRawTitles = asArray(nytDiag.nytNormalizedTitles);
  const uniqueToNyt = nytRawTitles.filter((t) => !gbTitles.has(norm(t)) && !olTitles.has(norm(t)));
  return { nytRawCount: nytRawTitles.length, uniqueToNytCount: uniqueToNyt.length, uniqueToNytTitles: uniqueToNyt };
}

// ── profiles ─────────────────────────────────────────────────────────────────

const PROFILES = [
  {
    id: "mystery-thriller",
    label: "Mystery / Thriller",
    ageBand: "adult",
    signals: [
      { action: "like", title: "Gone Girl", genres: ["psychological thriller", "mystery"], themes: ["crime", "suspense"], format: "book" },
      { action: "like", title: "The Girl with the Dragon Tattoo", genres: ["crime", "thriller"], themes: ["investigation", "dark"], format: "book" },
      { action: "like", title: "The Secret History", genres: ["literary fiction", "crime drama"], themes: ["dark academia", "obsession"], format: "book" },
    ],
  },
  {
    id: "scifi-fantasy",
    label: "Science Fiction / Fantasy",
    ageBand: "adult",
    signals: [
      { action: "like", title: "All Systems Red", genres: ["science fiction", "adventure"], themes: ["space", "humor"], format: "book" },
      { action: "like", title: "Legends & Lattes", genres: ["cozy fantasy", "fantasy"], themes: ["comfort", "found family"], format: "book" },
      { action: "like", title: "The Long Way to a Small Angry Planet", genres: ["science fiction"], themes: ["found family", "adventure"], format: "book" },
    ],
  },
  {
    id: "historical-literary",
    label: "Historical / Literary",
    ageBand: "adult",
    signals: [
      { action: "like", title: "11/22/63", genres: ["historical fiction", "science fiction"], themes: ["drama", "alternate history"], format: "book" },
      { action: "like", title: "The Plot Against America", genres: ["historical fiction"], themes: ["political", "drama"], format: "book" },
      { action: "like", title: "Dark Matter", genres: ["science fiction", "thriller"], themes: ["suspense", "identity"], format: "book" },
    ],
  },
  {
    id: "general-contemporary",
    label: "General / Contemporary Fiction",
    ageBand: "adult",
    signals: [
      { action: "like", title: "The Midnight Library", genres: ["contemporary fiction", "literary fiction"], themes: ["life choices", "hope"], format: "book" },
      { action: "like", title: "A Man Called Ove", genres: ["contemporary fiction"], themes: ["community", "grief"], format: "book" },
      { action: "like", title: "Where the Crawdads Sing", genres: ["mystery", "literary fiction"], themes: ["nature", "coming of age"], format: "book" },
    ],
  },
];

// ── run one profile pair ──────────────────────────────────────────────────────

async function runProfilePair(profile, limit = 6) {
  console.log(`\n── ${profile.label} ──`);

  // Run A: all three adult sources enabled.
  console.log("  Run A (GB + OL + NYT)...");
  const resultA = await runRecommenderV2({
    requestId: `nyt-f2b-a-${profile.id}`,
    ageBand: profile.ageBand,
    limit,
    enabledSources: { nyt: true, googleBooks: true, openLibrary: true, kitsu: false, comicVine: false, localLibrary: false, mock: false },
    signals: profile.signals,
  });

  console.log(`    slate: ${asArray(resultA.items).length} items — waiting 30 s before Run B...`);
  // Wait to avoid GB/OL rate-limit interference between the two runs.
  await sleep(30_000);

  // Run B: GB + OL only (NYT disabled). Same signals, same profile.
  console.log("  Run B (GB + OL only)...");
  const resultB = await runRecommenderV2({
    requestId: `nyt-f2b-b-${profile.id}`,
    ageBand: profile.ageBand,
    limit,
    enabledSources: { nyt: false, googleBooks: true, openLibrary: true, kitsu: false, comicVine: false, localLibrary: false, mock: false },
    signals: profile.signals,
  });

  console.log(`    slate: ${asArray(resultB.items).length} items`);

  // ── extract diagnostics ─────────────────────────────────────────────────────

  const diagA = asObject(resultA.diagnostics);
  const diagB = asObject(resultB.diagnostics);

  const gbDiagA = sourceDiag(diagA, "googleBooks");
  const olDiagA = sourceDiag(diagA, "openLibrary");
  const nytDiagA = sourceDiag(diagA, "nyt");
  const gbDiagB = sourceDiag(diagB, "googleBooks");
  const olDiagB = sourceDiag(diagB, "openLibrary");

  const slateA = slateItems(resultA);
  const slateB = slateItems(resultB);

  // ── candidate flow (NYT) ────────────────────────────────────────────────────
  // Pipeline stages where per-source counts are available from existing diagnostics.
  const nytRetrieved = Number(nytDiagA.nytConvertedCount || 0);
  const nytDroppedBeforeNorm = Number(nytDiagA.droppedBeforeDocCount || 0);
  // "entered scoring" and "eligible" can't be broken out per-source with current
  // diagnostics — record what's measurable and note the gap.
  const nytInFinalSlate = slateA.filter((i) => i.source === "nyt").length;
  const nytInFinalSlateTitles = slateA.filter((i) => i.source === "nyt").map((i) => i.title);

  const candidateFlow = {
    nytRetrievedFromApi: Number(nytDiagA.nytRawBookCount || 0),
    nytConverted: nytRetrieved,
    nytDroppedInConversion: Number(nytDiagA.nytDroppedCount || 0),
    // No per-source breakdown at normalization/scoring stages — engine-aggregate only:
    totalNormalizedA: stageCount(diagA, "normalized", "normalized"),
    totalScoredA: stageCount(diagA, "scored", "scored"),
    nytInFinalSlate,
    nytInFinalSlateTitles,
    nytUsedOverview: Boolean(nytDiagA.nytUsedOverview),
    nytQuotaBlocked: Boolean(nytDiagA.nytQuotaBlocked),
  };

  // ── unique contribution ─────────────────────────────────────────────────────
  const uniqueContrib = nytUniqueContribution(gbDiagA, olDiagA, nytDiagA);

  // ── source agreement matrix ─────────────────────────────────────────────────
  const agreementMatrix = buildAgreementMatrix(slateA, gbDiagA, olDiagA, nytDiagA);

  // ── slate comparison and replacement ───────────────────────────────────────
  const replacement = replacementAnalysis(slateA, slateB);

  // ── diversity ──────────────────────────────────────────────────────────────
  const authorsA = authorSet(slateA);
  const authorsB = authorSet(slateB);
  const diversity = {
    uniqueAuthorsA: authorsA.size,
    uniqueAuthorsB: authorsB.size,
    slateSizeA: slateA.length,
    slateSizeB: slateB.length,
    authorDiversityRatioA: slateA.length ? authorsA.size / slateA.length : 0,
    authorDiversityRatioB: slateB.length ? authorsB.size / slateB.length : 0,
  };

  // ── recency / bias ─────────────────────────────────────────────────────────
  const nytOnlyItems = slateA.filter((i) => {
    const t = norm(i.title);
    const inB = titleSet(slateB).has(t);
    return !inB && i.source === "nyt";
  });
  const baselineItems = slateA.filter((i) => {
    const t = norm(i.title);
    return titleSet(slateB).has(t); // titles that appear in both A and B
  });
  const recency = {
    medianPubYearBaseline: medianPubYear(baselineItems),
    medianPubYearNytOnly: medianPubYear(nytOnlyItems),
    medianPubYearSlateA: medianPubYear(slateA),
    medianPubYearSlateB: medianPubYear(slateB),
  };

  // ── source pool sizes ──────────────────────────────────────────────────────
  const poolSizes = {
    gbRawCountA: Number(gbDiagA.rawCount || 0),
    olRawCountA: Number(olDiagA.rawCount || 0),
    nytRawCountA: Number(nytDiagA.nytConvertedCount || 0),
    gbStatusA: text(gbDiagA.status),
    olStatusA: text(olDiagA.status),
    nytStatusA: text(nytDiagA.status),
    gbRawCountB: Number(gbDiagB.rawCount || 0),
    olRawCountB: Number(olDiagB.rawCount || 0),
  };

  // ── console summary ────────────────────────────────────────────────────────
  console.log(`    GB raw A/B: ${poolSizes.gbRawCountA}/${poolSizes.gbRawCountB}  OL raw A/B: ${poolSizes.olRawCountA}/${poolSizes.olRawCountB}  NYT raw A: ${poolSizes.nytRawCountA}`);
  console.log(`    NYT retrieved=${nytDiagA.nytRawBookCount}, converted=${nytDiagA.nytConvertedCount}, inFinalSlate=${nytInFinalSlate}`);
  console.log(`    NYT unique (not in GB/OL): ${uniqueContrib.uniqueToNytCount}/${uniqueContrib.nytRawCount}`);
  console.log(`    Slate A: ${slateA.map((i) => i.title).join(", ") || "(empty)"}`);
  console.log(`    Slate B: ${slateB.map((i) => i.title).join(", ") || "(empty)"}`);
  if (replacement.nytAdditions.length) console.log(`    NYT additions to slate: ${replacement.nytAdditions.join(", ")}`);
  if (replacement.nytRemovals.length) console.log(`    Displaced from slate:   ${replacement.nytRemovals.join(", ")}`);
  console.log(`    Author diversity A/B: ${authorsA.size}/${authorsB.size} unique authors`);
  console.log(`    Agreement matrix:`);
  for (const row of agreementMatrix) {
    console.log(`      "${row.title.slice(0, 40)}"  GB:${row.gb ? "✓" : "✗"}  OL:${row.ol ? "✓" : "✗"}  NYT:${row.nyt ? "✓" : "✗"}  (${row.agreementCount}/3)`);
  }

  return {
    profileId: profile.id,
    profileLabel: profile.label,
    candidateFlow,
    uniqueContribution: uniqueContrib,
    replacementAnalysis: replacement,
    agreementMatrix,
    diversity,
    recency,
    poolSizes,
    slateTitlesA: slateA.map((i) => i.title),
    slateTitlesB: slateB.map((i) => i.title),
  };
}

// ── success criteria ──────────────────────────────────────────────────────────

function evaluateSuccessCriteria(profiles) {
  const totalProfiles = profiles.length;
  const profilesWithUniqueContrib = profiles.filter((p) => p.uniqueContribution.uniqueToNytCount > 0).length;
  const profilesWithSlateContrib = profiles.filter((p) => p.candidateFlow.nytInFinalSlate > 0).length;
  const avgUniquePerProfile = profiles.reduce((sum, p) => sum + p.uniqueContribution.uniqueToNytCount, 0) / totalProfiles;
  const totalNytSlateAdditions = profiles.reduce((sum, p) => sum + p.replacementAnalysis.nytAdditions.length, 0);
  const diversityPreserved = profiles.every((p) => p.diversity.authorDiversityRatioA >= p.diversity.authorDiversityRatioB * 0.9);

  // Success: ≥ 1 unique candidate per route on average AND some slate survival AND diversity not reduced.
  const nytAddsUniquesCandidates = avgUniquePerProfile >= 1;
  const nytReachesSlate = totalNytSlateAdditions > 0 || profilesWithSlateContrib > 0;
  const nytPreservesDiversity = diversityPreserved;

  const verdict = nytAddsUniquesCandidates && nytReachesSlate && nytPreservesDiversity
    ? "NYT_ADDS_MEANINGFUL_VALUE"
    : nytAddsUniquesCandidates && !nytReachesSlate
      ? "NYT_CONTRIBUTES_CANDIDATES_FILTERED_BEFORE_SLATE"
      : !nytAddsUniquesCandidates && nytReachesSlate
        ? "NYT_SLATE_IMPACT_FROM_OVERLAPPING_POOL"
        : "NYT_CONTRIBUTION_UNCLEAR";

  return {
    totalProfiles,
    profilesWithUniqueContrib,
    profilesWithSlateContrib,
    avgUniquePerProfile,
    totalNytSlateAdditions,
    diversityPreserved,
    criteria: {
      nytAddsUniquesCandidates,
      nytReachesSlate,
      nytPreservesDiversity,
    },
    verdict,
  };
}

// ── main ──────────────────────────────────────────────────────────────────────

console.log("\n══════════════════════════════════════════════════════════");
console.log("NYT-F2B: Recommendation-Value Audit");
console.log("══════════════════════════════════════════════════════════");
console.log("Design: A (GB+OL+NYT) vs B (GB+OL only) — one variable, four profiles");
console.log(`Profiles: ${PROFILES.map((p) => p.label).join(", ")}\n`);

const profileResults = [];
for (const profile of PROFILES) {
  const result = await runProfilePair(profile, 6);
  profileResults.push(result);
  // Brief pause between profile pairs to avoid quota pressure.
  if (profile !== PROFILES[PROFILES.length - 1]) {
    console.log("  Cooling down 20 s before next profile...");
    await sleep(20_000);
  }
}

const successCriteria = evaluateSuccessCriteria(profileResults);

// ── final summary ─────────────────────────────────────────────────────────────

console.log("\n══════════════════════════════════════════════════════════");
console.log("F2B SUMMARY");
console.log("══════════════════════════════════════════════════════════\n");

for (const p of profileResults) {
  const flow = p.candidateFlow;
  const uniq = p.uniqueContribution;
  const div = p.diversity;
  const rep = p.replacementAnalysis;
  console.log(`${p.profileLabel}`);
  console.log(`  NYT flow:   retrieved=${flow.nytRetrievedFromApi} → converted=${flow.nytConverted} → inSlate=${flow.nytInFinalSlate}`);
  console.log(`  Unique (not in GB/OL raw): ${uniq.uniqueToNytCount}/${uniq.nytRawCount}`);
  console.log(`  Slate additions (NYT): ${rep.nytAdditions.length}  displacements: ${rep.nytRemovals.length}`);
  console.log(`  Author diversity: A=${div.uniqueAuthorsA}/${div.slateSizeA}  B=${div.uniqueAuthorsB}/${div.slateSizeB}`);
  if (rep.pairs.some((pair) => pair.removed || pair.replacedBy)) {
    console.log("  Replacement pairs:");
    for (const pair of rep.pairs) {
      console.log(`    "${pair.removed ?? "—"}" → replaced by → "${pair.replacedBy ?? "—"}"`);
    }
  }
  console.log();
}

console.log("Success criteria evaluation:");
console.log(`  Profiles with ≥1 unique NYT candidate: ${successCriteria.profilesWithUniqueContrib}/${successCriteria.totalProfiles}`);
console.log(`  Avg unique-to-NYT per profile:         ${successCriteria.avgUniquePerProfile.toFixed(1)}`);
console.log(`  Profiles with NYT in final slate:       ${successCriteria.profilesWithSlateContrib}/${successCriteria.totalProfiles}`);
console.log(`  Total NYT slate additions:              ${successCriteria.totalNytSlateAdditions}`);
console.log(`  Diversity preserved (A ≥ 90% of B):   ${successCriteria.diversityPreserved}`);
console.log(`\nVERDICT: ${successCriteria.verdict}`);

// ── save artifacts ────────────────────────────────────────────────────────────

const artifact = {
  auditTimestamp: new Date().toISOString(),
  design: "A (GB+OL+NYT) vs B (GB+OL only) — single variable: NYT enabled/disabled",
  profiles: profileResults,
  successCriteria,
  hypothesis: {
    predicted: "GB=semantic leader; OL=long-tail; NYT=few unique but recognizable/contemporary",
    verdictMatches: successCriteria.verdict === "NYT_ADDS_MEANINGFUL_VALUE" || successCriteria.verdict === "NYT_CONTRIBUTES_CANDIDATES_FILTERED_BEFORE_SLATE",
  },
};

const jsonPath = resolve(outDir, "nyt-f2b-value-audit.json");
writeFileSync(jsonPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
console.log(`\nArtifact saved: ${jsonPath}`);
