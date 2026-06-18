'use strict';
const axios = require('axios');

const API_KEY    = () => process.env.YOUTUBE_API_KEY;
const CHANNEL_ID = () => process.env.YOUTUBE_CHANNEL_ID || 'UCSE72IaHOL-1Tv-m3JHE4Cg';
const BASE       = 'https://www.googleapis.com/youtube/v3';

async function ytGet(endpoint, params) {
  const key = API_KEY();
  if (!key) throw new Error('YOUTUBE_API_KEY is not set in .env');
  const { data } = await axios.get(`${BASE}/${endpoint}`, { params: { key, ...params } });
  return data;
}

// Cheap: 1 quota unit per call regardless of how many video IDs.
async function getVideoDetails(videoIds) {
  if (!videoIds.length) return [];
  const data = await ytGet('videos', {
    id:   videoIds.join(','),
    part: 'id,snippet,liveStreamingDetails',
  });
  return (data.items || []).map(v => ({
    video_id:           v.id,
    title:              v.snippet.title,
    channel_id:         v.snippet.channelId,
    channel_title:      v.snippet.channelTitle,
    thumbnail_url:      v.snippet.thumbnails?.medium?.url
                        || v.snippet.thumbnails?.default?.url
                        || null,
    concurrent_viewers: parseInt(v.liveStreamingDetails?.concurrentViewers ?? '0', 10),
    is_live:            v.snippet.liveBroadcastContent === 'live',
    last_seen_at:       new Date().toISOString(),
  }));
}

// Expensive: 100 quota units. Call sparingly (every 30 min).
async function discoverLiveVideos() {
  const data = await ytGet('search', {
    channelId:  CHANNEL_ID(),
    part:       'id,snippet',
    eventType:  'live',
    type:       'video',
    maxResults: 10,
  });
  const ids = (data.items || []).map(i => i.id.videoId);
  if (!ids.length) return [];
  return getVideoDetails(ids);
}

// Poll viewer counts for already-known live video IDs (cheap).
async function getViewerCounts(videoIds) {
  return getVideoDetails(videoIds);
}

module.exports = { discoverLiveVideos, getViewerCounts };
