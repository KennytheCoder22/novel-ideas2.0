import type { SwipeDeckCard } from '../../data/swipeDecks/types';

type DeckKey = 'k2' | '36' | 'ms_hs' | 'adult';

type CardSelectionContext = {
  deckKey: DeckKey;
  cards: SwipeDeckCard[];
  tagCounts: Record<string, number>;
  recentCardKeys?: string[];
  recentCards?: SwipeDeckCard[];
};

function normalizeKey(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

export function cardIdentityKey(card: SwipeDeckCard): string {
  return (
    normalizeKey((card as any).id) ||
    normalizeKey((card as any).title) ||
    normalizeKey((card as any).prompt) ||
    JSON.stringify(card)
  );
}

function cardTags(card: SwipeDeckCard): string[] {
  const tags = Array.isArray((card as any).tags) ? (card as any).tags : [];
  return tags.map((tag: unknown) => String(tag || '').trim()).filter(Boolean);
}

function tagPrefix(tag: string): string {
  const idx = tag.indexOf(':');
  return idx > 0 ? tag.slice(0, idx).trim().toLowerCase() : 'plain';
}

function cardMedium(card: SwipeDeckCard): string {
  const tags = cardTags(card).map((tag) => tag.toLowerCase());
  if (tags.some((tag) => tag.includes("movie"))) return "movies";
  if (tags.some((tag) => tag.includes("tv"))) return "tv";
  if (tags.some((tag) => tag.includes("game"))) return "games";
  if (tags.some((tag) => tag.includes("podcast"))) return "podcasts";
  if (tags.some((tag) => tag.includes("anime") || tag.includes("manga"))) return "anime";
  if (tags.some((tag) => tag.includes("album") || tag.includes("music"))) return "albums";
  return "books";
}

function familiarityScore(card: SwipeDeckCard, deckKey: DeckKey): number {
  const title = normalizeKey((card as any).title);
  const tags = cardTags(card).join(' ').toLowerCase();
  let score = 0.35;

  if ((card as any).wikiTitle) score += 0.18;
  if ((card as any).imageUri) score += 0.12;
  if ((card as any).isDefault) score += 0.08;
  if (/(disney|pixar|minecraft|harry potter|star wars|marvel|pokemon|stranger things|taylor swift|beatles|zelda|mario)/.test(`${title} ${tags}`)) {
    score += 0.18;
  }
  if (deckKey === 'k2' && /(picture book|cartoon|animation)/.test(tags)) score += 0.1;
  return Math.min(1, score);
}

function sophisticationBand(card: SwipeDeckCard): number {
  const text = `${normalizeKey((card as any).title)} ${normalizeKey((card as any).genre)} ${cardTags(card).join(' ').toLowerCase()}`;
  let score = 0.5;
  if (/literary|philosophy|identity|mystery|historical_fiction|theme:grief|theme:identity|theme:power/.test(text)) score += 0.16;
  if (/cozy|fast|sports|competition|cartoon|picture_book/.test(text)) score -= 0.12;
  if (/horror|crime|psychological|thoughtful|weird/.test(text)) score += 0.08;
  return Math.max(0, Math.min(1, score));
}

function diagnosticScore(card: SwipeDeckCard): number {
  const tags = cardTags(card);
  const uniquePrefixes = new Set(tags.map((tag) => tagPrefix(tag)).filter(Boolean));
  let score = Math.min(1, uniquePrefixes.size * 0.18 + tags.length * 0.04);
  if (tags.some((tag) => /^theme:|^vibe:|^genre:/.test(tag))) score += 0.15;
  return Math.min(1.1, score);
}

function diversityPenalty(card: SwipeDeckCard, recentCardKeys: string[]): number {
  const key = cardIdentityKey(card);
  if (recentCardKeys.includes(key)) return 1.3;
  return 0;
}

function topTagsByDirection(
  tagCounts: Record<string, number>,
  direction: 'positive' | 'negative',
  limit = 6
): string[] {
  return Object.entries(tagCounts || {})
    .filter(([, value]) => {
      const n = Number(value || 0);
      return direction === 'positive' ? n > 0 : n < 0;
    })
    .sort((a, b) => {
      const av = Math.abs(Number(a[1] || 0));
      const bv = Math.abs(Number(b[1] || 0));
      return bv - av;
    })
    .slice(0, limit)
    .map(([tag]) => tag);
}

function overlapCount(tags: string[], targets: string[]): number {
  if (!tags.length || !targets.length) return 0;
  const targetSet = new Set(targets);
  let count = 0;
  for (const tag of tags) {
    if (targetSet.has(tag)) count += 1;
  }
  return count;
}

function unseenSignalCount(tags: string[], tagCounts: Record<string, number>): number {
  let count = 0;
  for (const tag of tags) {
    if (!tagCounts || Number(tagCounts[tag] || 0) === 0) count += 1;
  }
  return count;
}

function underexploredPrefixBonus(tags: string[], tagCounts: Record<string, number>): number {
  const seenPrefixTotals = new Map<string, number>();
  for (const [tag, raw] of Object.entries(tagCounts || {})) {
    const prefix = tagPrefix(tag);
    seenPrefixTotals.set(prefix, (seenPrefixTotals.get(prefix) || 0) + Math.abs(Number(raw || 0)));
  }

  let bonus = 0;
  const used = new Set<string>();
  for (const tag of tags) {
    const prefix = tagPrefix(tag);
    if (used.has(prefix)) continue;
    used.add(prefix);
    const prior = seenPrefixTotals.get(prefix) || 0;
    if (prior === 0) bonus += 0.24;
    else if (prior <= 1) bonus += 0.12;
  }
  return bonus;
}

function contradictionPenalty(tags: string[], negativeTags: string[]): number {
  const negativeOverlap = overlapCount(tags, negativeTags);
  return negativeOverlap * 0.4;
}

function supportScore(tags: string[], positiveTags: string[]): number {
  const overlap = overlapCount(tags, positiveTags);
  return overlap * 0.5;
}

function probeScore(tags: string[], positiveTags: string[], tagCounts: Record<string, number>): number {
  const positiveOverlap = overlapCount(tags, positiveTags);
  const novelSignals = unseenSignalCount(tags, tagCounts);
  if (positiveOverlap === 0) return 0;
  return positiveOverlap * 0.22 + Math.min(0.7, novelSignals * 0.16);
}

function balanceTargetForDeck(deckKey: DeckKey): number {
  if (deckKey === 'k2') return 0.35;
  if (deckKey === '36') return 0.45;
  return 0.58;
}

function weightedPick<T>(entries: Array<{ item: T; weight: number }>): T | null {
  const positive = entries.filter((entry) => entry.weight > 0);
  if (!positive.length) return entries[0]?.item ?? null;

  const total = positive.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * total;

  for (const entry of positive) {
    roll -= entry.weight;
    if (roll <= 0) return entry.item;
  }

  return positive[positive.length - 1]?.item ?? null;
}

function selectionMode(tagMagnitude: number): 'discover' | 'probe' | 'exploit' {
  const roll = Math.random();

  if (tagMagnitude < 3) {
    if (roll < 0.55) return 'discover';
    if (roll < 0.85) return 'probe';
    return 'exploit';
  }

  if (tagMagnitude < 7) {
    if (roll < 0.3) return 'discover';
    if (roll < 0.7) return 'probe';
    return 'exploit';
  }

  if (roll < 0.18) return 'discover';
  if (roll < 0.58) return 'probe';
  return 'exploit';
}

export function selectAdaptiveCard(context: CardSelectionContext): SwipeDeckCard | null {
  const { cards, deckKey, tagCounts, recentCardKeys = [], recentCards = [] } = context;
  if (!cards.length) return null;

  const positiveTags = topTagsByDirection(tagCounts, 'positive', 6);
  const negativeTags = topTagsByDirection(tagCounts, 'negative', 6);
  const tagMagnitude = Object.values(tagCounts || {}).reduce((sum, value) => sum + Math.abs(Number(value || 0)), 0);
  const mode = selectionMode(tagMagnitude);
  const balanceTarget = balanceTargetForDeck(deckKey);

  const recentMediumCounts = new Map<string, number>();
  for (const card of recentCards) {
    const medium = cardMedium(card);
    recentMediumCounts.set(medium, (recentMediumCounts.get(medium) || 0) + 1);
  }

  const ranked = cards
    .map((card) => {
      const tags = cardTags(card);
      const familiar = familiarityScore(card, deckKey);
      const diagnostic = diagnosticScore(card);
      const support = supportScore(tags, positiveTags);
      const probe = probeScore(tags, positiveTags, tagCounts);
      const unseen = unseenSignalCount(tags, tagCounts);
      const contradiction = contradictionPenalty(tags, negativeTags);
      const sophistication = sophisticationBand(card);
      const diversity = diversityPenalty(card, recentCardKeys);
      const underexplored = underexploredPrefixBonus(tags, tagCounts);
      const balanceBonus = 0.55 - Math.abs(sophistication - balanceTarget);
      const medium = cardMedium(card);
      const mediumRepeatPenalty = Math.max(0, (recentMediumCounts.get(medium) || 0) - 1) * 0.28;

      let score = balanceBonus - diversity - contradiction - mediumRepeatPenalty;

      if (mode === 'discover') {
        score += familiar * 1.15 + diagnostic * 0.95 + underexplored * 1.15 + Math.min(0.55, unseen * 0.14);
      } else if (mode === 'probe') {
        score += diagnostic * 1.3 + probe * 1.5 + support * 0.65 + underexplored * 0.9;
      } else {
        score += support * 1.45 + diagnostic * 0.85 + probe * 0.85 + familiar * 0.35;
      }

      if (!positiveTags.length && mode !== 'exploit') score += familiar * 0.35;
      if (!tags.length) score -= 0.35;

      return { card, score };
    })
    .sort((a, b) => b.score - a.score);

  const candidatePool = ranked.slice(0, Math.min(6, ranked.length));
  const choice = weightedPick(
    candidatePool.map(({ card, score }, index) => ({
      item: card,
      weight: Math.max(0.01, score + Math.max(0, 1.25 - index * 0.18)),
    }))
  );

  return choice ?? ranked[0]?.card ?? cards[0] ?? null;
}
