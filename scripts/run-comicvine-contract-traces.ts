import msHsDeck from '../data/swipeDecks/ms_hs';
import { getRecommendations } from '../screens/recommenders/recommenderRouter';
import { EXPECTED_ROUTER_FINGERPRINT } from '../screens/recommenders/routerFingerprint';
import type { RecommenderInput } from '../screens/recommenders/types';

type Direction = 'like' | 'dislike' | 'skip';

type TracePreset = { id: 'test_a' | 'test_b' | 'test_c'; sequence: Direction[] };

const PRESETS: TracePreset[] = [
  { id: 'test_a', sequence: ['like', 'like', 'dislike', 'skip', 'like', 'dislike', 'like', 'skip'] },
  { id: 'test_b', sequence: ['dislike', 'dislike', 'like', 'skip', 'dislike', 'like', 'skip', 'like'] },
  { id: 'test_c', sequence: ['like', 'skip', 'like', 'skip', 'dislike', 'like', 'dislike', 'like'] },
];

function toTagCounts(sequence: Direction[]) {
  const cards = Array.isArray((msHsDeck as any)?.cards) ? (msHsDeck as any).cards.slice(0, sequence.length) : [];
  const tagCounts: Record<string, number> = {
    'audience:kids': 0,
    'audience:teen': 1000,
    'audience:adult': 0,
    'age:k2': 0,
    'age:36': 0,
    'age:mshs': 1000,
    'age:adult': 0,
  };

  for (let index = 0; index < cards.length; index += 1) {
    const card = cards[index] as any;
    const direction = sequence[index] || 'skip';
    const weight = direction === 'like' ? 1 : direction === 'dislike' ? -1 : 0;
    if (!weight) continue;
    const tags = Array.isArray(card?.tags) ? card.tags : [];
    for (const rawTag of tags) {
      const tag = String(rawTag || '').trim().toLowerCase();
      if (!tag) continue;
      tagCounts[tag] = Number(tagCounts[tag] || 0) + weight;
    }
  }

  const disliked = Object.fromEntries(
    Object.entries(tagCounts)
      .filter(([, value]) => Number(value || 0) < 0)
      .map(([tag, value]) => [tag, Math.abs(Number(value || 0))])
  );

  return { tagCounts, disliked };
}

async function runPreset(preset: TracePreset) {
  const { tagCounts, disliked } = toTagCounts(preset.sequence);
  const input: RecommenderInput = {
    deckKey: 'ms_hs',
    limit: 10,
    timeoutMs: 9000,
    tagCounts,
    dislikedTagCounts: disliked,
    leftTagCounts: disliked,
    sourceEnabled: {
      googleBooks: false,
      openLibrary: false,
      localLibrary: false,
      kitsu: false,
      comicVine: true,
    } as any,
  } as RecommenderInput;

  const result = await getRecommendations(input as any);
  const trace = (result as any)?.debugGcdDispatchTrace || {};
  const runtimeRouterVersion = String((result as any)?.debugRouterVersion || '');
  const routerResultTracePresent = Boolean((result as any)?.routerResultTracePresent);
  const recommendFunctionReturned = Boolean(result);
  const recommendFunctionError = String((trace as any)?.comicVineDispatchError || '');


  const returnedTitles = Array.isArray((result as any)?.items) ? (result as any).items.map((it: any) => String(it?.doc?.title || it?.title || '').trim()).filter(Boolean) : [];
  const terminalRejectReasonByTitle = ((result as any)?.terminalRejectReasonByTitle || {}) as Record<string, string>;
  const norm = (v: string) => String(v || '').toLowerCase().trim();
  const returnedWithFinalEligibilityRejected = returnedTitles.filter((t) => String(terminalRejectReasonByTitle[norm(t)] || '').includes('final_eligibility_rejected'));
  const returnedItemsLength = Number((result as any)?.items?.length || 0);

  const fields = {
    returnedItemsLength,
    countContractSatisfied: Boolean(trace?.countContractSatisfied),
    returnedItemsBuiltFrom: String(trace?.returnedItemsBuiltFrom || ''),
    final_contract_refill_candidates: trace?.final_contract_refill_candidates ?? [],
    final_contract_refill_accepts: trace?.final_contract_refill_accepts ?? [],
    non_shrunk_restore: trace?.non_shrunk_restore ?? false,
  };

  if (!recommendFunctionReturned) throw new Error(`${preset.id}: recommendFunctionReturned false`);
  if (runtimeRouterVersion !== EXPECTED_ROUTER_FINGERPRINT) {
    throw new Error(`${preset.id}: stale runtime artifact detected (debugRouterVersion=${runtimeRouterVersion || 'missing'}, expected=${EXPECTED_ROUTER_FINGERPRINT})`);
  }
  if (!routerResultTracePresent || !Boolean(trace?.debugRouterVersion || Object.keys(trace || {}).length > 0)) {
    throw new Error(`${preset.id}: routerResultTracePresent false`);
  }
  if (recommendFunctionError) {
    throw new Error(`${preset.id}: recommendFunctionError present (${recommendFunctionError})`);
  }
  if (returnedWithFinalEligibilityRejected.length > 0) {
    throw new Error(`${preset.id}: returned titles with final_eligibility_rejected: ${returnedWithFinalEligibilityRejected.join(' | ')}`);
  }

  return {
    id: preset.id,
    passed: true,
    returnedItemsLength,
    runtimeRouterVersion,
    routerResultTracePresent,
    recommendFunctionReturned,
    recommendFunctionError: recommendFunctionError || '(none)',
    fields,
  };
}

