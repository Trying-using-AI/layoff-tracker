'use strict';
const sb = require('./_sb');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const days  = Math.min(parseInt(req.query.days) || 7, 30);
  const since = new Date(Date.now() - days * 86400000).toISOString();

  try {
    const { data: videos, error: vErr } = await sb
      .from('videos')
      .select('*')
      .or(`last_seen_at.gte.${since},status.eq.live`)
      .order('first_seen_at', { ascending: false });
    if (vErr) throw vErr;
    if (!videos?.length) return res.json([]);

    // Fetch all snapshots for these videos in one query
    const ids = videos.map(v => v.video_id);
    const { data: snaps, error: sErr } = await sb
      .from('viewer_snapshots')
      .select('video_id, timestamp, concurrent_viewers')
      .in('video_id', ids)
      .gte('timestamp', since)
      .order('timestamp', { ascending: true });
    if (sErr) throw sErr;

    // Group snapshots by video
    const byVideo = {};
    for (const s of (snaps || [])) {
      if (!byVideo[s.video_id]) byVideo[s.video_id] = [];
      byVideo[s.video_id].push(s);
    }

    const result = videos.map(v => {
      const arr = byVideo[v.video_id] || [];
      const sessionPeak = arr.reduce((m, s) => Math.max(m, s.concurrent_viewers), 0);
      return {
        ...v,
        snapshot_count: arr.length,
        stream_start:   arr[0]?.timestamp   || null,
        stream_end:     arr[arr.length - 1]?.timestamp || null,
        session_peak:   sessionPeak,
      };
    });

    res.json(result);
  } catch (err) {
    console.error('/api/videos', err.message);
    res.status(500).json({ error: err.message });
  }
};
