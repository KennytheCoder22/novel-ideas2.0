# Graphic Novel Live Evidence — Licensing and Access Decision Record

## Status

**Planning complete. Implementation blocked pending resolution of open questions below.**

- Branch: `kennythecoder22-graphic-licensing-live-evidence-plan`
- Baseline commit: `26a7b8bf815a61ebba4498a16788e543b5acaca7`
- Planning pass authored: Phase IV planning session
- Governing gate: `docs/GRAPHIC_NOVEL_PRE_CHARACTERIZATION_GATES.md`
- Governing roadmap: `docs/NOVELIDEAS_COMPLETION_ROADMAP.md` §5
- Live GCD calls made: **no**
- Live ComicVine calls made: **no**
- Production behavior changed: **no**

This is an engineering assessment of published terms, not legal advice. It records which questions remain open and what each answer enables or forecloses. Answers must be confirmed in writing before any live evidence collection begins.

---

## Decision Vocabulary

| Decision | Meaning |
|---|---|
| **Go with controls** | Published terms support the use if the listed controls are maintained. |
| **Conditional** | The use may be supportable, but a material question is not answered by the published terms alone. |
| **No-go on published terms** | The stated use conflicts with a published restriction unless separate permission is obtained. |
| **Blocked** | This action cannot proceed until a specific listed question is answered. |
| **Resolved** | The question has received a written answer that governs the action. (None resolved yet.) |

---

## ComicVine — Open Questions

All nine ComicVine questions remain **unresolved**. The answers govern whether any live probe proceeds.

### CV-1: Commercial use definition

**Question:** Does ComicVine consider a grant-funded, institutionally-hosted, sponsored, or contract-hosted NovelIdeas deployment "commercial" under its non-commercial restriction?

**Why it matters:** ComicVine's API terms state API use is strictly non-commercial and commercial use may cause key revocation. If any plausible NovelIdeas deployment model is commercial, no live calls are authorized.

**Required before:** Any live request against the ComicVine API under this characterization phase.

**Current status:** **Unresolved.**

**Resolution record:** _(to be filled when written clarification received)_

---

### CV-2: Metadata transformation permission

**Question:** May ComicVine metadata be transformed into recommendation cards, librarian diagnostics, Human Review records, and long-lived derived evidence artifacts?

**Why it matters:** The redistribution restriction prohibits editing, manipulating, or reproducing data in another form. Normalization, field-presence extraction, and observation artifact generation are all transformations.

**Required before:** Any capture that stores derived metadata.

**Current status:** **Unresolved.**

**Resolution record:** _(to be filled)_

---

### CV-3: Cache retention scope

**Question:** What cache duration and persistence scope does ComicVine's suggestion to "cache responses to avoid duplicate requests" permit?

**Why it matters:** The suggestion establishes permission for operational caching, not blanket permission to publish or archive a database copy. The boundary between operational cache and durable data store is undefined.

**Required before:** Any frozen Tier 1 artifact committed to the repository.

**Current status:** **Unresolved.**

**Resolution record:** _(to be filled)_

---

### CV-4: Fixture and payload storage

**Question:** May captured ComicVine payloads be stored privately, committed as test fixtures, or shared with project contributors?

**Why it matters:** The redistribution restriction ("data must not be redistributed in another form") applies to captured payloads. Without written permission, committing a response body — even redacted — may violate terms.

**Required before:** Any ComicVine response body or full metadata record committed to the repository.

**Current status:** **Unresolved.**

**Resolution record:** _(to be filled)_

---

### CV-5: Cover URL rights

**Question:** May ComicVine cover URLs be hotlinked in rendered cards? May cover files be proxied or cached?

**Why it matters:** The API terms do not grant cover-image rights, and the redistribution restriction counsels against storing or redistributing cover files.

**Required before:** Any capture that records cover URLs or any rendering that displays ComicVine cover images.

**Current status:** **Unresolved.** Cover URLs must be excluded from all capture artifacts regardless of this resolution, pending a separate rights basis.

**Resolution record:** _(to be filled)_

---

### CV-6: API key authorization for repeated characterization

**Question:** Is the existing per-site API key authorized for repeated characterization-class requests (≤ 18 requests per session) under the documented rate budget (200 req/resource/hour)?

**Why it matters:** The key must belong to NovelIdeas and be in good standing. Rate-bounded characterization probes are within the published limit, but the key authorization must be confirmed.

**Required before:** Any live call.

**Current status:** **Unresolved.** Key presence and validity must be confirmed before the runner starts.

**Resolution record:** _(to be filled)_

---

## GCD — Open Questions

GCD's CC BY-SA 4.0 license is more deployment-compatible than ComicVine's non-commercial restriction, but five questions remain open.

### GC-1: ShareAlike scope of derived artifacts

**Question:** Which NovelIdeas artifacts constitute adapted material or a substantial database extraction for ShareAlike purposes under CC BY-SA 4.0?

**Why it matters:** CC BY-SA requires that adapted material or extracted substantial portions be shared under a compatible license. A field-presence observation artifact or delta report may qualify.

**Required before:** Any GCD-derived artifact is committed to a public repository or shared with contributors outside the operating institution.

**Current status:** **Unresolved.** Artifacts committed to this private repository are flagged `shareAlikeAssessmentPending: true` until legal review completes.

**Resolution record:** _(to be filled)_

