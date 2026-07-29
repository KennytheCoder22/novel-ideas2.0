# NovelIdeas Recommendation Philosophy

Recommendation systems accumulate thousands of implementation decisions over time. Without a durable philosophy, local optimizations such as returned count, code simplicity, passing tests, or endpoint success can collectively reduce recommendation quality even when each change appears reasonable in isolation. This document exists to preserve the product's intent across changing implementations and contributors.

## Purpose

This document is the constitution for recommendation work in NovelIdeas.

It is not an architecture audit. It does not prescribe a particular implementation, source, model, scoring formula, or software structure. Those things will change.

This document defines the values that should survive those changes. It describes what NovelIdeas is trying to accomplish, what counts as an improvement, and what future contributors must protect when they modify recommendation behavior.

The companion architecture audit records what exists at a particular point in time. This document governs how future work should be judged.

## NovelIdeas Engineering Constitution

These principles govern recommendation investigations, source integrations, and the promotion of new architectural concepts:

1. **NovelIdeas owns the conceptual model.**

   Sources do not define what NovelIdeas can understand. The platform defines its concepts and evaluates how faithfully each source can express them.

2. **Sources expose evidence, not behavior.**

   Source adapters retrieve, preserve, and normalize source evidence. Routing, eligibility, ranking, diversity, and final selection remain responsibilities of the shared recommendation architecture.

3. **Characterize before optimizing.**

   Determine what a source or subsystem actually contributes, where attrition occurs, and which contract boundary is responsible before attempting to improve its results.

4. **Characterization is itself a deliverable.**

   A reproducible account of capabilities, limitations, uncertainty, and failure modes is valuable even when an investigated source or strategy is never adopted.

5. **Architectural abstractions become shared only after repeated empirical validation.**

   A domain-specific model may be formally source-neutral without immediately becoming platform-wide architecture. Generalization must be earned by solving the same demonstrated problem across more than one domain.

6. **Every investigation should leave the architecture stronger, regardless of its implementation outcome.**

   Investigations should produce reusable evidence, contracts, fixtures, diagnostics, or clarified boundaries. A well-supported no-go decision can strengthen NovelIdeas as much as a production implementation.

Together, these principles define ownership, methodology, architectural promotion, and success. They apply independently of any particular source, media type, provider, or current implementation.

## The problem NovelIdeas is solving

NovelIdeas is not trying to identify books that share labels with things a reader has liked.

It is trying to understand what kind of reading experience the reader wants next and to find works that can credibly provide that experience.

A reader may respond to genre, but also to tone, pace, emotional intensity, character relationships, narrative structure, setting, maturity, format, novelty, familiarity, and current mood. Two books may share a genre while offering entirely different experiences. Two works in different genres may satisfy the same underlying taste.

The system therefore exists to translate incomplete, sometimes contradictory reader signals into a small set of recommendations that are:

- relevant to the reader's present intent;
- supported by evidence about the recommended work;
- appropriate for the reader and context;
- varied without becoming arbitrary;
- explainable enough to diagnose;
- trustworthy enough that the reader wants to continue using the product.

The objective is not maximum inventory exposure. It is useful discovery.

## The enduring recommendation lifecycle

Recommendation work should preserve the following conceptual stages, even if their implementation changes:

```text
Reader intent

↓

Taste understanding

↓

Source purpose and routing

↓

Retrieval

↓

Normalization

↓

Document-backed evidence

↓

Eligibility

↓

Selection

↓

Presentation
```

Each stage answers a different question. Combining stages may be computationally convenient, but their responsibilities and diagnostics should remain distinguishable.

## 1. Understand intent, not merely labels

Genre labels are useful clues. They are not a complete model of taste.

“Fantasy” can mean comfort, wonder, political intrigue, romantic tension, mythic scope, school adventure, dark horror, found family, or many other experiences. A recommendation that matches only the word “fantasy” may be technically related and personally wrong.

