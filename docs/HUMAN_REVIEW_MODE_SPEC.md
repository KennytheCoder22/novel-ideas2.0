# Human Review Mode Specification

## Status and scope

This document specifies a future Human Review Mode for NovelIdeas recommendation characterization. It defines review concepts, records, workflows, reporting boundaries, and safeguards. It does not implement storage, commands, interfaces, automation, or recommendation behavior.

Source Competence Harness Phase 1 remains frozen and unchanged. Human Review Mode must be additive: it may read immutable machine artifacts and append separate review records, but it must never edit, replace, annotate in place, or reinterpret the historical machine artifact as though the machine produced a different result.

## Purpose

Deterministic diagnostics answer what the recommendation system did. Human review answers whether the result appears useful for the reader represented by the reviewed profile. Both are necessary, and neither substitutes for the other.

Human Review Mode exists to bridge deterministic characterization and product judgment while preserving their different claims:

- machine state describes what the system did;
- human review judges whether a candidate or slate is useful for the represented reader;
- human judgment never rewrites routing, transport, filtering, normalization, evidence, eligibility, selection, fallback, or recovery history;
- deterministic correctness and human usefulness remain independent claims;
- disagreement and uncertainty are first-class evidence, not failures to be hidden.

The mode should help future contributors discover patterns worth investigating. It must not silently turn reviewer opinion into production policy.

## Governing principles

1. **Machine history is immutable.** A reviewed artifact remains an exact record of the original run.
2. **Human judgment is appended.** Reviews are separate, versioned records linked by stable identifiers and hashes.
3. **Usefulness is reader-relative.** Reviewers judge predicted fit for the preserved reader intent, not their personal preference.
4. **Evidence remains visible.** Review cards expose the evidence and decisions needed to understand the machine path.
5. **Uncertainty is explicit.** `insufficient_information` and uncertainty notes are legitimate outcomes.
6. **Coverage is measurable.** Unreviewed candidates and slates remain visibly unreviewed and never imply approval.
7. **Multiple views may coexist.** Reviewers may disagree without either record overwriting the other.
8. **Old reviews retain their meaning.** Later rubric versions create new records or interpretations; they do not rewrite historical reviews.
9. **Findings propose work.** Review results may motivate engineering changes, but they never mutate the reviewed run.
10. **No composite badge replaces the evidence.** Machine correctness, coverage, human fit, concerns, and disagreement remain separately reportable.

## Claims Human Review Mode may and may not make

| Claim | Established by | Meaning |
| --- | --- | --- |
| Machine terminal state | Harness artifact | The terminal condition reached by the recorded pipeline run. |
| Deterministic reproducibility | Harness validation | The same inputs and implementation reproduce the characterized machine output. |
| Review coverage | Review records | The proportion of eligible review units with completed or explicitly abstained reviews. |
| Human fit judgment | Candidate review | One reviewer judged predicted reader fit under a named rubric version. |
| Slate usefulness judgment | Slate review | One reviewer judged the recommendation set as a whole. |
| Source-level usefulness pattern | Aggregated reviewed evidence | A qualified pattern across reviewed cases, never proof from an isolated result. |

In Phase 1, `eligible_useful` remains a machine terminal-state family. It means the pipeline produced a sufficiently populated eligible slate under the Phase 1 machine classification. It is not evidence that a human found the recommendations useful.

## Review subject hierarchy

Human Review Mode distinguishes three related objects:

1. **Machine run:** the immutable harness execution and its artifacts.
2. **Candidate review unit:** one recommendation card tied to one candidate in that run.
3. **Slate review unit:** the final recommendation set and its set-level behavior.

Candidate review and slate review answer different questions. A slate may contain individually acceptable candidates yet be poor because of repetition, sequel pressure, format imbalance, or weak filler. Conversely, one questionable candidate does not necessarily make an otherwise strong slate useless.

## Primary review unit: recommendation card

The primary review unit is a recommendation card derived from an immutable source artifact. The card is a presentation of machine evidence, not a new machine artifact.

Every card must be tied to:

