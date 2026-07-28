export type NovelIdeasDeploymentKind = "global" | "customized_library";

export type PatronCandidateUniversePolicy = "global_sources_allowed" | "local_collection_only";

export type CollectionOpportunitiesConfiguration = "enabled" | "disabled";

export type CollectionOpportunitiesImplementationStatus = "planned_not_implemented";

export interface CollectionOpportunitiesCapability {
  configuration: CollectionOpportunitiesConfiguration;
  implementationStatus: CollectionOpportunitiesImplementationStatus;
  operational: false;
  affectsPatronCandidateUniverse: false;
}

export interface DeploymentCapabilities {
  deployment: NovelIdeasDeploymentKind;
  patronCandidateUniversePolicy: PatronCandidateUniversePolicy;
  collectionOpportunities: CollectionOpportunitiesCapability;
}

export const COLLECTION_OPPORTUNITIES_DESCRIPTION =
  "Identify collection gaps from anonymous, aggregated patron demand and generate evidence-backed acquisition suggestions.";

const PATRON_CANDIDATE_POLICY_BY_DEPLOYMENT: Readonly<Record<NovelIdeasDeploymentKind, PatronCandidateUniversePolicy>> = {
  global: "global_sources_allowed",
  customized_library: "local_collection_only",
};

export function describeDeploymentCapabilities(
  deployment: NovelIdeasDeploymentKind,
  collectionOpportunities: CollectionOpportunitiesConfiguration = "disabled",
): DeploymentCapabilities {
  return {
    deployment,
    patronCandidateUniversePolicy: PATRON_CANDIDATE_POLICY_BY_DEPLOYMENT[deployment],
    collectionOpportunities: {
      configuration: deployment === "customized_library" ? collectionOpportunities : "disabled",
      implementationStatus: "planned_not_implemented",
      operational: false,
      affectsPatronCandidateUniverse: false,
    },
  };
}
