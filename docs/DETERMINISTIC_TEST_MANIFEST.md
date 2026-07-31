# NovelIdeas Deterministic Test Manifest

## 1. Purpose and scope

This manifest classifies the repository's validation tools and prepares the evidence needed for a future canonical deterministic release command and CI workflow. It follows `docs/RECOMMENDATION_PHILOSOPHY.md`, `docs/NOVELIDEAS_COMPLETION_ROADMAP.md`, and the current-code-over-stale-audit rule in `docs/CODEX_ARCHITECTURE_AND_SOURCE_AUDIT.md`.

The manifest does not:

- create a canonical release command;
- implement CI;
- certify launch readiness;
- alter a test, fixture, frozen artifact, registry, package command, or production behavior.

Passing deterministic checks proves only the contract each check asserts. It does not prove recommendation usefulness.

## 2. Repository baseline

- **Branch:** `main`
- **Starting commit:** `89ed9234178e7c1fc51d7ffd606119faffb6f872`
- **Starting state:** local `main` and `origin/main` matched and the worktree was clean.
- **Package/runtime evidence:** `package.json` has no `engines` declaration; there is no `.nvmrc`, `.node-version`, or `.tool-versions`. `package-lock.json` is lockfile version 3, but the repository does not pin Node or npm.
- **Existing generic commands:** `npm run lint` invokes `expo lint`; `npm run typecheck` invokes `tsc --noEmit`. No canonical deterministic-suite or production-build command exists.
- **Validation package surface:** 49 validation-oriented package commands resolve to 45 unique repository entry points: 29 `test:*` aliases, 18 `audit:*` aliases, and two main `certify:`/`characterize:` aliases. Four aliases are alternate modes of `run-v2-teen-openlibrary-timeout-audit.mjs`; two Open Library test aliases share `run-v2-openlibrary-routing-regressions.mjs`.
- **Locations searched:** `package.json`, `scripts/run-*.mjs`, all executable files under `scripts/`, `scripts/source-competence/`, `scripts/comparison-harness/`, `scripts/lib/`, `scripts/output/`, source-competence and comparison fixtures/frozen artifacts, repository-root executable files, current docs, `SOURCE_CERTIFICATION_STANDARD.md`, and `Teen_Regression_Checklist.md`.
- **Inventory size:** 99 directly runnable tools and 12 validation support modules (111 files total).

No live or credential-dependent script was run. For classification value only, the local non-network release candidates were sampled at the command level:

- `npm run typecheck` **failed**. Major groups include missing `@vercel/node` types, UI typing errors, `graphicNovelKeywords` deck-schema drift, legacy Taste Profile interface drift, and V2/NYT typing errors.
- `npm run lint` **failed** with 21 errors and 49 warnings. The errors are dominated by unresolved `@/` imports; it also loaded the tracked `.env`, which makes environment isolation part of the future CI design.

Neither failure was repaired. Both commands left the worktree unchanged.

## 3. Classification model

| Classification | Meaning |
| --- | --- |
| **Release Gate Candidate (RG)** | Deterministic, bounded work that may belong in a future canonical gate after its dependencies and mutation behavior are accepted. |
| **Subsystem Certification Lock (SL)** | Frozen protection for a named certified contract or slice. |
| **Contract Regression (CR)** | Focused assertion of routing, identity, admission, scoring, selection, diagnostics, or another contract. |
| **Characterization (CH)** | Produces evidence describing a source or subsystem without claiming improvement. |
| **Comparison (CP)** | Compares equivalent frozen evidence without changing recommendation behavior. |
| **Output-Invariance Test (OI)** | Proves production hashes, recommendation output, or diagnostic-only boundaries remain unchanged. |
| **Fixture Integrity Check (FI)** | Protects fixture shape, frozen artifacts, or deterministic replay. |
| **Diagnostic/Audit (DA)** | Produces investigative evidence; generally not a release gate. |
| **Live Probe (LP)** | Requires or may dispatch external network services. |
| **Manual Utility (MU)** | Operator/developer helper rather than validation. |
| **Historical/Superseded (HS)** | Appears tied to a completed numbered investigation or replaced workflow. It must not be deleted without history review. |
| **Unknown/Requires Decision (UD)** | Purpose or authority is insufficiently documented to place in a gate. |

A file may have several classifications. The first listed classification is its primary purpose.

## 4. Determinism criteria

The inventory uses these compact codes:

| Dimension | Codes |
| --- | --- |
| Network | `N0` none or fully mocked; `NL` live required; `NM` deterministic and live behavior mixed; `NU` unclear |
| Credentials | `C0` none; `CR` required; `CO` optional/unstated; `CU` unclear |
| Mutation | `M0` no persistent write; `MT` isolated temporary files cleaned; `MTR` tracked temporary/compiled files; `MI` ignored `artifacts/`; `MO` tracked `scripts/output/` or other repository artifacts; `MR` intentionally destructive repository utility |
| Determinism | `P` explicitly proven by repeated output/hash assertions; `I` intended/static; `C` conditional on frozen input/environment/order; `L` live and not byte-stable; `U` unclear |
| CI | `Y` suitable candidate; `C` conditional; `N` unsuitable for deterministic CI; `D` undecided pending authority/history review |
| Status | `A` active; `H` historical investigation; `S` apparently superseded; `U` unclear |

For direct tools, `direct` means `node <exact path>`. Package aliases are expanded in section 6.

A future deterministic CI candidate must be bounded, use no live service or secret, fail closed on unexpected network, avoid unexplained clock/random/order dependence, run from a clean checkout, and either avoid writes or write only isolated disposable output. Artifact generators are not artifact-integrity checks unless they compare before replacing.

The classification is static unless the repository itself asserts determinism. URLs inside mocked fixtures do not make a regression live. Conversely, a script can dispatch through `runRecommenderV2` without containing a literal `fetch`; such scripts are classified live when no fetch mock is installed.

## 5. Complete script inventory

### 5.1 Summary

- **99** directly runnable tools are inventoried below.
- **45** are exposed through `package.json`; **54** require direct invocation.
- **43** are deterministic CI candidates: 42 `Y` and one `C`. This set consists of 38 `*-regressions.mjs` entry points, the Adult Kitsu fixture lock, three source-competence runners in explicit replay/no-network modes, and the comparison artifact runner. The Open Library routing regression is conditional because it compiles into tracked `.tmp/`.
- **56** are live, manual, artifact-refresh, historical, or otherwise non-CI/undecided tools.
- The 12 support modules in section 5.6 are not counted as directly runnable tools.

### 5.2 Harnesses, utilities, ComicVine, Kitsu, NYT, Open Library, and shared V2