- harness run ID;
- case or profile ID;
- source;
- engine path and engine version;
- candidate stable ID;
- candidate artifact path or artifact object reference;
- selected rank, or an explicit `not_selected` value;
- title and creator or creators;
- reader-intent summary;
- source activation rationale;
- originating query and complete available provenance;
- document-backed positive evidence;
- document-backed negative or avoid evidence;
- eligibility result and reasoning;
- selection result and reasoning;
- fallback, recovery, emergency, or curated provenance;
- machine terminal state for the run;
- source artifact reference and content hash.

The card should also identify the candidate's observed pipeline stages so a reviewer can distinguish, for example, a selected recommendation from a normalized candidate rejected at final eligibility.

### Recommendation card model

A future card model should contain at least:

```text
card_schema_version
review_unit_id
harness_run_id
case_profile_id
source
engine_path
engine_version
candidate_stable_id
selected_rank | not_selected
title
creators[]
reader_intent_summary
source_activation { status, rationale[] }
query_provenance { query, family, route, fallback, recovery, curated }
document_evidence { positive[], negative[], unknown[] }
eligibility { result, reasons[] }
selection { result, reasons[] }
machine_terminal_state
artifact_reference { path_or_uri, sha256 }
```

`review_unit_id` must be deterministically derivable from the immutable run identity and candidate identity. It must not be derived only from title text.

## Human judgment schema

Human review records require an explicit schema version. The first implementation should use a semantic schema identifier such as `novelideas.human-review.candidate/1.0.0`, with a different identifier for slate reviews.

A candidate review record must contain:

| Field | Required | Meaning |
| --- | --- | --- |
| `schema_version` | Yes | Exact candidate-review schema and rubric contract. |
| `review_id` | Yes | Stable unique identity for this appended review. |
| `review_unit_id` | Yes | Link to the immutable recommendation card. |
| `harness_run_id` | Yes | Link to the characterized run. |
| `artifact_sha256` | Yes | Hash of the exact machine artifact reviewed. |
| `reviewer_id_or_label` | Yes | Named, pseudonymous, or role-based reviewer identity under project policy. |
| `review_timestamp` | Yes | Timestamp recorded in a documented timezone or UTC. |
| `review_status` | Yes | Workflow state such as `draft`, `completed`, `abstained`, or `superseded_by_new_review`. |
| `rubric_version` | Yes | Rubric used to interpret the fit and concern fields. |
| `fit_classification` | When completed | Explicit nonnumeric fit judgment. |
| `confidence` | When completed | Bounded categorical confidence, separate from fit. |
| `concern_categories` | Yes | Zero or more structured concern values. |
| `free_text_rationale` | When completed | Concise evidence-based explanation of the judgment. |
| `uncertainty_note` | Required when uncertain | What information is missing or ambiguous. |
| `outside_knowledge_used` | Yes | Whether judgment relied on knowledge not present in the review card. |
| `outside_knowledge_note` | If used | Nature and relevance of that knowledge without reproducing copyrighted material. |
| `metadata_quality` | Yes | Whether metadata appears adequate, misleading, incomplete, or conflicting. |
| `good_entry_point` | Yes | `yes`, `no`, `unclear`, or `not_applicable`. |
| `belongs_in_final_slate` | Yes | `yes`, `no`, or `unclear`. |
| `slate_observation` | Optional | Candidate-specific effect on the complete slate. |

### Fit classification

The primary fit judgment must not be a single numeric score. Use this explicit scale:

- `strong_fit`: compelling alignment with the represented reader intent and no material unresolved concern;
- `acceptable_fit`: relevant and defensible, though not exceptional or entirely concern-free;
- `weak_fit`: some alignment exists, but evidence, audience, entry-point quality, or expected usefulness is inadequate;
- `false_positive`: the candidate should not be treated as a recommendation for this profile;
- `concern`: potentially relevant, but a material safety, maturity, format, metadata, crossover, or slate concern prevents ordinary acceptance;
- `insufficient_information`: the available evidence does not support a responsible fit judgment.

`concern` should not become a vague substitute for rationale. At least one concern category and a rationale are required when it is selected.

### Confidence

