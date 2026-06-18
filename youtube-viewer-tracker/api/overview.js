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
    const { data: snaps, error } = await sb
      .from('viewer_snapshots')
      .select('video_id, timestamp, concurrent_viewers')
      .gte('timestamp', since)
      .order('timestamp', { ascending: true });
    if (error) throw error;

    // Step 1: per (bucket, video) take MAX viewers to de-dupe rapid polls
    const bucketVideo = {};
    for (const s of (snaps || [])) {
      const k = `${toBucket(s.timestamp)}|${s.video_id}`;
      if (bucketVideo[k] == null || s.concurrent_viewers > bucketVideo[k].v) {
        bucketVideo[k] = { bucket: toBucket(s.timestamp), v: s.concurrent_viewers };
      }
    }

    // Step 2: sum across videos within the same bucket
    const byBucket = {};
    for (const { bucket, v } of Object.values(bucketVideo)) {
      if (!byBucket[bucket]) byBucket[bucket] = { time_bucket: bucket, total_viewers: 0, active_streams: 0 };
      byBucket[bucket].total_viewers  += v;
      byBucket[bucket].active_streams += 1;
    }

    const result = Object.values(byBucket).sort((a, b) => a.time_bucket.localeCompare(b.time_bucket));
    res.json(result);
  } catch (err) {
    console.error('/api/overview', err.message);
    res.status(500).json({ error: err.message });
  }
};
