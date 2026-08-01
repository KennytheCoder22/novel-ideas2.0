# Live Evidence Decision Register

## Metadata

| Field | Value |
|---|---|
| **Document status** | Active governance record |
| **Effective date** | 2026-07-31 |
| **Governing commit** | `f8180776415ffcf2ab8c4895370b89354cbf510e` (Phase IV planning merged to `main`) |
| **Governing gates** | `docs/GRAPHIC_NOVEL_LIVE_EVIDENCE_LICENSING_DECISION.md` |
| **Governing roadmap** | `docs/NOVELIDEAS_COMPLETION_ROADMAP.md` §5 |
| **Governing pre-characterization gates** | `docs/GRAPHIC_NOVEL_PRE_CHARACTERIZATION_GATES.md` |
| **Live GCD calls made** | No |
| **Live ComicVine calls made** | No |
| **Production behavior changed** | No |

This document is a governance and decision record only. It does not authorize live evidence collection, live requests, or production behavior changes. It records which non-engineering blockers remain, which product decisions resolve previously open questions, and what must happen next before any live probe session begins.

This is an engineering assessment of published terms, not legal advice.

---

## Governing Product Decisions (Effective Immediately)

The following product decisions are treated as authoritative for the purposes of this register. They are not engineering decisions and do not require further internal deliberation.

| # | Decision | Effect on gates |
|---|---|---|
| PD-1 | NovelIdeas is free to use. | Eliminates revenue-model scenarios (subscriptions, advertising, licensing, sales). Narrows CV-1 materially but does not resolve it without written confirmation from ComicVine. |
| PD-2 | There is no planned revenue model (no subscriptions, advertising, licensing fees, or sales). | Same as PD-1. Strengthens the non-commercial argument to ComicVine but does not substitute for written clarification. |
| PD-3 | NovelIdeas is a recommendation engine, not a metadata service. It retrieves only the source evidence necessary to generate and display recommendations; it is not a searchable replica or redistribution platform. | Narrows CV-2, CV-3, and GC-1 scope. Does not resolve them because ComicVine's written permission is still required for stored derived artifacts and GCD's ShareAlike scope still requires legal determination. |
| PD-4 | NovelIdeas is not intended to cache or redistribute source metadata beyond what is necessary to provide the recommendation experience. | Governs intent. Does not replace ComicVine's required written permission (CV-3, CV-4) because those gates concern what ComicVine authorizes, not what NovelIdeas intends. |
| PD-5 | NovelIdeas displays covers only where applicable rights and terms permit. Cover rights remain separate from metadata rights. | **Directly resolves CV-5 and GC-3** as No-go confirmed (see below). Enforces the capture protocol's cover-exclusion rule as a permanent product constraint. |

---

## Gate Status Summary

### Legend

| Status | Meaning |
|---|---|
| **Resolved** | Fully satisfied; no further action required before this specific gate. |
| **Ken can resolve** | No external party required; Ken can close this gate through an operational action or confirmation. |
| **External clarification required** | A written answer from ComicVine, GCD, or legal counsel is required. Engineering is blocked at this gate. |
| **Unresolved** | Gate remains open; the party responsible and action required are stated below. |

---

### ComicVine Gates

#### CV-1 — Commercial Use Definition

| Field | Value |
|---|---|
| **Type** | Legal/licensing |
| **Status** | **Unresolved — external clarification required** |
| **Engineering blocked?** | Yes — no live ComicVine calls are authorized until resolved |
| **Gates affected** | All live ComicVine probe sessions |

**Why the gate exists:** ComicVine's API terms state that API use is strictly non-commercial and commercial use may cause key revocation. The terms do not define "commercial." Without a definition, any deployment model — including a free service — could theoretically be characterized as commercial if it is grant-funded, institutionally hosted, or sponsored.

**Effect of product decisions (PD-1, PD-2):** These decisions eliminate the most obvious commercial scenarios (subscriptions, advertising, licensing fees, sales). They substantially narrow the question. However, they do not substitute for ComicVine's own written determination because the definition of "commercial" in this context is ComicVine's call, not NovelIdeas's. The question has become simpler; it has not disappeared.

**What would resolve it:** Written confirmation from ComicVine that a free, no-revenue-model, no-advertising, no-subscription recommendation service (as described in PD-1 and PD-2) falls outside their non-commercial restriction, or an explicit acknowledgment that the described model is commercial and that a commercial license is required.

