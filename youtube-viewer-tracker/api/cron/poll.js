'use strict';
const sb              = require('../_sb');
const { fetchDetails } = require('../_yt');

// Called every 5 min by Vercel Cron.
// Polls viewer counts for tracked live videos (1 quota unit per call, not per video).
module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const now = new Date().toISOString();
  try {
    const { data: liveRows, error: lvErr } = await sb
      .from('videos')
      .select('video_id')
      .eq('status', 'live');

    if (lvErr) throw lvErr;
    if (!liveRows?.length) {
      console.log('[poll] No live videos currently tracked');
      return res.json({ ok: true, polled: 0 });
    }

    const ids     = liveRows.map(r => r.video_id);
    const details = await fetchDetails(ids);
    let polled    = 0;
    let totalViewers = 0;

    for (const v of details) {
      if (!v.is_live) {
        await sb.rpc('mark_offline', { p_video_id: v.video_id });
        console.log(`[poll] ⬇ "${v.title}" went offline`);
        continue;
      }

      const { error: sErr } = await sb.from('viewer_snapshots').insert({
        video_id:           v.video_id,
        timestamp:          now,
        concurrent_viewers: v.concurrent_viewers,
      });
      if (sErr) console.error('[poll] snapshot insert error:', sErr.message);

      const { error: tErr } = await sb.rpc('touch_video', {
        p_video_id: v.video_id,
        p_viewers:  v.concurrent_viewers,
      });
      if (tErr) console.error('[poll] touch_video error:', tErr.message);

      totalViewers += v.concurrent_viewers;
      polled++;
    }

    console.log(`[poll] ${polled} live — ${totalViewers.toLocaleString()} total viewers`);
    res.json({ ok: true, polled, total_viewers: totalViewers, ts: now });
  } catch (err) {
    console.error('[poll] fatal:', err.message);
    res.status(500).json({ error: err.message });
  }
};
