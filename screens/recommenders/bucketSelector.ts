import type { RecommenderInput, RecommendationResult, DeckKey } from "./types";

export type SearchBucketId =
  | "visual_comics"
  | "teen_romance"
  | "teen_fantasy"
  | "teen_thriller"
  | "teen_realism"
  | "adult_thriller"
  | "adult_mystery"
  | "adult_romance"
  | "adult_scifi"
  | "adult_fantasy"
  | "adult_horror"
  | "adult_historical"
  | "adult_dystopian"
  | "adult_literary"
  | "adult_general"
  | "preteen_general"
  | "kids_picture"
  | "kids_early_reader"
  | "kids_chapter_middle";

export type BucketPlan = {
  bucketId: SearchBucketId;
  queries: string[];
  domainMode: RecommendationResult["domainMode"];
  rationale: string[];
};

type BucketRule = {
  bucketId: SearchBucketId;
  queries: string[];
  minScore?: number;
  score: (input: RecommenderInput, tags: Record<string, number>) => number;
  rationale: (input: RecommenderInput, tags: Record<string, number>) => string[];
};

function asCount(tags: Record<string, number>, key: string): number {
  return Number(tags?.[key] || 0);
}

function totalForAliases(tags: Record<string, number>, aliases: string[]): number {
  return aliases.reduce((sum, alias) => sum + asCount(tags, alias), 0);
}

function deckDomainMode(deckKey: DeckKey, input: RecommenderInput): RecommendationResult["domainMode"] {
  if (deckKey === "k2") {
    return ((input as any)?.domainModeOverride ?? "chapterMiddle") as RecommendationResult["domainMode"];
  }
  return "default";
}

function visualSignalWeight(tagCounts: Record<string, number>): number {
  return totalForAliases(tagCounts, [
    "topic:manga",
    "format:graphic_novel",
    "format:graphic novel",
    "media:anime",
    "genre:superheroes",
    "superheroes",
  ]);
}

function tasteAxis(input: RecommenderInput, key: string): number {
  return Number(((input as any)?.tasteProfile?.axes || {})[key] || 0);
}

function clampNonNegative(value: number): number {
  return value > 0 ? value : 0;
}