Confidence describes confidence in the review, not confidence in the recommender. A small categorical scale is preferred:

- `high`;
- `medium`;
- `low`;
- `not_assessed`.

A high-confidence `false_positive` and a low-confidence `strong_fit` remain meaningfully different records. Fit and confidence must therefore remain separate.

### Metadata quality

Metadata assessment should use:

- `adequate`;
- `incomplete`;
- `misleading`;
- `conflicting`;
- `not_assessed`.

This field evaluates whether the review evidence represents the work reliably. It does not alter the metadata stored in the machine artifact.

## Concern taxonomy

Candidate reviews may include multiple concerns. The initial taxonomy must include:

- `age_or_maturity`;
- `wrong_format`;
- `weak_taste_alignment`;
- `query_only_alignment`;
- `misleading_metadata`;
- `artifact_or_non_narrative`;
- `poor_series_entry`;
- `duplicate_or_near_duplicate`;
- `franchise_overconcentration`;
- `inappropriate_crossover`;
- `fallback_quality`;
- `famous_but_poor_fit`;
- `individually_valid_but_bad_for_slate`;
- `other`.

When `other` is used, a short description is mandatory. Taxonomy additions require a new rubric version or a backward-compatible documented extension; historical concern values must not be silently renamed.

## Machine and human separation

Machine and human records must remain structurally separate.

### Immutable machine fields

Human Review Mode must not alter:

- planned or actual source activation;
- query text, order, route, or provenance;
- request, response, retry, timeout, or transport facts;
- raw source identifiers or ordering;
- structural or source-policy drop counts;
- normalized candidate data;
- scores, evidence, or score breakdowns;
- final eligibility decisions or reasons;
- selection rank or reasons;
- fallback, recovery, emergency, or curated provenance;
- machine terminal state;
- production hashes or artifact hashes.

### Append-only human fields

Human judgments live in separate review records. They may disagree with machine eligibility or selection, but the disagreement is represented as a relationship between records rather than as a correction to machine history.

Examples:

- a machine-eligible candidate may receive `false_positive`;
- a machine-rejected candidate may receive `acceptable_fit` with an explanation that it appears promising;
- a selected candidate may receive `individually_valid_but_bad_for_slate`;
- an unselected candidate may be judged a better entry point than a selected sequel;
- a reviewer may use `insufficient_information` because source metadata is inadequate.

None of these judgments changes the artifact being reviewed.

### Unreviewed is not approval

Review state must be explicit at candidate and slate levels. Absence of a review record means `unreviewed`; it must never be displayed, counted, exported, or inferred as accepted, useful, passing, or approved.

A `draft` review is also not completed coverage. An `abstained` review is completed workflow activity but not a fit judgment and must be reported separately.

## End-to-end workflow

1. **Generate deterministic harness artifacts.** Run the applicable fixture or replay characterization and preserve its run identity, schema versions, engine identity, and production hashes.
2. **Select review scope.** Choose cases, slates, selected candidates, rejected candidates, or a documented sample. Record the sampling rule so coverage is interpretable.
3. **Create review cards.** Derive cards from the immutable artifacts. Do not remove inconvenient evidence or hide machine decisions.
4. **Present evidence.** Show the preserved reader profile, intent summary, machine path, document evidence, and provenance with safeguards against over-priming.
5. **Record candidate judgments.** Append one candidate review per reviewer and review unit. Preserve drafts and abstentions according to storage policy.
6. **Record slate judgment.** Append a distinct slate review tied to the same run and exact final slate.
7. **Freeze the review record.** Store schema version, rubric version, reviewer label, timestamps, artifact reference, and artifact hashes. A completed review becomes immutable; corrections create a superseding review record.
8. **Generate comparison reports.** Join machine artifacts and review records without merging their claims.
9. **Propose future work.** Use patterns and disagreements to form diagnostics, retrieval, policy, or product hypotheses. Never mutate the reviewed run to make it agree with the proposal.

## Slate-level review

Slate review is a separate versioned record tied to the harness run, final returned slate, and artifact hash. It must not be synthesized automatically from candidate labels.

A slate review should cover:

