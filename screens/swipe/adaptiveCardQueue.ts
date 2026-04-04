import type { SwipeDeckCard } from '../../data/swipeDecks/types';

type DeckKey = 'k2' | '36' | 'ms_hs' | 'adult';

type CardSelectionContext = {
  deckKey: DeckKey;
  cards: SwipeDeckCard[];
  tagCounts: Record<string, number>;
  recentCardKeys?: string[];
};

function normalizeKey(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

export function cardIdentityKey(card: SwipeDeckCard): string {
  return normalizeKey((card as any).id) || normalizeKey((card as any).title) || normalizeKey((card as any).prompt) || JSON.stringify(card);
}

function cardTags(card: SwipeDeckCard): string[] {
  const tags = Array.isArray((card as any).tags) ? (card as any).tags : [];
  return tags.map((tag: unknown) => String(tag || '').trim()).filter(Boolean);
}

function familiarityScore(card: SwipeDeckCard, deckKey: DeckKey): number {
  const title = normalizeKey((card as any).title);
  const tags = cardTags(card).join(' ').toLowerCase();
  let score = 0.35;

  if ((card as any).wikiTitle) score += 0.18;
  if ((card as any).imageUri) score += 0.12;
  if ((card as any).isDefault) score += 0.08;
  if (/(disney|pixar|minecraft|harry potter|star wars|marvel|pokemon|stranger things|taylor swift|beatles|zelda|mario)/.test(`${title} ${tags}`)) score += 0.18;
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

function tagOverlapScore(card: SwipeDeckCard, tagCounts: Record<string, number>): number {
  const tags = cardTags(card);
  if (!tags.length) return 0;
  let score = 0;
  for (const tag of tags) {
    const prior = Number(tagCounts[tag] || 0);
    if (prior > 0) score -= Math.min(0.8, prior * 0.35);
    if (prior < 0) score += Math.min(0.6, Math.abs(prior) * 0.2);
  }
  return score;
}

function diagnosticScore(card: SwipeDeckCard): number {
  const tags = cardTags(card);
  const uniquePrefixes = new Set(tags.map((tag) => tag.split(':')[0]).filter(Boolean));
  let score = Math.min(1, uniquePrefixes.size * 0.18 + tags.length * 0.04);
  if (tags.some((tag) => /^theme:|^vibe:|^genre:/.test(tag))) score += 0.15;
  return Math.min(1.1, score);
}

function diversityPenalty(card: SwipeDeckCard, recentCardKeys: string[]): number {
  const key = cardIdentityKey(card);
  if (recentCardKeys.includes(key)) return 1.3;
  const tags = new Set(cardTags(card));
  let overlap = 0;
  for (const recentKey of recentCardKeys) {
    if (key === recentKey) overlap += 1;
  }
  return overlap * 0.45;
}

export function selectAdaptiveCard(context: CardSelectionContext): SwipeDeckCard | null {
  const { cards, deckKey, tagCounts, recentCardKeys = [] } = context;
  if (!cards.length) return null;

  const tagMagnitude = Object.values(tagCounts || {}).reduce((sum, value) => sum + Math.abs(Number(value || 0)), 0);
  const needFamiliar = tagMagnitude < 3;
  const needDiagnostic = tagMagnitude >= 3;

  const ranked = cards
    .map((card) => {
      const familiar = familiarityScore(card, deckKey);
      const diagnostic = diagnosticScore(card);
      const overlap = tagOverlapScore(card, tagCounts);
      const sophistication = sophisticationBand(card);
      const diversity = diversityPenalty(card, recentCardKeys);
      const balanceTarget = deckKey === 'k2' ? 0.35 : deckKey === '36' ? 0.45 : 0.58;
      const balanceBonus = 0.55 - Math.abs(sophistication - balanceTarget);
      const score =
        (needFamiliar ? familiar * 1.5 : familiar * 0.5) +
        (needDiagnostic ? diagnostic * 1.45 : diagnostic * 0.8) +
        overlap +
        balanceBonus -
        diversity;
      return { card, score };
    })
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.card ?? cards[0] ?? null;
}
