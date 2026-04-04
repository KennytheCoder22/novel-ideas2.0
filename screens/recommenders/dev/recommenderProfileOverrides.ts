import { laneFromDeckKey, recommenderProfiles, type RecommenderLane, type RecommenderProfile } from '../recommenderProfiles';
import type { DeckKey } from '../types';
import {
  clearSavedRecommenderOverrides,
  loadSavedRecommenderOverrides,
  saveRecommenderOverrides,
  type RecommenderOverrides,
} from './recommenderTuningStorage';

let memoryOverrides: RecommenderOverrides = {};

function cleanPatch(patch: Partial<RecommenderProfile> | undefined): Partial<RecommenderProfile> {
  if (!patch) return {};

  const cleaned: Partial<RecommenderProfile> = {};
  const base = recommenderProfiles.adult;

  for (const key of Object.keys(base) as Array<keyof RecommenderProfile>) {
    const value = patch[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    cleaned[key] = value;
  }

  return cleaned;
}

function cleanOverrides(overrides: RecommenderOverrides): RecommenderOverrides {
  const out: RecommenderOverrides = {};
  for (const lane of Object.keys(recommenderProfiles) as RecommenderLane[]) {
    const patch = cleanPatch(overrides[lane]);
    if (Object.keys(patch).length > 0) out[lane] = patch;
  }
  return out;
}

export function getProfileOverrides(): RecommenderOverrides {
  return cleanOverrides(memoryOverrides);
}

export function getLaneOverride(lane: RecommenderLane): Partial<RecommenderProfile> {
  return { ...(memoryOverrides[lane] || {}) };
}

export function getEffectiveProfile(lane: RecommenderLane): RecommenderProfile {
  return {
    ...recommenderProfiles[lane],
    ...(memoryOverrides[lane] || {}),
  };
}

export function getEffectiveProfileForDeck(deckKey: DeckKey): RecommenderProfile {
  return getEffectiveProfile(laneFromDeckKey(deckKey));
}

export function setAllProfileOverrides(overrides: RecommenderOverrides): RecommenderOverrides {
  memoryOverrides = cleanOverrides(overrides);
  return getProfileOverrides();
}

export function setLaneOverride(
  lane: RecommenderLane,
  patch: Partial<RecommenderProfile>
): Partial<RecommenderProfile> {
  const next = cleanPatch({ ...(memoryOverrides[lane] || {}), ...patch });
  if (Object.keys(next).length === 0) delete memoryOverrides[lane];
  else memoryOverrides[lane] = next;
  return getLaneOverride(lane);
}

export function resetLaneOverride(lane: RecommenderLane): void {
  delete memoryOverrides[lane];
}

export async function loadProfileOverrides(): Promise<RecommenderOverrides> {
  memoryOverrides = cleanOverrides(await loadSavedRecommenderOverrides());
  return getProfileOverrides();
}

export async function saveProfileOverrides(): Promise<RecommenderOverrides> {
  const clean = getProfileOverrides();
  await saveRecommenderOverrides(clean);
  return clean;
}

export async function clearProfileOverrides(): Promise<void> {
  memoryOverrides = {};
  await clearSavedRecommenderOverrides();
}
