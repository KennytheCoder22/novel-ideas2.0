# Cascade save/sync recovery

## Confirmed production failure (September 12, 2026)

A canonical generated QA board event posted to the production endpoint returned
HTTP 503 with `cascade_quota_storage_unavailable`. This is not evidence that Blob
storage is missing: it is the failure branch around PostgreSQL quota enforcement.
The precise underlying database error still requires deployment logs.

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

Local tests do not establish production recovery. This branch has not been
merged or deployed and the server-side outage is not yet repaired.
