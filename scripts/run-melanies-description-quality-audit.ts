import fs from "node:fs";
import path from "node:path";
import { loadProjectEnv } from "@expo/env";
import { runRecommenderV2 } from "../app/recommender-v2/engine";
import type { AgeBandV2, SourceIdV2, SwipeSignalV2 } from "../app/recommender-v2/types";
import {
  catalogMelanieStories,
  type MelanieCandidateDescriptionDiagnostic,
} from "../lib/recommendationGames/melanieDescriptionQuality";

const AGE_BANDS: AgeBandV2[] = ["kids", "preteens", "teens", "adult"];
loadProjectEnv(process.cwd(), { silent: true });
const ENABLED_SOURCES: Partial<Record<SourceIdV2, boolean>> = {
  mock: false,
  googleBooks: true,
  openLibrary: true,
  localLibrary: true,
  kitsu: true,
  comicVine: true,
  nyt: true,
};
const AUDIT_PROFILES: { name: string; signals: SwipeSignalV2[] }[] = [
  { name: "broad", signals: [] },
  {
    name: "mystery-adventure",
    signals: [{
      id: "melanie-description-audit-mystery",
      action: "like",
      weight: 1,
      genres: ["mystery", "adventure"],
      themes: ["secrets", "survival"],
      format: "book",
      source: "melanie_description_audit",
    }],
  },
  {
    name: "science-fiction",
    signals: [{
      id: "melanie-description-audit-science-fiction",
      action: "like",
      weight: 1,
      genres: ["science fiction"],
      themes: ["discovery", "technology"],
      format: "book",
      source: "melanie_description_audit",
    }],
  },
  {
    name: "fantasy",
    signals: [{
      id: "melanie-description-audit-fantasy",
      action: "like",
      weight: 1,
      genres: ["fantasy"],
      themes: ["magic", "adventure"],
      format: "book",
      source: "melanie_description_audit",
    }],
  },
];

type AuditRun = {
  ageBand: AgeBandV2;
  profile: string;
  returnedCandidates: number;
  acceptedCandidates: number;
  sourceStatuses: { source: string; status: string; rawCount: number; reason: string | null }[];
  diagnostics: MelanieCandidateDescriptionDiagnostic[];
};

function outputPath(): string | null {
  const index = process.argv.indexOf("--output");
  if (index < 0 || !process.argv[index + 1]) return null;
  return path.resolve(process.argv[index + 1]);
}

function increment(record: Record<string, number>, key: string, amount = 1) {
  record[key] = (record[key] || 0) + amount;
}

async function main() {
  const runs: AuditRun[] = [];
  for (const ageBand of AGE_BANDS) {
    for (const profile of AUDIT_PROFILES) {
      const result = await runRecommenderV2({
        ageBand,
        libraryId: process.env.MELANIE_AUDIT_LIBRARY_ID || "default",
        localLibraryCurationTrusted: false,
        enabledSources: ENABLED_SOURCES,
        diversitySeed: `melanie-description-audit:${ageBand}:${profile.name}`,
        limit: 150,
        signals: profile.signals,
      });
      const catalog = catalogMelanieStories(result.items, false);
      runs.push({
        ageBand,
        profile: profile.name,
        returnedCandidates: result.items.length,
        acceptedCandidates: catalog.stories.length,
        sourceStatuses: result.diagnostics.sources.map((source) => ({
          source: source.source,
          status: source.status,
          rawCount: Number(source.rawCount || 0),
          reason: source.failedReason || source.skippedReason || source.emptyReason || null,
        })),
        diagnostics: catalog.diagnostics.candidates,
      });
    }
  }

  const byAge: Record<string, { candidates: number; accepted: number; rejected: number }> = {};
  const byCandidateSource: Record<string, { candidates: number; accepted: number; rejected: number }> = {};
  const byDescriptionSource: Record<string, { candidates: number; accepted: number; rejected: number }> = {};
  const rejectionReasons: Record<string, number> = {};
  for (const run of runs) {
    const age = byAge[run.ageBand] ||= { candidates: 0, accepted: 0, rejected: 0 };
    age.candidates += run.returnedCandidates;
    age.accepted += run.acceptedCandidates;
    age.rejected += run.returnedCandidates - run.acceptedCandidates;
    for (const candidate of run.diagnostics) {
      const source = byCandidateSource[candidate.candidateSource] ||= { candidates: 0, accepted: 0, rejected: 0 };
      source.candidates += 1;
      source[candidate.accepted ? "accepted" : "rejected"] += 1;
      if (candidate.descriptionSource) {
        const descriptionSource = byDescriptionSource[candidate.descriptionSource] ||= { candidates: 0, accepted: 0, rejected: 0 };
        descriptionSource.candidates += 1;
        descriptionSource[candidate.accepted ? "accepted" : "rejected"] += 1;
      }
      if (candidate.rejectionReason) increment(rejectionReasons, candidate.rejectionReason);
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    enabledSources: ENABLED_SOURCES,
    byAge,
    byCandidateSource,
    byDescriptionSource,
    rejectionReasons,
    runs,
  };
  console.log("Melanie description quality by age");
  console.table(byAge);
  console.log("Melanie description quality by candidate source");
  console.table(byCandidateSource);
  console.log("Selected description provenance");
  console.table(byDescriptionSource);
  console.log("Rejection reasons");
  console.table(rejectionReasons);
  if (process.argv.includes("--verbose")) {
    for (const run of runs) {
      console.log(`\n${run.ageBand} / ${run.profile}: ${run.acceptedCandidates}/${run.returnedCandidates} accepted`);
      console.table(run.diagnostics.map((candidate) => ({
        title: candidate.title,
        candidateSource: candidate.candidateSource,
        descriptionSource: candidate.descriptionSource,
        accepted: candidate.accepted,
        rejectionReason: candidate.rejectionReason,
        originalDescription: candidate.originalDescription,
        anonymizedDescription: candidate.anonymizedDescription,
      })));
    }
  }
  const destination = outputPath();
  if (destination) {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`\nWrote full audit report to ${destination}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