Reader intent should be inferred from the pattern of evidence:

- what the reader liked;
- what the reader disliked;
- what the reader skipped or treated as uncertain;
- which signals repeat;
- which signals conflict;
- which preferences appear strong, narrow, broad, or temporary;
- which experience the reader appears to want now.

No single swipe or tag should be treated as the whole person. Contradictory evidence should be represented as uncertainty, not silently forced into a false certainty.

The system should prefer a faithful, incomplete understanding over a confident misunderstanding.

## 2. Document evidence must outweigh query wording

A query explains why a source was asked a question. It does not prove that a returned record is a good answer.

The fact that a work was retrieved by a “Teen Fantasy” query is evidence about the retrieval route. It is not, by itself, evidence that the work is Teen Fantasy.

Recommendation evidence should come primarily from the work's own record:

- title and subtitle;
- description or synopsis;
- subjects and categories;
- audience and maturity metadata;
- creators and publisher;
- format and publication shape;
- series or edition identity;
- other authoritative, document-level metadata.

Query wording may support interpretation, provenance, or tie-breaking. It must not manufacture relevance that the document cannot substantiate.

This prevents circular reasoning:

> It is a good recommendation because the query returned it, and the query is considered good because it returned the recommendation.

When document evidence is weak, the honest conclusion may be uncertainty or underfill.

## 3. Routing, eligibility, and selection are different decisions

These stages must remain conceptually separate.

### Routing asks: where should we look?

Routing chooses sources, query families, or retrieval strategies that are competent for the reader's current need.

Routing is about opportunity. It should not guarantee acceptance.

### Eligibility asks: is this candidate acceptable?

Eligibility protects the recommendation set from candidates that are unsupported, unsafe, structurally wrong, misleading, or too weakly evidenced.

Eligibility is about minimum trust. It should not decide the entire ordering.

### Selection asks: which acceptable candidates form the best slate?

Selection balances relevance, strength of evidence, variety, duplicate pressure, series position, and other slate-level concerns.

Selection is about comparative value among acceptable choices.

A candidate may be correctly retrieved and correctly rejected. A candidate may pass eligibility and still not be selected. A source may be routed correctly and contribute nothing without any stage being defective.

Diagnostics must preserve these distinctions.

## 4. Relevance is more important than filling every slot

A recommendation slot is not valuable merely because it is occupied.

An underfilled slate of strong recommendations can be better than a full slate padded with weak, generic, repetitive, age-inappropriate, or poorly evidenced candidates.

The product should seek useful abundance, not count at any cost.

Fallback and recovery are appropriate when they broaden the search without abandoning the reader's intent. They are harmful when they redefine success as “return something.”

When the system underfills, it should be able to explain why:

- the source returned too little;
- the records lacked evidence;
- eligibility correctly rejected them;
- duplicate or series pressure reduced variety;
- a bounded retrieval attempt ended;
- the reader's profile was too sparse or contradictory;
- the available sources were not competent for the request.

Underfill is a diagnostic fact, not automatically a product failure.

## 5. Every source must have a purpose

No source should be expected to answer every reader profile.

A source is valuable when it has a clearly defined role and performs that role well. Its purpose may be broad bibliographic discovery, rich commercial metadata, comics, manga, bestseller authority, local availability, or something else.

For every source, recommendation work must answer three independent questions:

### Can the source answer?

This is a capability and transport question.

- Is an adapter available?
- Can the source be reached?
- Does it return a valid response?
- Does the response contain usable records?

### Should the source answer?

This is a routing and product-purpose question.

- Is the source appropriate for this reader, age band, format, and intent?
- Does the profile contain the evidence required to activate it?
- Would using the source add a meaningful capability?
- Is an intentional skip the correct behavior?

### Does the source answer well?

This is a competence and usefulness question.

