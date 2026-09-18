import type { NormalizedCandidate, SwipeSignalV2 } from "../../app/recommender-v2/types";
import {
  anonymousMelaniePremise,
  catalogMelanieStories,
  isUsableMelaniePremise,
  type MelanieDescriptionDiagnostics,
} from "./melanieDescriptionQuality";

export type StoryBook = {
  id: string; source: string; sourceId: string | null; title: string; author: string;
  synopsis: string; description: string; coverUrl: string | null;
  genres: string[]; themes: string[]; tones: string[]; dynamics: string[];
};
export type StoryRound = { offered: string[]; ranked: string[] };
export type StoryTournament = {
  version: 2; scope: string; sessionId: string; pool: StoryBook[];
  offered: string[]; selected: string[]; rounds: StoryRound[];
  held: string[];
  deals: { offered: string[]; saved: string[] }[];
  phase: "choose" | "rank" | "reveal"; shownAt?: string; feedbackSaved?: boolean;
};
export const SECRET_HAND_TARGET = 5;
export const SECRET_HAND_MINIMUM = 3;

export function anonymousSynopsis(description: string, title: string, authors: string[]): string | null {
  return anonymousMelaniePremise(description, title, authors);
}

export function catalogStories(candidates: readonly NormalizedCandidate[], localOnly: boolean): StoryBook[] {
  return catalogStoriesWithDiagnostics(candidates, localOnly).stories;
}

export function catalogStoriesWithDiagnostics(
  candidates: readonly NormalizedCandidate[],
  localOnly: boolean,
): { stories: StoryBook[]; diagnostics: MelanieDescriptionDiagnostics } {
  return catalogMelanieStories(candidates, localOnly);
}

