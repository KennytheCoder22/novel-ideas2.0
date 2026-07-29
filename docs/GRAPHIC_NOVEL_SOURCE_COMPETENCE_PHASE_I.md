# Graphic Novel Source Competence Phase I — GCD Characterization

## Status

Graphic Novel Source Competence Phase I is **complete at the approved fixture-first contract layer**.

- Branch: `codex/graphic-novel-source-evaluation`
- Phase I baseline: `32e22086707c4acc67a7e442499dc8348500178f`
- Inventory: `f7cd2fe49d1b6b9ae5639475bd812068e67ea7e7`
- Pre-characterization gates: `2179c4c3c89d48a1488b6929aeb2ae48c23d7179`
- Governing philosophy amendment: `f38760b4c826a4245ca27d8053d5510dc9ac0e97`
- Characterization mode: deterministic synthetic fixture replay
- Live GCD calls: none
- Production GCD adapter: absent
- Production recommendation behavior changed: no
- Comparative conclusion: none
- Human Review: not performed

The completion claim is deliberately narrow:

> GCD's documented capabilities, limitations, operational characteristics, and ability to supply evidence to the source-neutral reading-unit contract have been deterministically characterized using frozen synthetic evidence.

This phase does not establish live metadata composition, recommendation usefulness, route ownership, or superiority over ComicVine.

## Governing definition of done

Graphic Novel Source Competence Phase I is complete when GCD's capabilities, limitations, operational characteristics, and compliance with the source-neutral reading-unit contract have been deterministically characterized using frozen evidence, without changing production behavior or drawing comparative conclusions.

The fixture-first scope satisfies that definition as follows:

| Requirement | Result |
| --- | --- |
| Capabilities characterized | Yes, for the fields and access surfaces documented by the current official API and represented by frozen synthetic fixtures. |
| Limitations characterized | Yes, including discovery, schema stability, audience/maturity authority, cover rights, and absent production integration. |
| Operational characteristics characterized | Yes, at the documented-contract layer; live latency, numeric rate allowance, and response stability remain unmeasured. |
| Reading-unit compliance characterized | Yes, across the approved 13 source-neutral identity boundaries. |
| Frozen evidence | Yes; deterministic summary is committed and replay-verifiable. |
| Production behavior unchanged | Yes; production files are hash-guarded by the harness. |
| Comparative conclusion avoided | Yes; no ComicVine artifact is consumed. |

## Evidence boundary

The evidence ladder matters here:

1. **Deterministic contract evidence:** complete for the frozen synthetic cases.
2. **Frozen characterization:** complete for the fixture-first cases.
3. **Representative source comparison:** not begun.
4. **Live-source observation:** not performed and not authorized by the pre-characterization gate.
5. **Human review:** not performed.
6. **Production telemetry:** unavailable because no production GCD adapter exists.

Synthetic evidence proves that the diagnostic mapper preserves supported distinctions when the corresponding source evidence is present. It does not prove how often live GCD records contain those fields or whether returned works would be useful recommendations.

## Method

The characterization uses three independent records:

1. the official GCD API documentation as the operational contract observation;
2. wholly synthetic, GCD-shaped fixture responses as source evidence;
3. the approved source-neutral reading-unit fixture catalog as the identity contract.

The runner:

```text
frozen characterization profile
        ↓
synthetic GCD response envelope
        ↓
structural validation
        ↓
source-record identity
        ↓
publication identity
        ↓
readable-work identity
        ↓
reading-unit identity
        ↓
recommendation identity / supporting-only boundary
        ↓
metadata coverage and ambiguity diagnostics
        ↓
frozen deterministic artifact
```

It does not invoke Taste Profile, production routing, a source adapter, scoring, eligibility, ranking, selection, or rendering. Every artifact reports the production lifecycle state as `adapter_not_implemented` rather than implying that fixture normalization is production dispatch.

## Frozen profile matrix

The six representative profile purposes come directly from the approved inventory. Two operational controls distinguish valid empty and invalid response shapes.

| Profile | Raw | Normalized | Recommendation-capable identities | Ambiguous | Characterization outcome |
| --- | ---: | ---: | ---: | ---: | --- |
| Adult speculative ensemble | 8 | 8 | 6 | 0 | `classified_complete` |
| Adult horror/mystery | 4 | 4 | 3 | 0 | `classified_complete_with_metadata_limits` |
| Teen fantasy/adventure | 4 | 4 | 3 | 0 | `identity_preserved_audience_unsupported` |
| Teen superhero/identity | 4 | 4 | 2 | 1 | `classified_with_ambiguity_and_audience_limit` |
| Preteen humor/adventure | 2 | 2 | 2 | 0 | `identity_preserved_audience_and_maturity_unsupported` |
| Teen manga volume | 2 | 2 | 2 | 0 | `classified_complete_audience_unsupported` |
| Valid empty control | 0 | 0 | 0 | 0 | `valid_empty_response` |
| Invalid response control | 0 | 0 | 0 | 0 | `response_invalid` |

