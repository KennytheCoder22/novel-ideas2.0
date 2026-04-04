import React, { useEffect, useMemo, useState } from 'react';
import Slider from '@react-native-community/slider';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import {
  laneFromDeckKey,
  recommenderProfiles,
  type RecommenderLane,
  type RecommenderProfile,
} from '../recommenderProfiles';
import type { DeckKey } from '../types';
import {
  clearProfileOverrides,
  getEffectiveProfile,
  loadProfileOverrides,
  resetLaneOverride,
  saveProfileOverrides,
  setLaneOverride,
} from './recommenderProfileOverrides';
import { serializeOverridesForCopy } from './recommenderTuningStorage';

type Props = {
  deckKey: DeckKey;
  visible: boolean;
  onClose: () => void;
  onProfileOverrideChange?: (lane: RecommenderLane, profileOverride: Partial<RecommenderProfile>) => void;
};

type ControlSpec = {
  key: keyof RecommenderProfile;
  label: string;
  min: number;
  max: number;
  step: number;
};

const LANE_ORDER: RecommenderLane[] = ['kids', 'preTeen', 'teen', 'adult'];

const CONTROL_SPECS: ControlSpec[] = [
  { key: 'canonicalBoost', label: 'Canonical Boost', min: 0, max: 2, step: 0.05 },
  { key: 'discoveryBoost', label: 'Discovery Boost', min: 0, max: 2, step: 0.05 },
  { key: 'genreStrictness', label: 'Genre Strictness', min: 0, max: 2, step: 0.05 },
  { key: 'moodStrictness', label: 'Mood Match', min: 0, max: 2, step: 0.05 },
  { key: 'darknessTolerance', label: 'Darkness Tolerance', min: 0, max: 1.5, step: 0.05 },
  { key: 'authorRepeatLimit', label: 'Author Diversity', min: 1, max: 4, step: 1 },
  { key: 'popularityWeight', label: 'Popularity Weight', min: 0, max: 2, step: 0.05 },
  { key: 'obscurePenalty', label: 'Obscure Penalty', min: 0, max: 2, step: 0.05 },
  { key: 'seriesPenalty', label: 'Series Penalty', min: 0, max: 2, step: 0.05 },
  { key: 'compendiumPenalty', label: 'Compendium Penalty', min: 0, max: 2, step: 0.05 },
  { key: 'mediaTieInPenalty', label: 'Media Tie-In Penalty', min: 0, max: 2, step: 0.05 },
  { key: 'titleSpamPenalty', label: 'Title Spam Penalty', min: 0, max: 2, step: 0.05 },
  { key: 'coverPenalty', label: 'Cover Penalty', min: 0, max: 2, step: 0.05 },
  { key: 'recencyWeight', label: 'Recency Weight', min: 0, max: 2, step: 0.05 },
  { key: 'driftPenalty', label: 'Drift Penalty', min: 0, max: 2, step: 0.05 },
  { key: 'fictionStrictness', label: 'Fiction Strictness', min: 0, max: 2, step: 0.05 },
  { key: 'sourceWeightOpenLibrary', label: 'OL Source Boost', min: -1, max: 1, step: 0.05 },
  { key: 'sourceWeightGoogleBooks', label: 'GB Source Weight', min: -1, max: 1, step: 0.05 },
  { key: 'credibilityFloor', label: 'Credibility Floor', min: 0, max: 1, step: 0.05 },
  { key: 'semanticDiversityBoost', label: 'Diversity Boost', min: 0, max: 2, step: 0.05 },
  { key: 'authorPenaltyStrength', label: 'Author Penalty Strength', min: 0, max: 2, step: 0.05 },
  { key: 'sessionWeight', label: 'Session Weight', min: 0, max: 4, step: 0.05 },
  { key: 'anchorMatchBoost', label: 'Anchor Boost', min: 0, max: 3, step: 0.05 },
  { key: 'formatMatchBoost', label: 'Format Boost', min: 0, max: 3, step: 0.05 },

  // Manga / Kitsu tuning
  { key: 'kitsuSourceBoost', label: 'Kitsu Boost', min: 0, max: 5, step: 0.25 },
  { key: 'minMangaResults', label: 'Min Manga Results', min: 0, max: 4, step: 1 },

  { key: 'negativeSignalPenalty', label: 'Negative Signal Penalty', min: 0, max: 3, step: 0.05 },
  { key: 'minKeep', label: 'Minimum Keep', min: 3, max: 10, step: 1 },
];

