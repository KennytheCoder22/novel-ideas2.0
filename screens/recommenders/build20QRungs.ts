// build20QRungs.ts

type QueryIntent = {
  baseGenre?: string;
  axes?: {
    intrigue?: number;
    darkness?: number;
    speculative?: number;
    realism?: number;
    intimacy?: number;
    pacingSignal?: number;
  };
};

function normalizePhrase(q: string): string {
  return String(q || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 🔥 CORE FIX:
 * We ONLY generate story-shaped queries.
 * No "character driven", no "realistic fiction", no abstract garbage.
 */
function deriveHypothesisPrimaries(
  intent: QueryIntent,
  maxRungs: number
): string[] {
  const axes = intent.axes || {};
  const out: string[] = [];

  const add = (q?: string) => {
    if (!q) return;
    const cleaned = normalizePhrase(q);
    if (!cleaned) return;
    if (!out.includes(cleaned)) out.push(cleaned);
  };

  // 🔥 STRONG STORY-BASED QUERIES ONLY
  if (axes.intrigue && axes.darkness) {
    add("psychological thriller novel");
  }

  if (axes.intrigue && axes.pacingSignal) {
    add("fast paced thriller novel");
  }

  if (axes.speculative && axes.intrigue) {
    add("science fiction thriller novel");
  }

  if (axes.speculative && axes.darkness) {
    add("dystopian thriller novel");
  }

  if (axes.intimacy && axes.intrigue) {
    add("family secrets novel");
  }

  if (axes.realism && axes.intrigue) {
    add("crime conspiracy novel");
  }

  if (axes.pacingSignal) {
    add("survival thriller novel");
  }

  // fallback if nothing triggered
  add("thriller novel");

  // ensure enough rungs
  while (out.length < Math.max(1, maxRungs)) {
    add("psychological thriller novel");
    if (out.length < maxRungs) add("crime conspiracy novel");
    if (out.length < maxRungs) add("science fiction thriller novel");
  }

  return out.slice(0, Math.max(1, maxRungs));
}

/**
 * Public function used by system
 */
export function build20QRungs(intent: QueryIntent) {
  const primaries = deriveHypothesisPrimaries(intent, 4);

  const rungs = [];

  for (let i = 0; i < primaries.length; i++) {
    rungs.push({
      rung: i,
      query: primaries[i],
    });
  }

  // anchor rung (kept but now harmless due to filtering)
  rungs.push({
    rung: 90,
    query: "bestselling thriller novel",
  });

  return rungs;
}

export function rungToPreviewQuery(rung: { query: string }): string {
  return rung?.query || "";
}