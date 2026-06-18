'use strict';
const sb            = require('../_sb');
const { discoverLive } = require('../_yt');

// Called every 30 min by Vercel Cron.
// Searches for live streams and saves initial snapshots.
module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const now = new Date().toISOString();
  try {
    const streams = await discoverLive();
    console.log(`[discover] ${streams.length} live stream(s) found`);

    for (const s of streams) {
      const { error: uErr } = await sb.rpc('upsert_video', {
        p_video_id:      s.video_id,
        p_title:         s.title,
        p_channel_id:    s.channel_id,
        p_channel_title: s.channel_title,
        p_thumbnail_url: s.thumbnail_url,
        p_viewers:       s.concurrent_viewers,
      });
      if (uErr) console.error('[discover] upsert_video error:', uErr.message);

      const { error: sErr } = await sb.from('viewer_snapshots').insert({
        video_id:           s.video_id,
        timestamp:          now,
        concurrent_viewers: s.concurrent_viewers,
      });
      if (sErr) console.error('[discover] snapshot insert error:', sErr.message);

      console.log(`[discover] ▶ "${s.title}" — ${s.concurrent_viewers.toLocaleString()} viewers`);
    }

    res.json({ ok: true, found: streams.length, ts: now });
  } catch (err) {
    console.error('[discover] fatal:', err.message);
    res.status(500).json({ error: err.message });
  }
};
