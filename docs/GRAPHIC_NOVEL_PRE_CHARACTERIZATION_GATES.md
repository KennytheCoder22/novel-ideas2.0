# Graphic-Novel Source Evaluation: Pre-Characterization Gates

## Status and scope

This design record completes the licensing/operational-suitability and
source-neutral identity gates required before independent GCD
characterization.

- Branch: `codex/graphic-novel-source-evaluation`
- Phase I baseline: `32e22086707c4acc67a7e442499dc8348500178f`
- Governing inventory: `docs/GRAPHIC_NOVEL_SOURCE_EVALUATION_INVENTORY_AND_CONTRACT.md`
- Inventory commit: `f7cd2fe49d1b6b9ae5639475bd812068e67ea7e7`
- Terms reviewed: 2026-07-29
- Production behavior changed: no
- Existing harness changed: no
- Live GCD requests made: no

This is an engineering assessment of published terms, not legal advice. A
published license can establish some permissions and duties, but it cannot
resolve facts such as NovelIdeas's eventual business model, whether a
particular output is an adaptation, or whether a third party owns rights in
an image. Those questions are called out rather than guessed.

## Decision vocabulary

| Decision | Meaning |
| --- | --- |
| **Go with controls** | Published terms support the use if the listed controls are maintained. |
| **Conditional** | The use may be supportable, but a material question is not answered by the published terms. |
| **No-go on published terms** | The stated use conflicts with a published restriction unless separate permission is obtained. |
| **Out of scope** | This gate does not authorize the use. |

## Gate 1: licensing and operational suitability

### Published-source facts

#### ComicVine

The current ComicVine API page says:

- an account-specific API key is required;
- API use is strictly non-commercial, and commercial use may cause key
  revocation;
- the supported rate is 200 requests per resource per hour, with additional
  velocity detection;
- caching is suggested to avoid duplicate requests;
- pages using the data must link back to ComicVine;
- users must not build a competing editable data product;
- data must not be redistributed in another form, edited, manipulated, or
  reproduced on another medium; and
- access can be refused.

The same page does not publish a separate license for cover images, a cache
retention period, a durable-database right, or a definition of
“commercial.” The suggestion to cache responses is therefore evidence for
operational caching, not blanket permission to publish or archive a copy of
the database.

#### GCD

GCD states on its public pages that its database, schema, and distribution
format are licensed under CC BY-SA 4.0 except where noted. It separately
states that cover thumbnails are used only for identification and that all
rights in cover images remain with their respective copyright holders.

The current GCD API wiki describes the REST API as initial. Endpoint URLs
are intended to be stable, but fields and response formats are not. It says
anonymous requests currently receive hourly limits, authenticated requests
receive larger limits, anonymous access may later be disabled, and Basic
and session authentication are supported. The documented discovery surface
is oriented around series and issue lookup; it is not a guaranteed
recommendation-search contract.

CC BY-SA 4.0 permits reproduction, sharing, and adaptation of licensed
material, including commercial use, subject to attribution and ShareAlike
conditions. When licensed material is shared, supplied attribution,
copyright and license notices, a source link, and modification notices must
be retained. Shared adapted material must use the same license elements or a
compatible license. The license contains a specific database-rights clause
for extraction and reuse of substantial portions. These observations do
not decide whether a particular NovelIdeas output is adapted material or a
substantial database portion.

### Suitability matrix