**Recommended order:** Contact ComicVine first. All other ComicVine gates (CV-2, CV-3, CV-4) are downstream of CV-1. If CV-1 resolves as "No-go (commercial)," CV-2 through CV-4 become moot for live probing and the ComicVine stop condition `live_evidence_unavailable_legal_block_cv_commercial` should be committed.

---

#### CV-2 — Metadata Transformation Permission

| Field | Value |
|---|---|
| **Type** | Legal/licensing |
| **Status** | **Unresolved — external clarification required** |
| **Engineering blocked?** | Yes — any capture that stores derived metadata is blocked |
| **Gates affected** | Frozen Tier 1 artifact generation; recommendation card storage; diagnostic artifact generation |

**Why the gate exists:** ComicVine's redistribution restriction prohibits editing, manipulating, or reproducing data in another form. Normalization, field-presence extraction, and observation-artifact generation are all transformations. Without written permission, storing any ComicVine-derived artifact (even a field-presence record) is a potential terms violation.

**Effect of product decisions (PD-3, PD-4):** PD-3 confirms NovelIdeas is a recommendation engine, not a metadata redistribution platform. PD-4 confirms there is no intent to cache beyond what the recommendation experience requires. These narrow the question but do not resolve it, because ComicVine's restriction applies to any derived form regardless of intent.

**What would resolve it:** Written confirmation from ComicVine that normalized recommendation cards, librarian diagnostics, Human Review records, field-presence observation artifacts, and evidence-completeness records derived from ComicVine responses are permitted under their terms for a free, non-commercial recommendation service.

**Recommended order:** Bundle CV-2 into the same written clarification request as CV-1. Address all ComicVine licensing questions in a single communication.

---

#### CV-3 — Cache Retention Scope

| Field | Value |
|---|---|
| **Type** | Legal/licensing |
| **Status** | **Unresolved — external clarification required** |
| **Engineering blocked?** | Yes — frozen Tier 1 artifact commits are blocked |
| **Gates affected** | Any frozen observation artifact committed to the repository |

**Why the gate exists:** ComicVine's terms suggest caching responses to avoid duplicate requests. That suggestion establishes permission for operational caching, not blanket permission to publish or archive a database copy. The boundary between an operational cache and a durable data store is undefined in the published terms.

**Effect of product decisions (PD-4):** PD-4 states NovelIdeas is not intended to cache beyond what the recommendation experience requires. This aligns with ComicVine's caching suggestion in spirit but does not resolve the scope of what "the recommendation experience requires" means from ComicVine's perspective.

**What would resolve it:** Written confirmation of the maximum permissible cache retention period, the permissible persistence scope (session only, device only, service-level, repository-committed artifact), and whether frozen evidence artifacts that are hash-linked, attribution-carrying, and used only for reproducible regression testing qualify as operational caching.

**Recommended order:** Bundle with CV-1 and CV-2 in a single ComicVine clarification request.

---

#### CV-4 — Fixture and Payload Storage

| Field | Value |
|---|---|
| **Type** | Legal/licensing |
| **Status** | **Unresolved — external clarification required** |
| **Engineering blocked?** | Yes — any ComicVine response body or full metadata record committed to the repository is blocked |
| **Gates affected** | Repository commits of ComicVine response bodies or captured metadata records |

**Why the gate exists:** ComicVine's redistribution restriction ("data must not be redistributed in another form") applies to captured payloads. Without written permission, committing a response body — even redacted — may violate terms. The restriction does not distinguish between private and public commits.

**Effect of product decisions:** No product decision directly resolves this. The decision to function as a recommendation engine (PD-3) does not authorize committing ComicVine payloads to a repository shared with contributors.

**What would resolve it:** Written confirmation from ComicVine that captured response bodies, or redacted captures containing only field-presence indicators (no content fields), may be stored privately, committed as test fixtures, or shared with project contributors for a free, non-commercial service.

**Recommended order:** Bundle with CV-1, CV-2, CV-3.

**Interim implication:** Until CV-4 is resolved, ComicVine live evidence artifacts must use the `live_evidence_unavailable_legal_block_cv_storage` stop condition if the frozen artifact cannot be stored without committing a response body.

---

#### CV-5 — Cover URL Rights

