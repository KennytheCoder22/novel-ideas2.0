# Live Evidence Capture Protocol
## Graphic Novel Source Competence Phase IV

**Document version:** 1.0  
**Governing licensing record:** `docs/GRAPHIC_NOVEL_LIVE_EVIDENCE_LICENSING_DECISION.md`  
**Governing roadmap:** `docs/NOVELIDEAS_COMPLETION_ROADMAP.md` §5  
**Evidence class:** Representative Frozen Class and Live Observation Class (as declared per artifact)

---

## 1. Purpose

This protocol defines the exact rules for capturing, storing, freezing, and replaying live evidence from GCD and ComicVine during the Phase IV live observation phase. It governs:

- what may be committed to the repository (Tier 1)
- what must be discarded after analysis (Tier 2)
- the provenance block format required for every artifact
- how field-presence data is recorded without storing values
- how replay safety is established
- how stop conditions are detected and emitted

No live capture may proceed until all pre-probe checklist items in `docs/GRAPHIC_NOVEL_LIVE_EVIDENCE_LICENSING_DECISION.md` are checked.

---

## 2. Tier Separation

Every capture operation produces at most two tiers. Tier 2 exists only in local memory or a temporary file that is never committed.

### Tier 1 — Redacted Observation Artifact (committable pending terms resolution)

A Tier 1 artifact contains only:

- `source` — source identifier (`gcd` or `comicvine`)
- `evidenceClass` — `"Representative Frozen Class"` or `"Live Observation Class"` (never `"Fixture Class"`)
- `captureTimestamp` — ISO 8601 UTC
- `endpoint` — API endpoint URL template (no credentials)
- `apiSchemaVersion` — version or `"undocumented"` if not available in response
- `profileId` — the profile from the request manifest
- `requestParameters` — query parameters used (no API key)
- `httpStatus` — integer status code
- `responseTimeMs` — integer milliseconds
- `recordCount` — integer count of returned records
- `rateLimitHeaders` — parsed object (not raw string) with fields `requestsRemaining`, `resetAfterSeconds`, `velocityDetected`
- `sourceNativeIds` — array of source-native record ID strings only (no titles, creators, descriptions)
- `fieldPresence` — object mapping field name to presence statistics (see §4)
- `stopConditionEmitted` — `null` or stop condition reason code string
- `captureHash` — SHA-256 of the serialized Tier 1 artifact itself (computed after all other fields are set)
- `provenance` — provenance block (see §3)

Tier 1 artifacts may be committed to the repository if and only if the relevant legal questions in the licensing decision record are resolved. Until then they remain local-only.

### Tier 2 — Raw Response Capture (never committed)

Tier 2 contains:

- Full response body as received
- All metadata field values (titles, creators, descriptions, genres)
- Cover URLs (if returned — must not be stored beyond the analysis step)
- Raw request/response headers

Tier 2 is used only to produce the Tier 1 field-presence statistics. It must be discarded (garbage-collected from memory or deleted from any temp file) immediately after Tier 1 extraction completes for a given response. Tier 2 must never be written to any file in the repository or any versioned artifact store.

---

## 3. Provenance Block Format

### GCD (mandatory)

Every GCD Tier 1 artifact must carry this block as its `provenance` field:

```json
{
  "source": "Grand Comics Database",
  "sourceUrl": "https://www.comics.org",
  "endpointUrl": "<endpoint URL used>",
  "captureDate": "<ISO 8601 UTC>",
  "license": "CC BY-SA 4.0",
  "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/",
  "modified": false,
  "modificationNote": null,
  "attribution": "Grand Comics Database (https://www.comics.org), CC BY-SA 4.0",
  "shareAlikeAssessmentPending": true,
  "coversExcluded": true
}
```

When `modified` is `true`, `modificationNote` must describe what was modified (e.g., field names normalized, values redacted).

### ComicVine (mandatory)