| Path | Command | Primary purpose / scope | Class / status | N/C/M/D | CI | Registry or document | Recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `scripts/comparison-harness/run-comparison-harness.mjs` | direct | Generate OL-vs-GB fixture comparison artifacts | CP, CH / A | N0/C0/MI/I | Y | `docs/SOURCE_COMPARISON_HARNESS.md` | Future layer 5; pair with regression |
| `scripts/comparison-harness/run-comparison-harness-regressions.mjs` | direct | Overlap, underfill, metadata, no-network, determinism | CP, CR, FI / A | N0/C0/M0/P | Y | `docs/SOURCE_COMPARISON_HARNESS.md` | Include future layer 5 |
| `scripts/populateSwipeCardFallbackImages.mjs` | `npm run populate:swipe-images` | Fetch and write swipe-card fallback images | MU / A | NL/CO/MO/L | N | Package only | Manual data maintenance |
| `scripts/reset-project.js` | `npm run reset-project` | Move/delete project folders and recreate starter app | MU / A | N0/C0/MR/I | N | Package only | Never run in CI |
| `scripts/run-collection-opportunities-placeholder-regressions.mjs` | direct | Protect non-operational/local-only capability boundary | CR, OI / A | N0/C0/MT/I | Y | Roadmap; `COLLECTION_OPPORTUNITIES.md` | Include future layer 2 |
| `scripts/run-v2-adult-kitsu-cert-fixtures.mjs` | direct | Adult Kitsu K1 policy fixtures | SL, CR, FI / A | N0/C0/M0/I | Y | Registry K1 | Add package alias; layer 3 |
| `scripts/run-v2-adult-kitsu-source-certification-baseline.mjs` | direct | 14-profile Kitsu-only live baseline capture | LP, CH / A | NL/C0/MO/L | N | K1 supporting history | Staging/manual live run |
| `scripts/run-v2-comicvine-cert-gap-closure-regressions.mjs` | `npm run test:v2:comicvine-cert-gap-closure` | ComicVine entity-policy gap closures | SL, CR / A | N0/C0/M0/I | Y | Registry EP1 | Include layer 3 |
| `scripts/run-v2-comicvine-source-certification-regressions.mjs` | `npm run test:v2:comicvine-source-certification` | ComicVine adapter/entity certification | SL, CR, OI / A | N0/C0/M0/I | Y | Registry EP1 | Include layer 3 |
| `scripts/run-v2-kitsu-api-reliability-probe.mjs` | direct | Kitsu repeated live reliability capture | LP / A | NL/C0/MO/L | N | Registry K1 live probe | Staging/source-health lane |
| `scripts/run-v2-kitsu-comicvine-contract-regressions.mjs` | `npm run test:v2:kitsu-comicvine-contract` | Mixed-source registration, isolation, lineage | CR, OI / A | N0/C0/M0/I | Y | Graphic inventory doc | Include layer 4 |
| `scripts/run-v2-kitsu-source-certification-regressions.mjs` | direct | Adult Kitsu source certification | SL, CR, OI / A | N0/C0/M0/I | Y | Registry K1 | Add package alias; layer 3 |
| `scripts/run-v2-mock-source-regressions.mjs` | direct | Ensure mock source is off in production-style runs | CR, OI / A | N0/C0/M0/I | Y | Architecture audit | Add package alias; layer 2 |
| `scripts/run-v2-nyt-f1-live-validation.mjs` | direct | NYT mocked contract cases plus named live validation/output | LP, CR, DA / A | NM/CR/MO/C | N | No registry entry | Split deterministic/live before CI |
| `scripts/run-v2-nyt-f2a-overview-audit.mjs` | direct | NYT overview/list parity and depth | LP, DA / A | NL/CR/MO/L | N | No registry entry | Staging/manual |
| `scripts/run-v2-openlibrary-presets.mjs` | `npm run test:v2:openlibrary-presets` | Compile and run live Teen/Adult OL presets | LP, DA / A | NL/CO/MTR/L | N | Architecture audit | Rename out of `test:`; staging |
| `scripts/run-v2-openlibrary-recommendation-certification-suite-v1.mjs` | direct | Regenerate registered R1 suite inventory artifact | FI, MU / A | N0/C0/MO/I | N | Registry R1 | Add check-only verifier; generator manual |
| `scripts/run-v2-openlibrary-routing-regressions.mjs` | `npm run test:v2:openlibrary-routing-regressions` | OL routing, lineage, timeout/recovery contracts | CR, OI / A | N0/C0/MTR/I | C | Architecture audit | Move compile output to temp, then layer 4 |
| `scripts/run-v2-taste-alignment-diagnostics-regressions.mjs` | direct | Adult taste-alignment diagnostic contract | CR / A | N0/C0/M0/I | Y | Architecture audit | Add package alias; layer 4 |
| `scripts/source-competence/run-gcd-characterization.mjs` | `npm run characterize:gcd` | GCD replay, no-network, hashes, frozen comparison | CH, FI, OI / A | N0/C0/MI/P | Y | GCD Phase I doc/frozen artifact | Layer 5 with exact package flags |
| `scripts/source-competence/run-gcd-characterization-regressions.mjs` | `npm run test:source-competence:gcd` | GCD identity/fixture/no-network lock | CH, CR, FI, OI / A | N0/C0/M0/P | Y | GCD Phase I doc | Include layer 5 |
| `scripts/source-competence/run-googlebooks-certification.mjs` | `npm run certify:googlebooks` | GB competence replay and production-hash invariance | CH, OI / A | N0/C0/MI/P | Y | GB certification doc | Layer 5 |
| `scripts/source-competence/run-googlebooks-certification-regressions.mjs` | `npm run test:source-competence:googlebooks` | GB competence terminal/composition lock | CH, CR, OI / A | N0/C0/M0/P | Y | GB certification doc | Include layer 5 |
| `scripts/source-competence/run-source-competence-harness.mjs` | direct | OL Phase 1 replay/terminal-state characterization | CH, OI / A | N0/C0/MI/P with flags | Y | Architecture audit | Add exact no-network package command |
| `scripts/source-direct-smoke.mjs` | direct | Direct live source transport smoke | LP / A | NL/CO/M0/L | N | Teen checklist | Staging/source health |
| `scripts/source-health-preflight.mjs` | direct | Live quota/rate/transport preflight | LP / A | NL/CO/M0/L | N | Teen checklist, audit | Staging/source health |

### 5.3 Google Books numbered consolidation and role-gate series

These scripts write tracked `scripts/output/` evidence and appear tied to completed numbered investigations. They are deterministic or conditionally deterministic, but they are not current registry locks and have no package aliases. "Historical" is a classification, not deletion approval.