- Are the results strongly relevant?
- Is the metadata sufficient to support eligibility?
- Are maturity and audience appropriate?
- Are duplicates, sequels, artifacts, or crossovers controlled?
- Do the final recommendations help the reader?

A source can answer technically but should not answer a particular profile. It can be correctly routed but answer poorly. It can return no results because an intentional policy prevented an inappropriate dispatch.

These outcomes must never be collapsed into a single “source works” or “source is broken” judgment.

## 6. Health, correctness, competence, and usefulness are independent

Recommendation quality cannot be represented by one green check mark.

At minimum, distinguish:

1. **Contract correctness** — deterministic behavior follows its declared rules.
2. **Transport health** — the source can be reached and returns a valid response.
3. **Routing correctness** — the source and retrieval strategy are appropriate for the profile.
4. **Source competence** — retrieval supplies records with the evidence and composition required by policy.
5. **Human usefulness** — the final recommendations are genuinely good choices for representative readers.

Passing one layer does not imply passing the next.

A mocked regression can prove policy without proving live health. A healthy endpoint can return poor results. Correct routing can encounter weak metadata. A technically eligible slate can still disappoint a human reviewer.

Certification and usefulness are not equivalent.

## 7. Eligibility exists to protect trust

Eligibility is not an obstacle to slate size. It is a trust boundary.

The system should not recommend a work unless there is enough evidence to believe:

- it is the kind of work the product claims it is;
- it fits the requested audience and maturity context;
- it has meaningful support from the reader's taste;
- it is not merely an artifact, reference work, duplicate, fragment, or misleading publication shape;
- any exception or fallback is explicit and bounded.

Relaxing eligibility can be appropriate when evidence shows that a rule is rejecting genuinely good candidates. It should not be relaxed merely because retrieval produced too few candidates.

The correct response to weak retrieval is usually to investigate retrieval quality before weakening the trust boundary.

## 8. Sources should contribute complementary strengths

The best retrieval strategy may combine sources or query families that optimize different dimensions.

One source may provide broad discovery. Another may provide stronger metadata. One query may have high precision but sequel pressure. Another may have wider recall but more crossover.

Mixtures should be evaluated by the quality of the final candidate pool, not by whether every constituent source contributes or whether one query wins in isolation.

Source diversity is useful when it increases meaningful discovery. It is not valuable when it introduces irrelevant variety or hides weak competence behind aggregate counts.

## 9. Diversity should improve the slate, not dilute it

Variety is a slate-level value. It helps avoid:

- repeated editions;
- multiple forms of the same work;
- excessive author concentration;
- sequel-heavy results;
- franchise domination;
- several candidates offering essentially the same reading experience.

But diversity must operate among sufficiently relevant candidates.

The system should not replace a strong recommendation with an unrelated one merely to make the slate look varied. Relevance and eligibility establish the candidate pool; diversity shapes the best slate within it.

## 10. Age and maturity are matters of trust

Age band, audience identity, and content maturity are related but not interchangeable.

A work can be accessible to adults without containing mature content. A work can be marketed broadly while being a poor fit for a younger reader. A metadata provider's maturity field may describe content rather than intended audience.

Future contributors must preserve these distinctions and avoid converting missing metadata into unwarranted certainty.

For younger readers especially, false confidence is more dangerous than honest underfill.

## 11. Recovery must remain bounded and accountable

Timeouts, retries, fallback queries, and emergency paths are part of recommendation behavior.

Recovery should:

- have a clear trigger;
- remain within a total time and request budget;
- preserve the reader's intent;
- avoid duplicating successful work;
- stop when further attempts are unlikely to help;
- record what it tried and why;
- identify whether the returned candidate was primary, recovered, fallback, or curated.

Recovery must not silently transform a source failure into an apparently normal result.

A fallback recommendation may be acceptable. Its provenance must remain visible.

## 12. External variability should be measured, not moralized

Live sources change. Search order, metadata, latency, quotas, cache state, and endpoint behavior can vary without a production-code change.