function tokens(book: StoryBook): Set<string> {
  const text = [...book.genres, ...book.themes, ...book.tones, book.synopsis].join(" ").toLowerCase();
  const ignored = new Set(["about", "their", "there", "where", "which", "after", "before", "young", "story", "fiction", "through", "while", "must", "with", "that", "from", "they", "when"]);
  return new Set((text.match(/[a-z]{4,}/g) || []).filter(word => !ignored.has(word)));
}
function similarity(a: StoryBook, b: StoryBook): number {
  const left = tokens(a), right = tokens(b);
  return [...left].filter(word => right.has(word)).length / Math.max(1, Math.sqrt(left.size * right.size));
}
function hash(value: string): number {
  let n = 2166136261;
  for (const char of value) n = Math.imul(n ^ char.charCodeAt(0), 16777619);
  return n >>> 0;
}
export function diverseStories(pool: StoryBook[], count: number, seed: string, anchors: StoryBook[] = []): StoryBook[] {
  const chosen: StoryBook[] = [];
  const remaining = [...pool];
  while (chosen.length < count && remaining.length) {
    remaining.sort((a, b) => {
      const score = (book: StoryBook) => {
        const affinity = anchors.reduce((sum, anchor, i) => sum + similarity(book, anchor) / (i + 1), 0);
        const repetition = Math.max(0, ...chosen.map(other => similarity(book, other)));
        return affinity - repetition * 0.8;
      };
      return score(b) - score(a) || hash(seed + a.id) - hash(seed + b.id);
    });
    chosen.push(remaining.shift()!);
  }
  return chosen;
}
export function storyRoundCount(poolSize: number): number {
  return Math.min(3, 1 + Math.ceil(Math.max(0, poolSize - 6) / 3));
}
export function startStoryTournament(pool: StoryBook[], scope: string, sessionId: string): StoryTournament {
  if (pool.length < 4) throw new Error("Book sources returned too few usable descriptions to compare right now. Please try again shortly.");
  if (new Set(pool.map(book => book.id)).size !== pool.length || pool.length > 180) throw new Error("Invalid story catalog.");
  return { version: 2, pool, scope, sessionId, offered: diverseStories(pool, 6, sessionId).map(b => b.id), selected: [], held: [], deals: [], rounds: [], phase: "choose" };
}
export function unseenStories(state: StoryTournament): StoryBook[] {
  const seen = new Set([...state.rounds.flatMap(round => round.offered), ...state.deals.flatMap(deal => deal.offered), ...state.offered, ...state.held]);
  return state.pool.filter(book => !seen.has(book.id));
}
export function canRankSecretHand(state: StoryTournament): boolean {
  return state.held.length >= SECRET_HAND_MINIMUM
    || (state.held.length > 0 && state.offered.length === 0 && unseenStories(state).length === 0);
}
// Committing a deal records interest in selection order, not a fabricated ranking.
export function saveStoryDeal(state: StoryTournament): StoryTournament {
  if (state.phase !== "choose" || !state.offered.length) throw new Error("No active deal to save.");
  if (new Set(state.selected).size !== state.selected.length || state.selected.some(id => !state.offered.includes(id) || state.held.includes(id))) throw new Error("Invalid saved stories.");
  const held = [...state.held, ...state.selected];
  const deals = [...state.deals, { offered: [...state.offered], saved: [...state.selected] }];
  const anchors = held.map(id => state.pool.find(book => book.id === id)!);
  const offered = diverseStories(unseenStories(state), 6, `${state.sessionId}:deal-${deals.length}`, anchors).map(book => book.id);
  return { ...state, held, deals, offered, selected: [] };
}
export function rankSecretHand(state: StoryTournament): StoryTournament {
  if (state.phase !== "choose") throw new Error("Finish collecting before ranking.");
  // The combined CTA saves current genuine selections, but does not record an untouched
  // deal as a rejection when the reader simply decides their existing hand is enough.
  const next = state.selected.length ? saveStoryDeal(state) : state;
  if (!canRankSecretHand(next)) throw new Error("Save at least three stories before ranking.");
  return { ...next, selected: [...next.held], phase: "rank" };
}
export function finishStoryRound(state: StoryTournament): StoryTournament {
  if (state.phase !== "rank" || !state.held.length || state.selected.length !== state.held.length || new Set(state.selected).size !== state.held.length || state.selected.some(id => !state.held.includes(id))) throw new Error("Rank every saved story exactly once before revealing.");
  return { ...state, phase: "reveal", shownAt: new Date().toISOString() };
}
export function storySignals(state: StoryTournament): SwipeSignalV2[] {
  // Passed-over stories remain contextual evidence in deals, NEVER explicit dislikes.
  // A saved hand is unordered until reveal. Each genuinely held book contributes once.
  return state.held.map(id => {
    const book = state.pool.find(b => b.id === id)!;
    const rank = state.selected.indexOf(id);
    const weight = state.phase === "reveal" ? 1 - 0.55 * rank / Math.max(1, state.held.length - 1) : 0.6;
    return { id: `blind-synopsis:${id}`, action: "like", weight,
      genres: book.genres, themes: book.themes, tones: book.tones, characterDynamics: book.dynamics, format: "book", source: "melanies_game" };
  });
}
export function restoreStoryTournament(raw: string | null, scope: string): StoryTournament | null {
  try {
    const s = JSON.parse(raw || "null") as Omit<StoryTournament, "version"> & { version: number };
    if (!s || ![1,2].includes(s.version) || s.scope !== scope || typeof s.sessionId !== "string" || !["choose", "rank", "reveal"].includes(s.phase) || !Array.isArray(s.pool) || s.pool.length < 4 || s.pool.length > 180) return null;
    if (!s.pool.every(b => b && [b.id,b.title,b.author,b.synopsis,b.description,b.source].every(v => typeof v === "string") && isUsableMelaniePremise(b.synopsis) && [b.genres,b.themes,b.tones,b.dynamics].every(v => Array.isArray(v) && v.every(t => typeof t === "string")))) return null;
    const ids = new Set(s.pool.map(b => b.id));
    const valid = (list: unknown, length: number) => Array.isArray(list) && list.length === length && new Set(list).size === length && list.every(id => ids.has(id));
    if (ids.size !== s.pool.length || !valid(s.offered,s.offered?.length) || s.offered.length > 6 || !valid(s.selected,s.selected?.length) || !Array.isArray(s.rounds) || s.rounds.length > 3) return null;
    if (!s.rounds.every(r => valid(r.offered,r.offered?.length) && r.offered.length >= 4 && r.offered.length <= 6 && valid(r.ranked,3) && r.ranked.every(id => r.offered.includes(id)))) return null;
    if (s.version === 1) {
      if (s.offered.length < 4 || s.selected.length > 3 || !s.selected.every(id => s.offered.includes(id))) return null;
      if ((s.phase === "rank" && s.selected.length !== 3) || (s.phase === "reveal" && (s.rounds.length !== storyRoundCount(s.pool.length) || s.selected.length !== 3)) || (s.phase !== "reveal" && s.rounds.length >= storyRoundCount(s.pool.length))) return null;
      if (s.phase === "reveal" && (typeof s.shownAt !== "string" || !Number.isFinite(Date.parse(s.shownAt)) || JSON.stringify(s.selected) !== JSON.stringify(s.rounds[s.rounds.length - 1].ranked))) return null;
      // Preserve historical tournament evidence and all confirmed interests; do not
      // fabricate new deal evidence or change an already-revealed slate.
      const held = s.phase === "reveal" ? [...s.selected] : [...new Set([...s.rounds.flatMap(r => r.ranked), ...(s.phase === "rank" ? s.selected : [])])];
      const offered = s.offered.filter(id => !held.includes(id) && !s.rounds.some(r => r.offered.includes(id)));
      return { ...s, version: 2, held, deals: [], offered, rounds: s.phase === "rank" ? [...s.rounds, { offered: [...s.offered], ranked: [...s.selected] }] : s.rounds, selected: s.phase === "choose" ? s.selected.filter(id => offered.includes(id)) : [...held] };
    }
    if (!valid(s.held,s.held?.length) || !Array.isArray(s.deals) || s.deals.length > 180) return null;
    const dealt = new Set<string>();
    for (const deal of s.deals) {
      if (!valid(deal.offered,deal.offered?.length) || !deal.offered.length || deal.offered.length > 6 || !valid(deal.saved,deal.saved?.length) || !deal.saved.every(id => deal.offered.includes(id) && s.held.includes(id)) || deal.offered.some(id => dealt.has(id))) return null;
      deal.offered.forEach(id => dealt.add(id));
    }
    const recordedHeld = new Set([...s.rounds.flatMap(r => r.ranked), ...s.deals.flatMap(d => d.saved)]);
    if (s.held.some(id => !recordedHeld.has(id)) || s.offered.some(id => dealt.has(id) || s.held.includes(id))) return null;
    if (s.phase === "choose" ? s.selected.some(id => !s.offered.includes(id)) : !s.held.length || s.selected.length !== s.held.length || s.selected.some(id => !s.held.includes(id))) return null;
    if (s.phase === "reveal" && (typeof s.shownAt !== "string" || !Number.isFinite(Date.parse(s.shownAt)))) return null;
    return s as StoryTournament;
  } catch { return null; }
}