| Path | Command | Primary purpose / scope | Class / status | N/C/M/D | CI | Registry or document | Recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `scripts/run-v2-googlebooks-101-novelty-proof.mjs` | direct | #101 consolidation novelty proof | DA, HS / H | N0/CO/MO/C | N | No current authority found | Preserve; history review |
| `scripts/run-v2-googlebooks-202-hypothesis.mjs` | direct | #202 hypothesis/parity design artifact | DA, HS / H | N0/C0/MO/C | N | No current authority found | Preserve; consolidate later |
| `scripts/run-v2-googlebooks-202-parity-baseline.mjs` | direct | #202 deterministic parity baseline | DA, OI, HS / H | N0/CO/MO/C | N | Output artifacts only | Preserve; do not refresh in CI |
| `scripts/run-v2-googlebooks-202-parity-compare.mjs` | direct | Compare #202 before/after baselines | CP, OI, HS / H | N0/C0/MO/C | N | Output artifacts only | Preserve; history review |
| `scripts/run-v2-googlebooks-203-canonical-cue-equivalence-gate.mjs` | direct | #203 cue equivalence | CP, OI, HS / H | N0/C0/MO/C | N | Output artifacts only | Preserve; history review |
| `scripts/run-v2-googlebooks-204-final-slate-identity-role-gate.mjs` | direct | #204 final-slate identity role | DA, OI, HS / H | N0/C0/MO/C | N | Output artifacts only | Preserve; history review |
| `scripts/run-v2-googlebooks-205-counterfactual-final-slate-role-gate.mjs` | direct | #205 counterfactual final-slate role | CP, DA, HS / H | N0/C0/MO/C | N | Output artifacts only | Preserve; history review |
| `scripts/run-v2-googlebooks-303-canonical-cue-semantic-boundary-gate.mjs` | direct | #303 cue semantic boundary | DA, OI, HS / H | N0/C0/MO/C | N | Output artifacts only | Preserve; history review |
| `scripts/run-v2-googlebooks-303-semantic-core-only-gate.mjs` | direct | #303 removed-policy semantic core | DA, HS / S | N0/CO/MO/C | N | Header says policy removed | Retire only after review |
| `scripts/run-v2-googlebooks-306-query-quality-role-gate.mjs` | direct | #306 query-quality role/equivalence | CP, DA, HS / H | N0/C0/MO/C | N | Output artifacts only | Preserve; history review |
| `scripts/run-v2-googlebooks-307-family-query-competition-role-gate.mjs` | direct | #307 query competition | CP, DA, HS / H | N0/C0/MO/C | N | Output artifacts only | Preserve; history review |
| `scripts/run-v2-googlebooks-308-marginal-yield-role-gate.mjs` | direct | #308 marginal yield | CP, DA, HS / H | N0/C0/MO/C | N | Output artifacts only | Preserve; history review |
| `scripts/run-v2-googlebooks-409-query-promotion-replacement-role-gate.mjs` | direct | #409 query promotion/replacement | CP, DA, HS / H | N0/C0/MO/C | N | Output artifacts only | Preserve; history review |
| `scripts/run-v2-googlebooks-410-narrative-strength-role-gate.mjs` | direct | #410 narrative strength | CP, DA, HS / H | N0/C0/MO/C | N | Output artifacts only | Preserve; history review |
| `scripts/run-v2-googlebooks-411-meaningful-taste-tiers-role-gate.mjs` | direct | #411 taste tiers | CP, DA, HS / H | N0/C0/MO/C | N | Output artifacts only | Preserve; history review |
| `scripts/run-v2-googlebooks-599-adult-content-weighting-branch-role-gate.mjs` | direct | #599 Adult content-weight branch | DA, HS / H | N0/C0/MO/C | N | Output artifacts only | Preserve; history review |

### 5.4 Active Google Books contracts, audits, and experiments