function dedupeQueries(queries: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const query of queries) {
    const trimmed = String(query || "").trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function scoreFromSignals(input: RecommenderInput, tags: Record<string, number>, keys: string[], axisBoosts?: Array<[string, number]>): number {
  let score = totalForAliases(tags, keys);
  for (const [axis, weight] of axisBoosts || []) {
    score += clampNonNegative(tasteAxis(input, axis)) * weight;
  }
  return score;
}

const ADULT_RULES: BucketRule[] = [
  {
    bucketId: "adult_thriller",
    queries: [
      '"psychological thriller novel"',
      '"spy thriller novel"',
      '"crime thriller novel"',
    ],
    score: (input, tags) => scoreFromSignals(input, tags, ["thriller", "genre:thriller", "dark", "fast-paced", "mystery"], [["pacing", 1.2], ["darkness", 0.9]]),
    rationale: (_input, tags) => ["thriller", "dark", "fast-paced", "mystery"].filter((k) => asCount(tags, k) > 0),
  },
  {
    bucketId: "adult_mystery",
    queries: [
      '"murder investigation novel"',
      '"detective novel"',
    ],
    score: (input, tags) => scoreFromSignals(input, tags, ["mystery", "genre:mystery", "crime", "genre:crime"], [["complexity", 0.5]]),
    rationale: (_input, tags) => ["mystery", "crime"].filter((k) => asCount(tags, k) > 0),
  },
  {
    bucketId: "adult_romance",
    queries: [
      '"fake dating romance novel"',
      '"marriage of convenience romance novel"',
      '"friends to lovers romance novel"',
    ],
    score: (input, tags) => scoreFromSignals(input, tags, ["romance", "genre:romance", "love", "human connection", "family"], [["warmth", 1.0], ["characterFocus", 1.1]]),
    rationale: (_input, tags) => ["romance", "love", "human connection"].filter((k) => asCount(tags, k) > 0),
  },
  {
    bucketId: "adult_scifi",
    queries: [
      '"space opera science fiction"',
      '"dystopian science fiction novel"',
      '"time travel science fiction novel"',
    ],
    score: (input, tags) => scoreFromSignals(input, tags, ["science fiction", "genre:science fiction", "ai", "time travel", "space", "rebellion"], [["ideaDensity", 1.0], ["realism", -0.2]]),
    rationale: (_input, tags) => ["science fiction", "ai", "time travel", "space"].filter((k) => asCount(tags, k) > 0),
  },
  {
    bucketId: "adult_fantasy",
    queries: [
      '"epic fantasy novel"',
      '"dark fantasy novel"',
      '"magic fantasy novel"',
    ],
    score: (input, tags) => scoreFromSignals(input, tags, ["fantasy", "genre:fantasy", "mythology", "magic", "epic", "whimsical", "atmospheric"], [["realism", -0.4], ["darkness", 0.4]]),
    rationale: (_input, tags) => ["fantasy", "mythology", "magic", "epic"].filter((k) => asCount(tags, k) > 0),
  },
  {
    bucketId: "adult_horror",
    queries: [
      '"horror novel"',
      '"haunted house horror novel"',
      '"survival horror novel"',
    ],
    score: (input, tags) => scoreFromSignals(input, tags, ["horror", "genre:horror", "spooky", "dark", "survival", "weird"], [["darkness", 1.3]]),
    rationale: (_input, tags) => ["horror", "spooky", "dark", "weird"].filter((k) => asCount(tags, k) > 0),
  },
  {
    bucketId: "adult_historical",
    queries: [
      '"world war 2 fiction"',
      '"world war 1 fiction"',
      '"ancient rome novel"',
      '"ancient greece novel"',
      '"war of the roses novel"',
      '"crusades historical fiction"',
      '"norman conquest novel"',
      '"19th century american novel"',
      '"american society novel 19th century"',
    ],
    score: (input, tags) => scoreFromSignals(input, tags, ["historical", "genre:historical", "war & society", "authority", "political"], [["realism", 0.7], ["ideaDensity", 0.5]]),
    rationale: (_input, tags) => ["historical", "war & society", "authority"].filter((k) => asCount(tags, k) > 0),
  },
  {
    bucketId: "adult_dystopian",
    queries: [
      '"dystopian science fiction novel"',
      '"survival horror novel"',
      '"world war 2 fiction"',
    ],
    score: (input, tags) => scoreFromSignals(input, tags, ["dystopian", "genre:dystopian", "survival", "rebellion", "authority"], [["darkness", 0.8], ["ideaDensity", 0.5]]),
    rationale: (_input, tags) => ["dystopian", "survival", "rebellion", "authority"].filter((k) => asCount(tags, k) > 0),
  },
  {
    bucketId: "adult_literary",
    queries: [
      '"literary fiction novel"',
      '"award winning novel"',
      '"contemporary fiction novel"',
    ],
    score: (input, tags) => scoreFromSignals(input, tags, ["identity", "regret", "melancholic", "realistic", "human connection", "drama"], [["complexity", 1.0], ["characterFocus", 0.9], ["realism", 0.8]]),
    rationale: (_input, tags) => ["identity", "regret", "realistic", "human connection", "drama"].filter((k) => asCount(tags, k) > 0),
  },
  {
    bucketId: "adult_general",
    queries: [
      '"contemporary fiction novel"',
      '"general fiction novel"',
      '"literary fiction novel"',
      '"award winning novel"',
    ],
    score: () => 0.1,
    rationale: () => ["fallback"],
  },
];

const TEEN_RULES: BucketRule[] = [
  {
    bucketId: "visual_comics",
    queries: [
      'subject:"manga"',
      'subject:"graphic novels"',
      'subject:"comics"',
      'subject:"fiction"',
    ],
    minScore: 1,
    score: (_input, tags) => visualSignalWeight(tags),
    rationale: (_input, tags) => ["topic:manga", "format:graphic_novel", "media:anime", "genre:superheroes"].filter((k) => asCount(tags, k) > 0),
  },
  {
    bucketId: "teen_romance",
    queries: [
      '"teen romance novel"',
      '"friends to lovers romance novel"',
      '"fake dating romance novel"',
    ],
    score: (input, tags) => scoreFromSignals(input, tags, ["romance", "love", "human connection", "family"], [["warmth", 0.8], ["characterFocus", 0.9]]),
    rationale: (_input, tags) => ["romance", "love", "human connection"].filter((k) => asCount(tags, k) > 0),
  },
  {
    bucketId: "teen_fantasy",
    queries: [
      '"epic fantasy novel"',
      '"dark fantasy novel"',
      '"magic fantasy novel"',
    ],
    score: (input, tags) => scoreFromSignals(input, tags, ["fantasy", "mythology", "epic", "authority"], [["realism", -0.3]]),
    rationale: (_input, tags) => ["fantasy", "mythology", "epic"].filter((k) => asCount(tags, k) > 0),
  },
  {
    bucketId: "teen_thriller",
    queries: [
      '"murder investigation novel"',
      '"psychological thriller novel"',
      '"crime thriller novel"',
    ],
    score: (input, tags) => scoreFromSignals(input, tags, ["thriller", "mystery", "crime", "dark"], [["pacing", 1.0], ["darkness", 0.8]]),
    rationale: (_input, tags) => ["thriller", "mystery", "crime", "dark"].filter((k) => asCount(tags, k) > 0),
  },
  {
    bucketId: "teen_realism",
    queries: [
      '"young adult fiction"',
      '"coming of age novel"',
    ],
    score: (input, tags) => scoreFromSignals(input, tags, ["identity", "coming of age", "realistic", "human connection", "drama"], [["realism", 0.9], ["characterFocus", 0.7]]),
    rationale: (_input, tags) => ["identity", "coming of age", "realistic", "drama"].filter((k) => asCount(tags, k) > 0),
  },
];

export function chooseBucketPlan(input: RecommenderInput): BucketPlan {
  const deckKey = input.deckKey;
  const tags = (input.tagCounts || {}) as Record<string, number>;

  if (deckKey === "k2") {
    const mode = ((input as any)?.domainModeOverride ?? "chapterMiddle") as RecommendationResult["domainMode"];
    if (mode === "picture") {
      return {
        bucketId: "kids_picture",
        domainMode: "picture",
        queries: dedupeQueries([
          '"juvenile fiction" "picture books"',
          '"juvenile fiction" illustrated',
          '"picture books"',
        ]),
        rationale: ["kids picture mode"],
      };
    }
    if (mode === "earlyReader") {
      return {
        bucketId: "kids_early_reader",
        domainMode: "earlyReader",
        queries: dedupeQueries([
          '"juvenile fiction" readers',
          '"juvenile fiction" "early readers"',
          '"juvenile fiction"',
        ]),
        rationale: ["kids early reader mode"],
      };
    }
    return {
      bucketId: "kids_chapter_middle",
      domainMode: "chapterMiddle",
      queries: dedupeQueries([
        '"juvenile fiction" "chapter books"',
        '"juvenile fiction" "middle grade fiction"',
        '"juvenile fiction"',
      ]),
      rationale: ["kids chapter/middle mode"],
    };
  }

  if (deckKey === "36") {
    return {
      bucketId: "preteen_general",
      domainMode: deckDomainMode(deckKey, input),
      queries: dedupeQueries([
        '"middle grade fiction"',
        '"juvenile fiction"',
        '"chapter books"',
        'subject:"fiction"',
      ]),
      rationale: ["preteen baseline"],
    };
  }

  const rules = deckKey === "ms_hs" ? TEEN_RULES : ADULT_RULES;
  const scored = rules
    .map((rule) => ({
      rule,
      score: rule.score(input, tags),
    }))
    .sort((a, b) => b.score - a.score);

  const winner = scored.find(({ rule, score }) => score >= (rule.minScore ?? 0)) || scored[0];
  const backup = scored.find(({ rule }) => rule.bucketId !== winner.rule.bucketId);

  const mergedQueries = dedupeQueries([
    ...winner.rule.queries,
    ...(backup && backup.score > 0.75 ? backup.rule.queries.slice(0, 1) : []),
  ]);

  const rationale = [
    ...winner.rule.rationale(input, tags),
    ...(backup && backup.score > 0.75 ? [`secondary:${backup.rule.bucketId}`] : []),
  ];

  return {
    bucketId: winner.rule.bucketId,
    domainMode: deckDomainMode(deckKey, input),
    queries: mergedQueries,
    rationale: rationale.length ? rationale : [winner.rule.bucketId],
  };
}
