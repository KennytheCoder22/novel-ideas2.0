export type NovelIdeasDeploymentKind = "global" | "customized_library";

export type StudentCandidateUniversePolicy = "global_sources_allowed" | "local_collection_only";

export type CollectionOpportunitiesConfiguration = "enabled" | "disabled";

export type CollectionOpportunitiesImplementationStatus = "planned_not_implemented";

export interface CollectionOpportunitiesCapability {
  configuration: CollectionOpportunitiesConfiguration;
  implementationStatus: CollectionOpportunitiesImplementationStatus;
  operational: false;
  affectsStudentCandidateUniverse: false;
}

export interface DeploymentCapabilities {
  deployment: NovelIdeasDeploymentKind;
  studentCandidateUniversePolicy: StudentCandidateUniversePolicy;
  collectionOpportunities: CollectionOpportunitiesCapability;
}

export const COLLECTION_OPPORTUNITIES_DESCRIPTION =
  "Identify collection gaps from anonymous, aggregated reader demand and generate evidence-backed acquisition suggestions.";

const STUDENT_CANDIDATE_POLICY_BY_DEPLOYMENT: Readonly<Record<NovelIdeasDeploymentKind, StudentCandidateUniversePolicy>> = {
  global: "global_sources_allowed",
  customized_library: "local_collection_only",
};

export function describeDeploymentCapabilities(
  deployment: NovelIdeasDeploymentKind,
  collectionOpportunities: CollectionOpportunitiesConfiguration = "disabled",
): DeploymentCapabilities {
  return {
    deployment,
    studentCandidateUniversePolicy: STUDENT_CANDIDATE_POLICY_BY_DEPLOYMENT[deployment],
    collectionOpportunities: {
      configuration: deployment === "customized_library" ? collectionOpportunities : "disabled",
      implementationStatus: "planned_not_implemented",
      operational: false,
      affectsStudentCandidateUniverse: false,
    },
  };
}