| Path | Command | Primary purpose / scope | Class / status | N/C/M/D | CI | Registry or document | Recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `scripts/run-v2-googlebooks-age-band-infrastructure-audit-regressions.mjs` | `npm run test:v2:googlebooks-age-band-infrastructure-audit` | Non-Adult pipeline boundaries | CR / A | N0/C0/M0/I | Y | Package/docs | Layer 4 |
| `scripts/run-v2-googlebooks-audience-maturity-separation-regressions.mjs` | `npm run test:v2:googlebooks-audience-maturity-separation` | Audience versus maturity semantics | SL, CR / A | N0/C0/M0/I | Y | Registry E1 | Layer 3 |
| `scripts/run-v2-googlebooks-behavioral-equivalence-audit.mjs` | direct | Adult/Teen consolidation audit | DA, CP / U | N0/C0/MO/C | N | No current authority found | Run separately; document authority |
| `scripts/run-v2-googlebooks-consolidation-execution-plan.mjs` | direct | Generate ranked consolidation plan | DA, HS / H | N0/CO/MO/C | N | No current authority found | Historical planning tool |
| `scripts/run-v2-googlebooks-final-eligibility-regressions.mjs` | direct | Adult final-eligibility observability | CR / A | N0/C0/M0/I | Y | No registry entry | Add package alias; layer 4 |
| `scripts/run-v2-googlebooks-final-slate-identity-audit-regressions.mjs` | `npm run test:v2:googlebooks-final-slate-identity-audit` | Final-slate identity | CR, OI / A | N0/C0/M0/I | Y | Package/docs | Layer 4 |
| `scripts/run-v2-googlebooks-general-publication-identity-diagnostic.mjs` | `npm run audit:v2:googlebooks-general-publication-identity` | Live general publication identity evidence | LP, DA / A | NL/CO/MO/L | N | GB certification doc context | Manual/staging |
| `scripts/run-v2-googlebooks-general-publication-identity-regressions.mjs` | `npm run test:v2:googlebooks-general-publication-identity` | Publication-identity diagnostic logic | CR / A | N0/C0/M0/I | Y | Package | Layer 3/4 |
| `scripts/run-v2-googlebooks-general-shadow-counterfactual.mjs` | `npm run audit:v2:googlebooks-general-shadow-counterfactual` | Live shadow counterfactual | LP, DA / A | NL/CO/MO/L | N | Package | Manual/staging |
| `scripts/run-v2-googlebooks-general-shadow-counterfactual-regressions.mjs` | `npm run test:v2:googlebooks-general-shadow-counterfactual` | Counterfactual library logic | CR / A | N0/C0/M0/I | Y | Package | Layer 4 |
| `scripts/run-v2-googlebooks-kids-architecture-regressions.mjs` | `npm run test:v2:googlebooks-kids-architecture` | Kids admission architecture | SL, CR / A | N0/C0/M0/I | Y | Registry D1 | Layer 3 |
| `scripts/run-v2-googlebooks-kids-d1-certification-regressions.mjs` | direct | Kids D1 certification closure | SL, CR / A | N0/C0/M0/I | Y | Registry D1 | Add package alias; layer 3 |
| `scripts/run-v2-googlebooks-kids-k2-ground-truth-audit.mjs` | direct | Live K-2 ground-truth capture | LP, DA / A | NL/CO/MO/L | N | No registry entry | Manual evidence capture |
| `scripts/run-v2-googlebooks-kids-k2-pre-scoring-rejection-audit.mjs` | `npm run audit:v2:googlebooks-kids-pre-scoring-rejections` | Live Kids pre-scoring rejects | LP, DA / A | NL/CO/MO/L | N | Package | Manual evidence capture |
| `scripts/run-v2-googlebooks-kids-query-comparison.mjs` | `npm run audit:v2:googlebooks-kids-query-comparison` | Live Kids query-family comparison | LP, CP, DA / A | NL/CO/MO/L | N | Package | Manual evidence capture |
| `scripts/run-v2-googlebooks-kids-query-planning-regressions.mjs` | direct | Kids query planning | CR / A | N0/C0/M0/I | Y | No registry entry | Add package alias; layer 4 |
| `scripts/run-v2-googlebooks-knowledge-transfer-audit.mjs` | direct | Adult-to-Teen report comparison | DA / U | N0/C0/MO/C | N | No current authority found | Document input authority |
| `scripts/run-v2-googlebooks-lineage-diagnostics-regressions.mjs` | `npm run test:v2:googlebooks-lineage-diagnostics` | Stage-lineage reconciliation | CR, OI / A | N0/C0/M0/I | Y | Package/docs | Layer 4 |
| `scripts/run-v2-googlebooks-narrative-strength-ranking-regressions.mjs` | `npm run test:v2:googlebooks-narrative-strength-ranking` | Narrative ranking | CR / A | N0/C0/M0/I | Y | Package | Layer 4 |
| `scripts/run-v2-googlebooks-preteen-d2-certification-regressions.mjs` | direct | Preteen D2 certification closure | SL, CR / A | N0/C0/M0/I | Y | Registry D2 | Add package alias; layer 3 |
| `scripts/run-v2-googlebooks-preteen-kids-label-mismatch-audit.mjs` | `npm run audit:v2:googlebooks-preteen-kids-label-mismatch` | Report-driven age-label mismatch | DA / A | N0/C0/MO/C | N | Package | Run separately |
| `scripts/run-v2-googlebooks-preteen-maturity-policy-experiment.mjs` | `npm run audit:v2:googlebooks-preteen-maturity-policy-experiment` | Live maturity-policy experiment | LP, DA / A | NL/CR/MO/L | N | Package | Manual/staging |
| `scripts/run-v2-googlebooks-preteen-publication-identity-regressions.mjs` | `npm run test:v2:googlebooks-preteen-publication-identity-audit` | Preteen publication identity | SL, CR / A | N0/C0/M0/I | Y | Registry D2 | Layer 3 |
| `scripts/run-v2-googlebooks-preteen-publication-shape-false-reject-audit-regressions.mjs` | `npm run test:v2:googlebooks-preteen-publication-shape-false-reject-audit` | False-reject observability | CR, DA / A | N0/C0/M0/I | Y | Package | Layer 4 |
| `scripts/run-v2-googlebooks-preteen-publication-shape-narrative-rescue-regressions.mjs` | `npm run test:v2:googlebooks-preteen-publication-shape-narrative-rescue` | D2 narrative rescue | SL, CR / A | N0/C0/M0/I | Y | Registry D2 | Layer 3 |
| `scripts/run-v2-googlebooks-preteen-query-routing-regressions.mjs` | `npm run test:v2:googlebooks-preteen-query-routing` | Preteen query routing | CR / A | N0/C0/M0/I | Y | Package | Layer 4 |
| `scripts/run-v2-googlebooks-publication-shape-regressions.mjs` | `npm run test:v2:googlebooks-publication-shape` | Shared publication-shape classification | CR / A | N0/C0/M0/I | Y | Package | Layer 3 |
| `scripts/run-v2-googlebooks-query-quality-regressions.mjs` | `npm run test:v2:googlebooks-query-quality` | Query-quality contract | CR / A | N0/C0/M0/I | Y | Package | Layer 4 |
| `scripts/run-v2-googlebooks-query-refinement-root-cause.mjs` | `npm run audit:v2:googlebooks-query-refinement-root-cause` | Live top-100 refinement analysis | LP, DA / A | NL/CO/MO/L | N | Package | Manual/staging |
| `scripts/run-v2-googlebooks-query-refinement-root-cause-regressions.mjs` | `npm run test:v2:googlebooks-query-refinement-root-cause` | Refinement analysis logic | CR / A | N0/C0/M0/I | Y | Package | Layer 4 |
| `scripts/run-v2-googlebooks-recall-efficiency-diagnostic.mjs` | `npm run audit:v2:googlebooks-recall-efficiency` | Report-driven recall efficiency | DA / A | N0/C0/MO/C | N | Package | Run separately |
| `scripts/run-v2-googlebooks-recall-efficiency-regressions.mjs` | `npm run test:v2:googlebooks-recall-efficiency` | Recall-efficiency logic | CR / A | N0/C0/M0/I | Y | Package | Layer 4 |
| `scripts/run-v2-googlebooks-scifi-production-query-ab.mjs` | `npm run audit:v2:googlebooks-scifi-production-query-ab` | Live Teen SF query A/B | LP, CP, DA / A | NL/CO/MO/L | N | Package | Manual/staging |
| `scripts/run-v2-googlebooks-scifi-production-query-ab-regressions.mjs` | `npm run test:v2:googlebooks-scifi-production-query-ab` | SF A/B analysis contract | CR / A | N0/C0/M0/I | Y | Package | Layer 4 |
| `scripts/run-v2-googlebooks-short-signal-boundary-regressions.mjs` | `npm run test:v2:googlebooks-short-signals` | Short-signal boundary | CR / A | N0/C0/M0/I | Y | Package | Layer 4 |
| `scripts/run-v2-googlebooks-teen-e1-certification-regressions.mjs` | direct | Teen E1 certification closure | SL, CR / A | N0/C0/M0/I | Y | Registry E1 | Add package alias; layer 3 |
| `scripts/run-v2-googlebooks-teen-evidence-origin-reconciliation-audit.mjs` | direct | Report-driven Teen evidence origin | DA / A | N0/C0/MO/C | N | No registry entry | Run separately |
| `scripts/run-v2-googlebooks-teen-query-family-overlap-audit.mjs` | direct | Report-driven query overlap | CP, DA / A | N0/C0/MO/C | N | No registry entry | Run separately |
| `scripts/run-v2-googlebooks-teen-query-marginal-yield-audit.mjs` | direct | Report-driven marginal yield | DA / A | N0/C0/MO/C | N | No registry entry | Run separately |
| `scripts/run-v2-googlebooks-teen-query-planning-regressions.mjs` | direct | Teen query planning | CR / A | N0/C0/M0/I | Y | No registry entry | Add package alias; layer 4 |
| `scripts/run-v2-googlebooks-teens-architecture-regressions.mjs` | `npm run test:v2:googlebooks-teens-architecture` | Teen admission architecture | SL, CR / A | N0/C0/M0/I | Y | Registry E1 | Layer 3 |
| `scripts/run-v2-googlebooks-teen-taste-tier-audit.mjs` | direct | Report-driven taste-tier counterfactual | DA / A | N0/C0/MO/C | N | No registry entry | Run separately |
| `scripts/run-v2-googlebooks-teen-trusted-reconciliation-counterfactual.mjs` | direct | Report-driven trusted evidence | DA / A | N0/CO/MO/C | N | No registry entry | Run separately |
| `scripts/run-v2-googlebooks-teen-weak-metadata-sufficiency-audit.mjs` | direct | Report-driven weak metadata | DA / A | N0/C0/MO/C | N | No registry entry | Run separately |