| Use | ComicVine | GCD |
| --- | --- | --- |
| Development | **Go with controls** for non-commercial development using a per-site key, rate/velocity limits, linkback where data is displayed, and no competing data product. Synthetic fixtures remain preferred. | **Go with controls** for metadata. Preserve provenance, respect API limits, and expect schema drift. No cover copying. |
| Deterministic certification fixtures | **Go** for wholly synthetic fixtures. **Conditional** for captured real responses: the redistribution restriction does not establish permission to commit or distribute payloads. Written permission is required before real ComicVine payloads enter the repository. | **Go with controls** for synthetic fixtures. Real metadata fixtures are possible under CC BY-SA if attribution, license, source, and modification notices travel with them; exclude covers. Legal review should define when a fixture or derived corpus invokes ShareAlike. |
| Public production recommendations | **Conditional and not authorized by this gate.** A demonstrably non-commercial service may fit the stated restriction, but public reproduction, durable data use, and the long-term deployment model need written clarification. | **Conditional.** Metadata licensing is compatible in principle, including commercial use, but attribution/ShareAlike implementation, API operational permission, schema stability, and non-database rights must be resolved first. |
| Cached metadata | **Conditional.** Short-lived operational caching is expressly suggested. Retention, scope, access, transformation, and durable persistence are not defined. Do not treat that suggestion as permission for a public or permanent mirror. | **Go with controls.** Preserve provenance and license metadata. Sharing a cache or derived database may create attribution and ShareAlike obligations. |
| Persisted metadata | **No-go pending written permission** for a durable reusable corpus or redistributed fixture archive. Minimal internal identifiers and derived diagnostics require counsel/rights-holder confirmation if retained long term. | **Conditional go.** CC BY-SA supports reproduction and reuse, but persistence design must carry provenance and compliance metadata. Public or substantial derived datasets require a reviewed ShareAlike plan. |
| Displayed covers | **No-go pending separate clarification.** The API terms do not grant cover-image rights, and their reproduction restriction counsels against storing, proxying, or redistributing cover files. A remote URL is not proof that display is licensed. | **No-go from the database license alone.** GCD expressly excludes cover rights and describes thumbnails as identification use. Obtain a separate rights basis before storing, proxying, or displaying them. |
| Librarian-facing diagnostics | **Go** for synthetic certification evidence. **Conditional** for private displays of minimal real metadata with linkback. Do not export raw payloads or create a redistributable data product without permission. | **Go with controls** for metadata-only diagnostics that retain provenance. If shared outside the operating institution, include the applicable attribution/license record and assess ShareAlike. Exclude cover binaries. |
| Future commercial operation | **No-go on published terms.** A separate commercial license or written permission is required. | **Conditional go in principle** because CC BY-SA has no non-commercial restriction. Compliance, API access, attribution, ShareAlike boundaries, and third-party rights still require review. |
| Institutionally funded operation | **Conditional.** The terms do not define whether grants, public funding, vendor contracts, paid hosting, or institutional fees make a deployment commercial. Current free access does not answer the long-term question. Obtain written clarification before relying on ComicVine. | **Conditional go in principle**, subject to the same CC BY-SA compliance and operational controls as any public deployment. |

### Attribution and redistribution controls

#### ComicVine

1. Keep API credentials server-side and unique to NovelIdeas.
2. Record request counts by resource and enforce both hourly and velocity
   controls before any live study.
3. Link to ComicVine on every surface that displays its data.
4. Do not commit captured response bodies or cover binaries.
5. Certification fixtures must be synthetic until ComicVine grants written
   permission for captured data.
6. Do not market a ComicVine-backed deployment as ComicVine-sponsored.
7. Before public production reliance, obtain written answers covering public
   display, transformations, diagnostic persistence, fixtures, caching
   duration, cover URLs, and the intended funding model.

#### GCD

1. Every captured metadata artifact must record the GCD source URL, capture
   date, CC BY-SA 4.0 notice and URL, and whether fields were modified.
2. Preserve source IDs and raw hashes even when the raw body cannot or should
   not be distributed.
3. Keep cover URLs and binaries out of the fixture-first study.
4. Store licensing/provenance beside the artifact, not only in a separate
   document.
5. Before public output or a durable derived database, review whether the
   output is adapted material or includes a substantial portion of the
   database and define the corresponding ShareAlike boundary.
6. Treat current anonymous API access as revocable operational convenience,
   not a stable production contract.

### Unresolved legal and rights-holder questions

The following require counsel or written source-owner clarification:

1. Does ComicVine consider a free, grant-funded, institution-funded,
   sponsored, or contract-hosted NovelIdeas deployment “commercial”?
2. May ComicVine metadata be transformed into recommendation cards,
   librarian diagnostics, Human Review records, and long-lived derived
   evidence?
3. What cache duration and persistence scope does ComicVine's caching
   suggestion permit?
4. May captured ComicVine payloads be stored privately, committed as test
   fixtures, or shared with project contributors?
5. May ComicVine cover URLs be hotlinked, and may cover files be proxied or
   cached?
6. For GCD, which NovelIdeas artifacts constitute adapted material or a
   substantial database extraction for ShareAlike purposes?
7. What attribution placement is reasonable for patron cards, librarian
   diagnostics, fixtures, exports, and comparison artifacts?
8. What separate rights basis, if any, permits cover display from either
   source?
9. Does GCD approve the expected discovery workload and provide a stable
   authenticated access arrangement for repeated characterization?

