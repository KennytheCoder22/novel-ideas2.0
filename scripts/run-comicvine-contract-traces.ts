import msHsDeck from '../data/swipeDecks/ms_hs';
import { getRecommendations } from '../screens/recommenders/recommenderRouter';
import type { RecommenderInput } from '../screens/recommenders/types';

type Direction = 'like' | 'dislike' | 'skip';

type TracePreset = { id: 'test_a' | 'test_b' | 'test_c'; sequence: Direction[] };

const PRESETS: TracePreset[] = [
  { id: 'test_a', sequence: ['like', 'like', 'dislike', 'skip', 'like', 'dislike', 'like', 'skip'] },
  { id: 'test_b', sequence: ['dislike', 'dislike', 'like', 'skip', 'dislike', 'like', 'skip', 'like'] },
  { id: 'test_c', sequence: ['like', 'skip', 'like', 'skip', 'dislike', 'like', 'dislike', 'like'] },
];
const EXPECTED_ROUTER_FINGERPRINT = 'router-comicvine-proxy-default-v1+tdz-guard-2026-05-23b+dispatch-var-972e5e8';

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


  const returnedTitles = Array.isArray((result as any)?.items) ? (result as any).items.map((it: any) => String(it?.doc?.title || it?.title || '').trim()).filter(Boolean) : [];
  const terminalRejectReasonByTitle = ((result as any)?.terminalRejectReasonByTitle || {}) as Record<string, string>;
  const norm = (v: string) => String(v || '').toLowerCase().trim();
  const returnedWithFinalEligibilityRejected = returnedTitles.filter((t) => String(terminalRejectReasonByTitle[norm(t)] || '').includes('final_eligibility_rejected'));
  const recommendFunctionReturned = true;

  const fields = {
    returnedItemsLength: Number((result as any)?.items?.length || 0),
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
  if (!Boolean(trace?.comicVineFetchAttempted)) throw new Error(`${preset.id}: comicVineFetchAttempted false`);
  if (!Boolean(trace?.debugGcdDispatchTrace || Object.keys(trace || {}).length > 0)) {
    throw new Error(`${preset.id}: routerResultTracePresent false`);
  }
  if (Number(((result as any)?.finalEligibilityAcceptedTitles || []).length || 0) <= 0) {
    throw new Error(`${preset.id}: finalEligibilityAcceptedTitlesCount <= 0`);
  }
  if (returnedWithFinalEligibilityRejected.length > 0) {
    throw new Error(`${preset.id}: returned titles with final_eligibility_rejected: ${returnedWithFinalEligibilityRejected.join(' | ')}`);
  }

  console.log(`\n=== ${preset.id.toUpperCase()} ===`);
  console.log(JSON.stringify(fields, null, 2));
}

(async () => {
  for (const preset of PRESETS) {
    await runPreset(preset);
  }
})().catch((error) => {
  console.error('[comicvine-trace-harness] failed', error);
  process.exit(1);
});