### 5.5 Mystery, Teen Google Books R1, and Open Library timeout investigations

| Path | Command | Primary purpose / scope | Class / status | N/C/M/D | CI | Registry or document | Recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `scripts/run-v2-mystery-candidate-a-shadow-validation.mjs` | `npm run audit:v2:mystery-candidate-a-shadow-validation` | Live Adult Mystery candidate shadow | LP, DA / A | NL/CO/MO/L | N | Package | Manual/staging |
| `scripts/run-v2-mystery-primary-query-abcd-retrieval-experiment.mjs` | `npm run audit:v2:mystery-primary-query-abcd` | Live Mystery A/B/C/D retrieval | LP, CP, DA / A | NL/CO/MO/L | N | Package | Manual/staging |
| `scripts/run-v2-mystery-primary-query-publication-shape-audit.mjs` | `npm run audit:v2:mystery-primary-query-publication-shape` | Live Mystery publication shape | LP, DA / A | NL/CO/MO/L | N | Package | Manual/staging |
| `scripts/run-v2-teen-googlebooks-expanded-fallback-audit.mjs` | `npm run audit:v2:teen-googlebooks-expanded-fallback-audit` | Report-driven fallback audit | DA / A | N0/CO/MO/C | N | Package | Run separately |
| `scripts/run-v2-teen-googlebooks-expanded-fallback-audit-regressions.mjs` | `npm run test:v2:teen-googlebooks-expanded-fallback-audit` | Fallback audit library logic | CR / A | N0/C0/M0/I | Y | Package | Layer 4 |
| `scripts/run-v2-teen-googlebooks-fallback-root-cause-breakdown.mjs` | `npm run audit:v2:teen-googlebooks-fallback-root-cause-breakdown` | Report-driven root-cause summary | DA / A | N0/C0/MO/C | N | Package | Run separately |
| `scripts/run-v2-teen-googlebooks-fallback-root-cause-breakdown-regressions.mjs` | `npm run test:v2:teen-googlebooks-fallback-root-cause-breakdown` | Root-cause parser compatibility | CR / A | N0/C0/M0/I | Y | Package | Layer 4 |
| `scripts/run-v2-teen-googlebooks-r1-composite-query-experiment.mjs` | direct | Live R1 composite-query experiment | LP, DA / H | NL/CO/MO/L | N | R1 investigation artifacts | Preserve; manual only |
| `scripts/run-v2-teen-googlebooks-r1-phase4-final-slate-comparison.mjs` | direct | Live R1 final-slate comparison | LP, CP, DA / H | NL/CO/MO/L | N | R1 investigation artifacts | Preserve; manual only |
| `scripts/run-v2-teen-googlebooks-r1-post-promotion-validation.mjs` | direct | Live post-promotion validation | LP, DA / H | NL/CO/MO/L | N | R1 investigation artifacts | Preserve; manual only |
| `scripts/run-v2-teen-googlebooks-r1-query-family-characterization.mjs` | direct | Live query-family characterization | LP, CH, DA / H | NL/CO/MO/L | N | R1 investigation artifacts | Preserve; manual only |
| `scripts/run-v2-teen-googlebooks-r1-query-quality-audit.mjs` | direct | Live R1 query quality | LP, DA / H | NL/CO/MO/L | N | R1 investigation artifacts | Preserve; manual only |
| `scripts/run-v2-teen-openlibrary-timeout-audit.mjs` | four `npm run audit:v2:teen-openlibrary-*` modes | Repeated live timeout/budget/retry/counterfactual investigation | LP, DA / A | NL/C0/MO/L | N | Package; OL-F work | Staging/manual; never deterministic gate |

### 5.6 Support modules

These 12 files are imported by runners and are not direct tools. Their behavior is covered only through callers.

| Path | Purpose | Mutation/network | Authority / recommendation |
| --- | --- | --- | --- |
| `scripts/comparison-harness/lib/compare.mjs` | Comparison metrics, stable JSON/Markdown, artifact writer | MI; no network | Comparison docs; cover through comparison regression |
| `scripts/lib/googlebooks-general-publication-identity-diagnostic.mjs` | General identity audit logic | None | Cover through paired regression |
| `scripts/lib/googlebooks-general-shadow-counterfactual.mjs` | Shadow counterfactual logic | None | Cover through paired regression |
| `scripts/lib/googlebooks-query-refinement-analysis.mjs` | Query-refinement analysis | None | Cover through paired regression |
| `scripts/lib/googlebooks-recall-efficiency.mjs` | Recall-efficiency analysis | None | Cover through paired regression |
| `scripts/lib/googlebooks-scifi-production-ab.mjs` | SF A/B analysis | None | Cover through paired regression |
| `scripts/lib/recommendation-certification-suite-v1-fixtures.mjs` | R1 fixture inventory | None | Registry R1; add check-only artifact verifier |
| `scripts/lib/teen-googlebooks-audit-profiles.mjs` | Shared Teen audit profiles | None | Investigation support |
| `scripts/lib/teen-googlebooks-fallback-root-cause.mjs` | Fallback root-cause parser | None | Covered by paired regression |
| `scripts/source-competence/lib/gcdCharacterization.mjs` | GCD mapper/artifact writer | MI; no network expected | GCD Phase I |
| `scripts/source-competence/lib/googleBooksCertification.mjs` | GB replay/artifact writer | MI; mocked fetch | GB certification |
| `scripts/source-competence/lib/harness.mjs` | OL harness/replay/stable artifact support | MI; mocked fetch | Architecture audit/source competence |

