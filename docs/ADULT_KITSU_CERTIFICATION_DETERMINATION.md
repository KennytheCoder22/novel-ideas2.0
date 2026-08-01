# Adult Kitsu Certification Determination (K1)

Date: 2026-07-31  
Scope: Adult Kitsu route only (`kitsu_source_certification` / `K1`)

## 1. Evidence inventory

| Evidence | Class | What it proves |
| --- | --- | --- |
| `scripts/output/certified-subsystem-registry.json` (`K1` entry) | Mocked | Registry records K1 as `certified`/`fully_certified` under `certificationGate: "mocked"` with declared policy files, fixture suite references, and a separate live probe note. |
| `app/recommender-v2/sources/kitsuSource.ts` | Mocked | Adult Kitsu adapter behavior is statically defined: scope gate requires manga/anime format preference, retrieval uses Kitsu manga endpoint, category enrichment attempts per-item categories API then falls back to query-token enrichment, and diagnostics/lineage fields are emitted. |
| `app/recommender-v2/kitsuAdmission.ts` | Mocked | Adult Kitsu admission and post-score policy are statically defined: hard rejects (`doujinshi`, `oel`), `one_shot` fallback with score threshold (`>= 2.5`), and explicit gate diagnostics. |
| `scripts/run-v2-kitsu-source-certification-regressions.mjs` | Fixture | Contains explicit K1-K9 policy fixtures and a 14-profile mocked baseline. Script intercepts Kitsu API calls and blocks unexpected network usage. |
| `scripts/run-v2-adult-kitsu-cert-fixtures.mjs` | Fixture | Deterministic fixture coverage of policy behaviors: hard rejects, `one_shot` threshold behavior, category enrichment/fallback marker behavior, and maturity diagnostic fields. |
| `scripts/run-v2-kitsu-comicvine-contract-regressions.mjs` | Fixture | Deterministic source-integration contract checks (mocked fetch) covering lineage and isolation behavior when Kitsu is combined with other sources. |
| `scripts/run-v2-adult-kitsu-source-certification-baseline.mjs` | Live-probe | Characterization runner for 14 profiles against live Kitsu endpoint (Phase 2 baseline, infrastructure assertions). It is not a mocked certification gate. |
| `scripts/output/adult-kitsu-baseline-phase3.json` | Live-probe | Recorded live characterization artifact (`runCount: 14`, `infrastructureAssertionFails: 0`, `countContractPasses: 5`, `countContractFails: 9`, `liveApiFailures: 8`), showing mixed live outcomes and non-longitudinal behavior. |
| `scripts/run-v2-kitsu-api-reliability-probe.mjs` | Live-probe | Defines a bounded 20-call reliability probe with 250ms inter-call delay; script is explicitly investigative and non-production-mutating. |
| `scripts/output/kitsu-api-reliability-probe.json` | Live-probe | Single recorded run reports `20/20` success at `250ms` delay, demonstrating one-point transport success only. |
| `docs/NOVELIDEAS_COMPLETION_ROADMAP.md` (Section 7 Kitsu row) | Mocked | Governing lock context: K1 frozen mocked certification exists, but remaining gaps include Teen-vs-Adult role explanation, representative characterization/review, and enrichment failure contract; lock criterion requires every enabled route to be characterized, reviewed, operationally bounded, and registry-backed. |
| `docs/RECOMMENDATION_PHILOSOPHY.md` | Mocked | Governing boundary: deterministic correctness, transport health, routing correctness, source competence, and human usefulness are independent dimensions; mocked certification cannot be interpreted as complete live or human-usefulness certification. |

## 2. What K1 certifies

K1 certifies the **Adult Kitsu mocked contract scope**:

1. The Adult Kitsu route has a defined and testable policy boundary in code (`kitsuSource.ts`, `kitsuAdmission.ts`).
2. The scope gate behavior is specified and fixture-covered: Kitsu is skipped when manga/anime format preference evidence is absent, and dispatches under explicit manga-format evidence.
3. Admission policy behavior is fixture-covered: `doujinshi` and `oel` are hard-rejected.
4. Post-score fallback behavior is fixture-covered: `one_shot` candidates require positive taste evidence (`positiveTasteScore >= 2.5`) to survive the post-score gate.
5. Category-enrichment pathway behavior is fixture-covered at mocked level: categories API enrichment is preferred, and query fallback markers exist when category enrichment is unavailable.
6. Kitsu maturity/metadata diagnostics fields are surfaced in the mocked contract (`kitsuAgeRating`, `kitsuMaturityFlagged`, related provenance fields).
7. Registry bookkeeping is consistent with this mocked scope (`certificationGate: "mocked"`, fixture references, policy references).

## 3. Unsupported Conclusions

K1 does **not** certify the following:

1. **Longitudinal live stability** of Kitsu transport or retrieval composition.
2. **Teen Kitsu route certification** (or any non-Adult Kitsu route certification).
3. **Human Review usefulness** (reader-quality acceptance of returned titles/slates).
4. **Representative characterization completeness** across release-representative profile sets.
5. **Enrichment failure behavior beyond mocked cases**, including bounded operational behavior under real latency/failure envelopes.
6. Equivalence of one recorded live probe with release-level operational bounds.
7. Any claim that mocked contract correctness alone implies source competence or user usefulness.

## 4. Gap analysis against roadmap Section 7 (Kitsu)

| Roadmap remaining gap | Satisfied by existing evidence? | Why |
| --- | --- | --- |
| Explain Teen versus Adult product role | **No** | Registry and K1 evidence define Adult Kitsu mocked scope, but do not close Teen route ownership/scope decisions; roadmap still marks Teen graphic/manga launch scope as unproven. |
| Representative characterization/review | **No** | There is deterministic fixture coverage and one live characterization artifact, but no completed representative Human Review gate and no evidence that characterization is sufficient for lock-level route support. |
| Enrichment failure contract | **Partially (mocked only), not complete** | Mocked fixtures prove fallback-path mechanics, but existing evidence does not establish operationally bounded live enrichment failure behavior as a lock-level contract. |

Lock-criterion reconciliation (`Every enabled route is characterized, reviewed, operationally bounded, and registry-backed`):

- **Registry-backed:** Yes (for Adult K1 mocked scope).
- **Characterized:** Partially (deterministic mocked + single-period live artifact; not sufficient as complete release characterization).
- **Reviewed:** No (Human Review not implemented).
- **Operationally bounded:** Not fully (single probe and non-longitudinal observations do not establish durable bounds).

## 5. Certification determination

**Determination: `k1_complete_pending_supplemental_evidence`**

Rationale:

- Existing evidence is sufficient to uphold K1 as a **complete mocked Adult contract certification**.
- Existing evidence is **not sufficient** to claim roadmap lock-criterion completion for enabled-route support at release-governance level.
- The current registry status is not contradicted when interpreted within its stated mocked gate; supplemental evidence is required for remaining roadmap gates.

## 6. Next authorized engineering tasks

Because determination is `k1_complete_pending_supplemental_evidence`, the following become authorized without changing K1 policy behavior:

1. Produce a formal Adult-vs-Teen Kitsu route ownership/scope decision record, including explicit unsupported states if Teen remains uncertified.
2. Run and freeze representative characterization + structured Human Review deliverables for Adult Kitsu output quality.
3. Establish and document enrichment failure contract boundaries under bounded live conditions (latency/failure envelopes), separate from mocked fallback mechanics.
4. If governance clarity is desired, add non-downgrading registry annotations (for example, explicit `certificationScope` and `unsupportedConclusions`) while preserving existing certified statuses.

## 7. Stop conditions encountered

None. Static analysis was sufficient to determine mocked certification scope boundaries and identify supplemental-evidence gaps without changing runtime behavior or requiring new live probes.
