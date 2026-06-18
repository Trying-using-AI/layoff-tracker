'use strict';

// ── Utilities (hoisted as function declarations) ──────────────────────────────
function $(id) { return document.getElementById(id); }
function clamp(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function fmtNum(n) {
  if (n == null) return '0';
  return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);
}
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });
}

// ── Color palette — one per unique video, consistent across charts ────────────
const PALETTE = [
  { line: '#f59e0b', fill: 'rgba(245,158,11,0.12)' },
  { line: '#8b5cf6', fill: 'rgba(139,92,246,0.12)' },
  { line: '#10b981', fill: 'rgba(16,185,129,0.12)' },
  { line: '#06b6d4', fill: 'rgba(6,182,212,0.12)'  },
  { line: '#f97316', fill: 'rgba(249,115,22,0.12)' },
  { line: '#ec4899', fill: 'rgba(236,72,153,0.12)' },
  { line: '#84cc16', fill: 'rgba(132,204,22,0.12)' },
  { line: '#a78bfa', fill: 'rgba(167,139,250,0.12)'},
  { line: '#34d399', fill: 'rgba(52,211,153,0.12)' },
  { line: '#fb923c', fill: 'rgba(251,146,60,0.12)' },
];

// ── App state ─────────────────────────────────────────────────────────────────
const state = {
  days:          7,
  stats:         null,
  overview:      [],
  breakdown:     [],
  videos:        [],
  colorMap:      {},     // videoId → PALETTE entry
  charts:        { overview: null, breakdown: null },
  nextRefreshAt: 0,
};

function videoColor(videoId) {
  if (!state.colorMap[videoId]) {
    const i = Object.keys(state.colorMap).length % PALETTE.length;
    state.colorMap[videoId] = PALETTE[i];
  }
  return state.colorMap[videoId];
}

// ── Chart.js global defaults ──────────────────────────────────────────────────
Chart.defaults.color       = '#64748b';
Chart.defaults.borderColor = 'rgba(255,255,255,0.05)';
Chart.defaults.font.family = "'Inter', system-ui, sans-serif";

function makeScales() {
  return {
    x: {
      type: 'time',
      time: {
        displayFormats: {
          minute: 'h:mm a',
          hour:   'MMM d, ha',
          day:    'MMM d',
        },
      },
      grid:  { color: 'rgba(255,255,255,0.04)' },
      ticks: {
        color: '#475569',
        font:  { size: 11 },
        maxRotation: 0,
        maxTicksLimit: 8,
      },
    },
    y: {
      beginAtZero: true,
      grid:  { color: 'rgba(255,255,255,0.04)' },
      ticks: {
        color: '#475569',
        font:  { size: 11 },
        callback: v => v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v,
      },
    },
  };
}

function makeTooltip(extra) {
  return {
    backgroundColor: '#1a1a2e',
    borderColor:     'rgba(255,255,255,0.12)',
    borderWidth:     1,
    titleColor:      '#f1f5f9',
    bodyColor:       '#94a3b8',
    padding:         12,
    cornerRadius:    8,
    ...extra,
    callbacks: {
      label: ctx => ` ${ctx.dataset.label}: ${(ctx.parsed.y || 0).toLocaleString()} viewers`,
      ...(extra?.callbacks),
    },
  };
}