“Recommendation-capable” is an identity classification only. It means the record describes a bounded reading experience rather than a series container, reference artifact, or unresolved shape. It does not mean the record is eligible or useful for the representative reader.

## Source-neutral identity compliance

### Source record identity

**Deterministically satisfied.**

Each source record retains:

- distinct source namespace `gcd`;
- native record ID;
- source-record type;
- raw canonical hash;
- returned order.

Cross-source identity is never inferred, and a GCD source record is never relabeled ComicVine.

### Publication identity

**Deterministically satisfied when publication evidence is present.**

The fixtures preserve:

- publication format and type;
- ISBN-like external identifiers;
- publisher, indicia publisher, and brand as separate fields;
- language;
- variant-cover designation;
- printing designation;
- typed key and on-sale dates.

Variant covers, bindings, and editions retain distinct publication identities.

### Readable-work identity

**Conditionally satisfied.**

The mapper can identify a shared readable work when evidence includes:

- an explicit variant relationship; or
- the same explicit constituent issue set for multiple collected editions.

It does not merge on title alone. Two synthetic `Night Garden` series with different series IDs, creators, publishers, and eras remain distinct.

The contract still fails closed when constituent or relationship evidence is absent.

### Reading-unit identity

**Deterministically characterized across the approved boundaries.**

Frozen cases distinguish:

- single issue;
- variant publication of the same issue;
- collected volume;
- hardcover and paperback manifestations of one collected reading unit;
- standalone graphic work;
- graphic memoir;
- manga volume;
- omnibus;
- boxed set;
- supporting reference artifact;
- ambiguous issue-versus-collection shape.

A trade is not collapsed into one of its component issues. An omnibus is not collapsed into one of its contained volumes. A reference artifact is supporting-only. An unresolved issue/collection shape is reported as ambiguous rather than guessed.

### Recommendation identity

**Deterministically characterized as an identity collapse, not a selection decision.**

The frozen cases prove:

- base issue and cover variant → distinct publications, same reading unit and recommendation identity;
- hardcover and paperback with the same explicit constituents → distinct publications, same reading unit and recommendation identity;
- trade versus component issue → distinct recommendation identities;
- omnibus versus contained volume → distinct recommendation identities;
- similarly titled unrelated series → distinct recommendation identities.

The harness never chooses a preferred publication representative. That remains future shared selection behavior.

## Identity edge cases preserved

| Edge case | Frozen result |
| --- | --- |
| Missing volume number | Raw absence preserved; sequence order remains `unknown`; returned order is not used as series order. |
| Conflicting dates | All typed dates remain attached to their publications; the equivalent-readable-work group records the conflict. |
| Incomplete creator credits | Partial credit is retained with `creatorCreditsComplete: false`; it cannot establish creator equality. |
| Ambiguous issue versus collection | Classified `ambiguous_reading_unit`, low confidence, no recommendation identity. |
| Same title, unrelated series | Distinct series IDs are diagnosed; automatic merge is false. |
| Variant cover | Distinct source and publication identities; shared readable/reading-unit/recommendation identity. |
| Binding editions | Distinct publication identities; shared readable/reading-unit/recommendation identity only with explicit constituent agreement. |

## Metadata competence profile

### Strongly expressible in the reviewed contract

The official API documentation says series responses contain main series data plus issue IDs and descriptors, and issue responses include story and credit information. The frozen mapper demonstrates preservation of:

- stable native series and issue identifiers;
- issue numbering;
- series start year and publisher context;
- publication type and format when supplied;
- stories and sequence;
- creator names and roles when supplied;
- variants and explicit constituents when supplied;
- typed publication dates;
- language and external identifiers when supplied.

### Not established as authoritative by the reviewed API contract

The fixture corpus intentionally records zero authoritative coverage for:

- patron age/audience;
- maturity/content safety;
- recommendation genre;
- themes or tone;
- narrative synopsis.

Story titles, creator credits, characters, or descriptors may help future evidence extraction, but this phase does not promote them into authoritative audience, maturity, or taste evidence.

### Profile-specific implications

- Adult profiles can be identity-characterized without an audience label, but usefulness remains unreviewed.
- Teen profiles preserve reading-unit identity but lack documented Teen authority.
- The Preteen profile lacks both audience and maturity authority and cannot support younger-reader eligibility on identity evidence alone.
- Manga format and volume ordering can be represented when explicitly supplied, but Teen suitability remains unsupported.
- An inaccessible middle issue can be identified by number, but whether it should be withheld belongs to shared eligibility—not the GCD mapper.

## Operational characterization

### Documented API surface

The current official documentation exposes:

- series listing;
- series-name search;
- series-name plus start-year filtering;
- series lookup by ID;
- issue lookup by ID;
- series-name plus issue-number lookup, optionally by key-date year;
- weekly on-sale issue lookup.

A broad relevance-ranked recommendation search is not documented. This is a material competence limitation: a source can have excellent identity data without providing a suitable discovery surface.

### Stability