```json
{
  "source": "ComicVine",
  "sourceUrl": "https://comicvine.gamespot.com",
  "endpointUrl": "<endpoint URL used>",
  "captureDate": "<ISO 8601 UTC>",
  "linkbackRequired": true,
  "linkbackTarget": "https://comicvine.gamespot.com",
  "redistribution": "restricted_pending_written_permission",
  "covers": "excluded_pending_rights_clarification",
  "commercialUseStatus": "pending_cv1_resolution",
  "capturePermitted": false
}
```

`capturePermitted: false` must remain until CV-1 through CV-4 are resolved. If all four are resolved, update to `capturePermitted: true` and record the resolution date.

---

## 4. Field Presence Schema

Field presence data in Tier 1 records whether each schema field was present (non-null, non-empty) in the returned records, without recording the values themselves.

### Per-field presence record

```json
{
  "fieldName": "<source field name>",
  "presentCount": 0,
  "totalCount": 0,
  "presenceRate": 0.0,
  "fixtureClassPresenceRate": null,
  "driftDelta": null,
  "driftStatus": "fixture_baseline_unavailable"
}
```

`fixtureClassPresenceRate` is populated by the delta reporter after comparison against Phase I/II fixture baselines. `driftDelta` is the arithmetic difference. `driftStatus` is one of:

| driftStatus | Meaning |
|---|---|
| `fixture_baseline_unavailable` | No fixture-class baseline for this field exists yet |
| `no_drift` | Absolute delta ≤ 0.10 (10 percentage points) |
| `minor_drift` | Absolute delta > 0.10 and ≤ 0.30 |
| `schema_drift_suspected` | Absolute delta > 0.30 (field dropped ≥ 30pp from fixture baseline) |
| `schema_drift_critical` | Field was 1.0 in fixture, now ≤ 0.10 in live |

### Measured fields — GCD

- `seriesId` — GCD series identifier
- `issueId` — GCD issue identifier
- `seriesName` — series title
- `issueNumber` — issue number string
- `yearBegan` — series start year
- `publicationDate` — issue publication date
- `language` — language field (key Phase III hypothesis H1)
- `creatorCredits` — creator/role list
- `binding` — format/binding field
- `pageCount` — page count
- `coverImageUrl` — cover URL (presence noted, value never stored)

### Measured fields — ComicVine

- `id` — ComicVine record identifier
- `name` — volume or issue name
- `issueNumber` — issue number string
- `startYear` — volume start year
- `publisherName` — publisher
- `description` — description field
- `genres` — genre associations
- `imageUrl` — cover URL (presence noted, value never stored)
- `creatorCredits` — person/role credits
- `deck` — short description
- `countOfIssues` — issue count for volumes

---

## 5. Replay Safety Contract

A Tier 1 observation artifact is replay-safe when all of the following hold:

1. The artifact file is committed with its `captureHash` field set to the SHA-256 of its own serialized content (excluding the `captureHash` field during hash computation, then inserting the hash).
2. Running the probe runner in `--mode replay` reads the artifact from disk and reproduces its `fieldPresence`, `sourceNativeIds`, and `recordCount` identically from the stored values — without any network call.
3. Running the probe runner with `--verify-no-network` in replay mode causes the process to exit with code 1 if any network socket is opened.
4. The `evidenceClass` field in the artifact matches the mode used to capture it.
5. The replay artifact's `captureHash` matches the hash computed from its content at replay time.

Replay must never attempt to normalize live results to match fixture-class expectations. If replay produces different field-presence rates than the frozen capture, that is a hash mismatch error, not a normalization opportunity.

---

## 6. Stop Condition Detection and Emission

Each stop condition is checked in order before, during, and after the network call. When a stop condition fires:

1. No further network calls are made for the affected source and profile.
2. A `live_evidence_unavailable` result object is written to the Tier 1 artifact with the reason code.
3. The probe runner exits with a non-zero code (code 2 = stop condition, code 1 = error).
4. The reason code is logged to stdout as structured JSON.

### Stop condition table

