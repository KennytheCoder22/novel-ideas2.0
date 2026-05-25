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
  const recommendationResultWasPersisted = Boolean((result as any)?.recommendationResultWasPersisted);


  const returnedTitles = Array.isArray((result as any)?.items) ? (result as any).items.map((it: any) => String(it?.doc?.title || it?.title || '').trim()).filter(Boolean) : [];
  const terminalRejectReasonByTitle = ((result as any)?.terminalRejectReasonByTitle || {}) as Record<string, string>;
  const norm = (v: string) => String(v || '').toLowerCase().trim();
  const returnedWithFinalEligibilityRejected = returnedTitles.filter((t) => String(terminalRejectReasonByTitle[norm(t)] || '').includes('final_eligibility_rejected'));
  const returnedItemsLength = Number((result as any)?.items?.length || 0);

  const fields = {
    returnedItemsLength,
    returnedItemsTitles: returnedTitles,
    countContractSatisfied: Boolean(trace?.countContractSatisfied),
    returnedItemsBuiltFrom: String(trace?.returnedItemsBuiltFrom || ''),
    returnedReasonByTitle: (result as any)?.returnedReasonByTitle || {},
    returnedSwipeEvidenceByTitle: (result as any)?.returnedSwipeEvidenceByTitle || {},
    teenPostPassGlobalHandoffConsidered: Boolean((result as any)?.teenPostPassGlobalHandoffConsidered),
    teenPostPassGlobalHandoffAcceptedTitles: Array.isArray((result as any)?.teenPostPassGlobalHandoffAcceptedTitles) ? (result as any).teenPostPassGlobalHandoffAcceptedTitles : [],
    nytFetchAttempted: Boolean((result as any)?.nytFetchAttempted),
    nytCandidateTitles: Array.isArray((result as any)?.nytCandidateTitles) ? (result as any).nytCandidateTitles : [],
    nytAcceptedTitles: Array.isArray((result as any)?.nytAcceptedTitles) ? (result as any).nytAcceptedTitles : [],
    nytRejectedByTitle: (result as any)?.nytRejectedByTitle || {},
    nytReturnedCount: Number((result as any)?.nytReturnedCount || 0),
    nytAdminEnabled: Boolean((result as any)?.nytAdminEnabled),
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
  if (!recommendationResultWasPersisted) {
    throw new Error(`${preset.id}: recommendationResultWasPersisted false`);
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
    recommendationResultWasPersisted,
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
    recommendationResultWasPersisted: boolean;
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
        recommendationResultWasPersisted: false,
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
    row.recommendationResultWasPersisted === true &&
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

  const warnings: Array<{ preset: string; code: string; detail: string }> = [];
  const returnedPathCounts = {
    normalFinalGate: 0,
    teenPostPassEmergencyHandoff: 0,
    globalMinimalSafeFallback: 0,
  };
  for (const row of presetResults) {
    const fields = row.fields || {};
    const returnedTitles: string[] = Array.isArray(fields.returnedItemsTitles) ? fields.returnedItemsTitles : [];
    const builtFrom = String(fields.returnedItemsBuiltFrom || '');
    const reasons = (fields.returnedReasonByTitle || {}) as Record<string, string>;
    const swipeEvidence = (fields.returnedSwipeEvidenceByTitle || {}) as Record<string, string[]>;

    if (builtFrom.includes('minimal_safe_one')) {
      returnedPathCounts.globalMinimalSafeFallback += returnedTitles.length;
    } else if (builtFrom.includes('teen_postpass')) {
      returnedPathCounts.teenPostPassEmergencyHandoff += returnedTitles.length;
    } else {
      returnedPathCounts.normalFinalGate += returnedTitles.length;
    }

    if (/minimal_safe_one/.test(builtFrom)) {
      warnings.push({ preset: row.id, code: 'minimal_safe_one_return', detail: builtFrom });
    }
    for (const title of returnedTitles) {
      const reason = String(reasons[title] || '').trim();
      const evidence = Array.isArray(swipeEvidence[title]) ? swipeEvidence[title] : [];
      if (!reason) warnings.push({ preset: row.id, code: 'missing_return_reason', detail: title });
      if (evidence.length === 0) warnings.push({ preset: row.id, code: 'missing_swipe_evidence', detail: title });
    }
    if (Number(fields.nytReturnedCount || 0) > 0 && returnedTitles.length > 0 && Number(fields.nytReturnedCount || 0) === returnedTitles.length) {
      warnings.push({ preset: row.id, code: 'nyt_only_returned_items', detail: String(fields.returnedItemsBuiltFrom || '') });
    }
  }
  const nytTitleToPresets: Record<string, string[]> = {};
  for (const row of presetResults) {
    const nytAccepted: string[] = Array.isArray(row.fields?.nytAcceptedTitles) ? row.fields.nytAcceptedTitles : [];
    for (const t of nytAccepted) {
      const key = String(t || '').trim().toLowerCase();
      if (!key) continue;
      nytTitleToPresets[key] = nytTitleToPresets[key] || [];
      nytTitleToPresets[key].push(row.id);
    }
  }
  for (const [title, presets] of Object.entries(nytTitleToPresets)) {
    if (new Set(presets).size > 1) {
      warnings.push({ preset: 'multi', code: 'nyt_title_repeated_across_presets', detail: `${title} => ${Array.from(new Set(presets)).join(',')}` });
    }
  }
  const rootKeyByPreset: Record<string, string> = {};
  for (const row of presetResults) {
    const titles: string[] = Array.isArray(row.fields?.returnedItemsTitles) ? row.fields.returnedItemsTitles : [];
    rootKeyByPreset[row.id] = titles[0] ? titles[0].toLowerCase().trim() : '(none)';
  }
  const roots = Object.values(rootKeyByPreset);
  if (roots.length === PRESETS.length && roots.every((r) => r && r === roots[0])) {
    warnings.push({ preset: 'all', code: 'same_title_all_presets', detail: roots[0] });
  }
  console.log('\n=== QUALITY WARNING SUMMARY (NON-BLOCKING) ===');
  console.log(JSON.stringify({
    warningCount: warnings.length,
    returnedPathCounts,
    warnings,
    perPreset: presetResults.map((row) => ({
      id: row.id,
      returnedItemsTitles: row.fields?.returnedItemsTitles || [],
      returnedItemsBuiltFrom: row.fields?.returnedItemsBuiltFrom || '',
      returnedReasonByTitle: row.fields?.returnedReasonByTitle || {},
      returnedSwipeEvidenceByTitle: row.fields?.returnedSwipeEvidenceByTitle || {},
      teenPostPassGlobalHandoffConsidered: row.fields?.teenPostPassGlobalHandoffConsidered || false,
      teenPostPassGlobalHandoffAcceptedTitles: row.fields?.teenPostPassGlobalHandoffAcceptedTitles || [],
    })),
  }, null, 2));

  if (!gatePass) {
    throw new Error(`release gate failed: ${gateEligible.length}/${PRESETS.length} presets met baseline (need >=2)`);
  }
})().catch((error) => {
  console.error('[comicvine-trace-harness] failed', error);
  process.exit(1);
});
