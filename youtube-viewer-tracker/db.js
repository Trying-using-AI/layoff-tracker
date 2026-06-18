'use strict';
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'viewers.db');

let _db = null;
function db() {
  if (!_db) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.pragma('synchronous = NORMAL');
  }
  return _db;
}

// Rounds a timestamp column down to the nearest 5-minute bucket.
const BUCKET = (col) =>
  `strftime('%Y-%m-%dT%H:', ${col}) || printf('%02d', (CAST(strftime('%M', ${col}) AS INTEGER) / 5) * 5) || ':00Z'`;

function initDB() {
  db().exec(`
    CREATE TABLE IF NOT EXISTS videos (
      video_id      TEXT PRIMARY KEY,
      title         TEXT NOT NULL,
      channel_id    TEXT NOT NULL,
      channel_title TEXT,
      thumbnail_url TEXT,
      first_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      last_seen_at  TEXT,
      status        TEXT NOT NULL DEFAULT 'live',
      peak_viewers  INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS viewer_snapshots (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      video_id           TEXT NOT NULL,
      timestamp          TEXT NOT NULL,
      concurrent_viewers INTEGER NOT NULL,
      FOREIGN KEY (video_id) REFERENCES videos(video_id)
    );

    CREATE INDEX IF NOT EXISTS idx_snap_vid_ts ON viewer_snapshots(video_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_snap_ts     ON viewer_snapshots(timestamp);
  `);
}

function upsertVideo(v) {
  db().prepare(`
    INSERT INTO videos
      (video_id, title, channel_id, channel_title, thumbnail_url, last_seen_at, status, peak_viewers)
    VALUES
      (@video_id, @title, @channel_id, @channel_title, @thumbnail_url, @last_seen_at, @status, @peak_viewers)
    ON CONFLICT(video_id) DO UPDATE SET
      title         = excluded.title,
      last_seen_at  = excluded.last_seen_at,
      status        = excluded.status,
      peak_viewers  = MAX(videos.peak_viewers, excluded.peak_viewers)
  `).run(v);
}

function saveSnapshot(videoId, viewers) {
  const now = new Date().toISOString();
  db().prepare(
    `INSERT INTO viewer_snapshots (video_id, timestamp, concurrent_viewers) VALUES (?, ?, ?)`
  ).run(videoId, now, viewers);
  db().prepare(
    `UPDATE videos SET peak_viewers = MAX(peak_viewers, ?) WHERE video_id = ?`
  ).run(viewers, videoId);
}

function markVideoOffline(videoId) {
  db().prepare(
    `UPDATE videos SET status='offline', last_seen_at=strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE video_id=?`
  ).run(videoId);
}

function getOverviewData(days = 7) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  return db().prepare(`
    SELECT
      time_bucket,
      SUM(max_per_video) AS total_viewers,
      COUNT(*)           AS active_streams
    FROM (
      SELECT
        ${BUCKET('timestamp')} AS time_bucket,
        video_id,
        MAX(concurrent_viewers) AS max_per_video
      FROM viewer_snapshots
      WHERE timestamp >= ?
      GROUP BY time_bucket, video_id
    )
    GROUP BY time_bucket
    ORDER BY time_bucket ASC
  `).all(since);
}

function getVideoBreakdown(days = 7) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  return db().prepare(`
    SELECT
      s.video_id,
      v.title,
      ${BUCKET('s.timestamp')} AS time_bucket,
      MAX(s.concurrent_viewers) AS viewers
    FROM viewer_snapshots s
    JOIN videos v ON s.video_id = v.video_id
    WHERE s.timestamp >= ?
    GROUP BY time_bucket, s.video_id
    ORDER BY s.video_id, time_bucket ASC
  `).all(since);
}

function getVideos(days = 7) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  return db().prepare(`
    SELECT
      v.*,
      COUNT(s.id)               AS snapshot_count,
      MIN(s.timestamp)          AS stream_start,
      MAX(s.timestamp)          AS stream_end,
      MAX(s.concurrent_viewers) AS session_peak
    FROM videos v
    LEFT JOIN viewer_snapshots s
      ON v.video_id = s.video_id AND s.timestamp >= ?
    WHERE v.last_seen_at >= ? OR v.status = 'live'
    GROUP BY v.video_id
    ORDER BY v.first_seen_at DESC
  `).all(since, since);
}

function getVideoViewers(videoId) {
  return db().prepare(`
    SELECT
      ${BUCKET('timestamp')} AS time_bucket,
      MAX(concurrent_viewers) AS viewers
    FROM viewer_snapshots
    WHERE video_id = ?
    GROUP BY time_bucket
    ORDER BY time_bucket ASC
  `).all(videoId);
}

function getCurrentLiveStats() {
  const liveVideos = db().prepare(`
    SELECT
      v.video_id, v.title, v.thumbnail_url, v.status, v.peak_viewers,
      s.concurrent_viewers AS current_viewers,
      s.timestamp          AS last_updated
    FROM videos v
    JOIN viewer_snapshots s ON v.video_id = s.video_id
    WHERE v.status = 'live'
      AND s.timestamp = (SELECT MAX(timestamp) FROM viewer_snapshots WHERE video_id = v.video_id)
    ORDER BY s.concurrent_viewers DESC
  `).all();

  const total = liveVideos.reduce((n, v) => n + (v.current_viewers || 0), 0);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const peakRow = db().prepare(`
    SELECT MAX(sub.total) AS peak
    FROM (
      SELECT SUM(concurrent_viewers) AS total
      FROM viewer_snapshots
      WHERE timestamp >= ?
      GROUP BY ${BUCKET('timestamp')}
    ) sub
  `).get(todayStart.toISOString());

  const since7 = new Date(Date.now() - 7 * 86400000).toISOString();
  const sessRow = db().prepare(
    `SELECT COUNT(*) AS cnt FROM videos WHERE last_seen_at >= ? OR status='live'`
  ).get(since7);

  return {
    live_videos:           liveVideos,
    total_current_viewers: total,
    today_peak_viewers:    peakRow?.peak  || 0,
    active_streams:        liveVideos.length,
    sessions_this_week:    sessRow?.cnt   || 0,
  };
}

module.exports = {
  initDB, upsertVideo, saveSnapshot, markVideoOffline,
  getOverviewData, getVideoBreakdown, getVideos, getVideoViewers, getCurrentLiveStats,
};