| Field | Value |
|---|---|
| **Type** | Legal/licensing + product |
| **Status** | ✅ **Resolved by product decision PD-5** |
| **Engineering blocked?** | No — cover exclusion is confirmed |
| **Gates affected** | Capture scope; rendering |

**Why the gate exists:** ComicVine's API terms do not grant cover-image rights, and the redistribution restriction counsels against storing or redistributing cover files. A cover URL alone is not a license to display.

**Resolution:** PD-5 confirms that NovelIdeas will display covers only where applicable rights and terms permit, and that cover rights remain separate from metadata rights. This is a permanent product constraint, not a deferred decision. All capture artifacts must exclude ComicVine cover URLs and binaries. The probe runners' cover-exclusion enforcement is hereby confirmed as correct product behavior.

**No separate rights basis for ComicVine covers is in scope for Phase IV.** If cover display is later desired, it requires a separate rights decision record at that time.

---

#### CV-6 — API Key Authorization

| Field | Value |
|---|---|
| **Type** | Operational/access |
| **Status** | **Unresolved — Ken can resolve** |
| **Engineering blocked?** | Yes — no live calls may proceed without a confirmed, valid, authorized key |
| **Gates affected** | Any live ComicVine request |

**Why the gate exists:** The existing per-site API key must belong to NovelIdeas, be in good standing, and be authorized for the characterization request pattern (≤ 18 requests per session, within the 200 req/resource/hour rate budget).

**What would resolve it:** Ken verifies that the ComicVine API key stored server-side is current, not revoked, and in good standing. This does not require external permission — it requires operational confirmation. If the key has been revoked or is missing, a new key request is a separate action.

**Recommended order:** Resolve concurrently with outreach for CV-1–4. If CV-1 resolves as "No-go (commercial)," CV-6 is moot.

---

### GCD Gates

#### GC-1 — ShareAlike Scope of Derived Artifacts

| Field | Value |
|---|---|
| **Type** | Legal/licensing |
| **Status** | **Unresolved — legal review required** |
| **Engineering blocked?** | Partially — GCD live probes are not blocked by GC-1 alone; committing derived artifacts to a shared repository requires this to be resolved |
| **Gates affected** | Public or contributor-shared artifacts derived from GCD data |

**Why the gate exists:** CC BY-SA 4.0 requires that adapted material or extracted substantial portions of a database be shared under a compatible license. A field-presence observation artifact, a delta report, or a frozen evidence artifact extracted from GCD may qualify. The threshold for "substantial portion" is not defined in the license itself.

**Effect of product decisions (PD-3, PD-4):** PD-3 (recommendation engine, not metadata service) and PD-4 (minimal caching) are directly relevant to this assessment. Legal counsel should be given these product decisions as inputs. The product decisions narrow the scope of what artifacts are generated, which narrows the legal question.

**What would resolve it:** Legal counsel's determination of (a) which artifact types NovelIdeas generates constitute adapted material or substantial database extractions, and (b) what ShareAlike obligation applies to each, given that NovelIdeas is a free, no-revenue-model recommendation engine (PD-1–4).

**Interim mitigation:** All GCD-derived artifacts committed to the repository carry `shareAlikeAssessmentPending: true` in their provenance block until legal review completes. This flags them correctly without blocking engineering work. GCD live probes may proceed once GC-4 and GC-5 are resolved — GC-1 does not block the probe; it governs what happens with the resulting artifact.

---

#### GC-2 — Attribution Placement

| Field | Value |
|---|---|
| **Type** | Legal/licensing + operational |
| **Status** | **Provisionally resolved — Ken can adopt; legal confirmation recommended** |
| **Engineering blocked?** | No — provisional attribution form is available |
| **Gates affected** | Any GCD-derived artifact committed or shared |

**Why the gate exists:** CC BY-SA 4.0 requires supplied attribution, copyright and license notices, a source link, and modification notices when licensed material is shared.

**Provisional resolution:** The governing document (`docs/GRAPHIC_NOVEL_LIVE_EVIDENCE_LICENSING_DECISION.md` §GC-2) already supplies an attribution form:

```
Source: Grand Comics Database (https://www.comics.org)
License: CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/)
Capture date: [ISO 8601 UTC]
Modified: [yes/no] [modification description if yes]
```

