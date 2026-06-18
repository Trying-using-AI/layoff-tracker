-- ============================================================
-- Yoga Circle Viewer Tracker — Supabase Schema
-- Run this entire file once in: Supabase → SQL Editor → New query
-- ============================================================

-- ── Tables ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS videos (
  video_id      TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  channel_id    TEXT NOT NULL,
  channel_title TEXT,
  thumbnail_url TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at  TIMESTAMPTZ,
  status        TEXT NOT NULL DEFAULT 'live',
  peak_viewers  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS viewer_snapshots (
  id                 BIGSERIAL PRIMARY KEY,
  video_id           TEXT NOT NULL REFERENCES videos(video_id),
  "timestamp"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  concurrent_viewers INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_snap_vid_ts ON viewer_snapshots(video_id, "timestamp" DESC);
CREATE INDEX IF NOT EXISTS idx_snap_ts     ON viewer_snapshots("timestamp" DESC);

-- ── Functions ───────────────────────────────────────────────────────────

-- Upsert a video, keeping the highest peak_viewers
CREATE OR REPLACE FUNCTION upsert_video(
  p_video_id TEXT, p_title TEXT, p_channel_id TEXT,
  p_channel_title TEXT, p_thumbnail_url TEXT, p_viewers INTEGER
) RETURNS VOID LANGUAGE SQL AS $$
  INSERT INTO videos
    (video_id, title, channel_id, channel_title, thumbnail_url, last_seen_at, status, peak_viewers)
  VALUES
    (p_video_id, p_title, p_channel_id, p_channel_title, p_thumbnail_url, NOW(), 'live', p_viewers)
  ON CONFLICT (video_id) DO UPDATE SET
    title         = EXCLUDED.title,
    last_seen_at  = NOW(),
    status        = 'live',
    peak_viewers  = GREATEST(videos.peak_viewers, EXCLUDED.peak_viewers);
$$;

-- Update last_seen_at and peak atomically after a viewer poll
CREATE OR REPLACE FUNCTION touch_video(p_video_id TEXT, p_viewers INTEGER)
RETURNS VOID LANGUAGE SQL AS $$
  UPDATE videos SET
    last_seen_at = NOW(),
    peak_viewers = GREATEST(peak_viewers, p_viewers)
  WHERE video_id = p_video_id;
$$;

-- Mark a video as offline
CREATE OR REPLACE FUNCTION mark_offline(p_video_id TEXT)
RETURNS VOID LANGUAGE SQL AS $$
  UPDATE videos SET status = 'offline', last_seen_at = NOW()
  WHERE video_id = p_video_id;
$$;