## 6. Existing package command coverage

### Certification and characterization commands

| Package command | Script | Classification |
| --- | --- | --- |
| `certify:googlebooks` | `scripts/source-competence/run-googlebooks-certification.mjs --mode replay --profile all --verify-no-network --verify-determinism` | Deterministic characterization; CI candidate |
| `test:source-competence:googlebooks` | `scripts/source-competence/run-googlebooks-certification-regressions.mjs` | Deterministic lock |
| `characterize:gcd` | `scripts/source-competence/run-gcd-characterization.mjs --mode replay --profile all --verify-no-network --verify-determinism --verify-frozen` | Deterministic frozen characterization |
| `test:source-competence:gcd` | `scripts/source-competence/run-gcd-characterization-regressions.mjs` | Deterministic lock |

### Test commands

| Package command | Script | Deterministic classification |
| --- | --- | --- |
| `test:v2:googlebooks-query-quality` | `run-v2-googlebooks-query-quality-regressions.mjs` | Yes |
| `test:v2:googlebooks-query-refinement-root-cause` | `run-v2-googlebooks-query-refinement-root-cause-regressions.mjs` | Yes |
| `test:v2:googlebooks-general-publication-identity` | `run-v2-googlebooks-general-publication-identity-regressions.mjs` | Yes |
| `test:v2:googlebooks-general-shadow-counterfactual` | `run-v2-googlebooks-general-shadow-counterfactual-regressions.mjs` | Yes |
| `test:v2:teen-googlebooks-fallback-root-cause-breakdown` | `run-v2-teen-googlebooks-fallback-root-cause-breakdown-regressions.mjs` | Yes |
| `test:v2:teen-googlebooks-expanded-fallback-audit` | `run-v2-teen-googlebooks-expanded-fallback-audit-regressions.mjs` | Yes |
| `test:v2:googlebooks-scifi-production-query-ab` | `run-v2-googlebooks-scifi-production-query-ab-regressions.mjs` | Yes |
| `test:v2:googlebooks-recall-efficiency` | `run-v2-googlebooks-recall-efficiency-regressions.mjs` | Yes |
| `test:v2:googlebooks-publication-shape` | `run-v2-googlebooks-publication-shape-regressions.mjs` | Yes |
| `test:v2:googlebooks-kids-architecture` | `run-v2-googlebooks-kids-architecture-regressions.mjs` | Yes; D1 |
| `test:v2:googlebooks-teens-architecture` | `run-v2-googlebooks-teens-architecture-regressions.mjs` | Yes; E1 |
| `test:v2:googlebooks-final-slate-identity-audit` | `run-v2-googlebooks-final-slate-identity-audit-regressions.mjs` | Yes |
| `test:v2:googlebooks-narrative-strength-ranking` | `run-v2-googlebooks-narrative-strength-ranking-regressions.mjs` | Yes |
| `test:v2:googlebooks-age-band-infrastructure-audit` | `run-v2-googlebooks-age-band-infrastructure-audit-regressions.mjs` | Yes |
| `test:v2:googlebooks-audience-maturity-separation` | `run-v2-googlebooks-audience-maturity-separation-regressions.mjs` | Yes; E1 |
| `test:v2:googlebooks-lineage-diagnostics` | `run-v2-googlebooks-lineage-diagnostics-regressions.mjs` | Yes |
| `test:v2:googlebooks-preteen-publication-identity-audit` | `run-v2-googlebooks-preteen-publication-identity-regressions.mjs` | Yes; D2 |
| `test:v2:googlebooks-preteen-publication-shape-false-reject-audit` | `run-v2-googlebooks-preteen-publication-shape-false-reject-audit-regressions.mjs` | Yes |
| `test:v2:googlebooks-preteen-publication-shape-narrative-rescue` | `run-v2-googlebooks-preteen-publication-shape-narrative-rescue-regressions.mjs` | Yes; D2 |
| `test:v2:googlebooks-preteen-query-routing` | `run-v2-googlebooks-preteen-query-routing-regressions.mjs` | Yes |
| `test:v2:googlebooks-short-signals` | `run-v2-googlebooks-short-signal-boundary-regressions.mjs` | Yes |
| `test:v2:openlibrary-presets` | `run-v2-openlibrary-presets.mjs` | **No: live/network-dependent despite `test:` name** |
| `test:v2:openlibrary-routing-regressions` | `run-v2-openlibrary-routing-regressions.mjs` | Deterministic; conditional tracked `.tmp` mutation |
| `test:v2:openlibrary-query-lineage` | same script with `--query-lineage-only` | Deterministic alias/subset |
| `test:v2:kitsu-comicvine-contract` | `run-v2-kitsu-comicvine-contract-regressions.mjs` | Yes |
| `test:v2:comicvine-source-certification` | `run-v2-comicvine-source-certification-regressions.mjs` | Yes; EP1 |
| `test:v2:comicvine-cert-gap-closure` | `run-v2-comicvine-cert-gap-closure-regressions.mjs` | Yes; EP1 |

There are 29 `test:*` aliases above but only 28 unique scripts. Twenty-eight aliases are deterministic; `test:v2:openlibrary-presets` is live.

### Audit commands

All 18 `audit:*` aliases are investigative, not deterministic release gates:

| Package command | Script / mode |
| --- | --- |
| `audit:v2:googlebooks-kids-query-comparison` | `run-v2-googlebooks-kids-query-comparison.mjs` |
| `audit:v2:googlebooks-query-refinement-root-cause` | `run-v2-googlebooks-query-refinement-root-cause.mjs` |
| `audit:v2:googlebooks-general-publication-identity` | `run-v2-googlebooks-general-publication-identity-diagnostic.mjs` |
| `audit:v2:googlebooks-general-shadow-counterfactual` | `run-v2-googlebooks-general-shadow-counterfactual.mjs` |
| `audit:v2:teen-googlebooks-fallback-root-cause-breakdown` | `run-v2-teen-googlebooks-fallback-root-cause-breakdown.mjs` |
| `audit:v2:teen-googlebooks-expanded-fallback-audit` | `run-v2-teen-googlebooks-expanded-fallback-audit.mjs` |
| `audit:v2:mystery-primary-query-publication-shape` | `run-v2-mystery-primary-query-publication-shape-audit.mjs` |
| `audit:v2:mystery-primary-query-abcd` | `run-v2-mystery-primary-query-abcd-retrieval-experiment.mjs` |
| `audit:v2:mystery-candidate-a-shadow-validation` | `run-v2-mystery-candidate-a-shadow-validation.mjs` |
| `audit:v2:googlebooks-scifi-production-query-ab` | `run-v2-googlebooks-scifi-production-query-ab.mjs` |
| `audit:v2:googlebooks-recall-efficiency` | `run-v2-googlebooks-recall-efficiency-diagnostic.mjs` |
| `audit:v2:googlebooks-kids-pre-scoring-rejections` | `run-v2-googlebooks-kids-k2-pre-scoring-rejection-audit.mjs` |
| `audit:v2:googlebooks-preteen-kids-label-mismatch` | `run-v2-googlebooks-preteen-kids-label-mismatch-audit.mjs` |
| `audit:v2:googlebooks-preteen-maturity-policy-experiment` | `run-v2-googlebooks-preteen-maturity-policy-experiment.mjs` |
| `audit:v2:teen-openlibrary-timeouts` | `run-v2-teen-openlibrary-timeout-audit.mjs` default |
| `audit:v2:teen-openlibrary-timeout-budget-matrix` | same script, `--budget-matrix` |
| `audit:v2:teen-openlibrary-targeted-retry-experiment` | same script, `--targeted-retry-experiment` |
| `audit:v2:teen-openlibrary-counterfactual-impact` | same script, `--counterfactual-impact` |

### Missing and misleading package coverage

Eleven deterministic regression scripts lack package commands:

- `scripts/comparison-harness/run-comparison-harness-regressions.mjs`
- `scripts/run-collection-opportunities-placeholder-regressions.mjs`
- `scripts/run-v2-googlebooks-final-eligibility-regressions.mjs`
- `scripts/run-v2-googlebooks-kids-d1-certification-regressions.mjs`
- `scripts/run-v2-googlebooks-kids-query-planning-regressions.mjs`
- `scripts/run-v2-googlebooks-preteen-d2-certification-regressions.mjs`
- `scripts/run-v2-googlebooks-teen-e1-certification-regressions.mjs`
- `scripts/run-v2-googlebooks-teen-query-planning-regressions.mjs`
- `scripts/run-v2-kitsu-source-certification-regressions.mjs`
- `scripts/run-v2-mock-source-regressions.mjs`
- `scripts/run-v2-taste-alignment-diagnostics-regressions.mjs`

The registry-referenced `run-v2-adult-kitsu-cert-fixtures.mjs`, the generic Open Library source-competence runner, and the comparison artifact runner also lack package aliases. Conversely, `test:v2:openlibrary-presets` is named like a deterministic test but performs live source work. The many `*-audit-regressions` names are deterministic even though "audit" can imply live work.

## 7. Certification registry reconciliation

Every script and artifact path currently named by `scripts/output/certified-subsystem-registry.json` exists.

| Registry slice | Validation files | Artifact | Package coverage | Reconciliation |
| --- | --- | --- | --- | --- |
| Google Books D1 Kids | `googlebooks-kids-architecture-regressions`; `googlebooks-kids-d1-certification-regressions` | No slice artifact named | Architecture packaged; D1 closure not packaged | Status matches code, but release discovery is incomplete |
| Google Books D2 Preteen | publication identity; narrative rescue; D2 certification regressions | No slice artifact named | First two packaged; D2 closure not packaged | All paths exist; no single D2 command |
| Google Books E1 Teen | Teen architecture; audience/maturity; E1 certification regressions | No slice artifact named | First two packaged; E1 closure not packaged | All paths exist; no single E1 command |
| Open Library R1 Adult | `run-v2-openlibrary-recommendation-certification-suite-v1.mjs` | `scripts/output/recommendation-certification-suite-v1.json` | Neither packaged | Generator exists and artifact exists, but no non-mutating verifier; registry says `certified_fixture_suite_registered`, not fully certified |
| ComicVine EP1 | source certification and gap-closure regressions | Baseline named only as `entity-policy-v1` plus tag | Both packaged | Paths and documented status agree |
| Kitsu K1 Adult | source certification and fixture regressions | `scripts/output/adult-kitsu-baseline-phase3.json` | Neither packaged | Paths/artifact exist; live probe is correctly separate but registry's historical 20/20 observation is not a deterministic lock |

Important deterministic work not represented in the registry includes:

- GCD Phase I characterization and `scripts/source-competence/frozen/gcd-phase1-summary.json`;
- Google Books source-competence certification artifacts;
- Open Library Phase 1 source-competence harness;
- the OL-vs-GB comparison harness;
- Open Library routing/lineage regression;
- mock-off, taste-diagnostics, and Collection Opportunities invariance regressions;
- numerous Google Books routing, identity, diagnostic, and ranking regressions.

The omission does not invalidate those tools; it means the registry is a subsystem certification registry, not yet the authoritative release manifest.

Documentation drift exists in older audits. These referenced paths are absent on current `main`:

- `scripts/smoke-comicvine-dispatch-diagnostics.mjs`
- `scripts/test-gcd-query-regression.mjs`
- `scripts/run-comicvine-contract-traces.ts`
- `scripts/smoke-comicvine-adapter.mjs`

They remain cited by `docs/CODEX_ARCHITECTURE_AND_SOURCE_AUDIT.md` or `docs/GRAPHIC_NOVEL_SOURCE_EVALUATION_INVENTORY_AND_CONTRACT.md`. Current ComicVine regressions and later certification records are authoritative.

## 8. Proposed future release-gate layers

This is a proposal, not an implementation or claim that the layers currently pass.

| Layer | Candidate commands | Dependencies / parallel safety | Mutation risk | Failure meaning |
| --- | --- | --- | --- | --- |
| 1. Repository integrity | clean status, `git diff --check`, lockfile presence, frozen path/hash checks | First; serial | None | Checkout or artifact integrity is not trustworthy |
| 2. Pure contracts | collection placeholder, mock-off, taste diagnostics, pure GB classifier/query regressions | Parallel by process after alias/env isolation | Mostly none; collection uses cleaned OS temp | Shared invariant or pure decision contract changed |
| 3. Adapter/admission locks | D1/D2/E1, EP1, K1, GB publication shape | Parallel by source; environment must be isolated | None expected | Certified source contract drifted |
| 4. Pipeline lifecycle | OL routing/lineage, GB routing/lineage/ranking/final eligibility, Kitsu-CV integration | Parallel only after tracked `.tmp` issue is removed; avoid shared global/env state in one process | OL currently rewrites tracked `.tmp` | Routing, identity, scoring, eligibility, selection, or diagnostics changed |
| 5. Competence/comparison | GB/GCD/OL competence replay and comparison regression/artifact generation | Parallel with unique ignored output dirs | Writes ignored `artifacts/` | Frozen characterization/comparison no longer reproduces |
| 6. Frozen artifact integrity | GCD `--verify-frozen`; future non-mutating R1/GB/comparison checksum verifiers | After layers 3-5 | Current R1 tool overwrites tracked artifact and must not be used as verifier | Stored evidence and executable methodology disagree |
| 7. Static/build | `npm run lint`, `npm run typecheck`, future production build | After dependency install; lint/typecheck may run parallel | Lint reads `.env`; no write observed | Repository is not statically/build ready |