### Operational risk summary

| Risk | ComicVine | GCD |
| --- | --- | --- |
| Authentication | Per-site API key required; access may be refused. | Anonymous access currently possible but may be disabled; Basic/session authentication documented. |
| Rate limiting | 200 requests per resource per hour plus velocity controls. | Hourly limits vary by authentication; exact production allowance is not a fixed contract in the wiki. |
| Pagination/discovery | Search supports resource filters and offsets, but current NovelIdeas uses issue-only queries and assumes more rows than the published search documentation promises. | Series/issue oriented API does not itself establish broad recommendation discovery. |
| Schema stability | Structured resource fields are documented, but no versioned stability guarantee was found. | Endpoint URLs described as stable; fields and formats explicitly unstable. |
| Retry/replay | Current adapter has no retry or replay store. | No NovelIdeas adapter exists; replay design must be fixture-first. |
| Persistence | Operational caching suggested, durable redistribution restricted. | Metadata persistence supportable under CC BY-SA controls; covers excluded. |
| Long-term deployment | Explicit non-commercial restriction is a material blocker. | License is more deployment-compatible, but operational and ShareAlike design remain. |

## Gate 2: source-neutral reading-unit identity contract

### Design objective

Identity must describe what a record *is* before recommendation policy
decides whether it is suitable. Query wording, source score, popularity,
reader age, maturity, and route membership are not identity evidence.

The model has five layers. Cross-source matching creates typed equivalence
assertions between layers; it never erases source provenance.

### Layered entities

#### 1. Source record identity

The immutable fact that a source returned a particular record.

Required:

- source namespace;
- source-native record type;
- source-native ID;
- source URL when available;
- capture/schema version;
- raw or canonicalized-record hash.

Two source records are identical only when source namespace, record type,
and native ID match. Cross-source records are never the same source record.

#### 2. Publication identity

A concrete manifestation that can differ by binding, edition, printing,
language, market, ISBN, or cover variant.

Fields include:

- publication ID;
- format/binding;
- edition and printing statements;
- variant-cover designation;
- identifiers;
- publisher and imprint;
- typed dates (`cover`, `on_sale`, `publication`, `copyright`);
- language and market;
- parent/constituent relationships;
- evidence and confidence.

Hardcover and paperback manifestations are distinct publication identities.
A second printing and a variant cover are also distinct publication
identities even when their readable content is unchanged.

#### 3. Readable-work identity

The content unit a patron can meaningfully read. Kinds:

- `single_issue`;
- `collected_volume` (including trade paperback and hardcover collection);
- `standalone_graphic_work`;
- `manga_volume`;
- `omnibus`;
- `anthology`;
- `boxed_set`;
- `ambiguous_reading_unit`.

A readable work records its exact or asserted constituent works, stories, or
issues; creators with roles; series membership; sequence; title; language;
and identity evidence. An omnibus is not the same readable work as each
contained volume. A collection is not the same readable work as each
constituent issue, even though the relationships are recorded.

#### 4. Series identity

A continuing publication or narrative sequence, with enough context to
separate similarly named and restarted series.

Fields include normalized title, publisher/imprint, creators where
available, start era/date, language/market, and source evidence. Series
membership uses:

- raw sequence label;
- parsed ordinal when safe;
- volume designation;
- entry kind;
- confidence.

A series is supporting metadata, not a patron-facing recommendation by
default.

#### 5. Recommendation identity

The duplicate-suppression identity presented as one recommendation choice.
It normally points to one readable work and one chosen publication
representative.

Hardcover, paperback, later printings, and cover variants of the same
content collapse to one recommendation identity. An omnibus and its
constituent trade remain distinct recommendation identities because their
reading scope materially differs. Selection may choose the best publication
representative, but it must preserve every collapsed source and publication
link in diagnostics.

### Patron-facing versus supporting entities

| Entity | Patron-facing capability |
| --- | --- |
| Single issue | Potentially eligible when shared policy accepts the entry point; identity alone does not make it eligible. |
| Trade, hardcover collection, graphic novel, manga volume, omnibus, anthology | Potentially eligible readable works. |
| Boxed set | Potentially eligible only when represented as an obtainable, sufficiently described unit; otherwise a grouping relation. |
| Story inside an issue or anthology | Supporting metadata unless independently published as a readable unit. |
| Series container | Supporting metadata. |
| Variant cover, printing, binding, edition | Publication choices supporting one readable-work/recommendation identity; not separate recommendations by themselves. |
| Creator, publisher, character, franchise | Supporting entities/signals. |