Variability should be characterized before it is “fixed.”

The system should distinguish:

- stable results arriving at variable speeds;
- variable ranking with stable membership;
- missing pages or records;
- local timeout behavior;
- retry-path differences;
- proxy or cache effects;
- genuine source drift.

A single empty run does not prove source incompetence. A single successful run does not prove stability.

## 13. Diagnostics must preserve evidence

Diagnostics are not decorative logging. They are part of the engineering contract.

A useful diagnostic record should allow a future contributor to reconstruct:

- what the reader signaled;
- what the system inferred;
- why a source was or was not activated;
- which exact requests were attempted;
- what each request returned;
- which records were removed at each stage;
- what evidence each candidate carried;
- why it passed or failed eligibility;
- why it was selected, deferred, deduplicated, or omitted;
- what finally reached the reader.

Pass/fail alone is insufficient.

Aggregate counts are insufficient when candidate lineage is lost.

Verbose data is also insufficient when it cannot answer a concrete causal question. Diagnostics should be structured around decisions, evidence, and transitions.

The goal is not to log everything. It is to preserve the facts needed to explain behavior without changing that behavior.

## 14. Recommendation changes require comparative evidence

A proposed change is not an improvement because it:

- returns more results;
- raises average scores;
- reduces visible failures;
- makes a regression pass;
- improves one profile;
- adds a popular title;
- simplifies the code;
- uses a more sophisticated model.

It is an improvement only when comparative evidence shows that it better serves readers without unacceptable regressions.

Evaluation should consider:

- representative profiles, not only the motivating example;
- final recommendation identity, not only intermediate counts;
- precision as well as recall;
- age and maturity safety;
- duplicate, sequel, and crossover pressure;
- stability across repeated runs;
- latency and request budgets;
- intentional skips and appropriate underfill;
- false positives and false negatives;
- source-specific purpose;
- human review of actual titles.

When a change modifies production behavior, the before-and-after recommendation outputs should be explicit.

## 15. Diagnose the narrowest failing layer

Recommendation systems are easy to “fix” at the wrong layer.

If a slate is empty, determine whether the cause is:

- reader-intent interpretation;
- source routing;
- query construction;
- transport;
- source filtering;
- normalization;
- evidence quality;
- scoring;
- final eligibility;
- deduplication;
- selection;
- rendering.

Do not change scoring to solve a transport problem. Do not weaken eligibility to solve weak retrieval. Do not rewrite queries to solve a rendering omission.

The narrowest correct intervention is usually the safest and most informative.

## 16. Observability changes and behavior changes are different work

Instrumentation should describe existing behavior without changing it.

Behavior changes should be evaluated as behavior changes, even when they appear small or are implemented inside diagnostic-looking code.

When improving observability:

- preserve recommendation outputs;
- preserve ordering;
- preserve source requests unless request tracing is the explicit subject;
- preserve policy decisions;
- prove lineage reconciliation;
- identify any unavoidable measurement effect.

When changing behavior:

- state the intended product outcome;
- identify the layer being changed;
- compare final outputs;
- retain diagnostics that explain the new decision;
- avoid bundling unrelated cleanup.

## 17. Historical baselines deserve respect, not worship

Existing behavior may be intentional, accidental, stale, or merely inherited.

A frozen baseline is valuable because it makes change measurable. It is not proof that the baseline is ideal.

When a regression conflicts with current behavior, determine:

- whether the expectation is stale;
- whether behavior drifted unintentionally;
- whether an intentional historical change already established a new baseline;
- whether the test protects a product value or only an implementation detail.

Tests should protect intended behavior. They should not force production behavior to conform to an obsolete assumption.

## 18. Simplicity is valuable only when it preserves meaning

Recommendation code often becomes complex because it has accumulated knowledge about real failure modes.

Complexity should be reduced when the same product meaning can be expressed more clearly and safely. It should not be removed merely because a rule looks inelegant.

