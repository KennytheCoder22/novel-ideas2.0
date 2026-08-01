#!/usr/bin/env node
/**
 * Frozen/Live Delta Reporter — Phase IV Live Observation
 *
 * Compares field-presence rates from Tier 1 live observation artifacts against
 * Phase I (GCD) and Phase II (ComicVine) fixture-class baselines and reports
 * schema drift.
 *
 * Inputs:
 *   --gcd-live <path>         Path to GCD Tier 1 observation artifact (default: frozen/gcd-live-observation-v1.json)
 *   --comicvine-live <path>   Path to ComicVine Tier 1 observation artifact (default: frozen/comicvine-live-observation-v1.json)
 *   --output <dir>            Output directory for delta report (default: artifacts/live-evidence/delta)
 *
 * Outputs:
 *   delta-report.json — machine-readable delta report (per source, per field)
 *   delta-report.md   — human-readable summary
 *
 * Does NOT:
 *   - Modify any frozen artifact
 *   - Make network calls
 *   - Change fixture-class characterization results
 *   - Determine source superiority or production suitability
 *
 * Drift status taxonomy (per capture-protocol.md §4):
 *   no_drift           — absolute delta ≤ 0.10
 *   minor_drift        — 0.10 < absolute delta ≤ 0.30
 *   schema_drift_suspected — absolute delta > 0.30
 *   schema_drift_critical  — field was 1.0 in fixture, now ≤ 0.10 in live
 *   fixture_baseline_unavailable — no fixture-class baseline for the field
 *   live_artifact_unavailable    — live observation artifact not present or pending legal clearance
 *
 * Governance:
 *   scripts/live-evidence/capture-protocol.md §10
 *   docs/GRAPHIC_NOVEL_LIVE_EVIDENCE_LICENSING_DECISION.md
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "../..");

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const gcdLivePath = resolve(repoRoot, option("--gcd-live", "scripts/live-evidence/frozen/gcd-live-observation-v1.json"));
const cvLivePath = resolve(repoRoot, option("--comicvine-live", "scripts/live-evidence/frozen/comicvine-live-observation-v1.json"));
const outputDir = resolve(repoRoot, option("--output", "artifacts/live-evidence/delta"));

// ---------------------------------------------------------------------------
// Drift classification
// ---------------------------------------------------------------------------

function classifyDrift(fixtureRate, liveRate) {
  if (fixtureRate === null || liveRate === null) return "fixture_baseline_unavailable";
  const delta = liveRate - fixtureRate;
  const absDelta = Math.abs(delta);
  if (fixtureRate >= 1.0 && liveRate <= 0.10) return "schema_drift_critical";
  if (absDelta > 0.30) return "schema_drift_suspected";
  if (absDelta > 0.10) return "minor_drift";
  return "no_drift";
}

// ---------------------------------------------------------------------------
// Load Phase I/II fixture-class presence baselines
// ---------------------------------------------------------------------------

function loadFixtureBaselines(source) {
  const frozenPaths = {
    gcd: join(repoRoot, "scripts/source-competence/frozen/gcd-phase1-summary.json"),
    comicvine: join(repoRoot, "scripts/source-competence/frozen/comicvine-phase2-summary.json"),
  };
  const path = frozenPaths[source];
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

// Extract a flat field-name to presence-rate map from a Phase I/II frozen summary.
// The summary structure varies; we extract what we can without assuming a rigid schema.
function extractFixtureFieldPresence(summary) {
  const result = {};
  if (!summary || typeof summary !== "object") return result;

  // Traverse the summary looking for field coverage or presence objects
  function traverseNode(node, depth) {
    if (depth > 6 || node == null || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node)) {
      if (typeof value === "number" && (key.endsWith("Coverage") || key.endsWith("Rate") || key.endsWith("Presence"))) {
        const fieldName = key.replace(/Coverage$|Rate$|Presence$/, "").replace(/^field_/, "");
        if (!(fieldName in result)) result[fieldName] = value;
      } else if (typeof value === "object" && value !== null) {
        traverseNode(value, depth + 1);
      }
    }
  }
  traverseNode(summary, 0);
  return result;
}

// ---------------------------------------------------------------------------
// Process one source's live observation artifact
// ---------------------------------------------------------------------------

function processDelta(source, livePath) {
  if (!existsSync(livePath)) {
    return {
      source,
      status: "live_artifact_unavailable",
      detail: `Live observation artifact not found: ${livePath}`,
      fields: [],
    };
  }

  let liveArtifact;
  try {
    liveArtifact = JSON.parse(readFileSync(livePath, "utf8"));
  } catch (err) {
    return {
      source,
      status: "live_artifact_parse_error",
      detail: err.message,
      fields: [],
    };
  }

  if (liveArtifact.artifactStatus === "pending_legal_clearance") {
    return {
      source,
      status: "live_artifact_unavailable",
      detail: `Live observation artifact is a placeholder pending legal clearance. Blocked by: ${(liveArtifact.blockedByQuestions || []).join(", ")}`,
      fields: [],
    };
  }

  // Collect field presence across all profiles in the live artifact
  const liveFieldTotals = {};
  const liveProfiles = Array.isArray(liveArtifact.profiles) ? liveArtifact.profiles : [];
  for (const profile of liveProfiles) {
    const fp = profile.fieldPresence || {};
    for (const [fieldName, fpEntry] of Object.entries(fp)) {
      if (!liveFieldTotals[fieldName]) {
        liveFieldTotals[fieldName] = { presentCount: 0, totalCount: 0 };
      }
      liveFieldTotals[fieldName].presentCount += fpEntry.presentCount || 0;
      liveFieldTotals[fieldName].totalCount += fpEntry.totalCount || 0;
    }
  }

  const liveFieldRates = Object.fromEntries(
    Object.entries(liveFieldTotals).map(([f, { presentCount, totalCount }]) => [
      f,
      totalCount > 0 ? presentCount / totalCount : 0,
    ])
  );

  // Load fixture-class baselines
  const fixtureSummary = loadFixtureBaselines(source);
  const fixtureFieldPresence = extractFixtureFieldPresence(fixtureSummary);

  // Build delta entries
  const allFields = new Set([...Object.keys(liveFieldRates), ...Object.keys(fixtureFieldPresence)]);
  const fields = Array.from(allFields).sort().map((fieldName) => {
    const liveRate = liveFieldRates[fieldName] ?? null;
    const fixtureRate = fixtureFieldPresence[fieldName] ?? null;
    const delta = liveRate !== null && fixtureRate !== null ? liveRate - fixtureRate : null;
    const driftStatus = liveRate !== null
      ? classifyDrift(fixtureRate, liveRate)
      : "live_artifact_unavailable";
    return {
      fieldName,
      fixtureClassPresenceRate: fixtureRate,
      liveObservationPresenceRate: liveRate,
      delta,
      driftStatus,
    };
  });

  const criticalDrifts = fields.filter((f) => f.driftStatus === "schema_drift_critical");
  const suspectedDrifts = fields.filter((f) => f.driftStatus === "schema_drift_suspected");
  const minorDrifts = fields.filter((f) => f.driftStatus === "minor_drift");

  return {
    source,
    status: "complete",
    liveProfileCount: liveProfiles.length,
    fixtureBaselineAvailable: fixtureSummary !== null,
    fields,
    summary: {
      totalFields: fields.length,
      criticalDriftCount: criticalDrifts.length,
      suspectedDriftCount: suspectedDrifts.length,
      minorDriftCount: minorDrifts.length,
      noDriftCount: fields.filter((f) => f.driftStatus === "no_drift").length,
      fixtureBaselineUnavailableCount: fields.filter((f) => f.driftStatus === "fixture_baseline_unavailable").length,
    },
    criticalDrifts: criticalDrifts.map((f) => f.fieldName),
    suspectedDrifts: suspectedDrifts.map((f) => f.fieldName),
    minorDrifts: minorDrifts.map((f) => f.fieldName),
  };
}

// ---------------------------------------------------------------------------
// Generate Markdown report
// ---------------------------------------------------------------------------

function generateMarkdown(report) {
  const lines = [];
  lines.push("# Frozen/Live Delta Report — Phase IV Live Observation");
  lines.push("");
  lines.push(`**Generated:** ${report.generatedAt}`);
  lines.push(`**Evidence class:** Live Observation vs. Fixture Class`);
  lines.push("");
  lines.push("> This report describes field-presence differences between live observation data and Phase I/II fixture-class baselines.");
  lines.push("> Differences are findings, not errors. This report does not establish source superiority, production suitability, or recommendation usefulness.");
  lines.push("");

  for (const delta of report.deltas) {
    lines.push(`## ${delta.source.toUpperCase()}`);
    lines.push("");
    lines.push(`**Status:** ${delta.status}`);
    if (delta.status !== "complete") {
      lines.push(`**Detail:** ${delta.detail}`);
      lines.push("");
      continue;
    }
    lines.push(`**Live profiles:** ${delta.liveProfileCount}`);
    lines.push(`**Fixture baseline available:** ${delta.fixtureBaselineAvailable}`);
    lines.push("");

    if (delta.summary) {
      lines.push("### Summary");
      lines.push(`- Total fields measured: ${delta.summary.totalFields}`);
      lines.push(`- Critical drift: ${delta.summary.criticalDriftCount} field(s)`);
      lines.push(`- Suspected drift (>30pp): ${delta.summary.suspectedDriftCount} field(s)`);
      lines.push(`- Minor drift (10–30pp): ${delta.summary.minorDriftCount} field(s)`);
      lines.push(`- No drift (≤10pp): ${delta.summary.noDriftCount} field(s)`);
      lines.push(`- Fixture baseline unavailable: ${delta.summary.fixtureBaselineUnavailableCount} field(s)`);
      lines.push("");
    }

    if (delta.criticalDrifts?.length > 0) {
      lines.push("### Critical Drift Fields");
      lines.push("_(Field was 100% present in fixtures, ≤10% in live — possible schema change)_");
      lines.push("");
      for (const f of delta.criticalDrifts) lines.push(`- \`${f}\``);
      lines.push("");
    }

    if (delta.suspectedDrifts?.length > 0) {
      lines.push("### Suspected Drift Fields (>30pp drop)");
      for (const f of delta.suspectedDrifts) lines.push(`- \`${f}\``);
      lines.push("");
    }

    if (delta.fields?.length > 0) {
      lines.push("### Field Presence Details");
      lines.push("");
      lines.push("| Field | Fixture Rate | Live Rate | Delta | Status |");
      lines.push("|---|---:|---:|---:|---|");
      for (const f of delta.fields) {
        const fixtureStr = f.fixtureClassPresenceRate !== null ? f.fixtureClassPresenceRate.toFixed(4) : "N/A";
        const liveStr = f.liveObservationPresenceRate !== null ? f.liveObservationPresenceRate.toFixed(4) : "N/A";
        const deltaStr = f.delta !== null ? (f.delta >= 0 ? `+${f.delta.toFixed(4)}` : f.delta.toFixed(4)) : "N/A";
        lines.push(`| \`${f.fieldName}\` | ${fixtureStr} | ${liveStr} | ${deltaStr} | ${f.driftStatus} |`);
      }
      lines.push("");
    }
  }

  lines.push("---");
  lines.push("");
  lines.push("## Unsupported Conclusions");
  lines.push("");
  lines.push("This delta report does **not** establish:");
  lines.push("- Source superiority or production suitability");
  lines.push("- Long-term schema stability from a short probe");
  lines.push("- Recommendation usefulness");
  lines.push("- Commercial permission or licensing clearance for either source");
  lines.push("- That fixture-class differences represent live catalog structure");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const gcdDelta = processDelta("gcd", gcdLivePath);
const cvDelta = processDelta("comicvine", cvLivePath);

const reportHash = createHash("sha256")
  .update(JSON.stringify([gcdDelta, cvDelta]))
  .digest("hex");

const report = {
  schemaVersion: "1.0",
  reportId: `delta-${reportHash.slice(0, 16)}`,
  generatedAt: new Date().toISOString(),
  governingDocuments: [
    "scripts/live-evidence/capture-protocol.md",
    "docs/GRAPHIC_NOVEL_LIVE_EVIDENCE_LICENSING_DECISION.md",
  ],
  evidenceClassComparison: "Live Observation Class vs. Fixture Class",
  liveNetworkCallsMade: false,
  deltas: [gcdDelta, cvDelta],
  reportHash,
};

mkdirSync(outputDir, { recursive: true });
const jsonPath = join(outputDir, "delta-report.json");
const mdPath = join(outputDir, "delta-report.md");

writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");
writeFileSync(mdPath, generateMarkdown(report), "utf8");

console.log(JSON.stringify({
  pass: true,
  reportId: report.reportId,
  gcdStatus: gcdDelta.status,
  comicvineStatus: cvDelta.status,
  outputDir: outputDir.replace(`${repoRoot}\\`, "").replace(`${repoRoot}/`, ""),
  liveNetworkCallsMade: false,
  comparativeConclusionMade: false,
}, null, 2));
