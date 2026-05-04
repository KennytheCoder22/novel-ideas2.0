export function applyAdultCanonicalRungOverrides(_canonicalFamilyRungs: Record<string, string[]>): void {
  // Adult defaults are already encoded in the base canonical rung map.
}

export function adultExpansionQueries(routerFamily: string) {
  return [
    { query: `${routerFamily} isolation survival narrative novel`, queryFamily: routerFamily, laneKind: "cluster-expansion" },
    { query: `${routerFamily} psychological dread and consequence novel`, queryFamily: routerFamily, laneKind: "cluster-expansion" },
    { query: `${routerFamily} authored atmospheric tension story novel`, queryFamily: routerFamily, laneKind: "cluster-expansion" },
  ];
}
