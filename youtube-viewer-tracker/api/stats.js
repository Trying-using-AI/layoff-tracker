'use strict';
const sb = require('./_sb');

function toBucket(ts) {
  const ms = new Date(ts).getTime();
  return new Date(Math.floor(ms / 300000) * 300000).toISOString();
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    // Live videos
    const { data: liveVideos, error: lvErr } = await sb
      .from('videos')
      .select('video_id, title, thumbnail_url, status, peak_viewers')
      .eq('status', 'live');
    if (lvErr) throw lvErr;

    // Latest snapshot per live video (one round-trip each, but count is small)
    const liveWithCounts = await Promise.all((liveVideos || []).map(async v => {
      const { data: snap } = await sb
        .from('viewer_snapshots')
        .select('concurrent_viewers, timestamp')
        .eq('video_id', v.video_id)
        .order('timestamp', { ascending: false })
        .limit(1)
        .maybeSingle();
      return { ...v, current_viewers: snap?.concurrent_viewers ?? 0, last_updated: snap?.timestamp };
    }));

    const totalCurrent = liveWithCounts.reduce((n, v) => n + v.current_viewers, 0);

    // Today's peak (aggregate snapshots since midnight UTC)
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const { data: todaySnaps } = await sb
      .from('viewer_snapshots')
      .select('video_id, timestamp, concurrent_viewers')
      .gte('timestamp', todayStart.toISOString());

    let todayPeak = 0;
    if (todaySnaps?.length) {
      const bucketVideo = {}; // "bucket::videoId" -> max viewers
      for (const s of todaySnaps) {
        const k = `${toBucket(s.timestamp)}::${s.video_id}`;
        if (bucketVideo[k] == null || s.concurrent_viewers > bucketVideo[k]) {
          bucketVideo[k] = s.concurrent_viewers;
        }
      }
      const byBucket = {};
      for (const [k, v] of Object.entries(bucketVideo)) {
        const b = k.split('::')[0];
        byBucket[b] = (byBucket[b] || 0) + v;
      }
      todayPeak = Math.max(0, ...Object.values(byBucket));
    }

    // Sessions this week
    const since7 = new Date(Date.now() - 7 * 86400000).toISOString();
    const { count } = await sb
      .from('videos')
      .select('*', { count: 'exact', head: true })
      .or(`last_seen_at.gte.${since7},status.eq.live`);

    res.json({
      live_videos:           liveWithCounts,
      total_current_viewers: totalCurrent,
      today_peak_viewers:    todayPeak,
      active_streams:        (liveVideos || []).length,
      sessions_this_week:    count || 0,
    });
  } catch (err) {
    console.error('/api/stats', err.message);
    res.status(500).json({ error: err.message });
  }
};
