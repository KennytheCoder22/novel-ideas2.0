CREATE TABLE IF NOT EXISTS swipe_card_performance (
  card_id TEXT NOT NULL,
  age_band TEXT NOT NULL,
  card_type TEXT NOT NULL,
  title TEXT NOT NULL,
  times_shown BIGINT NOT NULL DEFAULT 0,
  likes BIGINT NOT NULL DEFAULT 0,
  dislikes BIGINT NOT NULL DEFAULT 0,
  skips BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (card_id, age_band)
);

CREATE TABLE IF NOT EXISTS swipe_card_performance_events (
  event_id TEXT PRIMARY KEY,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