Ken can adopt this form immediately as the required provenance block for all GCD-derived artifacts. This satisfies the practical requirement. Legal counsel should confirm whether this placement is sufficient for patron-facing cards, repository fixtures, and diagnostic artifacts — but the absence of that confirmation does not block live probe execution or artifact commitment. The provenance block must accompany every artifact regardless.

**Recommended order:** Present the provisional form to legal counsel as part of the GC-1 review.

---

#### GC-3 — Cover Rights Basis

| Field | Value |
|---|---|
| **Type** | Legal/licensing + product |
| **Status** | ✅ **Resolved by product decision PD-5 — No-go confirmed** |
| **Engineering blocked?** | No — cover exclusion is confirmed |
| **Gates affected** | Capture scope; rendering |

**Why the gate exists:** GCD's database license expressly excludes cover images and describes thumbnails as identification use only. All cover rights remain with respective copyright holders. A database license does not grant display rights for images the database describes.

**Resolution:** PD-5 confirms that NovelIdeas will display covers only where applicable rights and terms permit, and that cover rights remain separate from metadata rights. GCD cover rights do not permit display under the database license alone. NovelIdeas therefore will not display GCD covers until a separate rights basis is established.

The "No-go from the database license alone" posture stated in the governing document is confirmed as the correct product position. Cover URLs and binaries are permanently excluded from all GCD capture artifacts. The probe runners' cover-exclusion enforcement is correct.

---

#### GC-4 — GCD Access Arrangement for Characterization Workload

| Field | Value |
|---|---|
| **Type** | Operational/access |
| **Status** | **Unresolved — Ken can initiate** |
| **Engineering blocked?** | Yes — GCD live probes are blocked until this gate is confirmed |
| **Gates affected** | Any live GCD probe session |

**Why the gate exists:** GCD's API wiki states that anonymous access may later be disabled and describes authenticated access as available. Characterization requires predictable, repeatable access. Probing without prior confirmation risks triggering rate limits or consuming scarce anonymous quota in a non-repeatable manner.

**What would resolve it:** Ken contacts GCD (via their API wiki contact mechanism or developer list) and obtains confirmation that (a) the expected discovery workload (≤ 18 requests per session, bounded per the request manifest) is acceptable, and (b) anonymous access is currently sufficient OR that credentials for authenticated access are provided. The probe runner enforces this gate through the `GCD_ACCESS_MODE_CONFIRMED=true` environment variable.

**Recommended order:** Initiate GCD contact before ComicVine outreach if GCD is considered the lower-risk path. GC-4 and GC-5 together unblock GCD live probes even if all ComicVine gates remain unresolved.

---

#### GC-5 — Anonymous vs. Authenticated Access Mode

| Field | Value |
|---|---|
| **Type** | Operational/access |
| **Status** | **Unresolved — Ken can resolve (follows GC-4)** |
| **Engineering blocked?** | Yes — enforced as a hard pre-request gate by the probe runner |
| **Gates affected** | GCD probe session design; any GCD fetch call |

**Why the gate exists:** GCD states anonymous access currently receives hourly limits (unspecified) and may later be disabled. If authenticated access is required for reliable, repeated probing, credentials must be provisioned and stored server-side before any probe. The probe runner enforces `GCD_ACCESS_MODE_CONFIRMED=true` as a hard gate; missing it emits `live_evidence_unavailable_gcd_access_mode_unconfirmed` and makes zero network calls.

**What would resolve it:** Following GC-4 contact with GCD, Ken determines:
- **Anonymous:** Confirm that current anonymous access is stable enough for the characterization window and that the session budget is within the undisclosed hourly limit.
- **Authenticated:** Provision GCD credentials, store them server-side, configure the runner with `GCD_ACCESS_MODE=authenticated`, and set `GCD_ACCESS_MODE_CONFIRMED=true`.

Ken then sets `GCD_ACCESS_MODE_CONFIRMED=true` (and `GCD_ACCESS_CONFIRMED=true` if using authenticated mode) in the probe environment. Setting `GCD_ACCESS_CONFIRMED=true` alone does not open the gate.

**Recommended order:** Resolve as part of GC-4 — the same GCD contact that resolves GC-4 should also answer which access mode is appropriate.

---

## Pre-Probe Checklist — Updated Status

The governing document (`docs/GRAPHIC_NOVEL_LIVE_EVIDENCE_LICENSING_DECISION.md`) requires ALL items to be checked before any live session. Current status:

| Item | Source | Status |
|---|---|---|
| CV-1 resolved | For ComicVine sessions | ⬜ **Unresolved** — external clarification required |
| CV-2 resolved | For any metadata storage | ⬜ **Unresolved** — external clarification required |
| CV-3 resolved | For any frozen artifact commit | ⬜ **Unresolved** — external clarification required |
| CV-4 resolved | For any repository commit of real payload | ⬜ **Unresolved** — external clarification required |
| CV-6 confirmed | Key present, valid, authorized | ⬜ **Unresolved** — Ken can resolve operationally |
| GC-4 confirmed | GCD access arrangement | ⬜ **Unresolved** — Ken must initiate GCD contact |
| GC-5 resolved | Anonymous vs. authenticated access mode confirmed | ⬜ **Unresolved** — resolves with GC-4 |
| Rate budget predeclared | `scripts/live-evidence/request-manifest-v1.json` | ✅ **Satisfied** (committed in Phase IV planning) |
| Capture protocol documented | `scripts/live-evidence/capture-protocol.md` | ✅ **Satisfied** (committed in Phase IV planning) |
| No cover URLs or binaries in capture scope | Enforced by runners | ✅ **Confirmed** — resolved by PD-5; runners enforce; permanent product constraint |

**GCD live probes** are blocked by: GC-4 and GC-5.  
**ComicVine live probes** are blocked by: CV-1, CV-2, CV-3, CV-4, CV-6 (and CV-6 is moot if CV-1 resolves as No-go).

---

## Suitability Matrix — Updated State

| Action | ComicVine | GCD |
|---|---|---|
| Synthetic fixture development | ✅ **Go** | ✅ **Go** |
| Live characterization probes | ❌ **Blocked** — CV-1 unresolved | ❌ **Blocked** — GC-4 and GC-5 unresolved |
| Freeze Tier 1 observation artifact | ❌ **Blocked** — CV-1, CV-3 unresolved | 🟡 **Conditional go** — once GC-4 confirmed; provenance block required; GC-1 assessed |
| Commit response body payloads | ❌ **No-go** — CV-4 unresolved | 🟡 **Conditional go** — CC BY-SA compliance metadata required; GC-1 pending |
| Commit cover URLs or binaries | ❌ **No-go** — confirmed by PD-5 | ❌ **No-go** — confirmed by PD-5 and GC-3 |
| Public or contributor-shared artifact | ❌ **No-go** — CV-1–4 unresolved | 🟡 **Conditional go** — once GC-1/GC-2 resolved with ShareAlike plan |
| Runner development (no network) | ✅ **Go** | ✅ **Go** |
| Replay regression suite | ✅ **Go** | ✅ **Go** |

---

## Decision Classification

### Gates Resolved by the Product Decisions Above

| Gate | Resolution type | Resolved by | Effect |
|---|---|---|---|
| CV-5 | Product decision | PD-5 | No-go confirmed. Cover URLs excluded from all ComicVine capture. Permanent product constraint. |
| GC-3 | Product decision | PD-5 | No-go confirmed. Cover URLs excluded from all GCD capture. Permanent product constraint. |

### Gates Ken Can Resolve Without External Parties

| Gate | Type | Required action |
|---|---|---|
| CV-6 | Operational | Verify that the stored ComicVine API key is current, not revoked, and in good standing. Document confirmation here. |
| GC-4 | Operational/access | Contact GCD via their developer channel; confirm workload (≤ 18 req/session) is acceptable and access arrangement is stable. Document GCD's response here. |
| GC-5 | Operational/access | Following GC-4, confirm access mode (anonymous or authenticated); set `GCD_ACCESS_MODE_CONFIRMED=true` in probe environment; document here. |
| GC-2 | Operational (provisional) | Adopt the provisional attribution form from the governing document for all GCD-derived artifacts. Legal confirmation recommended but does not block execution. |

### Gates Requiring External Clarification

