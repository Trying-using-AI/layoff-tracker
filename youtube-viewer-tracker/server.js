'use strict';
require('dotenv').config();

const express = require('express');
const cron    = require('node-cron');
const path    = require('path');

const {
  initDB, upsertVideo, saveSnapshot, markVideoOffline,
  getOverviewData, getVideoBreakdown, getVideos, getVideoViewers, getCurrentLiveStats,
} = require('./db');
const { discoverLiveVideos, getViewerCounts } = require('./youtube');

const app  = express();
const PORT = process.env.PORT || 3000;

// Video IDs we currently know are live — cheap to poll every 5 min.
const trackedIds = new Set();

// ─── Polling ─────────────────────────────────────────────────────────────────

async function pollViewerCounts() {
  if (trackedIds.size === 0) return;
  const ts = new Date().toISOString();
  try {
    const details = await getViewerCounts([...trackedIds]);
    let total = 0;
    for (const v of details) {
      if (!v.is_live) {
        markVideoOffline(v.video_id);
        trackedIds.delete(v.video_id);
        console.log(`[${ts}] ⬇  Ended: "${v.title}"`);
        continue;
      }
      saveSnapshot(v.video_id, v.concurrent_viewers);
      total += v.concurrent_viewers;
    }
    console.log(`[${ts}] 📊 ${details.filter(v => v.is_live).length} live — ${total.toLocaleString()} viewers`);
  } catch (err) {
    console.error(`[${ts}] Poll error:`, err.message);
  }
}

async function discoverAndTrack() {
  const ts = new Date().toISOString();
  try {
    const streams = await discoverLiveVideos();
    for (const s of streams) {
      upsertVideo({
        video_id:      s.video_id,
        title:         s.title,
        channel_id:    s.channel_id,
        channel_title: s.channel_title,
        thumbnail_url: s.thumbnail_url,
        last_seen_at:  s.last_seen_at,
        status:        'live',
        peak_viewers:  s.concurrent_viewers,
      });
      saveSnapshot(s.video_id, s.concurrent_viewers);
      if (!trackedIds.has(s.video_id)) {
        trackedIds.add(s.video_id);
        console.log(`[${ts}] ▶  New: "${s.title}" (${s.concurrent_viewers.toLocaleString()} viewers)`);
      }
    }
    if (!streams.length) console.log(`[${ts}] 🔍 No live streams found`);
  } catch (err) {
    console.error(`[${ts}] Discovery error:`, err.message);
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

const wrap = fn => (req, res) => {
  try { res.json(fn(req)); }
  catch (e) { res.status(500).json({ error: e.message }); }
};

app.get('/api/stats',           wrap(() => getCurrentLiveStats()));
app.get('/api/overview',        wrap(req => getOverviewData(clampDays(req))));
app.get('/api/breakdown',       wrap(req => getVideoBreakdown(clampDays(req))));
app.get('/api/videos',          wrap(req => getVideos(clampDays(req))));
app.get('/api/videos/:id/viewers', wrap(req => getVideoViewers(req.params.id)));

function clampDays(req) { return Math.min(parseInt(req.query.days) || 7, 30); }

// ─── Startup ──────────────────────────────────────────────────────────────────

async function start() {
  initDB();

  // Immediate first pass
  await discoverAndTrack();
  await pollViewerCounts();

  // Every 5 min — poll viewer counts for tracked live videos (1 quota unit/call)
  cron.schedule('*/5 * * * *', async () => {
    await pollViewerCounts();
    if (trackedIds.size === 0) await discoverAndTrack(); // quick re-check if nothing live
  });

  // Every 30 min — search for new live streams (100 quota units/call)
  cron.schedule('*/30 * * * *', discoverAndTrack);

  app.listen(PORT, () => {
    console.log(`\n🧘 Yoga Circle Viewer Dashboard → http://localhost:${PORT}`);
    console.log(`   Channel : ${process.env.YOUTUBE_CHANNEL_ID || 'UCSE72IaHOL-1Tv-m3JHE4Cg'}`);
    console.log(`   Poll    : every 5 min (viewers) / 30 min (discovery)\n`);
  });
}

start().catch(err => {
  console.error('Startup failed:', err);
  process.exit(1);
});