function printPreset(result: any) {
  console.log(`\n=== ${String(result?.id || '').toUpperCase()} ===`);
  console.log(JSON.stringify(result?.fields || {}, null, 2));
}

(async () => {
  const presetResults: Array<{
    id: string;
    passed: boolean;
    returnedItemsLength: number;
    runtimeRouterVersion: string;
    routerResultTracePresent: boolean;
    recommendFunctionReturned: boolean;
    recommendFunctionError: string;
    fields: Record<string, any>;
  }> = [];

  for (const preset of PRESETS) {
    try {
      const one = await runPreset(preset);
      presetResults.push(one);
      printPreset(one);
    } catch (error: any) {
      presetResults.push({
        id: preset.id,
        passed: false,
        returnedItemsLength: 0,
        runtimeRouterVersion: '(missing)',
        routerResultTracePresent: false,
        recommendFunctionReturned: false,
        recommendFunctionError: String(error?.message || error || 'unknown'),
        fields: { error: String(error?.message || error || 'unknown') },
      });
      console.error(`\n=== ${preset.id.toUpperCase()} ===`);
      console.error(String(error?.message || error || 'unknown'));
    }
  }

  const gateEligible = presetResults.filter((row) =>
    row.passed &&
    row.runtimeRouterVersion === EXPECTED_ROUTER_FINGERPRINT &&
    row.recommendFunctionReturned === true &&
    row.recommendFunctionError === '(none)' &&
    row.routerResultTracePresent === true &&
    row.returnedItemsLength >= 1
  );
  const gatePass = gateEligible.length >= 2;
  console.log('\n=== RELEASE GATE SUMMARY ===');
  console.log(JSON.stringify({
    expectedFingerprint: EXPECTED_ROUTER_FINGERPRINT,
    gateRule: 'fingerprint exact + recommendFunctionReturned:true + recommendFunctionError:(none) + routerResultTracePresent:true + returnedItemsLength>=1 on at least 2/3 presets',
    passingPresetCount: gateEligible.length,
    totalPresets: PRESETS.length,
    passingPresetIds: gateEligible.map((row) => row.id),
    gatePass,
  }, null, 2));

  if (!gatePass) {
    throw new Error(`release gate failed: ${gateEligible.length}/${PRESETS.length} presets met baseline (need >=2)`);
  }
})().catch((error) => {
  console.error('[comicvine-trace-harness] failed', error);
  process.exit(1);
});
