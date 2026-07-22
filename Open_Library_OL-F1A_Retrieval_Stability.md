# OL-F1A ? Open Library Retrieval Stability

## Question

Why can an identical Teen Fantasy Open Library query produce a complete retrieval pool in one run and no pool in another?

This is a diagnostics-only characterization. No query, route, timeout, retry, scoring, eligibility, ranking, merge, or recommendation behavior changed.

## Environment and exact request

The investigation ran from the local Node environment with no Open Library proxy configured. The active path was direct HTTPS.

The Teen profile uses:

- 8 documents per query
- a 2,000 ms per-query timeout
- no pagination for this request
- the fixed field list below

Exact Series request:

`https://openlibrary.org/search.json?q=young%20adult%20fantasy%20series&limit=8&fields=key%2Ctitle%2Csubtitle%2Cauthor_name%2Cfirst_publish_year%2Ccover_i%2Cedition_key%2Csubject%2Csubject_key%2Csubject_facet%2Cfirst_sentence%2Cdescription%2Cpublisher&language=eng`

## Method

Two bounded observations were compared:

1. Six identical direct endpoint requests with a 10-second client ceiling.
2. Four rotated rounds through the actual Open Library adapter, covering Series, Magical Adventure, and Teen Fantasy Adventure twelve times total.

For every adapter attempt the diagnostics recorded the exact URL, UTC timestamp, elapsed time, fetch path, timeout and retry state, HTTP status, body-completion state, full returned work-ID order, source-policy accepted count, cache-related headers, and missing/added works relative to the first successful response.

## Direct endpoint result

All six direct Series calls returned HTTP 200 with eight documents.

- Elapsed range: 362?1,198 ms
- Work-ID set changes: 0
- Order changes: 0
- Missing works: 0
- Added works: 0
- Pagination changes: not applicable
- Cache headers: no `Age`, `Via`, or `X-Cache` values were exposed

Ordered Series work IDs on every successful direct call:

1. `/works/OL29851133W`
2. `/works/OL33364737W`
3. `/works/OL17339151W`
4. `/works/OL30932790W`
5. `/works/OL20039818W`
6. `/works/OL13691568W`
7. `/works/OL20879599W`
8. `/works/OL17715454W`

This sample does not support Open Library ranking or result-set variability as the cause of the disappearing Series pool.

## Adapter result

| Query | Attempts | Successful | Timed out | Successful elapsed range | Documents / accepted | ID or order changes |
|---|---:|---:|---:|---:|---:|---:|
| `young adult fantasy series` | 4 | 3 | 1 | 370?602 ms | 8 / 5 | 0 |
| `young adult magical adventure` | 4 | 4 | 0 | 458?1,113 ms | 8 / 6 | 0 |
| `teen fantasy adventure` | 4 | 4 | 0 | 393?735 ms | 8 / 4 | 0 |

The failed Series attempt was the first adapter request in the process:

- Timestamp: `2026-07-22T06:37:13.788Z`
- Fetch path: direct
- Client timeout: 2,000 ms
- HTTP status: 200 headers received
- Elapsed: 2,001 ms
- Timed out: true
- Abort origin: local timeout
- Body completed: no
- Documents exposed to the adapter: 0
- Accepted candidates: 0
- Retry attempted: no

The next three identical Series requests completed in 602 ms, 370 ms, and 522 ms. Each returned the same eight work IDs in the same order and produced the same five source-policy-accepted candidates.

For the timeout, all eight baseline works were effectively missing because the response body did not complete before the local deadline. Across successful responses, no works were missing, added, or reordered.

## Factor assessment

| Candidate source | Assessment |
|---|---|
| Search ranking | Not observed; successful IDs and ordering were identical |
| API result variability | Not observed in the bounded sample |
| Timeout timing | Confirmed immediate cause of the zero pool |
| Cache state | Not characterizable from response headers; no cache markers were exposed |
| Proxy behavior | Excluded in this environment; all requests were direct |
| Pagination | Excluded; every request was the same first-page `limit=8` URL |
| Request ordering | The only failure occurred on the first adapter request; later rotated positions succeeded |
| Retry path | No retry occurred for the failed direct Teen request |
| Merge / normalization / eligibility | Excluded; the failed response produced no documents for those stages |

The first-request position is consistent with cold DNS/TLS/connection or upstream body-latency effects, but the bounded run does not prove which of those subcomponents consumed the deadline. The characterization should stop at the observable boundary: HTTP 200 headers arrived, the body exceeded the 2,000 ms local deadline, and the adapter converted that timing event into an empty retrieval pool.

## Conclusion

Open Library returned reproducible work pools whenever the body completed. The observed instability is retrieval-completion instability at the local timeout boundary, not evidence of changing search results.

This explains Phase 2 without changing its quality conclusions:

- Series remains high precision but operationally unstable under the current deadline.
- Magical Adventure was stable in this sample but remains lower precision.
- Series + Magical remains the most promising composition, with stability unresolved because one constituent can disappear on a body timeout.
- No strategy is ready for promotion.
- No timeout or retry change is proposed by OL-F1A.

The result is relevant beyond Fantasy: Open Library comparisons must distinguish ?different result set? from ?no completed response before the local deadline.?