// ── API calls ─────────────────────────────────────────────────────────────────
async function apiFetch(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

async function loadAll() {
  const d = state.days;
  const [stats, overview, breakdown, videos] = await Promise.all([
    apiFetch('/api/stats'),
    apiFetch(`/api/overview?days=${d}`),
    apiFetch(`/api/breakdown?days=${d}`),
    apiFetch(`/api/videos?days=${d}`),
  ]);
  state.stats     = stats;
  state.overview  = overview;
  state.breakdown = breakdown;
  state.videos    = videos;
}

// ── Render: stat cards ────────────────────────────────────────────────────────
function renderStats() {
  const s = state.stats;
  if (!s) return;
  $('sCurrentViewers').textContent = (s.total_current_viewers ?? 0).toLocaleString();
  $('sActiveStreams').textContent   = `${s.active_streams ?? 0} active stream${s.active_streams !== 1 ? 's' : ''}`;
  $('sTodayPeak').textContent       = (s.today_peak_viewers ?? 0).toLocaleString();
  $('sSessions').textContent        = (s.sessions_this_week ?? 0).toLocaleString();
  $('liveBadge').style.display      = s.active_streams > 0 ? 'flex' : 'none';
  setStatus(s.active_streams > 0 ? 'live' : 'idle');
}

// ── Render: overview chart (total viewers, gradient fill) ─────────────────────
function renderOverview() {
  const canvas = $('overviewChart');
  const empty  = $('overviewEmpty');
  const data   = state.overview;

  if (!data.length) {
    canvas.style.display = 'none';
    empty.style.display  = 'block';
    return;
  }
  canvas.style.display = 'block';
  empty.style.display  = 'none';

  const points = data.map(d => ({ x: new Date(d.time_bucket), y: d.total_viewers }));

  const dataset = {
    label:            'Total Concurrent Viewers',
    data:             points,
    borderColor:      '#f59e0b',
    backgroundColor:  function(ctx) {
      const chart = ctx.chart;
      const { ctx: c, chartArea } = chart;
      if (!chartArea) return 'rgba(245,158,11,0.1)';
      const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
      g.addColorStop(0, 'rgba(245,158,11,0.35)');
      g.addColorStop(1, 'rgba(245,158,11,0.00)');
      return g;
    },
    fill:             true,
    tension:          0.35,
    pointRadius:      data.length > 150 ? 0 : 2,
    pointHoverRadius: 6,
    pointBackgroundColor: '#f59e0b',
    borderWidth:      2.5,
    spanGaps:         false,   // gaps between different stream sessions stay empty
  };

  if (state.charts.overview) {
    state.charts.overview.data.datasets = [dataset];
    state.charts.overview.update('active');
  } else {
    state.charts.overview = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: { datasets: [dataset] },
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        interaction:         { mode: 'index', intersect: false },
        plugins:             { legend: { display: false }, tooltip: makeTooltip() },
        scales:              makeScales(),
        animation:           { duration: 500 },
      },
    });
  }
}

// ── Render: per-video breakdown chart ─────────────────────────────────────────
function renderBreakdown() {
  const canvas = $('breakdownChart');
  const empty  = $('breakdownEmpty');
  const raw    = state.breakdown;

  if (!raw.length) {
    canvas.style.display = 'none';
    empty.style.display  = 'block';
    return;
  }
  canvas.style.display = 'block';
  empty.style.display  = 'none';

  // Group by video_id — each video is its own dataset/line
  const map = new Map();
  for (const row of raw) {
    if (!map.has(row.video_id)) map.set(row.video_id, { title: row.title, pts: [] });
    map.get(row.video_id).pts.push({ x: new Date(row.time_bucket), y: row.viewers });
  }

  const datasets = [];
  for (const [videoId, { title, pts }] of map) {
    const c = videoColor(videoId);
    datasets.push({
      label:            clamp(title, 45),
      data:             pts,
      borderColor:      c.line,
      backgroundColor:  c.fill,
      fill:             false,
      tension:          0.35,
      pointRadius:      pts.length > 150 ? 0 : 2,
      pointHoverRadius: 5,
      pointBackgroundColor: c.line,
      borderWidth:      2,
      spanGaps:         false,  // no lines across stream gaps
    });
  }

  if (state.charts.breakdown) {
    state.charts.breakdown.data.datasets = datasets;
    state.charts.breakdown.update('active');
  } else {
    state.charts.breakdown = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: { datasets },
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        interaction:         { mode: 'index', intersect: false },
        plugins: {
          legend: {
            display:  true,
            position: 'bottom',
            labels: {
              color:        '#94a3b8',
              font:         { size: 11 },
              boxWidth:     12,
              boxHeight:    12,
              borderRadius: 4,
              padding:      16,
            },
          },
          tooltip: makeTooltip(),
        },
        scales:    makeScales(),
        animation: { duration: 500 },
      },
    });
  }
}