- overall usefulness for the represented reader;
- coherence without excessive sameness;
- meaningful variety;
- duplicate and near-duplicate pressure;
- sequel, volume, and series-entry pressure;
- maturity consistency;
- format balance;
- missing obvious recommendation types or experiences;
- weak filler;
- likely effect on reader trust;
- whether honest underfill was preferable to available alternatives;
- whether individually good candidates combine into a poor slate;
- whether the slate overrepresents a franchise, author, route, source, or evidence family.

### Proposed slate schema

A future slate review record should include:

```text
schema_version
review_id
harness_run_id
case_profile_id
artifact_sha256
slate_identity_hash
reviewer_id_or_label
review_timestamp
review_status
rubric_version
overall_usefulness
coherence
variety
maturity_consistency
format_balance
duplicate_pressure
series_pressure
weak_filler_present
missing_recommendation_types[]
trust_impact
underfill_preference
concern_categories[]
rationale
uncertainty_note
outside_knowledge_used
```

Categorical values should be explicit and documented. No single slate score should replace these dimensions.

## Disagreement model

Disagreements are expected observations. Reports should preserve the machine decision, every reviewer decision, the rubric used, and the basis of disagreement.

### Machine accepted, human rejected

Represent a candidate that was machine eligible or selected but receives `weak_fit`, `false_positive`, or `concern`. Record the applicable concern categories and whether the problem appears candidate-specific, metadata-driven, route-related, or slate-dependent.

This is evidence for investigation, not automatic proof that eligibility policy is wrong.

### Machine rejected, human believes promising

Permit review of nonselected and rejected candidates when the artifact contains enough evidence. Record the machine rejection stage and reason alongside the human fit judgment.

This is evidence that a gate, evidence extraction, metadata interpretation, or selection tradeoff may deserve study. It must not retrospectively mark the candidate eligible.

### Reviewer disagreement

Multiple completed reviews for the same review unit remain distinct. A comparison layer may classify their relationship as:

- agreement;
- adjacent disagreement, such as `strong_fit` versus `acceptable_fit`;
- material disagreement, such as `strong_fit` versus `false_positive`;
- confidence-weighted uncertainty;
- rubric-version mismatch;
- not comparable because the reviewed artifact hashes differ.

Reviewer votes must not be silently averaged into a numeric truth score. If adjudication is later required, the adjudication must be a separate record with its own reviewer, rationale, and policy authority.

### Insufficient information

Use `insufficient_information` when the evidence does not support a responsible judgment. Record whether the gap concerns description, audience, maturity, format, series position, edition identity, or another field.

This result should increase visible uncertainty and metadata-gap counts; it must not be converted to neutral approval.

### Metadata disagreement

A reviewer may believe the source metadata is misleading, incomplete, or conflicting. The review record should identify the disputed fields and any outside knowledge used. The machine artifact remains unchanged.

### Profile ambiguity

If the reader profile itself is ambiguous or contradictory, record that limitation in the review rationale or a profile-level observation. Do not edit the profile after seeing the recommendations. A revised profile requires a new machine run and new review scope.

### Slate-only concerns

Some concerns cannot be assigned fairly to one title, including franchise overconcentration, monotony, poor format balance, missing obvious experiences, or cumulative maturity drift. Record them in the slate review without forcing a candidate-level blame assignment.

## Reporting specification

Reports must keep these sections separate:

1. **Machine terminal-state counts:** exact harness states and activation outcomes.
2. **Human review coverage:** eligible units, completed reviews, drafts, abstentions, and unreviewed units.
3. **Fit classifications:** counts and shares by completed candidate review.
4. **Concern frequencies:** candidate and slate concerns, with `other` descriptions retained.
5. **Reviewer disagreement:** coverage by reviewer, comparable review pairs, and disagreement categories.
6. **Source-level patterns:** reviewed evidence grouped by source without assuming causality.
7. **Age-band patterns:** reviewed evidence grouped by preserved profile age band.
8. **Candidate-level findings:** title-specific evidence, judgment, confidence, and rationale.
9. **Slate-level findings:** usefulness, variety, pressure, underfill, and trust observations.
10. **Metadata and information gaps:** misleading, incomplete, conflicting, and insufficient-information counts.

