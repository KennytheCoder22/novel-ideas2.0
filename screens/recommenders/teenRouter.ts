export function isTeenDeckKey(deckKey: unknown): boolean {
  const key = String(deckKey || "").toLowerCase();
  return key === "ms_hs" || key === "ms-hs" || key === "mshs" || key === "teen" || key === "teens" || key === "teens_school";
}

export function applyTeenCanonicalRungOverrides(canonicalFamilyRungs: Record<string, string[]>): void {
  canonicalFamilyRungs.thriller = [
    "young adult school mystery thriller",
    "young adult fast-paced survival thriller",
    "young adult identity under pressure thriller",
    "young adult friendship betrayal mystery",
  ];
  canonicalFamilyRungs.mystery = [
    "young adult paranormal school mystery",
    "young adult coming of age mystery",
    "young adult social mystery thriller",
    "young adult friendship investigation mystery",
  ];
  canonicalFamilyRungs.horror = [
    "teen social horror thriller",
    "young adult survival horror",
    "young adult paranormal suspense",
    "young adult eerie mystery thriller",
  ];
  canonicalFamilyRungs.fantasy = [
    "young adult adventure found family fantasy",
    "young adult magical school fantasy",
    "young adult identity quest fantasy",
    "young adult anime inspired fantasy adventure",
  ];
  canonicalFamilyRungs.science_fiction = [
    "young adult sci-fi adventure",
    "young adult dystopian identity science fiction",
    "young adult speculative survival adventure",
    "young adult future society rebellion",
  ];
}

export function teenExpansionQueries(routerFamily: string) {
  const family = routerFamily;
  const map: Record<string, string[]> = {
    thriller: [
      "young adult school conspiracy thriller",
      "young adult fast-paced survival thriller",
      "young adult high stakes mystery chase",
    ],
    mystery: [
      "young adult detective mystery with friendship stakes",
      "young adult school investigation mystery",
      "young adult puzzle driven mystery thriller",
    ],
    horror: [
      "young adult survival horror with social pressure",
      "young adult paranormal dread mystery",
      "young adult eerie atmosphere suspense",
    ],
    romance: [
      "young adult coming of age romance",
      "young adult emotional relationship drama",
      "young adult first love identity growth",
    ],
    fantasy: [
      "young adult magical academy fantasy adventure",
      "young adult found family quest fantasy",
      "young adult epic fantasy identity journey",
    ],
    science_fiction: [
      "young adult dystopian resistance science fiction",
      "young adult near future survival sci-fi",
      "young adult technology identity speculative fiction",
    ],
    historical: [
      "young adult historical fiction with identity pressure",
      "young adult period mystery drama",
      "young adult wartime coming of age fiction",
    ],
  };
  return (map[family] || map.thriller).map((query) => ({ query, queryFamily: family, laneKind: "cluster-expansion" }));
}

export function inferTeenLaneFromFacets(tagCounts: Record<string, number> | null | undefined, fallbackFamily: string): string {
  const entries = Object.entries(tagCounts || {});
  if (!entries.length) return fallbackFamily;
  const score: Record<string, number> = {
    thriller: 0, mystery: 0, horror: 0, romance: 0, fantasy: 0, science_fiction: 0, historical: 0,
  };
  const lex: Record<string, (key: string) => boolean> = {
    thriller: (k) => /\b(thrill|suspense|chase|conspiracy|crime|killer|manhunt|survival)\b/.test(k),
    mystery: (k) => /\b(mystery|detective|investigation|clue|whodunit|puzzle)\b/.test(k),
    horror: (k) => /\b(horror|haunted|ghost|monster|occult|dread|scary)\b/.test(k),
    romance: (k) => /\b(romance|love|relationship|heartbreak|dating|emotional)\b/.test(k),
    fantasy: (k) => /\b(fantasy|magic|dragon|sword|kingdom|myth|fae)\b/.test(k),
    science_fiction: (k) => /\b(science fiction|sci-fi|dystopian|future|space|ai|robot|technology)\b/.test(k),
    historical: (k) => /\b(historical|war|victorian|period|regency|civil war|empire)\b/.test(k),
  };
  for (const [rawKey, rawVal] of entries) {
    const key = String(rawKey).toLowerCase();
    const val = Number(rawVal || 0);
    for (const lane of Object.keys(lex)) if (lex[lane](key)) score[lane] += val;
  }
  const best = Object.entries(score).sort((a, b) => b[1] - a[1])[0];
  if (!best || best[1] <= 0) return fallbackFamily;
  return best[0];
}