| Gate | External party | Type | Why product decisions are insufficient |
|---|---|---|---|
| CV-1 | ComicVine (written) | Legal/licensing | "Commercial" is ComicVine's definition, not NovelIdeas's. PD-1/PD-2 eliminate the most obvious commercial scenarios but ComicVine must confirm the free, no-revenue-model service is within their non-commercial permission. |
| CV-2 | ComicVine (written) | Legal/licensing | The redistribution restriction applies to any derived form. PD-3/PD-4 narrow the scope but do not substitute for ComicVine's authorization of normalization, field extraction, and artifact generation. |
| CV-3 | ComicVine (written) | Legal/licensing | Cache scope is ComicVine's to define. PD-4 states intent; it does not grant the scope permission. |
| CV-4 | ComicVine (written) | Legal/licensing | Fixture commits involve redistribution within a shared repository. PD-3/PD-4 do not authorize this; ComicVine must. |
| GC-1 | Legal counsel | Legal/licensing | "Adapted material" and "substantial database extraction" are legal interpretations. PD-3/PD-4 are inputs that counsel should use; they do not replace the determination. |

---

## Prioritized Action Checklist

Resolution of the following items, in this order, is required before any live evidence session begins:

### Tier 1 — Must complete before any live probes (either source)

These are the minimum required actions before running `node scripts/live-evidence/run-gcd-live-probe.mjs` or `node scripts/live-evidence/run-comicvine-live-probe.mjs` in live mode.

- [ ] **[Ken / Operational] Confirm ComicVine API key (CV-6).** Check that the key stored server-side is current, not revoked, and in good standing. Record confirmation in this document at the CV-6 Resolution Record.

- [ ] **[Ken / External — ComicVine] Initiate written clarification request for CV-1, CV-2, CV-3, CV-4.** Draft a single request letter to ComicVine covering all four questions simultaneously. Provide the product decisions (PD-1–PD-5) as context: NovelIdeas is a free, no-revenue-model, no-advertising recommendation engine that does not intend to function as a metadata redistribution platform. Ask:
  1. Whether a free, no-subscription, no-advertising, no-licensing-fee recommendation service is within the non-commercial restriction (CV-1).
  2. Whether normalized recommendation cards, field-presence records, and diagnostic artifacts derived from API responses are permitted (CV-2).
  3. What cache retention period and persistence scope are permitted, including whether hash-linked regression artifacts qualify as operational caching (CV-3).
  4. Whether redacted captures containing only field-presence indicators may be committed to a private repository as test fixtures (CV-4).

- [ ] **[Ken / External — GCD] Contact GCD and confirm access arrangement (GC-4, GC-5).** Using the GCD developer contact channel, confirm that a session budget of ≤ 18 requests is acceptable, whether anonymous access is currently stable for repeated characterization, or whether authenticated access is preferred. Record GCD's response. Set `GCD_ACCESS_MODE_CONFIRMED=true` (and the correct access mode variable) in the probe environment.

### Tier 2 — Must complete before committing GCD observation artifacts

These items do not block GCD probe execution but block committing the resulting frozen artifacts.

- [ ] **[Ken / Legal — GC-1] Engage legal counsel on CC BY-SA ShareAlike scope.** Provide the product decisions (PD-1–PD-5) and the types of artifacts generated (field-presence records, observation artifacts, delta reports). Ask counsel to determine which artifact types invoke ShareAlike obligations and what ShareAlike plan is required. Interim: continue carrying `shareAlikeAssessmentPending: true` in all GCD-derived artifact provenance blocks.

- [ ] **[Ken / Operational — GC-2] Adopt provisional attribution form.** Confirm that the provisional attribution form in `docs/GRAPHIC_NOVEL_LIVE_EVIDENCE_LICENSING_DECISION.md §GC-2` is the form used for all GCD-derived artifacts. Present this to legal counsel as part of the GC-1 engagement.

### Tier 3 — Required for full Phase IV closure

These items are required before the Phase IV completion record in `docs/GRAPHIC_NOVEL_SOURCE_COMPETENCE_PHASE_IV_LIVE_OBSERVATION.md` can be finalized.

- [ ] **Update all Resolution Records** in `docs/GRAPHIC_NOVEL_LIVE_EVIDENCE_LICENSING_DECISION.md` with written confirmation texts and dates as gates are resolved.
- [ ] **Commit stop-condition artifacts** (using `live_evidence_unavailable_*` status) for any gate that resolves as No-go, so Phase IV closes with documented stop conditions rather than empty placeholder files.
- [ ] **Run replay regressions** (`node scripts/live-evidence/run-live-evidence-regressions.mjs`) to confirm all engineering work passes before any live session begins.