Before refactoring, identify:

- which reader harm the rule prevents;
- which diagnostic distinction it preserves;
- which age band or source depends on it;
- which fallback or recovery path assumes it;
- which final outputs would change.

Architecture should become simpler by improving concepts and boundaries, not by deleting hard-earned behavior without evidence.

## 19. Human judgment remains part of certification

No deterministic suite can completely certify recommendation usefulness.

Human review is required to recognize:

- technically aligned but emotionally wrong recommendations;
- inappropriate crossover;
- weak or misleading series entry points;
- titles that are famous but poor fits;
- metadata that satisfies a rule while misrepresenting the reading experience;
- slates that are individually defensible but collectively monotonous;
- recommendations that a real reader would simply find unhelpful.

Human review should be structured and repeatable, not anecdotal. Reviewers should see the evidence and provenance, classify the candidates, and record uncertainty.

Automation should make this judgment easier to perform and compare. It should not pretend to eliminate it.

## 20. Good recommendations earn future trust

The immediate output is a list of works. The long-term product is reader trust.

A good recommendation tells the reader:

> The system understood enough about what I wanted, respected what I did not want, and showed me something worth considering.

One excellent discovery can be more valuable than ten plausible fillers. One obviously inappropriate result can undermine confidence in an otherwise strong slate.

Recommendation quality should therefore be evaluated not only by relevance in isolation, but by whether the slate makes the reader willing to trust the next recommendation.

## Common anti-patterns

Future contributors should treat the following as warning signs:

- using query text as the candidate's only relevance evidence;
- treating every empty result as a failed source;
- enabling every source for every profile;
- optimizing returned count without auditing precision;
- weakening a gate before investigating retrieval composition;
- equating endpoint health with recommendation competence;
- equating deterministic certification with human usefulness;
- hiding fallback or curated candidates inside normal results;
- merging routing, eligibility, and selection into one unexplained score;
- updating a regression merely because it fails;
- preserving a regression merely because it exists;
- evaluating only the motivating profile;
- accepting opaque behavior because the final count looks correct;
- describing underfill as failure without examining what was rejected;
- allowing instrumentation work to alter recommendation output.

## Evaluation framework for future changes

Before proposing a change, answer:

1. What reader problem is being observed?
2. At which lifecycle stage does the evidence show the problem originates?
3. Is the source capable of answering?
4. Should the source answer this profile?
5. Does it currently answer well?
6. What is the smallest appropriate intervention?
7. Which final recommendations change?
8. Which representative profiles could regress?
9. Does the change improve precision, recall, or both?
10. What happens to maturity, duplicate, sequel, crossover, and fallback pressure?
11. Does total source time remain bounded?
12. Can diagnostics explain every changed outcome?
13. What deterministic evidence is available?
14. What live-source evidence is available?
15. What human usefulness review is still required?

If these questions cannot be answered, the work is not ready for promotion.

## Standard for a good recommendation system

NovelIdeas is succeeding when it can:

- infer a nuanced reading intent from imperfect evidence;
- route only to sources with a reason to participate;
- retrieve candidates without confusing route alignment for relevance;
- require credible document-backed evidence;
- protect audience, maturity, and publication identity;
- prefer a smaller strong slate to irrelevant filler;
- balance relevance with meaningful variety;
- explain every important transition and rejection;
- distinguish deterministic correctness from live competence;
- expose uncertainty rather than conceal it;
- demonstrate improvement through representative comparison;
- produce recommendations that human reviewers and readers find genuinely useful.

Implementations will change. Sources will change. Models and APIs will change.

These standards should not.

**NovelIdeas optimizes for reader trust, not algorithmic confidence.**

The system should be willing to express honest uncertainty and return a smaller relevant slate rather than confidently present weak recommendations. Saying "I don't know enough yet" protects reader trust better than filling every slot with unsupported certainty.
