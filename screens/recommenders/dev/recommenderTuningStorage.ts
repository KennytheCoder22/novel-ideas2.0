import AsyncStorage from '@react-native-async-storage/async-storage';

import { recommenderProfiles, type RecommenderLane, type RecommenderProfile } from '../recommenderProfiles';

export type RecommenderOverrides = Partial<Record<RecommenderLane, Partial<RecommenderProfile>>>;

const STORAGE_KEY = 'novelideas.recommender.devOverrides.v1';

function sanitizeNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return value;
}

function sanitizeProfilePatch(raw: unknown): Partial<RecommenderProfile> {
  if (!raw || typeof raw !== 'object') return {};

  const out: Partial<RecommenderProfile> = {};
  const template = recommenderProfiles.adult;

  for (const key of Object.keys(template) as Array<keyof RecommenderProfile>) {
    const value = sanitizeNumber((raw as any)[key]);
    if (value == null) continue;
    out[key] = value as never;
  }

  return out;
}

function sanitizeOverrides(raw: unknown): RecommenderOverrides {
  if (!raw || typeof raw !== 'object') return {};

  const out: RecommenderOverrides = {};
  for (const lane of Object.keys(recommenderProfiles) as RecommenderLane[]) {
    const patch = sanitizeProfilePatch((raw as any)[lane]);
    if (Object.keys(patch).length > 0) out[lane] = patch;
  }

  return out;
}

export async function loadSavedRecommenderOverrides(): Promise<RecommenderOverrides> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return sanitizeOverrides(JSON.parse(raw));
  } catch {
    return {};
  }
}

export async function saveRecommenderOverrides(overrides: RecommenderOverrides): Promise<void> {
  const clean = sanitizeOverrides(overrides);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
}

export async function clearSavedRecommenderOverrides(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}

export function serializeOverridesForCopy(overrides: RecommenderOverrides): string {
  const clean = sanitizeOverrides(overrides);
  return JSON.stringify(clean, null, 2);
}
