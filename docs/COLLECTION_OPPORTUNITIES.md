# Collection Opportunities

## Status

Collection Opportunities is a planned, non-operational architectural capability. This document preserves the boundary between student recommendations and future librarian-facing collection analysis. It does not define or implement an acquisition recommender, analytics pipeline, network integration, or production feature.

## Permanent design rules

> A deployment defines the candidate universe; the recommendation engine defines how candidates are evaluated.

> Global sources may inform acquisitions, but they may not populate Library Mode recommendations.

These rules are independent of implementation details and must survive future changes to sources, ranking, administration, analytics, or deployment architecture.

## Library Mode student promise

In a customized Library Mode deployment, every student-facing recommendation must come from the configured library's owned local collection.

The deployment boundary establishes `local_collection_only` as the student candidate-universe policy. The recommendation engine may normalize, evaluate, filter, score, rank, and select only within that universe. It must not widen the universe with Open Library, Google Books, ComicVine, Kitsu, NYT, or any other global bibliographic source.

An underfilled but relevant local slate is preferable to filling student slots with titles the configured library does not own. A zero-result state must remain distinguishable from global-source fallback.

## Librarian-facing purpose

Collection Opportunities is a future librarian-facing capability for identifying evidence-backed weaknesses in an owned collection. It may eventually compare anonymous, aggregated reader demand with collection coverage and global bibliographic evidence to suggest titles a librarian may wish to consider acquiring.

It is not part of the student recommendation path. It must be hidden from students and ordinary users. Suggestions are private administrative evidence, not recommendations presented to patrons.

## Three separate concepts

### 1. Existing collection recommendation

An existing collection recommendation selects a title already owned by the configured library for a student profile. Its candidate universe is local and closed. This is the only category permitted in customized Library Mode student results.

### 2. Collection-gap analysis

Collection-gap analysis examines aggregate patterns indicating that the owned collection may serve some reader intents poorly. It describes a possible weakness; it does not identify a purchase automatically and does not modify student recommendations.

### 3. Acquisition suggestion

An acquisition suggestion is an advisory librarian-facing record proposing that a specific work may address a documented collection gap. It may use global bibliographic information, but it remains outside the student candidate universe and requires librarian judgment.

These concepts must have separate records, diagnostics, permissions, and presentation. A title appearing in an acquisition suggestion does not make it eligible for student recommendation until it is owned, represented in the configured local collection, and admitted through the normal local-collection path.

## Potential future evidence

Future collection-gap analysis may consider evidence such as:

- repeated local underfill for a reader-intent family;
- underserved combinations of genre, tone, theme, maturity, format, or character dynamics;
- repeated reuse of a small number of titles because the local collection lacks alternatives;
- `Already Read` saturation within a relevant local pool;
- aggregate recommendation rejection patterns;
- collection coverage gaps identified against documented reader demand;
- recurring slate imbalance, series pressure, or format scarcity;
- persistent local zero-result states where global bibliographic evidence suggests plausible works exist.

No single signal proves a collection gap. Evidence should retain age band, intent family, time window, sample size, and uncertainty without exposing individual patron history.

## Privacy principles

Collection Opportunities must be designed around aggregate rather than individual analysis:

- acquisition reports must not identify patrons or expose patron-level histories;
- analysis must use minimum sample thresholds before surfacing a pattern;
- sparse or unique combinations must be suppressed when they could identify a reader;
- retention must be configurable and limited to what collection analysis needs;
- patron-level raw events must not become a permanent acquisition-recommendation store;
- reports should explain their aggregation window and threshold;
- librarian exports must preserve the same privacy boundary;
- disabling the future capability must not affect student recommendation eligibility.

The initial implementation must not begin collecting data merely because this architectural placeholder exists.

## Librarian control

Future suggestions are advisory only. The librarian remains the collection-development authority. A future workflow should support dispositions including:

- `purchase`;
- `consider_later`;
- `already_ordered`;
- `not_appropriate`;
- `collection_sufficient`;
- `dismiss_do_not_suggest_again`.

A disposition must not silently become student preference evidence or modify recommendation ranking. Dismissal and suppression policy will require explicit retention and audit decisions before implementation.

## Deployment capability placeholder

The isolated typed placeholder in `constants/deploymentCapabilities.ts` expresses:

- `global` and `customized_library` deployment kinds;
- `global_sources_allowed` and `local_collection_only` student candidate policies;
- Collection Opportunities configured as `enabled` or `disabled`;
- an immutable `planned_not_implemented` implementation status;
- `operational: false`;
- `affectsStudentCandidateUniverse: false`.

The placeholder is not wired into source routing, recommendation inputs, configuration persistence, or production selection. Its pure policy description exists to make the permanent boundary testable before implementation.

## Intended administrative placement

The existing desktop web administration route is a library customization surface: it manages library branding, collection upload, recommendation-source configuration, decks, and QR export. A non-interactive `Collection Opportunities` card is placed beside collection upload because that is the narrowest existing librarian-facing location.

The card is labeled `Planned`, contains no button or control, persists no setting, collects no data, and initiates no request. It is not rendered in student or ordinary-user screens.

## Explicit non-goals for the first implementation

A first implementation must not attempt to provide all possible collection intelligence. Its non-goals include:

- automatic purchasing or ordering;
- autonomous collection-development decisions;
- patron-identifiable or patron-level acquisition reports;
- changing student recommendation routing, eligibility, scoring, ranking, or selection;
- adding global-source titles to Library Mode student results;
- a new general analytics platform;
- real-time behavioral surveillance;
- predicting demand for individual patrons;
- replacing librarian professional judgment;
- vendor integration or pricing optimization;
- budget allocation;
- inventory, circulation, weeding, or holds management;
- broad renaming or refactoring of existing Local Library concepts;
- treating repeated underfill as proof that a purchase is required.

The earliest functional work should first define privacy thresholds, aggregate evidence contracts, librarian authority, auditability, and a read-only evaluation method. Those decisions are outside this placeholder task.

## Architectural invariants

Any future implementation must preserve:

1. A customized library deployment has a `local_collection_only` student candidate universe.
2. Enabling, disabling, or describing Collection Opportunities cannot alter that universe.
3. Global mode candidate behavior remains independent of this capability.
4. Global-source results used for private acquisition analysis never enter student Library Mode results.
5. A collection-gap observation is not an acquisition suggestion.
6. An acquisition suggestion is not an owned item.
7. Only owned local-collection items may become Library Mode student candidates.
8. Privacy thresholds and aggregate evidence are required before librarian-facing analysis is surfaced.
9. Librarian dispositions are advisory workflow records, not recommendation-engine signals.
10. Planned UI and configuration must remain visibly non-operational until a separately approved implementation exists.