function cloneProfiles(): Record<RecommenderLane, RecommenderProfile> {
  return {
    kids: { ...getEffectiveProfile('kids') },
    preTeen: { ...getEffectiveProfile('preTeen') },
    teen: { ...getEffectiveProfile('teen') },
    adult: { ...getEffectiveProfile('adult') },
  };
}

function formatValue(value: number | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—';
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.00$/, '');
}

function clampToStep(value: number, min: number, max: number, step: number): number {
  const clamped = Math.max(min, Math.min(max, value));
  const snapped = Math.round((clamped - min) / step) * step + min;
  const fixed = Number(snapped.toFixed(4));
  return Math.max(min, Math.min(max, fixed));
}

function percentFromValue(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  return ((value - min) / (max - min)) * 100;
}

function resolveControlValue(
  profile: RecommenderProfile,
  key: keyof RecommenderProfile,
  fallback: number,
): number {
  const raw = profile[key];
  return typeof raw === 'number' && !Number.isNaN(raw) ? raw : fallback;
}

type MixerSliderRowProps = {
  label: string;
  value: number;
  defaultValue: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
};

function MixerSliderRow({
  label,
  value,
  defaultValue,
  min,
  max,
  step,
  onChange,
}: MixerSliderRowProps) {
  const defaultPct = percentFromValue(defaultValue, min, max);
  const changed = value !== defaultValue;

  return (
    <View style={styles.controlBlock}>
      <View style={styles.controlTopRow}>
        <Text style={styles.controlLabel}>{label}</Text>
        <View style={styles.valuePills}>
          <View style={[styles.valuePill, changed && styles.valuePillActive]}>
            <Text style={[styles.valuePillText, changed && styles.valuePillTextActive]}>
              {formatValue(value)}
            </Text>
          </View>
          <View style={styles.defaultPill}>
            <Text style={styles.defaultPillText}>default {formatValue(defaultValue)}</Text>
          </View>
        </View>
      </View>

      <View style={styles.sliderShell}>
        <View style={styles.trackBackdrop} pointerEvents="none">
          <View style={[styles.defaultMarker, { left: `${defaultPct}%` }]} />
        </View>

        <Slider
          style={styles.slider}
          minimumValue={min}
          maximumValue={max}
          step={step}
          value={value}
          minimumTrackTintColor="#2563eb"
          maximumTrackTintColor="#29476f"
          thumbTintColor="#f8fbff"
          onValueChange={onChange}
        />
      </View>

      <View style={styles.sliderMetaRow}>
        <Text style={styles.sliderMetaText}>
          {formatValue(min)}
        </Text>
        <Text style={styles.sliderMetaText}>
          step {formatValue(step)}
        </Text>
        <Text style={styles.sliderMetaText}>
          {formatValue(max)}
        </Text>
      </View>
    </View>
  );
}

