# Teen Regression Checklist

Status: **Kitsu Teen Branch stabilized**. Do not tune Kitsu Teen behavior further unless a new regression reproduces outside the cases below.

## Scope

Use this checklist before moving tuning focus to Adult or another source. It is intentionally small and focused on the Teen cases that drove the final Kitsu stabilization work.

## Kitsu Teen stabilization cases

1. **Missing Kitsu source identifiers**
   - Confirm Kitsu-backed returned docs have usable `sourceId`, `canonicalId`, or `key` attribution.
   - Expected: legitimate Kitsu rows are not rejected solely as `missing_source_id` when a stable Kitsu identifier can be synthesized.
   - Watch diagnostics: `finalEligibilityRejectedTitlesByReason.missing_source_id`, `kitsuFinalEligibilitySparseMetadataRescueCandidates`, and returned item source IDs.

2. **Comic / superhero recovery routing**
   - Use Teen inputs with explicit comic/superhero intent such as Batman, Spider-Man, Marvel/DC, graphic novel, or superhero likes.
   - Expected: recovery attribution preserves comic/superhero intent instead of collapsing to unrelated generic genre fallback.
   - Watch diagnostics: `kitsuRecoveryComicIntentDetected`, `kitsuRecoveryComicIntentTerms`, `kitsuRecoveryComicIntentFallbackUsed`, `kitsuRecoverySelectedQuery`, and `kitsuFinalQueryUsedForFetch`.

3. **All-weak Kitsu ranked rescue slates**
   - Use Kitsu-heavy Teen runs where raw Kitsu count is healthy but final eligibility underfills.
   - Expected: `kitsu_ranked_pool_rescue` is not used for a slate made entirely of zero-evidence, zero-taste, non-lane-aligned rows.
   - Expected weak-only fallback behavior: return fewer items, usually one, and stamp as `kitsu_ranked_pool_rescue_weak_candidates` or `kitsu_emergency_weak_candidate`.
   - Watch diagnostics: `kitsuRescueSlateStrongCount`, `kitsuRescueSlateZeroEvidenceCount`, `kitsuRankedPoolRescueWeakCandidateOutput`, `kitsuRankedPoolRescueWeakCandidateReason`, `kitsuRankedPoolRescueWeakCandidateSuppressedCount`, and `kitsuEmergencyWeakCandidateSuppressedTitles`.

4. **One-item Kitsu emergency attribution**
   - Use Teen runs where `finalItemsLength === 0`, Kitsu raw count is healthy, and the returned slate has exactly one Kitsu-backed item.
   - Expected: `returnedItemsBuiltFrom` must not remain `none` or `final_gate_accepted_docs`.
   - Expected attribution: `kitsu_emergency_weak_candidate`, `kitsu_ranked_pool_rescue_weak_candidates`, `kitsu_normal_recovery`, or `kitsu_normal_recovery_single_strong`, depending on the actual path.
   - Watch diagnostics: `kitsuEmergencyWeakCandidateAttributionCorrected`, `kitsuEmergencyWeakCandidatePreviousBuiltFrom`, `kitsuEmergencyWeakCandidatePath`, `kitsuEmergencyWeakCandidateBypassPath`, and `kitsuEmergencyWeakCandidateTitle`.

5. **Multi-item weak Kitsu emergency attribution**
   - Use Teen runs where `finalItemsLength === 0`, Kitsu raw count is healthy, `returnedItemsBuiltFrom === "none"`, and multiple Kitsu-backed returned items appear without strong audit evidence.
   - Expected: cap to one returned item and stamp as `kitsu_emergency_weak_candidate`.
   - Watch diagnostics: `kitsuEmergencyWeakCandidatePriorItemCount`, `kitsuEmergencyWeakCandidateSuppressedTitles`, `kitsuEmergencyWeakCandidateBypassPath`, and `sourceSkippedReason` entries containing `kitsu_multi_item_emergency_weak_candidate_attribution_corrected`.

6. **Normal recovery attribution preservation**
   - Use Teen runs like the Cyborg 009 case where Kitsu normal recovery returns a single positive-evidence item.
   - Expected: do not relabel `kitsu_normal_recovery` as `kitsu_ranked_pool_rescue` unless the item actually came through ranked-pool rescue.
   - Expected attribution: preserve `kitsu_normal_recovery` or stamp `kitsu_normal_recovery_single_strong` for a single strong normal-recovery item.
   - Watch diagnostics: `returnedItemsBuiltFrom`, `finalMetadataCorrectionPreviousBuiltFrom`, `sourceSkippedReason` entries containing `final_metadata_preserved_normal_recovery_attribution` or `final_metadata_corrected_from:kitsu_normal_recovery:to:kitsu_normal_recovery_single_strong`.

## Regression validation commands

Run these when the environment has source/network access:

```bash
node scripts/source-health-preflight.mjs
node scripts/source-direct-smoke.mjs
npm run typecheck -- --pretty false
```

If the environment lacks external source access, record the source-health limitation and rely on static diagnostics plus targeted trace output from the recommender result payloads above.

## Stabilization decision

Kitsu Teen is considered stabilized for this branch when:

- No Kitsu-backed returned item loses source attribution.
- Comic/superhero intent remains visible in Kitsu recovery diagnostics.
- No all-weak multi-item slate is presented as stable `kitsu_ranked_pool_rescue`.
- One-item and multi-item Kitsu emergency outputs have explicit weak-candidate or normal-recovery attribution.
- Normal recovery is not misleadingly relabeled as ranked-pool rescue.

After this checklist passes, stop Kitsu Teen tuning and move to Adult or another source.