The API wiki states that endpoint URLs are stable but supplied fields and response formats are not stable. Any future live capture therefore needs:

- observed schema version or schema hash;
- raw response hash;
- source URL and capture time;
- explicit field-presence diagnostics;
- failure on unrecognized response shapes;
- fixture regeneration through review rather than silent compatibility coercion.

### Authentication and rate limits

The documentation states:

- anonymous access is currently available with hourly limits;
- authenticated access receives larger limits;
- anonymous access may be disabled;
- Basic and session authentication are supported.

The reviewed documentation does not publish a stable numeric allowance for the intended workload. Live characterization and production planning therefore remain blocked on an accepted access and rate arrangement.

### Pagination, retries, latency, and replay

No live behavior was exercised. This phase does not claim:

- pagination completeness;
- latency bounds;
- timeout behavior;
- retry semantics;
- rate-limit response shape;
- stable returned ordering;
- cache behavior;
- live replayability.

Fixture replay is deterministic and makes no network request.

## Licensing and rights compliance

This phase complies with the approved gate by using:

- wholly synthetic fixture metadata;
- no captured GCD response body;
- no live entity URL;
- no cover URL;
- no cover image;
- no public production use.

The artifacts record the official schema basis and explicitly state that live metadata was not captured.

Future real GCD fixtures must add source URL, capture date, CC BY-SA 4.0 notice and link, modification status, and reviewed ShareAlike treatment. Cover files remain excluded because GCD states that cover rights belong to the respective copyright holders.

## Observations, interpretations, and conclusions

### Observations

1. The documented API is series- and issue-centered rather than recommendation-search centered.
2. It documents issue stories and credits and series issue IDs/descriptors.
3. Endpoint URLs are described as stable; fields and formats are described as unstable.
4. Authentication and access policy may change.
5. The synthetic fixtures map deterministically into all five approved identity layers.
6. The frozen mapper preserves variants, constituent collections, binding editions, ordering uncertainty, date disagreement, incomplete credits, and ambiguous shape.
7. No production GCD adapter exists.
8. No authoritative audience, maturity, summary, genre, or theme fields were established by this review.

### Interpretations

1. GCD appears structurally promising as an identity and constituent-evidence source.
2. GCD's discovery surface may be insufficient for broad recommendation retrieval without an additional supported access pattern.
3. GCD metadata alone, as currently documented, appears insufficient to establish younger-reader eligibility.
4. Schema instability makes deterministic capture and explicit versioning mandatory for any live phase.

These are interpretations of documented capability and synthetic contract behavior, not measurements of live result composition.

### Conclusions supported by Phase I

1. A fixture-only GCD characterizer can satisfy the source-neutral identity contract when required evidence is present.
2. Ambiguity can be preserved without source-specific recommendation heuristics.
3. GCD should remain a distinct source identity.
4. Production restoration is not justified.
5. Source comparison is not yet justified because an equivalent independently frozen ComicVine reading-unit characterization has not been consumed.
6. Human recommendation quality, route ownership, and source preference remain unknown.

### Questions intentionally unresolved

- How complete are these fields in representative live GCD records?
- Does the live API return publication format, constituents, variants, and creator roles consistently?
- What request strategy, if any, supports broad reader-intent discovery with GCD's approval?
- What are current numeric rate limits and acceptable study volume?
- How should authentication be provisioned for reproducible institutional use?
- Can GCD supply or derive defensible audience and maturity evidence?
- Would humans consider any resulting slate useful?
- How does GCD compare with ComicVine on equivalent frozen profiles?

## Reproducible workflow

Run the deterministic characterization and verify the committed frozen artifact:

```powershell
node scripts/source-competence/run-gcd-characterization.mjs --mode replay --profile all --verify-no-network --verify-determinism --verify-frozen
```

Run focused regressions:

```powershell
node scripts/source-competence/run-gcd-characterization-regressions.mjs
```

Generated working artifacts are written beneath:

`artifacts/source-competence/graphic-novel-source-competence-phase1/`

The committed frozen evidence is:

`scripts/source-competence/frozen/gcd-phase1-summary.json`

## Future phases not begun

This report does not authorize:

- live GCD requests;
- production adapter implementation;
- GCD routing;
- recommendation scoring or eligibility changes;
- ComicVine comparison;
- cross-source merge decisions;
- source preference or route ownership;
- cover display;
- generalized platform-wide promotion of the reading-unit model.

The next valid checkpoint is independent ComicVine characterization under the same reading-unit contract or a separately approved live GCD evidence gate. Comparative evidence begins only after both exact profile artifacts exist.

## Official references

- GCD API documentation: <https://github.com/GrandComicsDatabase/gcd-django/wiki/API>
- GCD API implementation repository: <https://github.com/GrandComicsDatabase/gcd-django/tree/beta/apps/api>
- GCD database and cover-rights notice: <https://www.comics.org/issue/1622223/cover/4/>
- CC BY-SA 4.0 legal code: <https://creativecommons.org/licenses/by-sa/4.0/legalcode.en>