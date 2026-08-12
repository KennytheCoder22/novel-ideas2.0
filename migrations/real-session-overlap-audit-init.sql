CREATE TABLE IF NOT EXISTS real_session_overlap_audit (
  audit_id TEXT PRIMARY KEY,
  library_id TEXT NOT NULL,
  patron_hash TEXT NOT NULL,
  age_band TEXT NOT NULL,
  likes INTEGER NOT NULL,
  dislikes INTEGER NOT NULL,
  skips INTEGER NOT NULL,
  dominant_taste JSONB NOT NULL,
  local_queries JSONB NOT NULL,
  final_recommendations JSONB NOT NULL,
  recent_overlaps JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
