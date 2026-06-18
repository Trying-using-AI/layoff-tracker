'use strict';
const sb = require('./_sb');

function toBucket(ts) {
  const ms = new Date(ts).getTime();
  return new Date(Math.floor(ms / 300000) * 300000).toISOString();
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const days  = Math.min(parseInt(req.query.days) || 7, 30);
  const since = new Date(Date.now() - days * 86400000).toISOString();

  try {
    // Join with videos to get title in one query
    const { data: snaps, error } = await sb
      .from('viewer_snapshots')
      .select('video_id, timestamp, concurrent_viewers, videos(title)')
      .gte('timestamp', since)
      .order('timestamp', { ascending: true });
    if (error) throw error;

    // Per (video, bucket) take MAX viewers
    const map = {};
    for (const s of (snaps || [])) {
      const b = toBucket(s.timestamp);
      const k = `${s.video_id}|${b}`;
      if (map[k] == null || s.concurrent_viewers > map[k].viewers) {
        map[k] = {
          video_id:    s.video_id,
          title:       s.videos?.title || 'Unknown',
          time_bucket: b,
          viewers:     s.concurrent_viewers,
        };
      }
    }

    const result = Object.values(map).sort((a, b) =>
      a.video_id !== b.video_id
        ? a.video_id.localeCompare(b.video_id)
        : a.time_bucket.localeCompare(b.time_bucket)
    );
    res.json(result);
  } catch (err) {
    console.error('/api/breakdown', err.message);
    res.status(500).json({ error: err.message });
  }
};