Reports must not collapse these sections into one pass/fail badge, quality score, certification label, or traffic-light indicator.

### Coverage denominators

Every reported percentage must name its denominator. Examples include:

- completed candidate reviews divided by selected candidates in scope;
- reviewed slates divided by harness cases in scope;
- `false_positive` judgments divided by completed fit judgments;
- disagreement pairs divided by review units with multiple comparable completed reviews.

A source with two reviewed candidates must not appear equivalent in evidentiary strength to a source with two hundred.

### Comparability

Reports may compare records only when they identify relevant differences in:

- machine artifact hash;
- harness and engine version;
- profile and case identity;
- source;
- rubric version;
- reviewer or reviewer role;
- sampling rule;
- fixture, replay, or future live mode.

Differences do not always prohibit comparison, but they must remain visible.

## Bias and review safeguards

### Show evidence without over-priming

Reviewers need machine evidence, but presentation order can bias judgment. A future interface should consider staged disclosure:

1. preserved reader intent and bibliographic identity;
2. document-backed evidence and provenance;
3. machine eligibility and selection reasoning;
4. aggregate machine state only after the reviewer has enough context.

The system must not hide evidence. Staged disclosure exists to reduce anchoring, not to create a blind review detached from the actual task. Whether machine score and terminal-state labels appear before the initial fit judgment requires product-owner approval and should be recorded in the review protocol.

### Preserve the exact reader profile

The card must display the profile and intent used by the machine run. Reviewers must not rewrite preferences after seeing candidates. If the profile appears wrong or ambiguous, record that observation and generate a new run later if appropriate.

### Predicted reader fit, not personal taste

Review instructions must ask: "Is this likely useful for the represented reader?" They must not ask whether the reviewer personally likes, recognizes, or would read the title.

### Record outside knowledge

Outside knowledge may improve review accuracy, but it changes the evidentiary basis. Reviewers must record whether it was used and summarize its relevance. Reports should permit separating metadata-only judgments from outside-knowledge-assisted judgments.

### Avoid authority and familiarity shortcuts

A title must not be accepted or rejected solely because it is famous, obscure, has an appealing cover, comes from a trusted source, or appears in a familiar franchise. These attributes may be context, but the rationale must return to reader fit, evidence, safety, entry point, and slate role.

### Repeat review and disagreement

The design must support multiple independent reviewers and repeat review under later rubrics. Interfaces should avoid showing another reviewer's judgment before an independent review is completed unless the task is explicit adjudication.

### Privacy and reviewer identifiers

Reviewer identity should collect no more personal data than necessary. Named, pseudonymous, and role-based labels must be supported by policy. Public reports should not expose private reviewer information. Internal records still require a stable label sufficient to detect repeat reviews and disagreement.

### Rubric versioning

Every completed review records the exact rubric version. Rubric changes must document whether fields or meanings are backward compatible. Historical reviews remain attached to their original rubric; they are not bulk-rewritten to appear current.

## Integrity and immutability requirements

A review record is valid only if it can identify exactly what was reviewed. At minimum, freeze:

- machine artifact SHA-256;
- review-card projection schema version;
- candidate stable ID or final slate identity hash;
- harness run and case/profile IDs;
- engine and harness versions;
- source;
- human-review schema and rubric versions.

If an artifact is regenerated and its hash changes, prior reviews remain attached to the old hash. The new artifact requires new review records or an explicit comparison workflow.

Completed review records should be append-only. Corrections use `supersedes_review_id` and preserve both records. Deletion, if required for privacy or legal reasons, should leave an auditable tombstone that does not falsely imply the review never existed, subject to future data-retention policy.

## Recommended eventual storage design

No storage is implemented by this specification. A future implementation should favor portable, source-agnostic files suitable for offline work.

A recommended layout is:

```text
artifacts/recommendation-evaluation/
  <run-id>/
    machine/                  # references or copied immutable hashes, not edited Phase 1 artifacts
    review-cards/
      <review-unit-id>.json
    reviews/
      candidates.jsonl
      slates.jsonl
      adjudications.jsonl
    reports/
      comparison.json
      comparison.md
    manifest.json
```

