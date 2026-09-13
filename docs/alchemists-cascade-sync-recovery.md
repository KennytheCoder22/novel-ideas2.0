# Cascade save/sync recovery

## Confirmed production failure (September 12, 2026)

A canonical generated QA board event posted to the production endpoint returned
HTTP 503 with `cascade_quota_storage_unavailable`. This is not evidence that Blob
storage is missing: it is the failure branch around PostgreSQL quota enforcement.
Authenticated production logs now confirm `missing_connection_string`: no
`POSTGRES_URL` was configured. Project environment inspection found neither that
key nor another database URL. Team Marketplace resource listing returned no
resources. A database must be provisioned/connected with user approval; this is
not a failed campaign save or a demonstrated SQL query defect.

After explicit approval and Marketplace terms acceptance, Neon Free resource
`cascade-quota` was provisioned in iad1 with auth disabled, connected only to
production. The actual quota implementation successfully created/used its table
and returned allowed=true for an isolated QA counter. No campaign data was reset.

The preserved QA campaign has 500 pending events and stalls on recipe 10. Do not
reset it or clear storage. No production campaign data was modified by this repair.

## Client repair

- The former 500-event cap is no longer a transaction failure. All old and new
  events stay in the existing durable queue, requiring no destructive migration.
- Real device-storage write failures still stop safely; storage is not infinite.
- Retry every 15 seconds even without new game actions; coalesce overlapping
  flushes, stop a batch on failure, and back off service outages for 60 seconds.
- Preserve strict acknowledgement checks and remove only acknowledged events.
- Show a safe quota-storage outage message, never raw server error content.
- Use same-origin API requests on web, independent of native API configuration.

## Required server recovery and release checks

1. Inspect Vercel function logs for `[alchemists-cascade] quota_storage_unavailable`.
2. Verify the production PostgreSQL connection used by `@vercel/postgres` is
   configured and reachable. Check the logged error before changing anything;
   it may be a connection, permissions, or query problem. Do not disclose secrets.
3. Verify the database role can create/use `alchemists_cascade_quota` and execute
   the quota statement. Keep shared quota enforcement enabled, fail-closed.
4. Deploy the reviewed client repair and any verified server/config correction.
5. Verify a QA event gets a durable 201 acknowledgement and replay gets 200 with
   `idempotentReplay: true`. Verify the preserved 500-event campaign drains and
   recipe 10 moves save after reload. Then finish recipes 11–12 and the ending.

## Verified release

Deployment `dpl_B4r9fLJCGAhgu5Fm19ntwZXBeUJX` (application commit 59c730e)
was built without live-domain assignment, verified with a synthetic QA event
(201 durable acceptance; 200 idempotent replay), then promoted to production.
The live domain passed the same checks. All 20 Cascade regression groups,
targeted lint and the local web build passed. Vercel's build completed; it also
reported an unrelated existing type diagnostic in api/human-review-append.ts.

The preserved campaign restored its exact recipe-10 state. Its previously failing
move succeeded: 11 moves/4,740 points became 10 moves/4,920 points. Pending notes
decreased from 500 to 404 through normal acknowledgements, without clearing data.
The post-promotion Cascade error-log query returned no entries. Full backlog
drain and recipes 11–12 remain follow-up playtest checks.