“Potentially eligible” is deliberately weaker than “eligible.” Audience,
maturity, relevance, entry-point quality, availability, and selection policy
remain downstream shared-architecture decisions.

### Relationship vocabulary

- `manifestation_of`: publication to readable work;
- `member_of_series`: readable work to series;
- `contains`: collection/omnibus/anthology/box to constituent units;
- `contained_by`: inverse of `contains`;
- `reprints`: publication or readable work to earlier content;
- `variant_of`: variant publication to base publication;
- `printing_of`: printing to publication family;
- `edition_of`: edition to readable work;
- `overlaps`: partial but non-equivalent content;
- `same_readable_work_as`: evidence-backed cross-source equivalence;
- `same_recommendation_as`: downstream collapse equivalence;
- `unresolved_relation`: evidence exists but is insufficient.

Relations are directional where appropriate and retain evidence,
provenance, and confidence.

### Invariants

1. Every recommendation identity points to exactly one readable-work
   identity and at least one publication representation.
2. Every assertion retains all contributing source-record identities.
3. Unknown is not equal. Missing values never create a match.
4. Title similarity alone never authorizes a cross-source merge.
5. Query text and route labels never contribute identity evidence.
6. Strong conflicting identifiers prevent automatic merge.
7. Parsed numbering never destroys the raw source label.
8. Different date meanings remain separate; disagreement is diagnostic data,
   not a reason to overwrite one value.
9. Incomplete creator credit is marked incomplete; absence is not evidence
   that creator lists agree.
10. Identity confidence and evidence are serialized, not reduced to pass/fail.
11. A same-recommendation decision does not imply the same publication.
12. Collapse preserves variants, editions, constituents, and source
    provenance in diagnostics.

### Merge and collapse rules

#### Same publication identity

Automatic equivalence requires either:

- the same strong publication identifier with compatible format/language; or
- compatible publisher, format, edition/printing/variant designation,
  content scope, and dates, supported by title/creator agreement.

An ISBN collision with conflicting content or format is not merged
automatically.

#### Same readable-work identity

Require at least two independent evidence families, including one
content-bearing family:

1. a strong identifier scoped to the same readable unit;
2. the same explicit constituent issue/story set;
3. compatible series identity plus entry/volume number, title, creators, and
   dates;
4. for a standalone work, compatible title, creator set, publisher/date, and
   content description.

Exact title alone, fuzzy title alone, query overlap, cover similarity, or a
shared franchise is insufficient.

#### Same recommendation identity

Collapse when readable content and series position are the same and
differences are limited to edition, binding, printing, market, or cover
variant. Keep distinct when scope differs materially:

- issue versus collection;
- trade versus omnibus;
- anthology versus one included story;
- boxed set versus one included volume;
- later series entry versus first entry.

#### Ambiguity and conflict

- Ambiguous issue-versus-collection records become
  `ambiguous_reading_unit`; they are not guessed into a preferred shape.
- Missing numbering is represented as unknown sequence, never inferred from
  returned order.
- Conflicting dates are retained with type/source and a conflict flag.
- Similar titles from unrelated series remain distinct when series,
  creators, publisher/era, or constituents disagree.
- Low-evidence cross-source pairs remain `unresolved`, visible to comparison,
  and unmerged.

### Responsibility boundaries

| Stage | Identity responsibility |
| --- | --- |
| Source adapter | Preserve native identity and fields; emit transport facts; do exact native-ID dedupe only. |
| Normalization | Map native shapes to the neutral vocabulary; parse numbers/dates without discarding raw values; emit evidence/confidence and relations. |
| Identity resolution | Make versioned publication/readable-work/series equivalence assertions using the minimum-evidence rules. |
| Eligibility | Decide which readable units are suitable for the reader and route; reject supporting-only or inaccessible entry points. |
| Selection | Collapse a known recommendation identity to its best representative and apply duplicate/diversity policy. It must not invent identity equivalence. |

## Source-neutral fixture catalog

Fixture file:
`scripts/source-competence/fixtures/graphicNovel/source-neutral-reading-unit-identity-v1.json`

All names, identifiers, publishers, and records are synthetic. The fixture
contains no ComicVine or GCD payload, field name, metadata, or cover image.

