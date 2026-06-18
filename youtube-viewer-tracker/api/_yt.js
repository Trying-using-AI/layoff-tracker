const axios = require('axios');
const BASE = 'https://www.googleapis.com/youtube/v3';

function apiKey() {
  const k = process.env.YOUTUBE_API_KEY;
  if (!k) throw new Error('YOUTUBE_API_KEY is not set');
  return k;
}

// Resolves @handle to a channel ID.
// Checks YOUTUBE_CHANNEL_ID env first (cheap), otherwise calls the API.
async function resolveChannelId() {
  if (process.env.YOUTUBE_CHANNEL_ID) return process.env.YOUTUBE_CHANNEL_ID;
  const handle = (process.env.YOUTUBE_CHANNEL_HANDLE || 'yogacirclebycult').replace('@', '');
  const { data } = await axios.get(`${BASE}/channels`, {
    params: { key: apiKey(), part: 'id', forHandle: handle },
  });
  const id = data.items?.[0]?.id;
  if (!id) throw new Error(`Cannot resolve YouTube handle @${handle} to a channel ID`);
  return id;
}

// Expensive: 100 quota units. Search for live streams on channel.
async function discoverLive() {
  const channelId = await resolveChannelId();
  const { data } = await axios.get(`${BASE}/search`, {
    params: {
      key:        apiKey(),
      channelId,
      part:       'id',
      eventType:  'live',
      type:       'video',
      maxResults: 10,
    },
  });
  const ids = (data.items || []).map(i => i.id.videoId);
  return ids.length ? fetchDetails(ids) : [];
}

// Cheap: 1 quota unit per call (not per video).
async function fetchDetails(videoIds) {
  if (!videoIds.length) return [];
  const { data } = await axios.get(`${BASE}/videos`, {
    params: {
      key:  apiKey(),
      id:   videoIds.join(','),
      part: 'id,snippet,liveStreamingDetails',
    },
  });
  return (data.items || []).map(v => ({
    video_id:           v.id,
    title:              v.snippet.title,
    channel_id:         v.snippet.channelId,
    channel_title:      v.snippet.channelTitle || '',
    thumbnail_url:      v.snippet.thumbnails?.medium?.url
                        || v.snippet.thumbnails?.default?.url
                        || '',
    concurrent_viewers: parseInt(v.liveStreamingDetails?.concurrentViewers ?? '0', 10),
    is_live:            v.snippet.liveBroadcastContent === 'live',
  }));
}

module.exports = { discoverLive, fetchDetails };
