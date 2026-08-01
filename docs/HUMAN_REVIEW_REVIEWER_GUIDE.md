# Human Review Reviewer Guide (Rubric v1)

This guide is for reviewers. It explains how to review one recommendation slate using the current Human Review pipeline.

## 1. Prepare your workspace

From a clean checkout at the repository root:

```powershell
npm install
```

## 2. Generate or locate recommendation snapshots

If snapshots are not already available, generate them:

```powershell
npm run human-review:capture-snapshots
```

Snapshots are written to:

`scripts/output/human-review/snapshots/`

Each snapshot file name looks like:

`<profileId>__<snapshotId>.json`

Example:

`teens-sci-fi-identity-v1__c8cd114ed4660a58.json`

## 3. Open one snapshot and copy required fields exactly

Open one snapshot JSON file and copy:

1. `snapshotId` (top-level field)
2. `profileId` (top-level field)
3. For each recommendation item:
   - `rank`
   - `title`

Use the exact values from the snapshot. Do not re-order or rename titles.

## 4. Create your review file from the template

Copy this template file:

`scripts/human-review/templates/human-review-record.v1.template.json`

Save your working copy somewhere writable, for example:

`scripts/output/human-review/my-review.<yourname>.json`

Then fill in:

1. `reviewId` with a unique ID.
2. `snapshotId` and `profileId` from the snapshot.
3. `reviewerId` with your reviewer identifier.
4. For each `itemReviews[]` entry:
   - keep the exact `rank` and `title` from the snapshot
   - set `overallScore` (integer 1-5)
   - set `decision` (`recommend`, `weak_recommend`, or `not_recommended`)
   - complete all rubric criteria in `criteriaRatings`:
     - `taste_alignment` (1-5)
     - `novelty` (1-5)
     - `confidence` (1-5)

### If your snapshot has more or fewer than 5 recommendations

- If fewer than 5, remove extra `itemReviews` entries so rank/title rows match the snapshot exactly.
- If more than 5, copy an existing item block and add additional rows (`rank` 6, 7, ...) until every snapshot recommendation is covered.

## 5. Append your review judgment

Run:

```powershell
npm run human-review:append-review -- --record scripts/output/human-review/my-review.<yourname>.json
```

## 6. Verify acceptance

A successful append prints JSON including:

- `"status": "ok"`
- `"appendOnly": true`
- `"appendedReviewId": "<your review id>"`

The append-only record store is:

`scripts/output/human-review/review-records.v1.ndjson`

## 7. Generate the aggregate report

Run:

```powershell
npm run human-review:report
```

Outputs:

- `scripts/output/human-review/reports/human-review-report.v1.json`
- `scripts/output/human-review/reports/human-review-report.v1.txt`

## 8. Validation-only check (safe sandbox; no real evidence file)

To verify your completed review file is valid without writing to the shared review evidence file, append into a temporary sandbox file:

```powershell
npm run human-review:append-review -- --record scripts/output/human-review/my-review.<yourname>.json --out .tmp/human-review-validation/review-records.validation.ndjson
```

If this succeeds (`"status": "ok"`), your review file format is accepted by the existing append-review pipeline.

You can delete the sandbox file afterward:

```powershell
Remove-Item .tmp/human-review-validation/review-records.validation.ndjson -ErrorAction SilentlyContinue
```