JSON or JSON Lines is recommended for canonical records because it is portable, diffable, and easy to validate. Markdown may be generated from those records for reading, but it should not be the canonical review store. If a database is introduced later, export and import must preserve the same versioned record contract.

Phase 1 artifacts beneath `artifacts/source-competence/` remain unchanged. A review manifest should reference their paths and hashes rather than writing review fields into them.

## Recommended eventual UI and CLI workflow

No interface or command is implemented here. A future CLI could conceptually support:

```text
prepare-review   <machine-artifact> <scope>
review-candidate <review-unit-id>
review-slate     <run-id>
validate-reviews <review-manifest>
report-reviews   <review-manifest>
```

An offline UI could render the same prepared cards and write the same canonical append-only records. CLI and UI paths must validate against the same schema and must not produce semantically different review formats.

The future workflow must:

- remain source-agnostic;
- support future cross-source and composition runs;
- preserve Phase 1 artifacts unchanged;
- append review records rather than edit source artifacts;
- work offline;
- permit deterministic regeneration of machine artifacts;
- permit multiple reviewers;
- retain later rubric versions without rewriting older reviews;
- expose artifact-hash mismatches before accepting a review;
- distinguish candidate review, slate review, and adjudication.

## Promotion and engineering use

Human Review Mode does not define automatic promotion thresholds. Review findings may support future decisions only when their coverage, sampling, rubric, reviewer context, and disagreement are visible.

A proposed recommendation change should cite:

- the machine pattern observed;
- the human-review pattern observed;
- review coverage and missing coverage;
- representative candidate and slate evidence;
- disagreement and uncertainty;
- the smallest engineering hypothesis consistent with that evidence;
- a plan to compare the proposed behavior against the frozen baseline.

A reviewer disagreement is not an instruction to weaken a gate. A false positive is not proof that a source is defective. An underfilled slate is not automatically worse than available filler. Human review should sharpen engineering questions, not bypass disciplined investigation.

## Open product decisions

The following decisions require product-owner approval before implementation:

1. Who may create candidate reviews, slate reviews, and adjudications?
2. Is Ken the authoritative reviewer during development, one reviewer among several, or the final adjudicator?
3. Are multiple independent reviewers required before a route, source, or strategy can be promoted?
4. Are candidate and slate reviews both mandatory, and for which kinds of investigation?
5. What review coverage is required before a source may be described as useful for an age band or route?
6. Should reviewer identity be named, pseudonymous, role-based, or configurable by environment?
7. How should material reviewer disagreement affect engineering priority and promotion decisions?
8. Will reader testing eventually supplement expert review, and how will reader feedback remain distinct from expert review?
9. Should selected and machine-rejected candidates both be eligible for routine review, or only for targeted disagreement studies?
10. What sampling strategy is acceptable when reviewing every candidate is impractical?
11. Which review fields are mandatory for an abstention or `insufficient_information` judgment?
12. Should reviewers see machine scores, terminal states, and prior reviews before making their initial judgment?
13. Is adjudication required for material disagreement, and who has authority to adjudicate?
14. How long should review records and reviewer identifiers be retained?
15. What minimum evidence is required before aggregated human judgments influence production experimentation?
16. How should review protocols distinguish fixture, replay, future live, and cross-source composition runs?

## Acceptance boundary for a future implementation

A future Human Review Mode should not be considered complete merely because it can save labels. It must demonstrate that:

- exact machine artifacts remain byte-for-byte unchanged;
- every review resolves to a specific artifact hash and review unit;
- unreviewed, draft, abstained, and completed states remain distinct;
- candidate and slate judgments remain distinct;
- multiple reviewers can disagree without data loss;
- reports preserve machine counts, human coverage, fit, concerns, and disagreement separately;
- old rubric records remain readable after a rubric update;
- offline review works without production or source access;
- no review action changes recommendation behavior;
- generated reports can be reproduced from canonical machine and review records.

Until those conditions are met and the open product decisions are resolved, Human Review Mode remains a specification rather than a certification or production feature.
