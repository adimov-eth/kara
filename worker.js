// Karaoke Queue with YouTube Integration - Cloudflare Worker
// Deploy: wrangler deploy

const STATE_KEY = 'state';
const VOTES_KEY = 'votes';
const ADMIN_PATH = '/shikashika';

// Initialize or get state
async function getState(env) {
  const state = await env.KARAOKE_KV.get(STATE_KEY, 'json');
  return state || { queue: [], currentEpoch: 0, nowPlaying: null };
}

async function saveState(env, state) {
  await env.KARAOKE_KV.put(STATE_KEY, JSON.stringify(state));
}

async function getVotes(env) {
  const votes = await env.KARAOKE_KV.get(VOTES_KEY, 'json');
  return votes || {}; // { entryId: { voterId: direction } }
}

async function saveVotes(env, votes) {
  await env.KARAOKE_KV.put(VOTES_KEY, JSON.stringify(votes));
}

// Sort queue by epoch ASC, votes DESC, joinedAt ASC
function sortQueue(queue) {
  return queue.sort((a, b) => {
    if (a.epoch !== b.epoch) return a.epoch - b.epoch;
    if (a.votes !== b.votes) return b.votes - a.votes;
    return a.joinedAt - b.joinedAt;
  });
}

// Generate unique ID
function generateId() {
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

// Extract YouTube video ID from URL
function extractYoutubeId(url) {
  if (!url) return null;
  // Normalize URL
  url = url.trim();

  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    /music\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /m\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// API Handlers
async function handleGetState(env) {
  const state = await getState(env);
  return Response.json(state);
}

async function handleJoin(env, request) {
  const { name, youtubeUrl, youtubeTitle } = await request.json();

  if (!name || name.trim() === '') {
    return Response.json({ error: 'Name required' }, { status: 400 });
  }
  if (!youtubeUrl || !extractYoutubeId(youtubeUrl)) {
    return Response.json({ error: 'Valid YouTube URL required' }, { status: 400 });
  }

  const trimmedName = name.trim().substring(0, 30);
  const state = await getState(env);

  // Check if user already has an entry in queue
  if (state.queue.some(e => e.name.toLowerCase() === trimmedName.toLowerCase())) {
    return Response.json({ error: 'You already have a song in the queue' }, { status: 400 });
  }

  // Check if currently playing
  if (state.nowPlaying && state.nowPlaying.name.toLowerCase() === trimmedName.toLowerCase()) {
    return Response.json({ error: 'Wait until your current song finishes' }, { status: 400 });
  }

  const entry = {
    id: generateId(),
    name: trimmedName,
    youtubeUrl: youtubeUrl.trim(),
    youtubeTitle: (youtubeTitle || 'Unknown Song').substring(0, 100),
    votes: 0,
    epoch: state.currentEpoch,
    joinedAt: Date.now()
  };

  state.queue.push(entry);
  sortQueue(state.queue);
  await saveState(env, state);

  const position = state.queue.findIndex(e => e.id === entry.id) + 1;
  return Response.json({ success: true, entry, position });
}

async function handleVote(env, request) {
  const { entryId, direction } = await request.json();
  const voterId = request.headers.get('X-Voter-Id');

  if (!voterId) {
    return Response.json({ error: 'Voter ID required' }, { status: 400 });
  }
  if (!entryId) {
    return Response.json({ error: 'Entry ID required' }, { status: 400 });
  }
  if (direction !== 1 && direction !== -1 && direction !== 0) {
    return Response.json({ error: 'Direction must be 1, -1, or 0' }, { status: 400 });
  }

  const state = await getState(env);
  const entry = state.queue.find(e => e.id === entryId);

  if (!entry) {
    return Response.json({ error: 'Entry not found' }, { status: 404 });
  }

  const votes = await getVotes(env);
  if (!votes[entryId]) votes[entryId] = {};

  const previousVote = votes[entryId][voterId] || 0;

  // Remove previous vote effect
  entry.votes -= previousVote;

  // Apply new vote (0 means remove vote)
  if (direction === 0) {
    delete votes[entryId][voterId];
  } else {
    votes[entryId][voterId] = direction;
    entry.votes += direction;
  }

  sortQueue(state.queue);
  await saveState(env, state);
  await saveVotes(env, votes);

  return Response.json({ success: true, newVotes: entry.votes });
}

async function handleRemove(env, request) {
  const { entryId } = await request.json();
  const isAdmin = request.headers.get('X-Admin') === 'true';
  const userName = request.headers.get('X-User-Name');

  const state = await getState(env);
  const entryIndex = state.queue.findIndex(e => e.id === entryId);

  if (entryIndex === -1) {
    return Response.json({ error: 'Entry not found' }, { status: 404 });
  }

  const entry = state.queue[entryIndex];

  // Check authorization: admin or self
  if (!isAdmin && (!userName || entry.name.toLowerCase() !== userName.toLowerCase())) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  state.queue.splice(entryIndex, 1);

  // Clean up votes for this entry
  const votes = await getVotes(env);
  delete votes[entryId];

  await saveState(env, state);
  await saveVotes(env, votes);

  return Response.json({ success: true });
}

async function handleSkip(env, request) {
  const isAdmin = request.headers.get('X-Admin') === 'true';
  const userName = request.headers.get('X-User-Name');

  const state = await getState(env);

  if (!state.nowPlaying) {
    return Response.json({ error: 'Nothing is playing' }, { status: 400 });
  }

  // Check authorization: admin or current singer
  if (!isAdmin && (!userName || state.nowPlaying.name.toLowerCase() !== userName.toLowerCase())) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Move to next song
  return advanceQueue(env, state);
}

async function handleNext(env, request) {
  let expectedId = null;
  try {
    const body = await request.json();
    expectedId = body.currentId;
  } catch (e) {
    // No body is fine for backwards compatibility
  }

  const state = await getState(env);

  // Idempotency check: verify caller's view matches server state
  // This prevents double-advance from multiple player tabs
  const actualId = state.nowPlaying ? state.nowPlaying.id : null;
  if (expectedId !== actualId) {
    // Caller's view is stale - don't advance, just return current state
    return Response.json({ success: false, reason: 'state_mismatch', nowPlaying: state.nowPlaying });
  }

  return advanceQueue(env, state);
}

async function advanceQueue(env, state) {
  // Increment epoch when song completes
  state.currentEpoch++;

  // Clean up votes for completed entry
  if (state.nowPlaying) {
    const votes = await getVotes(env);
    delete votes[state.nowPlaying.id];
    await saveVotes(env, votes);
  }

  // Pop next from queue
  if (state.queue.length > 0) {
    state.nowPlaying = state.queue.shift();
  } else {
    state.nowPlaying = null;
  }

  await saveState(env, state);
  return Response.json({ success: true, nowPlaying: state.nowPlaying, currentEpoch: state.currentEpoch });
}

async function handleReorder(env, request) {
  const isAdmin = request.headers.get('X-Admin') === 'true';
  if (!isAdmin) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { entryId, newEpoch, newPosition } = await request.json();

  const state = await getState(env);
  const entryIndex = state.queue.findIndex(e => e.id === entryId);

  if (entryIndex === -1) {
    return Response.json({ error: 'Entry not found' }, { status: 404 });
  }

  const entry = state.queue[entryIndex];

  if (typeof newEpoch === 'number') {
    entry.epoch = newEpoch;
  }

  if (typeof newPosition === 'number') {
    // Remove and reinsert at position
    state.queue.splice(entryIndex, 1);
    const targetIndex = Math.min(Math.max(0, newPosition), state.queue.length);
    state.queue.splice(targetIndex, 0, entry);

    // Adjust epoch to maintain position
    if (targetIndex > 0) {
      entry.epoch = state.queue[targetIndex - 1].epoch;
      entry.joinedAt = state.queue[targetIndex - 1].joinedAt - 1;
    } else if (state.queue.length > 1) {
      entry.epoch = state.queue[1].epoch;
      entry.joinedAt = state.queue[1].joinedAt - 1;
    }
  } else {
    sortQueue(state.queue);
  }

  await saveState(env, state);
  return Response.json({ success: true, queue: state.queue });
}

async function handleAdminAdd(env, request) {
  const isAdmin = request.headers.get('X-Admin') === 'true';
  if (!isAdmin) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { name, youtubeUrl, youtubeTitle } = await request.json();

  if (!name || name.trim() === '') {
    return Response.json({ error: 'Name required' }, { status: 400 });
  }
  if (!youtubeUrl || !extractYoutubeId(youtubeUrl)) {
    return Response.json({ error: 'Valid YouTube URL required' }, { status: 400 });
  }

  const state = await getState(env);

  // Admin adds play next (epoch -1 to ensure it's first)
  const entry = {
    id: generateId(),
    name: name.trim().substring(0, 30),
    youtubeUrl: youtubeUrl.trim(),
    youtubeTitle: (youtubeTitle || 'Unknown Song').substring(0, 100),
    votes: 0,
    epoch: -1, // Plays next
    joinedAt: Date.now()
  };

  state.queue.unshift(entry);
  await saveState(env, state);

  return Response.json({ success: true, entry });
}

// Main fetch handler
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Voter-Id, X-Admin, X-User-Name'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // API routes
    if (path.startsWith('/api/')) {
      let response;

      try {
        switch (path) {
          case '/api/state':
            response = await handleGetState(env);
            break;
          case '/api/join':
            if (request.method !== 'POST') {
              response = new Response('Method not allowed', { status: 405 });
            } else {
              response = await handleJoin(env, request);
            }
            break;
          case '/api/vote':
            if (request.method !== 'POST') {
              response = new Response('Method not allowed', { status: 405 });
            } else {
              response = await handleVote(env, request);
            }
            break;
          case '/api/remove':
            if (request.method !== 'POST') {
              response = new Response('Method not allowed', { status: 405 });
            } else {
              response = await handleRemove(env, request);
            }
            break;
          case '/api/skip':
            if (request.method !== 'POST') {
              response = new Response('Method not allowed', { status: 405 });
            } else {
              response = await handleSkip(env, request);
            }
            break;
          case '/api/next':
            if (request.method !== 'POST') {
              response = new Response('Method not allowed', { status: 405 });
            } else {
              response = await handleNext(env, request);
            }
            break;
          case '/api/reorder':
            if (request.method !== 'POST') {
              response = new Response('Method not allowed', { status: 405 });
            } else {
              response = await handleReorder(env, request);
            }
            break;
          case '/api/add':
            if (request.method !== 'POST') {
              response = new Response('Method not allowed', { status: 405 });
            } else {
              response = await handleAdminAdd(env, request);
            }
            break;
          default:
            response = new Response('Not found', { status: 404 });
        }
      } catch (err) {
        response = Response.json({ error: err.message }, { status: 500 });
      }

      // Add CORS headers to response
      const newHeaders = new Headers(response.headers);
      Object.entries(corsHeaders).forEach(([k, v]) => newHeaders.set(k, v));
      return new Response(response.body, { status: response.status, headers: newHeaders });
    }

    // View routes
    if (path === '/player') {
      return new Response(PLAYER_HTML, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    if (path === ADMIN_PATH) {
      return new Response(ADMIN_HTML, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    // Default: user view
    return new Response(USER_HTML, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }
};

// ============================================================
// USER VIEW HTML
// ============================================================
const USER_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Karaoke Queue</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    :root {
      --bg-deep: #0a0a0f;
      --bg-card: #12121a;
      --accent: #ff6b9d;
      --accent-glow: rgba(255, 107, 157, 0.4);
      --cyan: #4ecdc4;
      --cyan-glow: rgba(78, 205, 196, 0.3);
      --text: #f0f0f5;
      --text-muted: #6b6b80;
      --success: #7bed9f;
      --warning: #ffa502;
    }
    body {
      font-family: 'Outfit', sans-serif;
      background: var(--bg-deep);
      color: var(--text);
      min-height: 100vh;
      min-height: 100dvh;
      overflow-x: hidden;
    }
    body::before {
      content: '';
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background:
        radial-gradient(ellipse at 20% 20%, rgba(255, 107, 157, 0.08) 0%, transparent 50%),
        radial-gradient(ellipse at 80% 80%, rgba(78, 205, 196, 0.08) 0%, transparent 50%);
      pointer-events: none;
      z-index: 0;
    }
    .container {
      max-width: 480px;
      margin: 0 auto;
      padding: 24px 16px;
      position: relative;
      z-index: 1;
    }
    header { text-align: center; margin-bottom: 32px; }
    h1 {
      font-size: 2.5rem;
      font-weight: 800;
      background: linear-gradient(135deg, var(--accent) 0%, var(--cyan) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      letter-spacing: -0.02em;
      margin-bottom: 8px;
    }
    .subtitle { color: var(--text-muted); font-size: 0.95rem; font-weight: 300; }

    /* Now Playing */
    .now-playing-card {
      background: linear-gradient(135deg, rgba(255, 107, 157, 0.15) 0%, rgba(78, 205, 196, 0.1) 100%);
      border: 1px solid rgba(255, 107, 157, 0.3);
      border-radius: 20px;
      padding: 20px;
      margin-bottom: 24px;
      text-align: center;
    }
    .now-playing-label {
      font-size: 0.75rem;
      color: var(--accent);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin-bottom: 8px;
    }
    .now-playing-title {
      font-size: 1.1rem;
      font-weight: 600;
      margin-bottom: 4px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .now-playing-singer {
      color: var(--text-muted);
      font-size: 0.9rem;
    }
    .skip-own-btn {
      margin-top: 12px;
      background: rgba(255, 165, 2, 0.2);
      border: 1px solid rgba(255, 165, 2, 0.4);
      color: var(--warning);
      padding: 10px 20px;
      border-radius: 10px;
      font-size: 0.9rem;
      font-weight: 600;
      font-family: inherit;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .skip-own-btn:hover {
      background: rgba(255, 165, 2, 0.3);
    }
    .now-playing-empty {
      color: var(--text-muted);
      font-style: italic;
    }

    /* Join Form */
    .join-card {
      background: var(--bg-card);
      border-radius: 20px;
      padding: 24px;
      margin-bottom: 24px;
      border: 1px solid rgba(255, 255, 255, 0.05);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    }
    .join-card.disabled {
      opacity: 0.6;
      pointer-events: none;
    }
    .input-group { margin-bottom: 16px; }
    .input-label {
      display: block;
      font-size: 0.85rem;
      color: var(--text-muted);
      margin-bottom: 8px;
    }
    input[type="text"] {
      width: 100%;
      background: rgba(255, 255, 255, 0.05);
      border: 2px solid rgba(255, 255, 255, 0.1);
      border-radius: 14px;
      padding: 16px 20px;
      font-size: 1rem;
      font-family: inherit;
      color: var(--text);
      outline: none;
      transition: all 0.2s ease;
    }
    input[type="text"]:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 4px var(--accent-glow);
    }
    input[type="text"]::placeholder { color: var(--text-muted); }
    input[type="text"]:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .btn {
      background: linear-gradient(135deg, var(--accent) 0%, #ff8fab 100%);
      color: white;
      border: none;
      border-radius: 14px;
      padding: 16px 28px;
      font-size: 1rem;
      font-weight: 600;
      font-family: inherit;
      cursor: pointer;
      transition: all 0.2s ease;
      white-space: nowrap;
      width: 100%;
    }
    .btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 24px var(--accent-glow);
    }
    .btn:active { transform: translateY(0); }
    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
    }
    .error-msg {
      color: var(--warning);
      font-size: 0.85rem;
      margin-top: 12px;
      text-align: center;
      animation: shake 0.4s ease;
    }
    .validation-status {
      font-size: 0.85rem;
      margin-top: 8px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .validation-status.checking { color: var(--cyan); }
    .validation-status.valid { color: var(--success); }
    .validation-status.invalid { color: var(--warning); }
    .validation-spinner {
      width: 14px;
      height: 14px;
      border: 2px solid rgba(78, 205, 196, 0.3);
      border-top-color: var(--cyan);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-8px); }
      75% { transform: translateX(8px); }
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* Queue Section */
    .queue-section {
      background: var(--bg-card);
      border-radius: 20px;
      padding: 24px;
      border: 1px solid rgba(255, 255, 255, 0.05);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    }
    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }
    .section-title { font-size: 1.1rem; font-weight: 600; color: var(--text); }
    .queue-count {
      background: rgba(255, 255, 255, 0.1);
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 0.85rem;
      color: var(--text-muted);
    }
    .queue-list { list-style: none; }
    .queue-item {
      display: flex;
      align-items: center;
      padding: 14px;
      border-radius: 14px;
      margin-bottom: 8px;
      background: rgba(255, 255, 255, 0.03);
      transition: all 0.2s ease;
      animation: slideIn 0.3s ease;
    }
    @keyframes slideIn {
      from { opacity: 0; transform: translateX(-20px); }
      to { opacity: 1; transform: translateX(0); }
    }
    .queue-item.is-mine {
      background: linear-gradient(135deg, rgba(78, 205, 196, 0.15) 0%, rgba(78, 205, 196, 0.05) 100%);
      border: 1px solid rgba(78, 205, 196, 0.3);
    }
    .position {
      width: 28px;
      height: 28px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      font-size: 0.85rem;
      margin-right: 12px;
      flex-shrink: 0;
      background: rgba(255, 255, 255, 0.1);
      color: var(--text-muted);
    }
    .queue-info { flex: 1; min-width: 0; }
    .queue-song {
      font-weight: 500;
      font-size: 0.95rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-bottom: 2px;
    }
    .queue-singer {
      font-size: 0.8rem;
      color: var(--text-muted);
    }
    .queue-actions {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-left: 12px;
    }
    .vote-btn {
      background: none;
      border: none;
      width: 32px;
      height: 32px;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1rem;
    }
    .vote-btn:hover { background: rgba(255, 255, 255, 0.1); }
    .vote-btn.upvote { color: var(--success); }
    .vote-btn.downvote { color: var(--accent); }
    .vote-btn.active { background: rgba(255, 255, 255, 0.15); }
    .vote-btn:disabled { opacity: 0.3; cursor: not-allowed; }
    .vote-count {
      font-size: 0.85rem;
      min-width: 24px;
      text-align: center;
      color: var(--text-muted);
    }
    .vote-count.positive { color: var(--success); }
    .vote-count.negative { color: var(--accent); }
    .remove-btn {
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      padding: 8px;
      border-radius: 8px;
      transition: all 0.2s ease;
      font-size: 0.9rem;
    }
    .remove-btn:hover {
      background: rgba(255, 107, 157, 0.2);
      color: var(--accent);
    }
    .empty-state {
      text-align: center;
      padding: 48px 24px;
      color: var(--text-muted);
    }
    .empty-icon { font-size: 3rem; margin-bottom: 16px; opacity: 0.5; }
    .loading { text-align: center; padding: 48px; color: var(--text-muted); }
    .spinner {
      width: 32px;
      height: 32px;
      border: 3px solid rgba(255, 255, 255, 0.1);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 16px;
    }

    /* Toast */
    .toast {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%) translateY(100px);
      background: var(--bg-card);
      border: 1px solid rgba(255, 255, 255, 0.1);
      padding: 16px 24px;
      border-radius: 14px;
      font-size: 0.95rem;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      transition: transform 0.3s ease;
      z-index: 100;
    }
    .toast.show { transform: translateX(-50%) translateY(0); }
    .toast.success { border-color: rgba(123, 237, 159, 0.3); }

    /* Hidden YouTube player for validation */
    #validationPlayer { display: none; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Karaoke</h1>
      <p class="subtitle">Pick a song, join the queue, sing your heart out</p>
    </header>

    <div class="now-playing-card" id="nowPlayingCard" style="display: none;">
      <div class="now-playing-label">Now Playing</div>
      <div class="now-playing-title" id="nowPlayingTitle"></div>
      <div class="now-playing-singer" id="nowPlayingSinger"></div>
      <button class="skip-own-btn" id="skipOwnBtn" style="display: none;" onclick="skipOwnSong()">Skip My Song</button>
    </div>

    <div class="join-card" id="joinCard">
      <div class="input-group">
        <label class="input-label">Your name</label>
        <input type="text" id="nameInput" placeholder="Enter your name" maxlength="30" autocomplete="off">
      </div>
      <div class="input-group">
        <label class="input-label">YouTube URL</label>
        <input type="text" id="urlInput" placeholder="Paste YouTube link" autocomplete="off">
        <div class="validation-status" id="validationStatus" style="display: none;"></div>
      </div>
      <button class="btn" id="joinBtn" disabled>Add to Queue</button>
      <div id="errorMsg" class="error-msg" style="display: none;"></div>
    </div>

    <div class="queue-section">
      <div class="section-header">
        <span class="section-title">Up Next</span>
        <span class="queue-count" id="queueCount">0 in queue</span>
      </div>
      <div id="queueContent">
        <div class="loading">
          <div class="spinner"></div>
          Loading queue...
        </div>
      </div>
    </div>
  </div>

  <div class="toast" id="toast"></div>
  <div id="validationPlayer"></div>

  <script src="https://www.youtube.com/iframe_api"></script>
  <script>
    const API = '/api';
    const MAX_DURATION = 420; // 7 minutes

    let state = { queue: [], nowPlaying: null, currentEpoch: 0 };
    let lastStateHash = '';
    let pollInterval;
    let validationPlayer = null;
    let validatedUrl = null;
    let validatedTitle = null;

    // Get or create persistent IDs
    let myName = localStorage.getItem('karaoke_name') || '';
    let voterId = localStorage.getItem('karaoke_voter_id');
    if (!voterId) {
      voterId = crypto.randomUUID();
      localStorage.setItem('karaoke_voter_id', voterId);
    }
    let myVotes = JSON.parse(localStorage.getItem('karaoke_votes') || '{}');

    // Elements
    const nameInput = document.getElementById('nameInput');
    const urlInput = document.getElementById('urlInput');
    const joinBtn = document.getElementById('joinBtn');
    const errorMsg = document.getElementById('errorMsg');
    const validationStatus = document.getElementById('validationStatus');
    const queueContent = document.getElementById('queueContent');
    const queueCount = document.getElementById('queueCount');
    const nowPlayingCard = document.getElementById('nowPlayingCard');
    const nowPlayingTitle = document.getElementById('nowPlayingTitle');
    const nowPlayingSinger = document.getElementById('nowPlayingSinger');
    const skipOwnBtn = document.getElementById('skipOwnBtn');
    const joinCard = document.getElementById('joinCard');
    const toast = document.getElementById('toast');

    // Restore name
    if (myName) nameInput.value = myName;

    // YouTube IFrame API ready
    function onYouTubeIframeAPIReady() {
      // API is ready
    }

    // Extract video ID from URL
    function extractVideoId(url) {
      if (!url) return null;
      url = url.trim();

      const patterns = [
        /(?:youtube\\.com\\/watch\\?v=|youtu\\.be\\/|youtube\\.com\\/embed\\/)([a-zA-Z0-9_-]{11})/,
        /youtube\\.com\\/shorts\\/([a-zA-Z0-9_-]{11})/,
        /music\\.youtube\\.com\\/watch\\?v=([a-zA-Z0-9_-]{11})/,
        /m\\.youtube\\.com\\/watch\\?v=([a-zA-Z0-9_-]{11})/,
        /youtube\\.com\\/v\\/([a-zA-Z0-9_-]{11})/
      ];
      for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
      }
      return null;
    }

    // Validate YouTube URL
    async function validateUrl(url) {
      // Check for playlist URLs
      if (url.includes('list=') && !url.includes('watch?v=')) {
        showValidation('invalid', 'Playlists not supported - paste a single video');
        return false;
      }

      const videoId = extractVideoId(url);
      if (!videoId) {
        showValidation('invalid', 'Invalid YouTube URL');
        return false;
      }

      showValidation('checking', 'Checking video...');

      return new Promise((resolve) => {
        // Check if YouTube API is loaded
        if (typeof YT === 'undefined' || typeof YT.Player === 'undefined') {
          showValidation('invalid', 'YouTube API not loaded. Refresh the page.');
          resolve(false);
          return;
        }

        // Destroy existing player
        if (validationPlayer) {
          validationPlayer.destroy();
        }

        const container = document.getElementById('validationPlayer');
        container.innerHTML = '<div id="ytPlayer"></div>';

        validationPlayer = new YT.Player('ytPlayer', {
          height: '1',
          width: '1',
          videoId: videoId,
          playerVars: {
            autoplay: 0,
            controls: 0,
            disablekb: 1,
            fs: 0,
            modestbranding: 1
          },
          events: {
            onReady: (event) => {
              const duration = event.target.getDuration();
              const data = event.target.getVideoData();

              if (duration === 0) {
                showValidation('invalid', 'Livestreams not allowed');
                resolve(false);
                return;
              }

              if (duration > MAX_DURATION) {
                const mins = Math.floor(duration / 60);
                const secs = Math.round(duration % 60);
                showValidation('invalid', \`Too long (\${mins}:\${secs.toString().padStart(2, '0')}) - max 7 minutes\`);
                resolve(false);
                return;
              }

              validatedUrl = url;
              validatedTitle = data.title || 'Unknown Song';
              showValidation('valid', validatedTitle);
              resolve(true);
            },
            onError: () => {
              showValidation('invalid', 'Video not found or unavailable');
              resolve(false);
            }
          }
        });

        // Timeout fallback
        setTimeout(() => {
          if (validationStatus.classList.contains('checking')) {
            showValidation('invalid', 'Could not load video');
            resolve(false);
          }
        }, 10000);
      });
    }

    function showValidation(type, message) {
      validationStatus.style.display = 'flex';
      validationStatus.className = 'validation-status ' + type;

      if (type === 'checking') {
        validationStatus.innerHTML = '<div class="validation-spinner"></div>' + message;
      } else {
        validationStatus.textContent = message;
      }

      updateJoinButton();
    }

    function updateJoinButton() {
      const hasName = nameInput.value.trim().length > 0;
      const hasValidUrl = validatedUrl && urlInput.value === validatedUrl;
      const notInQueue = !state.queue.some(e => e.name.toLowerCase() === nameInput.value.trim().toLowerCase());
      const notPlaying = !state.nowPlaying || state.nowPlaying.name.toLowerCase() !== nameInput.value.trim().toLowerCase();

      joinBtn.disabled = !(hasName && hasValidUrl && notInQueue && notPlaying);
    }

    // Fetch state
    async function fetchState() {
      try {
        const res = await fetch(API + '/state');
        const data = await res.json();
        const hash = JSON.stringify(data);
        if (hash === lastStateHash) return;

        // Check if user's song just finished
        const wasPlaying = state.nowPlaying && state.nowPlaying.name.toLowerCase() === myName.toLowerCase();
        const isNowPlaying = data.nowPlaying && data.nowPlaying.name.toLowerCase() === myName.toLowerCase();
        if (wasPlaying && !isNowPlaying && myName) {
          showToast('Your song is done! Add another?');
        }

        lastStateHash = hash;
        state = data;
        render();
      } catch (err) {
        console.error('Failed to fetch state:', err);
      }
    }

    function render() {
      // Now playing
      if (state.nowPlaying) {
        nowPlayingCard.style.display = 'block';
        nowPlayingTitle.textContent = state.nowPlaying.youtubeTitle;
        nowPlayingSinger.textContent = state.nowPlaying.name;

        // Show skip button if it's my song
        const isMyTurn = state.nowPlaying.name.toLowerCase() === myName.toLowerCase();
        skipOwnBtn.style.display = isMyTurn ? 'inline-block' : 'none';
      } else {
        nowPlayingCard.style.display = 'none';
        skipOwnBtn.style.display = 'none';
      }

      // Check if user is in queue or playing
      const inQueue = state.queue.some(e => e.name.toLowerCase() === myName.toLowerCase());
      const isPlaying = state.nowPlaying && state.nowPlaying.name.toLowerCase() === myName.toLowerCase();

      if (inQueue || isPlaying) {
        joinCard.classList.add('disabled');
      } else {
        joinCard.classList.remove('disabled');
      }

      queueCount.textContent = state.queue.length + ' in queue';

      if (state.queue.length === 0) {
        queueContent.innerHTML = \`
          <div class="empty-state">
            <div class="empty-icon">*</div>
            <p>Queue is empty.<br>Be the first to add a song!</p>
          </div>
        \`;
      } else {
        queueContent.innerHTML = \`
          <ul class="queue-list">
            \${state.queue.map((entry, i) => {
              const isMe = entry.name.toLowerCase() === myName.toLowerCase();
              const myVote = myVotes[entry.id] || 0;
              const voteClass = entry.votes > 0 ? 'positive' : (entry.votes < 0 ? 'negative' : '');

              return \`
              <li class="queue-item \${isMe ? 'is-mine' : ''}">
                <span class="position">\${i + 1}</span>
                <div class="queue-info">
                  <div class="queue-song">\${escapeHtml(entry.youtubeTitle)}</div>
                  <div class="queue-singer">\${escapeHtml(entry.name)}</div>
                </div>
                <div class="queue-actions">
                  <button class="vote-btn upvote \${myVote === 1 ? 'active' : ''}"
                          onclick="vote('\${entry.id}', \${myVote === 1 ? 0 : 1})"
                          \${isMe ? 'disabled' : ''}>+</button>
                  <span class="vote-count \${voteClass}">\${entry.votes}</span>
                  <button class="vote-btn downvote \${myVote === -1 ? 'active' : ''}"
                          onclick="vote('\${entry.id}', \${myVote === -1 ? 0 : -1})"
                          \${isMe ? 'disabled' : ''}>-</button>
                  \${isMe ? \`<button class="remove-btn" onclick="removeEntry('\${entry.id}')">x</button>\` : ''}
                </div>
              </li>
            \`}).join('')}
          </ul>
        \`;
      }

      updateJoinButton();
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    // Join queue
    async function joinQueue() {
      const name = nameInput.value.trim();
      if (!name || !validatedUrl || !validatedTitle) return;

      joinBtn.disabled = true;
      hideError();

      try {
        const res = await fetch(API + '/join', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            youtubeUrl: validatedUrl,
            youtubeTitle: validatedTitle
          })
        });

        const data = await res.json();

        if (!res.ok) {
          showError(data.error || 'Failed to join queue');
          return;
        }

        myName = name;
        localStorage.setItem('karaoke_name', name);
        showToast(\`You're #\${data.position} in the queue!\`);

        // Reset form
        urlInput.value = '';
        validatedUrl = null;
        validatedTitle = null;
        validationStatus.style.display = 'none';

        lastStateHash = '';
        fetchState();
      } catch (err) {
        showError('Network error. Please try again.');
      } finally {
        joinBtn.disabled = false;
      }
    }

    // Vote
    async function vote(entryId, direction) {
      try {
        const res = await fetch(API + '/vote', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Voter-Id': voterId
          },
          body: JSON.stringify({ entryId, direction })
        });

        if (res.ok) {
          if (direction === 0) {
            delete myVotes[entryId];
          } else {
            myVotes[entryId] = direction;
          }
          localStorage.setItem('karaoke_votes', JSON.stringify(myVotes));
          lastStateHash = '';
          fetchState();
        }
      } catch (err) {
        console.error('Vote failed:', err);
      }
    }

    // Remove entry
    async function removeEntry(entryId) {
      if (!confirm('Remove your song from the queue?')) return;

      try {
        const res = await fetch(API + '/remove', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-User-Name': myName
          },
          body: JSON.stringify({ entryId })
        });

        if (res.ok) {
          lastStateHash = '';
          fetchState();
        }
      } catch (err) {
        console.error('Remove failed:', err);
      }
    }

    // Skip own song
    async function skipOwnSong() {
      if (!confirm('Skip your song?')) return;

      try {
        const res = await fetch(API + '/skip', {
          method: 'POST',
          headers: {
            'X-User-Name': myName
          }
        });

        if (res.ok) {
          showToast('Song skipped');
          lastStateHash = '';
          fetchState();
        }
      } catch (err) {
        console.error('Skip failed:', err);
      }
    }

    function showError(msg) {
      errorMsg.textContent = msg;
      errorMsg.style.display = 'block';
    }

    function hideError() {
      errorMsg.style.display = 'none';
    }

    function showToast(msg) {
      toast.textContent = msg;
      toast.classList.add('show', 'success');
      setTimeout(() => toast.classList.remove('show', 'success'), 3000);
    }

    // Event listeners
    joinBtn.addEventListener('click', joinQueue);
    nameInput.addEventListener('input', () => {
      myName = nameInput.value.trim();
      updateJoinButton();
    });

    let urlDebounce;
    urlInput.addEventListener('input', () => {
      clearTimeout(urlDebounce);
      validatedUrl = null;
      validatedTitle = null;

      const url = urlInput.value.trim();
      if (!url) {
        validationStatus.style.display = 'none';
        updateJoinButton();
        return;
      }

      urlDebounce = setTimeout(() => validateUrl(url), 500);
    });

    // Initial fetch and polling
    fetchState();
    pollInterval = setInterval(fetchState, 3000);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        clearInterval(pollInterval);
      } else {
        fetchState();
        pollInterval = setInterval(fetchState, 3000);
      }
    });
  </script>
</body>
</html>`;

// ============================================================
// PLAYER VIEW HTML
// ============================================================
const PLAYER_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Karaoke Player</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    :root {
      --bg-deep: #0a0a0f;
      --bg-card: #12121a;
      --accent: #ff6b9d;
      --cyan: #4ecdc4;
      --text: #f0f0f5;
      --text-muted: #6b6b80;
    }
    html, body {
      font-family: 'Outfit', sans-serif;
      background: var(--bg-deep);
      color: var(--text);
      height: 100%;
      overflow: hidden;
    }
    .player-container {
      display: flex;
      flex-direction: column;
      height: 100vh;
      height: 100dvh;
    }
    .video-wrapper {
      flex: 1;
      position: relative;
      background: #000;
    }
    #player {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
    }
    .idle-state {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: var(--bg-deep);
    }
    .idle-icon {
      font-size: 6rem;
      margin-bottom: 24px;
      opacity: 0.3;
    }
    .idle-text {
      font-size: 2rem;
      color: var(--text-muted);
      font-weight: 300;
    }
    .info-bar {
      background: var(--bg-card);
      padding: 20px 32px;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
    }
    .now-playing {
      display: flex;
      align-items: center;
      margin-bottom: 16px;
    }
    .now-label {
      font-size: 0.75rem;
      color: var(--accent);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin-right: 16px;
    }
    .now-title {
      font-size: 1.5rem;
      font-weight: 600;
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .now-singer {
      font-size: 1.2rem;
      color: var(--text-muted);
      margin-left: 16px;
    }
    .up-next {
      display: flex;
      gap: 24px;
    }
    .up-next-label {
      font-size: 0.75rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.1em;
      padding-top: 4px;
    }
    .up-next-list {
      display: flex;
      gap: 16px;
      flex: 1;
      overflow: hidden;
    }
    .up-next-item {
      background: rgba(255, 255, 255, 0.05);
      padding: 12px 16px;
      border-radius: 10px;
      min-width: 200px;
      max-width: 300px;
    }
    .up-next-song {
      font-size: 0.95rem;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-bottom: 4px;
    }
    .up-next-singer {
      font-size: 0.85rem;
      color: var(--text-muted);
    }
    .empty-queue {
      color: var(--text-muted);
      font-style: italic;
    }
  </style>
</head>
<body>
  <div class="player-container">
    <div class="video-wrapper">
      <div id="player"></div>
      <div class="idle-state" id="idleState">
        <div class="idle-icon">*</div>
        <div class="idle-text">Waiting for songs...</div>
      </div>
    </div>
    <div class="info-bar">
      <div class="now-playing" id="nowPlaying" style="display: none;">
        <span class="now-label">Now Playing</span>
        <span class="now-title" id="nowTitle"></span>
        <span class="now-singer" id="nowSinger"></span>
      </div>
      <div class="up-next">
        <span class="up-next-label">Up Next</span>
        <div class="up-next-list" id="upNextList">
          <span class="empty-queue">No songs in queue</span>
        </div>
      </div>
    </div>
  </div>

  <script src="https://www.youtube.com/iframe_api"></script>
  <script>
    const API = '/api';

    let player = null;
    let playerReady = false;
    let currentVideoId = null;
    let state = { queue: [], nowPlaying: null, currentEpoch: 0 };
    let lastStateHash = '';
    let pollInterval;
    let isAdvancing = false;

    // Extract video ID
    function extractVideoId(url) {
      if (!url) return null;
      url = url.trim();

      const patterns = [
        /(?:youtube\\.com\\/watch\\?v=|youtu\\.be\\/|youtube\\.com\\/embed\\/)([a-zA-Z0-9_-]{11})/,
        /youtube\\.com\\/shorts\\/([a-zA-Z0-9_-]{11})/,
        /music\\.youtube\\.com\\/watch\\?v=([a-zA-Z0-9_-]{11})/,
        /m\\.youtube\\.com\\/watch\\?v=([a-zA-Z0-9_-]{11})/,
        /youtube\\.com\\/v\\/([a-zA-Z0-9_-]{11})/
      ];
      for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
      }
      return null;
    }

    // YouTube IFrame API ready
    function onYouTubeIframeAPIReady() {
      player = new YT.Player('player', {
        width: '100%',
        height: '100%',
        playerVars: {
          autoplay: 1,
          controls: 1,
          modestbranding: 1,
          rel: 0,
          fs: 1
        },
        events: {
          onReady: onPlayerReady,
          onStateChange: onPlayerStateChange,
          onError: onPlayerError
        }
      });
    }

    function onPlayerReady() {
      playerReady = true;
      if (state.nowPlaying) {
        loadVideo(state.nowPlaying);
      }
    }

    function onPlayerStateChange(event) {
      // Video ended
      if (event.data === YT.PlayerState.ENDED) {
        advanceToNext();
      }
    }

    function onPlayerError(event) {
      console.error('Player error:', event.data);
      // Skip to next on error
      advanceToNext();
    }

    async function advanceToNext() {
      if (isAdvancing) return;
      isAdvancing = true;

      try {
        // Send current entry ID for idempotency (prevents double-advance from multiple tabs)
        const currentId = state.nowPlaying ? state.nowPlaying.id : null;
        await fetch(API + '/next', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ currentId })
        });
        lastStateHash = '';
        await fetchState();
      } catch (err) {
        console.error('Failed to advance:', err);
      } finally {
        isAdvancing = false;
      }
    }

    function loadVideo(entry) {
      if (!entry || !playerReady) return;

      const videoId = extractVideoId(entry.youtubeUrl);
      if (videoId && videoId !== currentVideoId) {
        currentVideoId = videoId;
        player.loadVideoById(videoId);
      }
    }

    // Fetch state
    async function fetchState() {
      try {
        const res = await fetch(API + '/state');
        const data = await res.json();
        const hash = JSON.stringify(data);
        if (hash === lastStateHash) return;
        lastStateHash = hash;

        const previousNowPlaying = state.nowPlaying;
        state = data;
        render();

        // If nothing playing but queue has songs, start the first one
        if (!state.nowPlaying && state.queue.length > 0 && !isAdvancing) {
          advanceToNext();
          return;
        }

        // Load video if now playing changed
        if (state.nowPlaying) {
          const previousId = previousNowPlaying ? previousNowPlaying.id : null;
          if (state.nowPlaying.id !== previousId) {
            loadVideo(state.nowPlaying);
          }
        } else {
          currentVideoId = null;
          if (playerReady && player.getPlayerState() === YT.PlayerState.PLAYING) {
            player.stopVideo();
          }
        }
      } catch (err) {
        console.error('Failed to fetch state:', err);
      }
    }

    function render() {
      const idleState = document.getElementById('idleState');
      const nowPlaying = document.getElementById('nowPlaying');
      const nowTitle = document.getElementById('nowTitle');
      const nowSinger = document.getElementById('nowSinger');
      const upNextList = document.getElementById('upNextList');

      if (state.nowPlaying) {
        idleState.style.display = 'none';
        nowPlaying.style.display = 'flex';
        nowTitle.textContent = state.nowPlaying.youtubeTitle;
        nowSinger.textContent = state.nowPlaying.name;
      } else {
        idleState.style.display = 'flex';
        nowPlaying.style.display = 'none';
      }

      // Up next (show first 3)
      const upcoming = state.queue.slice(0, 3);
      if (upcoming.length === 0) {
        upNextList.innerHTML = '<span class="empty-queue">No songs in queue</span>';
      } else {
        upNextList.innerHTML = upcoming.map(entry => \`
          <div class="up-next-item">
            <div class="up-next-song">\${escapeHtml(entry.youtubeTitle)}</div>
            <div class="up-next-singer">\${escapeHtml(entry.name)}</div>
          </div>
        \`).join('');
      }
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    // Initial fetch and polling
    fetchState();
    pollInterval = setInterval(fetchState, 2000);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        clearInterval(pollInterval);
      } else {
        fetchState();
        pollInterval = setInterval(fetchState, 2000);
      }
    });
  </script>
</body>
</html>`;

// ============================================================
// ADMIN VIEW HTML
// ============================================================
const ADMIN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Karaoke Admin</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    :root {
      --bg-deep: #0a0a0f;
      --bg-card: #12121a;
      --accent: #ff6b9d;
      --accent-glow: rgba(255, 107, 157, 0.4);
      --cyan: #4ecdc4;
      --cyan-glow: rgba(78, 205, 196, 0.3);
      --text: #f0f0f5;
      --text-muted: #6b6b80;
      --success: #7bed9f;
      --warning: #ffa502;
    }
    body {
      font-family: 'Outfit', sans-serif;
      background: var(--bg-deep);
      color: var(--text);
      min-height: 100vh;
      min-height: 100dvh;
      overflow-x: hidden;
    }
    body::before {
      content: '';
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background:
        radial-gradient(ellipse at 20% 20%, rgba(255, 107, 157, 0.08) 0%, transparent 50%),
        radial-gradient(ellipse at 80% 80%, rgba(78, 205, 196, 0.08) 0%, transparent 50%);
      pointer-events: none;
      z-index: 0;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      padding: 24px 16px;
      position: relative;
      z-index: 1;
    }
    header { text-align: center; margin-bottom: 32px; }
    h1 {
      font-size: 2rem;
      font-weight: 800;
      background: linear-gradient(135deg, var(--warning) 0%, var(--accent) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      letter-spacing: -0.02em;
      margin-bottom: 8px;
    }
    .subtitle { color: var(--text-muted); font-size: 0.95rem; font-weight: 300; }

    /* Now Playing */
    .now-playing-card {
      background: linear-gradient(135deg, rgba(255, 107, 157, 0.15) 0%, rgba(78, 205, 196, 0.1) 100%);
      border: 1px solid rgba(255, 107, 157, 0.3);
      border-radius: 20px;
      padding: 20px;
      margin-bottom: 24px;
    }
    .now-playing-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }
    .now-playing-label {
      font-size: 0.75rem;
      color: var(--accent);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.1em;
    }
    .now-playing-info { margin-bottom: 16px; }
    .now-playing-title {
      font-size: 1.1rem;
      font-weight: 600;
      margin-bottom: 4px;
    }
    .now-playing-singer { color: var(--text-muted); font-size: 0.9rem; }
    .now-playing-controls { display: flex; gap: 12px; }
    .btn {
      background: linear-gradient(135deg, var(--accent) 0%, #ff8fab 100%);
      color: white;
      border: none;
      border-radius: 12px;
      padding: 12px 20px;
      font-size: 0.95rem;
      font-weight: 600;
      font-family: inherit;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px var(--accent-glow);
    }
    .btn:active { transform: translateY(0); }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
    .btn-skip {
      background: linear-gradient(135deg, var(--warning) 0%, #ffb347 100%);
    }
    .btn-cyan {
      background: linear-gradient(135deg, var(--cyan) 0%, #45b7aa 100%);
    }
    .btn-cyan:hover { box-shadow: 0 6px 20px var(--cyan-glow); }
    .now-playing-empty {
      text-align: center;
      color: var(--text-muted);
      font-style: italic;
      padding: 20px;
    }

    /* Add Entry */
    .add-card {
      background: var(--bg-card);
      border-radius: 20px;
      padding: 20px;
      margin-bottom: 24px;
      border: 1px solid rgba(255, 255, 255, 0.05);
    }
    .add-header {
      font-size: 1rem;
      font-weight: 600;
      margin-bottom: 16px;
    }
    .add-form { display: flex; flex-direction: column; gap: 12px; }
    .add-row { display: flex; gap: 12px; }
    input[type="text"] {
      flex: 1;
      background: rgba(255, 255, 255, 0.05);
      border: 2px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 12px 16px;
      font-size: 0.95rem;
      font-family: inherit;
      color: var(--text);
      outline: none;
      transition: all 0.2s ease;
    }
    input[type="text"]:focus {
      border-color: var(--cyan);
      box-shadow: 0 0 0 3px var(--cyan-glow);
    }
    input[type="text"]::placeholder { color: var(--text-muted); }

    /* Queue Section */
    .queue-section {
      background: var(--bg-card);
      border-radius: 20px;
      padding: 20px;
      border: 1px solid rgba(255, 255, 255, 0.05);
    }
    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }
    .section-title { font-size: 1rem; font-weight: 600; }
    .queue-count {
      background: rgba(255, 255, 255, 0.1);
      padding: 4px 12px;
      border-radius: 16px;
      font-size: 0.8rem;
      color: var(--text-muted);
    }
    .queue-list { list-style: none; }
    .queue-item {
      display: flex;
      align-items: center;
      padding: 12px;
      border-radius: 12px;
      margin-bottom: 8px;
      background: rgba(255, 255, 255, 0.03);
      transition: all 0.2s ease;
    }
    .queue-item:hover { background: rgba(255, 255, 255, 0.06); }
    .position {
      width: 28px;
      height: 28px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      font-size: 0.85rem;
      margin-right: 12px;
      background: rgba(255, 255, 255, 0.1);
      color: var(--text-muted);
    }
    .queue-info { flex: 1; min-width: 0; }
    .queue-song {
      font-weight: 500;
      font-size: 0.9rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-bottom: 2px;
    }
    .queue-meta {
      font-size: 0.8rem;
      color: var(--text-muted);
      display: flex;
      gap: 12px;
    }
    .queue-actions { display: flex; gap: 4px; margin-left: 8px; }
    .action-btn {
      background: none;
      border: none;
      width: 32px;
      height: 32px;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--text-muted);
      font-size: 1rem;
    }
    .action-btn:hover {
      background: rgba(255, 255, 255, 0.1);
      color: var(--text);
    }
    .action-btn.danger:hover {
      background: rgba(255, 107, 157, 0.2);
      color: var(--accent);
    }
    .empty-state {
      text-align: center;
      padding: 40px 20px;
      color: var(--text-muted);
    }

    /* Toast */
    .toast {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%) translateY(100px);
      background: var(--bg-card);
      border: 1px solid rgba(255, 255, 255, 0.1);
      padding: 14px 24px;
      border-radius: 12px;
      font-size: 0.9rem;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      transition: transform 0.3s ease;
      z-index: 100;
    }
    .toast.show { transform: translateX(-50%) translateY(0); }
    .toast.success { border-color: rgba(123, 237, 159, 0.3); }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Admin Control</h1>
      <p class="subtitle">Manage the karaoke queue</p>
    </header>

    <div class="now-playing-card" id="nowPlayingCard">
      <div id="nowPlayingContent">
        <div class="now-playing-empty">Nothing playing</div>
      </div>
    </div>

    <div class="add-card">
      <div class="add-header">Add Entry (Plays Next)</div>
      <div class="add-form">
        <div class="add-row">
          <input type="text" id="addName" placeholder="Singer name" maxlength="30">
          <input type="text" id="addUrl" placeholder="YouTube URL">
        </div>
        <input type="text" id="addTitle" placeholder="Song title (optional)" maxlength="100" style="margin-top: 8px;">
        <button class="btn btn-cyan" id="addBtn" style="margin-top: 12px;">Add to Front</button>
      </div>
    </div>

    <div class="queue-section">
      <div class="section-header">
        <span class="section-title">Queue</span>
        <span class="queue-count" id="queueCount">0 entries</span>
      </div>
      <div id="queueContent">
        <div class="empty-state">Queue is empty</div>
      </div>
    </div>
  </div>

  <div class="toast" id="toast"></div>

  <script>
    const API = '/api';

    let state = { queue: [], nowPlaying: null, currentEpoch: 0 };
    let lastStateHash = '';
    let pollInterval;

    // Elements
    const nowPlayingCard = document.getElementById('nowPlayingCard');
    const nowPlayingContent = document.getElementById('nowPlayingContent');
    const addName = document.getElementById('addName');
    const addUrl = document.getElementById('addUrl');
    const addTitle = document.getElementById('addTitle');
    const addBtn = document.getElementById('addBtn');
    const queueContent = document.getElementById('queueContent');
    const queueCount = document.getElementById('queueCount');
    const toast = document.getElementById('toast');

    // Fetch state
    async function fetchState() {
      try {
        const res = await fetch(API + '/state');
        const data = await res.json();
        const hash = JSON.stringify(data);
        if (hash === lastStateHash) return;
        lastStateHash = hash;
        state = data;
        render();
      } catch (err) {
        console.error('Failed to fetch state:', err);
      }
    }

    function render() {
      // Now playing
      if (state.nowPlaying) {
        nowPlayingContent.innerHTML = \`
          <div class="now-playing-header">
            <span class="now-playing-label">Now Playing</span>
            <span style="color: var(--text-muted); font-size: 0.8rem;">Epoch: \${state.currentEpoch}</span>
          </div>
          <div class="now-playing-info">
            <div class="now-playing-title">\${escapeHtml(state.nowPlaying.youtubeTitle)}</div>
            <div class="now-playing-singer">\${escapeHtml(state.nowPlaying.name)}</div>
          </div>
          <div class="now-playing-controls">
            <button class="btn btn-skip" onclick="skipCurrent()">Skip Song</button>
          </div>
        \`;
      } else {
        nowPlayingContent.innerHTML = '<div class="now-playing-empty">Nothing playing</div>';
      }

      // Queue
      queueCount.textContent = state.queue.length + ' entries';

      if (state.queue.length === 0) {
        queueContent.innerHTML = '<div class="empty-state">Queue is empty</div>';
      } else {
        queueContent.innerHTML = \`
          <ul class="queue-list">
            \${state.queue.map((entry, i) => \`
              <li class="queue-item">
                <span class="position">\${i + 1}</span>
                <div class="queue-info">
                  <div class="queue-song">\${escapeHtml(entry.youtubeTitle)}</div>
                  <div class="queue-meta">
                    <span>\${escapeHtml(entry.name)}</span>
                    <span>Epoch: \${entry.epoch}</span>
                    <span>Votes: \${entry.votes}</span>
                  </div>
                </div>
                <div class="queue-actions">
                  \${i > 0 ? \`<button class="action-btn" onclick="moveUp('\${entry.id}')" title="Move up">^</button>\` : ''}
                  \${i < state.queue.length - 1 ? \`<button class="action-btn" onclick="moveDown('\${entry.id}')" title="Move down">v</button>\` : ''}
                  <button class="action-btn danger" onclick="removeEntry('\${entry.id}')" title="Remove">x</button>
                </div>
              </li>
            \`).join('')}
          </ul>
        \`;
      }
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    // Skip current song
    async function skipCurrent() {
      try {
        await fetch(API + '/skip', {
          method: 'POST',
          headers: { 'X-Admin': 'true' }
        });
        lastStateHash = '';
        fetchState();
        showToast('Skipped!');
      } catch (err) {
        console.error('Skip failed:', err);
      }
    }

    // Add entry
    async function addEntry() {
      const name = addName.value.trim();
      const url = addUrl.value.trim();
      const title = addTitle.value.trim() || 'Added by admin';

      if (!name || !url) {
        showToast('Name and URL required');
        return;
      }

      addBtn.disabled = true;

      try {
        const res = await fetch(API + '/add', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Admin': 'true'
          },
          body: JSON.stringify({ name, youtubeUrl: url, youtubeTitle: title })
        });

        const data = await res.json();

        if (!res.ok) {
          showToast(data.error || 'Failed to add');
          return;
        }

        addName.value = '';
        addUrl.value = '';
        addTitle.value = '';
        lastStateHash = '';
        fetchState();
        showToast('Added to front of queue!');
      } catch (err) {
        showToast('Network error');
      } finally {
        addBtn.disabled = false;
      }
    }

    // Move up
    async function moveUp(entryId) {
      const index = state.queue.findIndex(e => e.id === entryId);
      if (index <= 0) return;

      try {
        await fetch(API + '/reorder', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Admin': 'true'
          },
          body: JSON.stringify({ entryId, newPosition: index - 1 })
        });
        lastStateHash = '';
        fetchState();
      } catch (err) {
        console.error('Move failed:', err);
      }
    }

    // Move down
    async function moveDown(entryId) {
      const index = state.queue.findIndex(e => e.id === entryId);
      if (index === -1 || index >= state.queue.length - 1) return;

      try {
        await fetch(API + '/reorder', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Admin': 'true'
          },
          body: JSON.stringify({ entryId, newPosition: index + 1 })
        });
        lastStateHash = '';
        fetchState();
      } catch (err) {
        console.error('Move failed:', err);
      }
    }

    // Remove entry
    async function removeEntry(entryId) {
      if (!confirm('Remove this entry?')) return;

      try {
        await fetch(API + '/remove', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Admin': 'true'
          },
          body: JSON.stringify({ entryId })
        });
        lastStateHash = '';
        fetchState();
      } catch (err) {
        console.error('Remove failed:', err);
      }
    }

    function showToast(msg) {
      toast.textContent = msg;
      toast.classList.add('show', 'success');
      setTimeout(() => toast.classList.remove('show', 'success'), 3000);
    }

    // Event listeners
    addBtn.addEventListener('click', addEntry);

    // Initial fetch and polling
    fetchState();
    pollInterval = setInterval(fetchState, 2000);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        clearInterval(pollInterval);
      } else {
        fetchState();
        pollInterval = setInterval(fetchState, 2000);
      }
    });
  </script>
</body>
</html>`;
