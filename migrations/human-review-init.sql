-- Human Review durable storage — Vercel Postgres (Neon) init script
-- Run once:  psql $POSTGRES_URL < migrations/human-review-init.sql
-- Idempotent: uses IF NOT EXISTS / CREATE INDEX IF NOT EXISTS throughout.

-- ---------------------------------------------------------------------------
-- Snapshots table
-- One immutable row per snapshot identity (snapshotId is the PK).
-- content_sha256 guards against content mutation on re-submission.
-- payload_json holds the full snapshot object for deterministic re-export.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS human_review_snapshots (
  snapshot_id     TEXT        NOT NULL PRIMARY KEY,
  profile_id      TEXT        NOT NULL,
  schema_version  TEXT        NOT NULL,
  rubric_version  TEXT        NOT NULL,
  content_sha256  TEXT        NOT NULL,
  payload_json    JSONB       NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for lookups by profile
CREATE INDEX IF NOT EXISTS idx_hr_snapshots_profile_id
  ON human_review_snapshots (profile_id);

-- ---------------------------------------------------------------------------
-- Reviews table
-- Append-only review records.
-- review_id is the application-generated unique key (deterministic fingerprint).
-- reviewer_id is a pseudonymous identifier; no raw patron identity is stored.
-- payload_json holds the full record for deterministic export/re-import.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS human_review_reviews (
  review_id       TEXT        NOT NULL PRIMARY KEY,
  snapshot_id     TEXT        NOT NULL REFERENCES human_review_snapshots(snapshot_id),
  profile_id      TEXT        NOT NULL,
  reviewer_id     TEXT        NOT NULL,
  schema_version  TEXT        NOT NULL,
  rubric_id       TEXT        NOT NULL,
  rubric_version  TEXT        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload_json    JSONB       NOT NULL
);

-- Index for lookups by snapshot
CREATE INDEX IF NOT EXISTS idx_hr_reviews_snapshot_id
  ON human_review_reviews (snapshot_id);

-- Index for lookups by reviewer
CREATE INDEX IF NOT EXISTS idx_hr_reviews_reviewer_id
  ON human_review_reviews (reviewer_id);

-- Duplicate-reviewer protection: one review per reviewer per snapshot.
-- Mirrors the dedupeReviewIds policy in human-review-core.mjs extended to
-- prevent the same reviewer from submitting a second review for the same slate.
CREATE UNIQUE INDEX IF NOT EXISTS idx_hr_reviews_reviewer_snapshot_unique
  ON human_review_reviews (snapshot_id, reviewer_id);

CREATE TABLE IF NOT EXISTS human_review_drafts (
  snapshot_id  TEXT        NOT NULL,
  reviewer_id  TEXT        NOT NULL,
  profile_id   TEXT        NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL,
  payload_json JSONB       NOT NULL,
  PRIMARY KEY (snapshot_id, reviewer_id)
);
