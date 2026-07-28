import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const tempPrefix = join(tmpdir(), "novelideas-collection-opportunities-");
const outDir = mkdtempSync(tempPrefix);

try {
  execFileSync(process.execPath, [
    "node_modules/typescript/bin/tsc",
    "--target", "es2020",
    "--module", "commonjs",
    "--moduleResolution", "node",
    "--strict",
    "--skipLibCheck",
    "--outDir", outDir,
    "constants/deploymentCapabilities.ts",
  ], { stdio: "pipe" });

  const { describeDeploymentCapabilities } = await import(pathToFileURL(join(outDir, "deploymentCapabilities.js")).href);

  const customizedDisabled = describeDeploymentCapabilities("customized_library", "disabled");
  const customizedEnabled = describeDeploymentCapabilities("customized_library", "enabled");
  const globalDefault = describeDeploymentCapabilities("global", "disabled");
  const globalWithInvalidFutureRequest = describeDeploymentCapabilities("global", "enabled");

  assertEqual(customizedDisabled.studentCandidateUniversePolicy, "local_collection_only", "customized Library Mode must be local-collection-only");
  assertEqual(customizedEnabled.studentCandidateUniversePolicy, "local_collection_only", "Collection Opportunities configuration must not widen the student candidate universe");
  assertEqual(customizedEnabled.collectionOpportunities.affectsStudentCandidateUniverse, false, "Collection Opportunities must be isolated from student candidates");
  assertEqual(customizedEnabled.collectionOpportunities.implementationStatus, "planned_not_implemented", "future capability must remain explicitly non-operational");
  assertEqual(customizedEnabled.collectionOpportunities.operational, false, "planned capability must not become operational");
  assertEqual(globalDefault.studentCandidateUniversePolicy, "global_sources_allowed", "global deployment behavior must remain unchanged");
  assertEqual(globalWithInvalidFutureRequest.studentCandidateUniversePolicy, "global_sources_allowed", "future configuration must not change global candidate policy");
  assertEqual(globalWithInvalidFutureRequest.collectionOpportunities.configuration, "disabled", "Collection Opportunities must remain disabled without a customized library deployment");

  console.log(JSON.stringify({
    pass: true,
    invariants: [
      "customized_library_is_local_collection_only",
      "collection_opportunities_never_changes_student_candidate_universe",
      "global_candidate_policy_unchanged",
      "collection_opportunities_planned_not_implemented",
    ],
  }, null, 2));
} finally {
  const resolvedTempRoot = tmpdir();
  if (!outDir.startsWith(resolvedTempRoot) || !outDir.startsWith(tempPrefix)) throw new Error(`Refusing to remove unexpected test directory: ${outDir}`);
  rmSync(outDir, { recursive: true, force: true });
}
