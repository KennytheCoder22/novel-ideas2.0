export function isTeenDeckKey(deckKey: unknown): boolean {
  const key = String(deckKey || "").toLowerCase();
  return key === "ms_hs" || key === "ms-hs" || key === "mshs" || key === "teen" || key === "teens" || key === "teens_school";
}

export function applyTeenCanonicalRungOverrides(canonicalFamilyRungs: Record<string, string[]>): Record<string, string[]> {
  return {
    ...canonicalFamilyRungs,
    thriller: [
      "young adult school mystery thriller",
      "young adult fast-paced survival thriller",
      "young adult identity under pressure thriller",
      "young adult friendship betrayal mystery",
    ],
    mystery: [
      "young adult paranormal school mystery",
      "young adult coming of age mystery",
      "young adult social mystery thriller",
      "young adult friendship investigation mystery",
    ],
    horror: [
      "teen social horror thriller",
      "young adult survival horror",
      "young adult paranormal suspense",
      "young adult eerie mystery thriller",
    ],
    fantasy: [
      "young adult adventure found family fantasy",
      "young adult magical school fantasy",
      "young adult identity quest fantasy",
      "young adult anime inspired fantasy adventure",
    ],
    science_fiction: [
      "young adult sci-fi adventure",
      "young adult dystopian identity science fiction",
      "young adult speculative survival adventure",
      "young adult future society rebellion",
    ],
  };
}

export function teenExpansionQueries(routerFamily: string): Array<{ query: string; queryFamily: string; laneKind: string }> {
  return [
    { query: "young adult fast-paced survival adventure", queryFamily: routerFamily, laneKind: "cluster-expansion" },
    { query: "young adult coming of age identity pressure", queryFamily: routerFamily, laneKind: "cluster-expansion" },
    { query: "young adult friendship stakes speculative thriller", queryFamily: routerFamily, laneKind: "cluster-expansion" },
  ];
}
