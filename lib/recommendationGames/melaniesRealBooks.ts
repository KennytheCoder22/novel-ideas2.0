import type { NormalizedCandidate, SwipeSignalV2 } from "../../app/recommender-v2/types";
import { canonicalBookIdentity, gameRecommendationCoverUrl } from "./gameRecommendationEngine";
import { gameRecommendationDescription } from "./gameRecommendationDescription";

export type StoryBook = {
  id: string; source: string; sourceId: string | null; title: string; author: string;
  synopsis: string; description: string; coverUrl: string | null;
  genres: string[]; themes: string[]; tones: string[]; dynamics: string[];
};
export type StoryRound = { offered: string[]; ranked: string[] };
export type StoryTournament = {
  version: 1; scope: string; sessionId: string; pool: StoryBook[];
  offered: string[]; selected: string[]; rounds: StoryRound[];
  phase: "choose" | "rank" | "reveal"; shownAt?: string; feedbackSaved?: boolean;
};

// Extract, never invent, a premise sentence; omit sentences that advertise an author/title.
export function anonymousSynopsis(description: string, title: string, authors: string[]): string | null {
  const identities = [title.replace(/\s*[:/].*$/, ""), ...authors].map(x => x.trim().toLowerCase()).filter(x => x.length > 3);
  const sentences = typeof Intl.Segmenter === "function"
    ? [...new Intl.Segmenter("en", { granularity: "sentence" }).segment(description)].map(x => x.segment.trim())
    : description.match(/[^.!?]+[.!?]+(?:[”’"]|$)?/g) || [];
  return sentences.find(sentence => {
    const words = sentence.split(/\s+/).length;
    return words >= 12 && words <= 65 && sentence.length <= 420 &&
      !identities.some(identity => sentence.toLowerCase().includes(identity)) &&
      !/bestsell|award.winning|\bISBN\b|starred review|\b(praise|edition|copyright|publisher|collection of|anthology)\b/i.test(sentence) &&
      !/^[“"‘]|^(During that time|His |Her |Their |It |This )|\bI (started|wrote|wanted|think)\b/.test(sentence);
  }) || null;
}

export function catalogStories(candidates: readonly NormalizedCandidate[], localOnly: boolean): StoryBook[] {
  const ids = new Set<string>(), premises = new Set<string>();
  return candidates.flatMap(candidate => {
    if (!candidate.formats.includes("book") || (localOnly && candidate.source !== "localLibrary")) return [];
    const description = gameRecommendationDescription(candidate)?.text;
    if (!description) return [];
    const synopsis = anonymousSynopsis(description, candidate.title, candidate.creators);
    const id = canonicalBookIdentity(candidate);
    if (!synopsis || ids.has(id) || premises.has(synopsis.toLowerCase())) return [];
    ids.add(id); premises.add(synopsis.toLowerCase());
    return [{ id, source: candidate.source, sourceId: candidate.sourceId || null, title: candidate.title,
      author: candidate.creators.join(", "), synopsis, description, coverUrl: gameRecommendationCoverUrl(candidate),
      genres: candidate.genres, themes: candidate.themes, tones: candidate.tones, dynamics: candidate.characterDynamics }];
  });
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
  return { version: 1, pool, scope, sessionId, offered: diverseStories(pool, 6, sessionId).map(b => b.id), selected: [], rounds: [], phase: "choose" };
}
export function finishStoryRound(state: StoryTournament): StoryTournament {
  if (state.phase !== "rank" || state.selected.length !== 3 || new Set(state.selected).size !== 3 || state.selected.some(id => !state.offered.includes(id))) throw new Error("Rank three stories before continuing.");
  const rounds = [...state.rounds, { offered: state.offered, ranked: state.selected }];
  if (rounds.length === storyRoundCount(state.pool.length)) return { ...state, rounds, phase: "reveal", shownAt: new Date().toISOString() };
  const seen = new Set(rounds.flatMap(round => round.offered));
  const anchors = state.selected.map(id => state.pool.find(b => b.id === id)!);
  const newcomers = diverseStories(state.pool.filter(b => !seen.has(b.id)), 3, state.sessionId + rounds.length, anchors);
  if (!newcomers.length) throw new Error("Not enough unseen stories to continue.");
  const offered = [...state.selected, ...newcomers.map(b => b.id)].sort((a, b) => hash(state.sessionId + rounds.length + a) - hash(state.sessionId + rounds.length + b));
  return { ...state, rounds, offered, selected: [], phase: "choose" };
}
export function storySignals(state: StoryTournament): SwipeSignalV2[] {
  // Each book contributes once using its latest comparison. Not selected means a weak relative
  // preference, not a declaration that the reader dislikes the book or has read it.
  const latest = new Map<string, SwipeSignalV2>();
  for (const round of state.rounds) for (const id of round.offered) {
    const book = state.pool.find(b => b.id === id)!;
    const rank = round.ranked.indexOf(id);
    latest.set(id, { id: `blind-synopsis:${id}`, action: rank < 0 ? "dislike" : "like", weight: rank < 0 ? 0.15 : [1, 0.7, 0.45][rank],
      genres: book.genres, themes: book.themes, tones: book.tones, characterDynamics: book.dynamics, format: "book", source: "melanies_game" });
  }
  return [...latest.values()];
}
export function restoreStoryTournament(raw: string | null, scope: string): StoryTournament | null {
  try {
    const s = JSON.parse(raw || "null") as StoryTournament;
    if (!s || s.version !== 1 || s.scope !== scope || typeof s.sessionId !== "string" || !["choose", "rank", "reveal"].includes(s.phase) || !Array.isArray(s.pool) || s.pool.length < 4 || s.pool.length > 180) return null;
    if (!s.pool.every(b => b && [b.id,b.title,b.author,b.synopsis,b.description,b.source].every(v => typeof v === "string") && [b.genres,b.themes,b.tones,b.dynamics].every(v => Array.isArray(v) && v.every(t => typeof t === "string")))) return null;
    const ids = new Set(s.pool.map(b => b.id));
    const valid = (list: unknown, length: number) => Array.isArray(list) && list.length === length && new Set(list).size === length && list.every(id => ids.has(id));
    if (ids.size !== s.pool.length || !valid(s.offered,s.offered?.length) || s.offered.length < 4 || s.offered.length > 6 || !Array.isArray(s.selected) || s.selected.length > 3 || new Set(s.selected).size !== s.selected.length || !s.selected.every(id => s.offered.includes(id)) || !Array.isArray(s.rounds) || s.rounds.length > 3) return null;
    if (!s.rounds.every(r => valid(r.offered,r.offered?.length) && r.offered.length >= 4 && r.offered.length <= 6 && valid(r.ranked,3) && r.ranked.every(id => r.offered.includes(id)))) return null;
    if ((s.phase === "rank" && s.selected.length !== 3) || (s.phase === "reveal" && (s.rounds.length !== storyRoundCount(s.pool.length) || s.selected.length !== 3)) || (s.phase !== "reveal" && s.rounds.length >= storyRoundCount(s.pool.length))) return null;
    if (s.phase === "reveal" && (typeof s.shownAt !== "string" || !Number.isFinite(Date.parse(s.shownAt)) || JSON.stringify(s.selected) !== JSON.stringify(s.rounds[s.rounds.length - 1].ranked))) return null;
    return s;
  } catch { return null; }
}