// ── Render: video cards ───────────────────────────────────────────────────────
function renderCards() {
  const grid    = $('videoGrid');
  const empty   = $('videosEmpty');
  const videos  = state.videos;

  if (!videos.length) {
    grid.innerHTML    = '';
    grid.style.display = 'none';
    empty.style.display = 'block';
    return;
  }
  grid.style.display  = 'grid';
  empty.style.display = 'none';
  grid.innerHTML      = '';

  for (const v of videos) {
    const c      = videoColor(v.video_id);
    const isLive = v.status === 'live';
    const lv     = state.stats?.live_videos?.find(x => x.video_id === v.video_id);
    const peak   = (v.session_peak ?? v.peak_viewers ?? 0).toLocaleString();

    const card = document.createElement('div');
    card.className = 'video-card';
    card.innerHTML = `
      <div class="vcolor-bar" style="background:${c.line}"></div>
      <div class="vthumb-wrap">
        ${v.thumbnail_url
          ? `<img class="vthumb" src="${esc(v.thumbnail_url)}" alt="" loading="lazy">`
          : `<div class="vthumb-ph">&#9654;</div>`}
        <span class="vstatus ${isLive ? 'live' : 'offline'}">
          ${isLive ? '&#9679; LIVE' : 'ENDED'}
        </span>
        ${isLive && lv?.current_viewers != null
          ? `<div class="vviewers-badge">&#128065; ${lv.current_viewers.toLocaleString()}</div>`
          : ''}
      </div>
      <div class="vbody">
        <div class="vtitle">${esc(v.title)}</div>
        <div class="vmeta">
          <span>${fmtDate(v.stream_start)}</span>
          <span class="vpeak">&#9889; ${peak}</span>
        </div>
      </div>`;
    grid.appendChild(card);
  }
}

// ── Status indicator ──────────────────────────────────────────────────────────
function setStatus(mode) {
  $('refreshDot').className = 'refresh-dot ' + mode;
  $('refreshLabel').textContent = {
    live:     'Live tracking',
    idle:     'Watching for streams',
    fetching: 'Fetching…',
  }[mode] || '';
}

// ── Countdown timer ───────────────────────────────────────────────────────────
function startCountdown() {
  setInterval(() => {
    const rem = Math.max(0, state.nextRefreshAt - Date.now());
    const m   = Math.floor(rem / 60000);
    const s   = Math.floor((rem % 60000) / 1000);
    $('sCountdown').textContent = `${m}:${String(s).padStart(2, '0')}`;
  }, 1000);
}

// ── Master refresh ────────────────────────────────────────────────────────────
async function refresh() {
  setStatus('fetching');
  try {
    await loadAll();
    renderStats();
    renderOverview();
    renderBreakdown();
    renderCards();
    $('footerTs').textContent =
      'Last updated ' + new Date().toLocaleTimeString('en-IN', { timeStyle: 'short' });
  } catch (err) {
    console.error('Refresh failed:', err);
    setStatus('idle');
  }
  state.nextRefreshAt = Date.now() + 5 * 60 * 1000;
}

// ── Boot ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Wire up day-range filter buttons
  document.querySelectorAll('.ftab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ftab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.days = parseInt(btn.dataset.days, 10);
      // Destroy charts so gradient context is recreated at correct dimensions
      ['overview', 'breakdown'].forEach(k => {
        if (state.charts[k]) { state.charts[k].destroy(); state.charts[k] = null; }
      });
      refresh();
    });
  });

  refresh();
  startCountdown();
  // Refresh every 5 minutes to stay in sync with server's poll cycle
  setInterval(refresh, 5 * 60 * 1000);
});