The first canonical command must not claim green while layer 7 fails. At this baseline:

- `npm run typecheck` fails with broad existing type errors.
- `npm run lint` fails with 21 errors and 49 warnings.
- no production build command or CI workflow exists.

Potential parallel execution must use separate processes and unique output directories. Tests that mutate `process.env` or `globalThis.fetch` are safe only with process isolation. Scripts writing shared `scripts/output/`, `.tmp/`, or common artifact directories must not run in parallel.

## 9. Exclusions from deterministic CI

| Excluded class | Tools/examples | Correct execution venue |
| --- | --- | --- |
| Live API probes | OL presets/timeout audit, Kitsu reliability, NYT F1/F2A, source smoke/preflight, live GB/Mystery/R1 scripts | Bounded staging or scheduled source-health workflow with approved credentials |
| Credential-dependent checks | NYT, authenticated GB, proxy-backed source work | Secret-isolated staging; never pull-request CI by default |
| Artifact refresh | R1 generator, numbered gates, report-driven audits | Explicit maintainer command in a clean branch; review generated diff |
| Manual/destructive utilities | swipe image population, `reset-project.js` | Human-operated maintenance only |
| Licensing/access investigations | GCD/ComicVine rights and access | Legal/policy review record |
| Human Review | `docs/HUMAN_REVIEW_MODE_SPEC.md` future workflow | Separate immutable review process |
| Staging/production smoke | future deployed app/source checks | Post-deploy workflow |
| Production telemetry | future operational evidence | Monitoring/analysis; never a deterministic correctness substitute |

Mixed scripts should be split before inclusion. In particular, NYT F1 combines mocked assertions and live-validation concerns; Open Library presets are packaged as a test despite being live.

## 10. Gaps and risks

1. **No authoritative release manifest.** There are 99 direct tools, but no single versioned list says which ones protect release.
2. **Package coverage is incomplete.** Eleven regression entry points and several registry/harness locks lack aliases.
3. **A live command is named as a test.** `test:v2:openlibrary-presets` is unsuitable for deterministic CI.
4. **Lint and typecheck are red.** Neither may be represented as a passing layer; the exact failures are broader than this documentation task.
5. **No Node/npm pin.** Clean-checkout reproducibility depends on an unstated runtime.
6. **No CI or production-build command.** `.github` and `eas.json` are absent.
7. **Tracked temporary compilation output.** OL routing and presets compile into tracked `.tmp/`, so source changes can dirty a run.
8. **Tracked artifact generators lack check mode.** R1 and many audits overwrite `scripts/output/`; regeneration is not validation.
9. **Environment isolation is weak.** Several deterministic regressions mutate `process.env`; lint loads the tracked `.env`; live scripts parse `.env` directly.
10. **Mixed evidence classes.** NYT F1 mixes mocked contract work and live validation; package naming does not always expose the distinction.
11. **Registry coverage is narrower than validation reality.** Important competence, comparison, routing, mock, taste, and placeholder locks are unregistered.
12. **Registry commands are undiscoverable.** D1/D2/E1 closure and K1 scripts lack package aliases.
13. **Historical script authority is unclear.** Numbered Google Books gates and R1 investigations produce tracked evidence but are not current registry locks.
14. **Documentation has stale paths.** Four older ComicVine/GCD scripts are cited but absent.
15. **No byte-integrity verifier for several frozen outputs.** GCD has one; R1 and other outputs generally rely on regeneration or ad hoc regressions.
16. **Ordering/parallel risks are undocumented.** Shared `globalThis.fetch`, `process.env`, `.tmp/`, and output directories require process and path isolation.
17. **No focused component/unit framework was found.** Validation is predominantly executable Node scripts that transpile/import production TypeScript.
18. **Clean-checkout dependency assumptions are implicit.** Several scripts invoke `node_modules/typescript/bin/tsc` directly.

These are findings, not repair authorization.

## 11. Recommended next implementation task

### Task: implement the canonical deterministic release command and CI workflow

Before implementation, resolve:

1. the supported Node/npm versions;
2. whether the 43 proposed candidates are accepted, especially OL tracked-`.tmp` behavior;
3. which historical numbered scripts remain authoritative;
4. whether the subsystem registry or a new release manifest owns gate membership;
5. how frozen R1/other artifacts receive non-mutating check modes;
6. whether lint/typecheck must be repaired first or introduced as visibly failing required layers;
7. how `.env` is excluded from deterministic CI and whether tracked secret history requires separate action;
8. the supported production build command.

Likely files:

- `package.json` for explicit layer and aggregate commands;
- a new versioned release-manifest file under `scripts/` or `scripts/output/`;
- one small orchestration runner under `scripts/`;
- `.github/workflows/...` for CI;
- runtime pinning (`.nvmrc`, `.node-version`, or `package.json.engines`);
- OL regression compile-output configuration;
- non-mutating frozen-artifact verifiers;
- documentation for local and CI use.

Acceptance must include clean install, network prohibition, isolated environments and output paths, deterministic ordering/reporting, a clean worktree after the gate, clear layer failures, and no production-output change. Live probes, Human Review, and telemetry remain separate workflows.

This recommendation is not authorization to implement.

## 12. Unsupported conclusions

This manifest does not prove:

- recommendation quality;
- live source health;
- launch readiness;
- Human Review approval;
- licensing suitability;
- deployment correctness;
- accessibility;
- privacy or security compliance;
- that every passing script belongs in the release gate;
- that historical scripts may be deleted without review;
- that all 43 proposed CI candidates currently pass together or in parallel;
- that lint, typecheck, or a production build is green;
- that a registered subsystem is useful to readers;
- that an unregistered regression is unimportant.

The manifest changes no behavior. It classifies the evidence surface so the next implementation can build an honest release gate rather than merely aggregate every executable file.