export function RecommenderEqualizerPanel({
  deckKey,
  visible,
  onClose,
  onProfileOverrideChange,
}: Props) {
  const [activeLane, setActiveLane] = useState<RecommenderLane>(laneFromDeckKey(deckKey));
  const [profiles, setProfiles] = useState<Record<RecommenderLane, RecommenderProfile>>(cloneProfiles);
  const [status, setStatus] = useState<string>('');

  useEffect(() => {
    setActiveLane(laneFromDeckKey(deckKey));
  }, [deckKey]);

  useEffect(() => {
    let cancelled = false;
    if (!visible) return;

    (async () => {
      await loadProfileOverrides();
      if (cancelled) return;
      setProfiles(cloneProfiles());
    })();

    return () => {
      cancelled = true;
    };
  }, [visible]);

  const activeProfile = useMemo(() => profiles[activeLane], [activeLane, profiles]);

  if (!visible) return null;

  const commitLaneProfile = (lane: RecommenderLane, nextProfile: RecommenderProfile) => {
    const base = recommenderProfiles[lane];
    const patch: Partial<RecommenderProfile> = {};

    for (const key of Object.keys(base) as Array<keyof RecommenderProfile>) {
      if (nextProfile[key] !== base[key]) patch[key] = nextProfile[key];
    }

    if (Object.keys(patch).length === 0) resetLaneOverride(lane);
    else setLaneOverride(lane, patch);

    onProfileOverrideChange?.(lane, patch);
  };

  const setControlValue = (key: keyof RecommenderProfile, value: number) => {
    setProfiles((prev) => {
      const nextLaneProfile = { ...prev[activeLane], [key]: value };
      const next = { ...prev, [activeLane]: nextLaneProfile };
      commitLaneProfile(activeLane, nextLaneProfile);
      setStatus(`Updated ${activeLane}.${String(key)} = ${formatValue(value)}`);
      return next;
    });
  };

  const nudgeControl = (key: keyof RecommenderProfile, delta: number) => {
    const spec = CONTROL_SPECS.find((item) => item.key === key);
    if (!spec) return;

    const current = activeProfile[key];
    const nextValue = clampToStep(current + delta, spec.min, spec.max, spec.step);
    setControlValue(key, nextValue);
  };

  const resetLane = () => {
    resetLaneOverride(activeLane);
    const base = { ...recommenderProfiles[activeLane] };
    setProfiles((prev) => ({ ...prev, [activeLane]: base }));
    onProfileOverrideChange?.(activeLane, {});
    setStatus(`Reset ${activeLane} to shipped defaults`);
  };

  const saveAll = async () => {
    const saved = await saveProfileOverrides();
    setStatus(`Saved locally for dev use.\n${serializeOverridesForCopy(saved)}`);
  };

  const resetAll = async () => {
    await clearProfileOverrides();
    setProfiles({
      kids: { ...recommenderProfiles.kids },
      preTeen: { ...recommenderProfiles.preTeen },
      teen: { ...recommenderProfiles.teen },
      adult: { ...recommenderProfiles.adult },
    });
    onProfileOverrideChange?.('kids', {});
    onProfileOverrideChange?.('preTeen', {});
    onProfileOverrideChange?.('teen', {});
    onProfileOverrideChange?.('adult', {});
    setStatus('Cleared all saved overrides');
  };

  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Recommender Equalizer</Text>
            <Text style={styles.subtitle}>
              Dev-only tuning controls. Save persists locally through AsyncStorage.
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>×</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.laneTabs}>
          {LANE_ORDER.map((lane) => {
            const selected = lane === activeLane;
            return (
              <TouchableOpacity
                key={lane}
                onPress={() => setActiveLane(lane)}
                style={[styles.laneTab, selected && styles.laneTabSelected]}
              >
                <Text style={[styles.laneTabText, selected && styles.laneTabTextSelected]}>
                  {lane}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {CONTROL_SPECS.map((spec) => {
            const baseValue = resolveControlValue(recommenderProfiles[activeLane], spec.key, spec.min);
            const currentValue = resolveControlValue(activeProfile, spec.key, baseValue);

            return (
              <View key={String(spec.key)} style={styles.rowShell}>
                <View style={styles.nudgeCol}>
                  <TouchableOpacity
                    style={styles.nudgeBtn}
                    onPress={() => nudgeControl(spec.key, -spec.step)}
                  >
                    <Text style={styles.nudgeText}>−</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.sliderCol}>
                  <MixerSliderRow
                    label={spec.label}
                    value={currentValue}
                    defaultValue={baseValue}
                    min={spec.min}
                    max={spec.max}
                    step={spec.step}
                    onChange={(value) => setControlValue(spec.key, value)}
                  />
                </View>

                <View style={styles.nudgeCol}>
                  <TouchableOpacity
                    style={styles.nudgeBtn}
                    onPress={() => nudgeControl(spec.key, spec.step)}
                  >
                    <Text style={styles.nudgeText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </ScrollView>

        {status ? <Text style={styles.status}>{status}</Text> : null}

        <View style={styles.actions}>
          <TouchableOpacity style={[styles.actionBtn, styles.secondaryBtn]} onPress={resetLane}>
            <Text style={styles.actionText}>Reset Lane</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, styles.secondaryBtn]} onPress={resetAll}>
            <Text style={styles.actionText}>Clear All</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, styles.primaryBtn]} onPress={saveAll}>
            <Text style={[styles.actionText, styles.primaryText]}>Save</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 24,
    left: 12,
    right: 12,
    bottom: 80,
    zIndex: 100,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  card: {
    width: '100%',
    maxWidth: 900,
    maxHeight: '100%',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(8,20,36,0.98)',
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 12,
  },
  title: { color: '#fff', fontSize: 18, fontWeight: '900' },
  subtitle: { color: 'rgba(255,255,255,0.72)', fontSize: 12, fontWeight: '700', marginTop: 4 },
  closeBtn: { paddingHorizontal: 10, paddingVertical: 2 },
  closeText: { color: '#fff', fontSize: 24, fontWeight: '900' },

  laneTabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  laneTab: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#32507c',
    backgroundColor: '#102542',
  },
  laneTabSelected: { backgroundColor: '#2563eb', borderColor: '#1d4ed8' },
  laneTabText: { color: '#d9e7ff', fontWeight: '800' },
  laneTabTextSelected: { color: '#fff' },

  scroll: { flexGrow: 0 },
  scrollContent: { paddingBottom: 8 },

  rowShell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sliderCol: { flex: 1 },
  nudgeCol: { width: 34, alignItems: 'center' },
  nudgeBtn: {
    width: 30,
    height: 30,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#34527e',
    backgroundColor: '#102542',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nudgeText: {
    color: '#e5efff',
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 20,
  },

  controlBlock: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    backgroundColor: 'rgba(255,255,255,0.02)',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  controlTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  controlLabel: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
    flex: 1,
  },

  valuePills: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  valuePill: {
    minWidth: 54,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#34527e',
    backgroundColor: '#102542',
    alignItems: 'center',
  },
  valuePillActive: {
    backgroundColor: '#163b74',
    borderColor: '#2563eb',
  },
  valuePillText: {
    color: '#dfe9ff',
    fontWeight: '900',
    fontSize: 12,
  },
  valuePillTextActive: {
    color: '#fff',
  },
  defaultPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  defaultPillText: {
    color: 'rgba(255,255,255,0.68)',
    fontWeight: '800',
    fontSize: 11,
  },

  sliderShell: {
    position: 'relative',
    justifyContent: 'center',
    height: 30,
    marginBottom: 2,
  },
  trackBackdrop: {
    position: 'absolute',
    left: 10,
    right: 10,
    top: '50%',
    marginTop: -1,
    height: 2,
  },
  defaultMarker: {
    position: 'absolute',
    top: -6,
    marginLeft: -1,
    width: 2,
    height: 14,
    borderRadius: 2,
    backgroundColor: '#f59e0b',
  },
  slider: {
    width: '100%',
    height: 30,
  },

  sliderMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sliderMetaText: {
    color: 'rgba(255,255,255,0.52)',
    fontSize: 10,
    fontWeight: '800',
  },

  status: {
    color: '#cde0ff',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 8,
    marginBottom: 8,
  },

  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    flexWrap: 'wrap',
  },
  actionBtn: {
    minWidth: 110,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtn: { backgroundColor: '#102542', borderColor: '#34527e' },
  primaryBtn: { backgroundColor: '#2563eb', borderColor: '#1d4ed8' },
  actionText: { color: '#e5efff', fontSize: 12, fontWeight: '900' },
  primaryText: { color: '#fff' },
});