| Check | Timing | Reason code |
|---|---|---|
| CV-1 not resolved | Pre-run | `live_evidence_unavailable_legal_block_cv_commercial` |
| CV-4 not resolved | Pre-run | `live_evidence_unavailable_legal_block_cv_storage` |
| ComicVine API key absent from environment | Pre-run | `live_evidence_unavailable_credentials_missing` |
| GC-4 not confirmed in licensing decision record | Pre-run | `live_evidence_unavailable_legal_block_gcd_access` |
| HTTP 401 / 403 / key revocation signal | Post-request | `live_evidence_unavailable_access_refused` |
| HTTP 429 and window > session budget | Post-request | `live_evidence_unavailable_rate_limit` |
| Request timeout exceeded (all retries) | Post-request | `live_evidence_unavailable_transport_timeout` |
| Critical field absent from response (ID or title missing) | Post-parse | `live_evidence_unavailable_schema_drift` |
| Cover URL required in capture scope | Pre-store | `live_evidence_unavailable_cover_rights` |
| GCD anonymous access appears disabled | Post-request | `live_evidence_unavailable_gcd_anon_disabled` |
| Cumulative request count exceeds budget | Pre-request | `live_evidence_budget_exhausted` |

### Stop condition result object

```json
{
  "source": "gcd",
  "evidenceClass": "Live Observation Class",
  "profileId": "<profile ID>",
  "captureTimestamp": "<ISO 8601 UTC>",
  "stopConditionEmitted": "<reason code>",
  "stopConditionDetail": "<human-readable explanation>",
  "recordCount": 0,
  "fieldPresence": {},
  "sourceNativeIds": [],
  "capturePermitted": false
}
```

---

## 7. Rate Budget Enforcement

The probe runner must enforce the following before any request is made:

```
if (cumulativeRequests >= MAX_REQUESTS_PER_SESSION) {
  emit stop condition: live_evidence_budget_exhausted
  exit(2)
}
```

`MAX_REQUESTS_PER_SESSION` = 18 for both sources.

Inter-request delay must be enforced: wait ≥ 2000ms between requests.

Session-wide abort: if any single request returns a 4xx authentication/authorization error, no further requests are made for that session.

---

## 8. Secrets Management

- API credentials must be read from environment variables only (`COMICVINE_API_KEY`, `GCD_API_KEY` if applicable).
- Credentials must never appear in any artifact, log line, error message, or committed file.
- The probe runner must redact credential values from all log output before writing.
- If a credential is accidentally included in a Tier 1 artifact draft, the draft must be destroyed and the credential rotated before any further capture.

---

## 9. Evidence Class Labeling

Every artifact must carry one of:

- `evidenceClass: "Representative Frozen Class"` — point-in-time frozen capture as the reference for a given profile
- `evidenceClass: "Live Observation Class"` — repeated or incremental observation not intended as the reference frozen artifact

**Invariants:**
- A `Live Observation Class` artifact must never be fed into the comparison harness as though it were `Fixture Class`.
- A `Representative Frozen Class` artifact must never overwrite a `Fixture Class` frozen artifact (Phases I–III).
- Evidence class must not be changed after the artifact is frozen.

---

## 10. Delta Reporting

After both Tier 1 frozen artifacts are committed, the delta reporter (`scripts/live-evidence/run-frozen-live-delta.mjs`) compares field-presence rates against Phase I (GCD) and Phase II (ComicVine) fixture-class baselines.

Delta report output fields per field:

- `source`
- `fieldName`
- `fixtureClassPresenceRate` — from Phase I/II frozen artifact
- `liveObservationPresenceRate` — from Tier 1 artifact
- `delta` — live minus fixture
- `driftStatus` — per the taxonomy in §4

The delta report must not modify the frozen Tier 1 artifact. It reads both artifacts as read-only inputs and writes a separate delta report artifact.

A field-presence delta is a finding about source behavior change; it does not cause a regression failure unless it triggers `schema_drift_critical` on a critical field (ID or title).
