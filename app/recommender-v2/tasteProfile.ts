import type { SourceIdV2, SwipeSessionV2, TasteProfile, WeightedSignalV2 } from "./types";

const SOURCE_HINTS = new Set<SourceIdV2>(["googleBooks", "openLibrary", "kitsu", "comicVine", "localLibrary", "nyt", "mock"]);

function normalizeSignal(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

function addWeighted(map: Map<string, WeightedSignalV2>, rawValue: string, weight: number, evidence: string): void {
  const value = normalizeSignal(rawValue);
  if (!value) return;
  const existing = map.get(value) || { value, weight: 0, evidence: [] };
  existing.weight += weight;
  if (!existing.evidence.includes(evidence)) existing.evidence.push(evidence);
  map.set(value, existing);
}

function sortedSignals(map: Map<string, WeightedSignalV2>, positiveOnly = true): WeightedSignalV2[] {
  return [...map.values()]
    .filter((row) => (positiveOnly ? row.weight > 0 : row.weight !== 0))
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight) || a.value.localeCompare(b.value))
    .slice(0, 12);
}

export function buildTasteProfile(session: SwipeSessionV2): TasteProfile {
  const tone = new Map<string, WeightedSignalV2>();
  const pacing = new Map<string, WeightedSignalV2>();
  const genreFamily = new Map<string, WeightedSignalV2>();
  const themes = new Map<string, WeightedSignalV2>();
  const characterDynamics = new Map<string, WeightedSignalV2>();
  const formatPreference = new Map<string, WeightedSignalV2>();
  const avoidSignals = new Map<string, WeightedSignalV2>();
  const sourceHints = new Set<SourceIdV2>();

  for (const signal of session.signals || []) {
    const direction = signal.action === "like" ? 1 : signal.action === "dislike" ? -1 : 0.25;
    const weight = direction * Math.max(0.25, Number(signal.weight || 1));
    const evidence = signal.title ? `${signal.action}:${signal.title}` : signal.action;
    const targetMap = signal.action === "dislike" ? avoidSignals : null;

    for (const value of signal.tones || []) addWeighted(targetMap || tone, value, weight, evidence);
    for (const value of signal.genres || []) addWeighted(targetMap || genreFamily, value, weight, evidence);
    for (const value of signal.themes || []) addWeighted(targetMap || themes, value, weight, evidence);
    for (const value of signal.characterDynamics || []) addWeighted(targetMap || characterDynamics, value, weight, evidence);
    for (const value of signal.tags || []) {
      const normalized = normalizeSignal(value);
      if (/slow|fast|propulsive|quiet|paced/.test(normalized)) addWeighted(targetMap || pacing, normalized, weight, evidence);
      else addWeighted(targetMap || themes, normalized, weight * 0.5, evidence);
    }
    if (signal.format) addWeighted(targetMap || formatPreference, signal.format, weight, evidence);
    const source = String(signal.source || "") as SourceIdV2;
    if (SOURCE_HINTS.has(source)) sourceHints.add(source);
  }

  return {
    ageBand: session.ageBand,
    tone: sortedSignals(tone),
    pacing: sortedSignals(pacing),
    genreFamily: sortedSignals(genreFamily),
    themes: sortedSignals(themes),
    characterDynamics: sortedSignals(characterDynamics),
    formatPreference: sortedSignals(formatPreference),
    maturityBand: session.ageBand,
    avoidSignals: sortedSignals(avoidSignals, false),
    sourceHints: [...sourceHints],
    diagnostics: {
      inputSignalCount: session.signals?.length || 0,
      likedCount: session.signals?.filter((s) => s.action === "like").length || 0,
      dislikedCount: session.signals?.filter((s) => s.action === "dislike").length || 0,
      skippedCount: session.signals?.filter((s) => s.action === "skip").length || 0,
    },
  };
}