---

### GC-2: Attribution placement

**Question:** What attribution placement is reasonable for patron cards, librarian diagnostics, test fixtures, and comparison artifacts?

**Why it matters:** CC BY-SA requires supplied attribution, copyright and license notices, a source link, and modification notices when licensed material is shared.

**Required before:** Any GCD-derived artifact is committed or shared.

**Current status:** **Unresolved.** Provisional: every committed artifact carries a provenance block (see capture protocol). Final placement requires legal review.

**Provisional attribution form (per Gates §GCD controls):**

```
Source: Grand Comics Database (https://www.comics.org)
License: CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/)
Capture date: [ISO 8601 UTC]
Modified: [yes/no] [modification description if yes]
```

**Resolution record:** _(to be filled)_

---

### GC-3: Cover rights basis

**Question:** What separate rights basis, if any, permits cover display from GCD?

**Why it matters:** GCD's database license expressly excludes cover images and describes thumbnails as identification use only. All cover rights remain with respective copyright holders.

**Required before:** Any capture that records cover URLs or any UI that displays GCD cover images.

**Current status:** **No-go on published terms alone.** Cover URLs and cover binaries must be excluded from all artifacts regardless of this resolution, pending a separate rights basis.

**Resolution record:** _(to be filled)_

---

### GC-4: GCD access arrangement for characterization workload

**Question:** Does GCD approve the expected discovery workload (≤ 18 requests per session) and provide a stable authenticated access arrangement for repeated characterization?

**Why it matters:** GCD's API wiki states that anonymous access may later be disabled and describes authenticated access as available. Characterization requires predictable, repeatable access. Probing without prior confirmation risks triggering rate limits or consuming scarce anonymous quota.

**Required before:** Any live probe session against GCD.

**Current status:** **Unresolved.** The probe runner will check whether anonymous access is still functional before any request and emit `live_evidence_unavailable_gcd_anon_disabled` if it is not.

**Resolution record:** _(to be filled)_

---

### GC-5: Anonymous vs. authenticated access mode

**Question:** Is current anonymous API access sufficient for characterization, or is authenticated access required for reliable, repeated probing?

**Why it matters:** GCD states anonymous access currently receives hourly limits (unspecified size) and that anonymous access may later be disabled. If authenticated access is required, credentials must be provisioned and stored server-side before any probe.

**Required before:** Probe session design is finalized.

**Current status:** **Unresolved.** Probe design defaults to anonymous with authenticated fallback. If anonymous access fails or is limited, authenticated mode requires credential provisioning.

**Resolution record:** _(to be filled)_

---

## Suitability Matrix — Current State

| Action | ComicVine | GCD |
|---|---|---|
| Synthetic fixture development | **Go** | **Go** |
| Live characterization probes | **Blocked** — CV-1 unresolved | **Blocked** — GC-4 unresolved |
| Freeze Tier 1 observation artifact | **Blocked** — CV-1, CV-3 unresolved | **Conditional go** with provenance block once GC-4 confirmed |
| Commit response body payloads | **No-go** — CV-4 unresolved | **Conditional go** with CC BY-SA compliance metadata once GC-1 assessed |
| Commit cover URLs or binaries | **No-go** | **No-go** |
| Public or contributor-shared artifact | **No-go** until CV-1–CV-4 resolved | **Conditional go** once GC-1/GC-2 resolved with ShareAlike plan |

---

## What Is Authorized Now (Without Further Resolution)

1. Author and commit the probe runners, request manifest, and capture protocol (all synthetic, no network calls).
2. Author and commit the replay regression suite and delta reporter (no network in replay mode).
3. Author and commit placeholder frozen artifact paths (`scripts/live-evidence/frozen/`) with `live_evidence_unavailable_legal_block_*` status.
4. Author and commit the Phase IV completion record template.
5. Record field-presence schema and stop-condition catalog in the capture protocol.
6. Maintain all Phase I, II, and III frozen artifacts and regression locks without modification.

---

## Pre-Probe Checklist (Required Before Any Live Session)

Before any live session begins, ALL of the following must be checked in this document:

- [ ] CV-1 resolved (for ComicVine sessions)
- [ ] CV-2 resolved (for any metadata storage)
- [ ] CV-3 resolved (for any frozen artifact commit)
- [ ] CV-4 resolved (for any repository commit of real payload)
- [ ] CV-6 confirmed (key present, valid, authorized)
- [ ] GC-4 confirmed (GCD access arrangement)
- [ ] GC-5 determined (anonymous vs. authenticated mode confirmed)
- [ ] Rate budget predeclared in `scripts/live-evidence/request-manifest-v1.json`
- [ ] Capture protocol documented in `scripts/live-evidence/capture-protocol.md`
- [ ] No cover URLs or cover binaries in capture scope

---

## Unsupported Conclusions

This decision record does **not** establish:

1. **Legal clearance for any live request.** It documents what questions must be answered. All questions remain unresolved.
2. **Commercial permission.** The absence of a negative answer is not a positive permission.
3. **That GCD CC BY-SA automatically permits all uses.** Attribution, ShareAlike, and operational suitability remain separate required controls.
4. **Source superiority, suitability, or production recommendation.** Licensing suitability is one dimension of operational readiness; it does not establish route ownership or recommendation quality.
5. **That this document replaces legal advice.** It is an engineering record of published terms and open questions.