---

## Gate-Status Summary

| Gate | Description | Type | Status | Who resolves |
|---|---|---|---|---|
| CV-1 | ComicVine commercial use definition | Legal/licensing | ⬜ Unresolved | ComicVine (written) |
| CV-2 | Metadata transformation permission | Legal/licensing | ⬜ Unresolved | ComicVine (written) |
| CV-3 | Cache retention scope | Legal/licensing | ⬜ Unresolved | ComicVine (written) |
| CV-4 | Fixture and payload storage | Legal/licensing | ⬜ Unresolved | ComicVine (written) |
| CV-5 | Cover URL rights | Legal/product | ✅ Resolved (No-go confirmed) | Resolved by PD-5 |
| CV-6 | API key authorization | Operational | ⬜ Unresolved | Ken |
| GC-1 | ShareAlike scope of derived artifacts | Legal/licensing | ⬜ Unresolved | Legal counsel |
| GC-2 | Attribution placement | Legal/operational | 🟡 Provisionally resolved | Ken (provisional); counsel to confirm |
| GC-3 | Cover rights basis | Legal/product | ✅ Resolved (No-go confirmed) | Resolved by PD-5 |
| GC-4 | GCD access arrangement | Operational/access | ⬜ Unresolved | Ken (GCD contact) |
| GC-5 | Anonymous vs. authenticated access mode | Operational/access | ⬜ Unresolved | Ken (follows GC-4) |

**Total open:** 7 unresolved, 1 provisionally resolved.  
**Total closed:** 2 resolved by product decisions (CV-5, GC-3).  
**Resolved this session:** CV-5 and GC-3 (both resolved by PD-5).

---

## Next Authorized Engineering Task

**The next engineering task that becomes fully authorized once the remaining gates are resolved** is:

> **Phase IV live observation execution** — running the bounded, terms-compliant probe sessions in live mode against GCD and ComicVine, capturing frozen Tier 1 observation artifacts, generating the delta report, and completing the Phase IV completion record (`docs/GRAPHIC_NOVEL_SOURCE_COMPETENCE_PHASE_IV_LIVE_OBSERVATION.md`).

The precise sequence is:

1. **GCD live probe** becomes authorized when GC-4 and GC-5 are resolved.  
   `node scripts/live-evidence/run-gcd-live-probe.mjs --mode live --profile all`

2. **ComicVine live probe** becomes authorized when CV-1, CV-2, CV-3, CV-4, and CV-6 are all resolved.  
   `node scripts/live-evidence/run-comicvine-live-probe.mjs --mode live --profile all`

3. **Phase IV closure** becomes authorized when both probe results (including any `live_evidence_unavailable_*` stop-condition artifacts) are committed, the delta report is committed, and the Phase IV completion record is updated with actual outcomes.

After Phase IV closes (regardless of whether live evidence was obtained or stop conditions were documented), the next phase is **Human Review** (roadmap §6), which requires:
- Representative frozen/live observation complete or stop conditions documented
- Human Review design from `docs/HUMAN_REVIEW_MODE_SPEC.md` implemented
- Reviewed slates hash-linked to specific machine artifacts
- Independent per-source and per-age-band review coverage

No production adapter changes, source-selection changes, or routing changes are authorized by Phase IV or by this register.

---

## What Is Authorized Now (Without Further Resolution)

The following engineering work is currently authorized and does not require any gate resolution:

1. Author, commit, and run the probe runners, request manifest, and capture protocol (synthetic only, no network).
2. Author, commit, and run the replay regression suite and delta reporter (no network in replay mode).
3. Maintain placeholder frozen artifact paths (`scripts/live-evidence/frozen/`) with `live_evidence_unavailable_legal_block_*` or `live_evidence_unavailable_gcd_access_mode_unconfirmed` status.
4. Author and update the Phase IV completion record template.
5. Commit this Decision Register and its gate resolutions.
6. Maintain all Phase I, II, and III frozen artifacts and regression locks without modification.
7. Draft the ComicVine clarification request letter for Ken's review.
8. Draft the GCD contact message for Ken's review.

---

## Changelog

| Date | Change |
|---|---|
| 2026-07-31 | Initial register created. CV-5 and GC-3 resolved by PD-5. GC-2 provisionally resolved. All other gates confirmed open. Prioritized action checklist produced. |