| Case | Contract boundary |
| --- | --- |
| `single-issue` | Issue is a readable work and publication; eligibility remains undecided. |
| `same-issue-variant-cover` | Variant is a distinct publication identity but the same readable and recommendation identity. |
| `trade-collecting-issues` | Collection is distinct from its constituents and links to all of them. |
| `hardcover-paperback-same-collection` | Bindings remain distinct publications and collapse at readable/recommendation layers. |
| `manga-volume` | Preserves series volume and entry order without treating it as an issue. |
| `omnibus-multiple-volumes` | Omnibus remains distinct while containing multiple volume works. |
| `creator-owned-standalone` | Standalone work does not require series identity. |
| `graphic-memoir` | Graphic memoir is a standalone graphic readable work; genre does not change identity. |
| `similar-title-unrelated-series` | Title similarity does not merge different series/creators/eras. |
| `missing-volume-numbering` | Unknown order remains unknown. |
| `conflicting-publication-dates` | Typed dates and conflict are preserved. |
| `incomplete-creator-credits` | Incomplete credit cannot prove creator equality. |
| `ambiguous-issue-versus-collection` | Insufficient shape evidence produces an unresolved identity. |

These are contract fixtures only. They do not certify a source, recommendation
quality, eligibility, or selection behavior.

## Comparison Harness extension design

Do not modify the locked Phase I comparator during independent source
characterization. A later, additive artifact schema should introduce:

1. `sourceRecordIdentity`, `publicationIdentity`, `readableWorkIdentity`,
   `seriesIdentity`, and `recommendationIdentity` envelopes;
2. a versioned resolver result of `same`, `related`, `distinct`, or
   `unresolved`;
3. the evidence and rule version for every cross-source assertion;
4. separate overlap counts for exact publication, readable work,
   recommendation identity, series, and partial-content relationships;
5. issue/collection, variant/printing, entry-order, ambiguous-shape, and
   unresolved-match pressure;
6. fail-closed matching when minimum evidence is absent.

The extension should consume independently frozen artifacts for the exact
same profile. It must not:

- compare source-native scores;
- use queries as identity evidence;
- coerce ambiguity into overlap;
- alter production normalization, eligibility, ranking, or selection;
- hide differences by collapsing issue, collection, and omnibus scopes.

The synthetic catalog in this gate should become the future resolver's
first deterministic regression corpus.

## Go/no-go decision

### Fixture-first GCD characterization: **GO WITH CONTROLS**

Independent GCD characterization is authorized only for the next bounded,
fixture-first stage under these conditions:

- begin with synthetic or manually authored source-shaped fixtures;
- map into this source-neutral identity contract;
- do not restore retired GCD production code;
- do not call live GCD endpoints until access, rate, attribution, capture,
  and schema-version controls are separately approved;
- include no cover URLs or binaries in distributable fixtures;
- if later fixtures contain real GCD metadata, attach complete CC BY-SA
  provenance and modification records;
- do not modify production routing, policy, scoring, ranking, selection, or
  the locked Comparison Harness.

This authorization is not approval for live capture, production restoration,
ComicVine replacement, cross-source merging, route ownership, or source
preference.

### Live GCD characterization: **NO-GO IN THIS GATE**

Before live calls, obtain or define:

- an acceptable authenticated/anonymous access arrangement and bounded rate;
- the exact supported discovery workload;
- response capture and schema-drift handling;
- attribution/ShareAlike treatment for raw and derived artifacts;
- cover exclusion controls;
- replay and redaction rules.

### ComicVine long-term production reliance: **NO-GO WITHOUT CLARIFICATION**

The explicit non-commercial restriction is incompatible with an
unqualified long-term plan that may become commercial. NovelIdeas's current
free status does not remove that risk. Production reliance beyond the
currently validated scope requires written permission or a separate license
covering the intended funding, display, caching, diagnostics, and fixture
uses.

## Official references

- ComicVine API terms, key, rate, attribution, and redistribution:
  <https://comicvine.gamespot.com/api/>
- ComicVine resource documentation:
  <https://comicvine.gamespot.com/api/documentation>
- GCD API status, authentication, and schema warning:
  <https://github.com/GrandComicsDatabase/gcd-django/wiki/API>
- GCD database and cover-rights notice (representative official page):
  <https://www.comics.org/issue/1622223/cover/4/>
- Creative Commons BY-SA 4.0 legal code:
  <https://creativecommons.org/licenses/by-sa/4.0/legalcode.en>
