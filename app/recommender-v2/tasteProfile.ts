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

function browserDebugFlag(name: string): { active: boolean; source?: "url" | "localStorage" } {
  const runtime = globalThis as any;
  try {
    const search = String(runtime?.location?.search || "");
    if (search) {
      const params = new URLSearchParams(search);
      const value = params.get(name);
      if (value === "1" || value === "true") return { active: true, source: "url" };
    }
  } catch {
    // Non-browser runtimes do not expose location; ignore.
  }
  try {
    const value = runtime?.localStorage?.getItem?.(name);
    if (value === "1" || value === "true") return { active: true, source: "localStorage" };
  } catch {
    // localStorage may be unavailable or blocked; ignore.
  }
  return { active: false };
}

function middleGradesDeepDebug(session: SwipeSessionV2): { active: boolean; source: "profile" | "url" | "localStorage" | "preset" | "none" } {
  if (session.ageBand !== "preteens") return { active: false, source: "none" };
  const diagnostics = session.diagnostics || {};
  if (diagnostics.debugMiddleGradesDeepTrace || diagnostics.debugMiddleGradesNoTimeouts || session.debugMiddleGradesDeepTrace || session.debugMiddleGradesNoTimeouts) {
    return { active: true, source: diagnostics.middleGradesDeepDebugActivationSource === "preset" ? "preset" : "profile" };
  }
  const urlFlag = browserDebugFlag("debugMiddleGradesDeepTrace");
  if (urlFlag.active) return { active: true, source: urlFlag.source || "url" };
  const noTimeoutUrlFlag = browserDebugFlag("debugMiddleGradesNoTimeouts");
  if (noTimeoutUrlFlag.active) return { active: true, source: noTimeoutUrlFlag.source || "url" };
  return { active: false, source: "none" };
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
  const deepDebug = middleGradesDeepDebug(session);

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
      ...(session.diagnostics || {}),
      debugMiddleGradesDeepTrace: deepDebug.active,
      debugMiddleGradesNoTimeouts: deepDebug.active,
      middleGradesDeepDebugActive: deepDebug.active,
      middleGradesDeepDebugActivationSource: deepDebug.source,
      sessionReportHeader: deepDebug.active ? "MIDDLE GRADES DEEP DEBUG: ACTIVE" : undefined,
    },
  };
}
